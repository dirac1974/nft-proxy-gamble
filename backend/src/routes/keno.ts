import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { signBalance } from "../services/balanceSigning.js";
import { recordAnalyticsEvent } from "../services/analyticsService.js";
import { consumeServerSeed, prismaChainStore } from "../services/serverSeedChain.js";
import {
  BET_LEVELS,
  BOARD_SIZE,
  CARD_CAP_MULTIPLIER,
  CLIENT_SEED_RE,
  GAME_TYPE_BY_MODE,
  KENO_PAYTABLE_VERSION,
  KenoError,
  MAX_CARDS,
  MAX_SPOTS,
  MAX_TOTAL_WAGER,
  MAX_WIN,
  RTP_BY_SPOTS,
  drawNumbers,
  generateClientSeed,
  modeFromGameType,
  publicPaytable,
  resolveKeno,
  type KenoResolution,
} from "../services/keno.js";

const router = Router();

function parseOr400<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new AppError(400, r.error.issues[0]?.message ?? "Invalid request");
  return r.data;
}

// GET /keno/paytable — public, static.
router.get("/paytable", (_req, res) => {
  res.json({
    version: KENO_PAYTABLE_VERSION,
    paytable: publicPaytable(),
    betLevels: BET_LEVELS,
    maxWin: MAX_WIN,
    rtpBySpots: RTP_BY_SPOTS, // percent, exact hypergeometric, 3 dp
    maxSpots: MAX_SPOTS,
    boardSize: BOARD_SIZE,
    maxCards: MAX_CARDS,
    maxTotalWager: MAX_TOTAL_WAGER,
    cardCapMultiplier: CARD_CAP_MULTIPLIER,
  });
});

// POST /keno/start-session — commit phase (serverSeed chain, clientSeed fixed before play).
const startSchema = z.object({
  mode: z.enum(["single", "quad"]),
  clientSeed: z.string().regex(CLIENT_SEED_RE, "clientSeed must match [A-Za-z0-9_-]{1,64}").optional(),
});

router.post("/start-session", requireAuth, async (req, res, next) => {
  try {
    const { mode, clientSeed: clientSeedOverride } = parseOr400(startSchema, req.body);
    const userId = req.user!.userId;
    const gameType = GAME_TYPE_BY_MODE[mode];

    const { serverSeed, serverSeedHash, nextServerSeedHash } = await consumeServerSeed(prismaChainStore, userId);
    const clientSeed = clientSeedOverride ?? generateClientSeed();

    const session = await prisma.gameSession.create({
      data: { userId, gameType, betAmount: 0, serverSeed, serverSeedHash, clientSeed },
    });

    res.status(201).json({ sessionId: session.id, gameType, serverSeedHash, clientSeed, nextServerSeedHash });
  } catch (err) {
    next(err);
  }
});

// POST /keno/play — wager + reveal. Structural bounds here; semantic rules in resolveKeno.
const playSchema = z.object({
  sessionId: z.string().min(1).max(64),
  cards: z
    .array(
      z.object({
        spots: z.array(z.number().int()).max(BOARD_SIZE),
        bet: z.number().int(),
      }),
    )
    .min(1)
    .max(MAX_CARDS.quad),
});

router.post("/play", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, cards } = parseOr400(playSchema, req.body);
    const userId = req.user!.userId;

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
    const mode = modeFromGameType(session.gameType);
    if (!mode) throw new AppError(409, "Not a keno session");
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");

    // One draw per session: the serverSeed is revealed in this response, so a
    // second play on the same session would be fully predictable.
    if ((session.hands as unknown as unknown[]).length >= 1) {
      throw new AppError(409, "This session already played. Start a new session for the next game.");
    }

    const nonce = 0;
    const drawn = drawNumbers(session.serverSeed, session.clientSeed, nonce);
    let resolution: KenoResolution;
    try {
      resolution = resolveKeno(drawn, cards, mode);
    } catch (e) {
      if (e instanceof KenoError) throw new AppError(400, e.message);
      throw e;
    }
    const { totalWagered, totalReturn } = resolution;

    // UX early-out; the real guard is the atomic conditional debit below.
    const preUser = await prisma.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
    if (!preUser) throw new AppError(404, "User not found");
    if (preUser.coinBalance < totalWagered) throw new AppError(402, "Insufficient coin balance");

    const handRecord = {
      nonce,
      gameType: session.gameType,
      mode,
      paytableVersion: KENO_PAYTABLE_VERSION,
      serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed,
      cards: cards.map((c) => ({ spots: c.spots, bet: c.bet })), // as submitted
      drawn: resolution.drawn,
      results: resolution.results,
      totalWagered,
      totalReturn,
      netProfit: resolution.netProfit,
      capped: resolution.capped,
      settledAt: new Date().toISOString(),
    };

    let postBalance: number;
    try {
      postBalance = await prisma.$transaction(async (tx) => {
        // State claim ACTIVE→AWAITING_DRAW, single-statement and also requiring
        // hands = [] so a concurrent loser that waited on the row lock is
        // re-evaluated (Postgres EvalPlanQual) against the committed winner's row
        // — which is ACTIVE again but has hands = [record] — and claims 0 rows.
        const claimed = await tx.$executeRaw`
          UPDATE "GameSession" SET "state" = 'AWAITING_DRAW', "updatedAt" = NOW()
          WHERE "id" = ${sessionId} AND "userId" = ${userId}
            AND "state" = 'ACTIVE' AND "hands" = '[]'::jsonb`;
        if (claimed !== 1) throw Object.assign(new Error("claim lost"), { code: "P2025" });

        const dec = await tx.user.update({
          where: { id: userId, coinBalance: { gte: totalWagered } },
          data: { coinBalance: { decrement: totalWagered } },
          select: { coinBalance: true },
        });
        let balance = dec.coinBalance;
        await tx.transaction.create({
          data: { userId, type: "GAME_LOSS", coinDelta: -totalWagered, balanceAfter: balance, sessionId },
        });

        if (totalReturn > 0) {
          const inc = await tx.user.update({
            where: { id: userId },
            data: { coinBalance: { increment: totalReturn } },
            select: { coinBalance: true },
          });
          balance = inc.coinBalance;
          await tx.transaction.create({
            data: { userId, type: "GAME_WIN", coinDelta: totalReturn, balanceAfter: balance, sessionId },
          });
        }

        await tx.gameSession.update({
          where: { id: sessionId },
          data: {
            state: "ACTIVE", // back to ACTIVE so /game/cashout can run (roulette parity)
            betAmount: totalWagered,
            hands: [handRecord] as unknown as object[],
            totalPayout: { increment: totalReturn },
          },
        });

        return balance;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        throw new AppError(409, "Play could not be completed atomically — session or balance changed.");
      }
      throw e;
    }

    recordAnalyticsEvent(userId, { type: "game_result", win: totalReturn > 0 }).catch((err) =>
      console.error("[analytics] keno play event error:", err),
    );

    res.json({
      drawn: resolution.drawn,
      results: resolution.results.map(({ multiplierX10: _m, ...r }) => r),
      totalWagered,
      totalReturn,
      netProfit: resolution.netProfit,
      capped: resolution.capped,
      serverSeed: session.serverSeed,
      serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed,
      nonce,
      ...signBalance(userId, postBalance),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
