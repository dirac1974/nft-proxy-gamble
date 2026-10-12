import { Router } from "express";
import { z } from "zod";
import type { GameSession } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { signBalance } from "../services/balanceSigning.js";
import { recordAnalyticsEvent } from "../services/analyticsService.js";
import { consumeServerSeed, prismaChainStore } from "../services/serverSeedChain.js";
import {
  SLOTS_GAME_TYPE,
  SLOTS_MATH_VERSION,
  BET_LEVELS,
  CLIENT_SEED_RE,
  DEFAULT_FEATURE_OPTION,
  FEATURE_OPTIONS,
  generateClientSeed,
  publicFeatureOptions,
  publicPaytable,
  resolveBaseSpin,
  resolveFeature,
  type FeatureOptionId,
  type SpinRecord,
  type FeatureResolution,
} from "../services/slots.js";

// "Lion Lantern Night" slot routes. One game round per session (roulette/keno
// pattern): commit at start-session, base spin at /spin, optional free-games
// feature at /feature. The serverSeed is revealed only when the round is fully
// resolved — a session left in FEATURE_PENDING keeps it hidden so the feature
// outcome cannot be computed before the option is chosen.

const router = Router();

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new AppError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

export interface SlotBaseHand {
  kind: "base";
  mathVersion: string;
  serverSeedHash: string;
  clientSeed: string;
  betLevel: number;
  wager: number;
  spin: SpinRecord;
  baseWin: number;
  featureTriggered: boolean;
  offeredOptions: FeatureOptionId[];
  settledAt: string;
}

export interface SlotFeatureHand {
  kind: "feature";
  option: FeatureOptionId;
  resolvedBy: "player" | "auto";
  awarded: number;
  retriggers: number;
  played: number;
  rawWin: number;
  totalWin: number;
  capped: boolean;
  spins: SpinRecord[];
  roundReturn: number;
  settledAt: string;
}

const isP2025 = (e: unknown): boolean => (e as { code?: string }).code === "P2025";

async function loadSlotSession(sessionId: string, userId: string): Promise<GameSession> {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
  if (session.gameType !== SLOTS_GAME_TYPE) throw new AppError(409, "Not a slots session");
  return session;
}

interface SettledFeature {
  base: SlotBaseHand;
  feature: FeatureResolution;
  roundReturn: number;
  balance: number;
}

// Resolve a FEATURE_PENDING session's free games and credit the award. State
// claim FEATURE_PENDING→AWAITING_DRAW is a single statement; the winner ends in
// ACTIVE (never FEATURE_PENDING again), so a concurrent loser re-evaluated by
// Postgres after the winner commits claims 0 rows → P2025.
async function settleFeature(
  session: GameSession,
  userId: string,
  optionId: FeatureOptionId,
  resolvedBy: "player" | "auto",
): Promise<SettledFeature> {
  const hands = session.hands as unknown as Array<SlotBaseHand | SlotFeatureHand>;
  const base = hands[0] as SlotBaseHand | undefined;
  if (!base || base.kind !== "base" || !base.featureTriggered || hands.length !== 1) {
    throw new AppError(409, "No pending feature on this session");
  }
  const feature = resolveFeature(session.serverSeed, session.clientSeed, base.betLevel, optionId, base.baseWin);
  const roundReturn = base.baseWin + feature.totalWin;
  const featureHand: SlotFeatureHand = {
    kind: "feature",
    option: feature.option,
    resolvedBy,
    awarded: feature.awarded,
    retriggers: feature.retriggers,
    played: feature.played,
    rawWin: feature.rawWin,
    totalWin: feature.totalWin,
    capped: feature.capped,
    spins: feature.spins,
    roundReturn,
    settledAt: new Date().toISOString(),
  };

  const balance = await prisma.$transaction(async (tx) => {
    const claimed = await tx.$executeRaw`
      UPDATE "GameSession" SET "state" = 'AWAITING_DRAW', "updatedAt" = NOW()
      WHERE "id" = ${session.id} AND "userId" = ${userId} AND "state" = 'FEATURE_PENDING'
        AND jsonb_array_length("hands") = 1`;
    if (claimed !== 1) throw Object.assign(new Error("claim lost"), { code: "P2025" });

    let bal: number;
    if (feature.totalWin > 0) {
      const inc = await tx.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: feature.totalWin } },
        select: { coinBalance: true },
      });
      bal = inc.coinBalance;
      await tx.transaction.create({
        data: { userId, type: "GAME_WIN", coinDelta: feature.totalWin, balanceAfter: bal, sessionId: session.id },
      });
    } else {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
      bal = u.coinBalance;
    }

    await tx.gameSession.update({
      where: { id: session.id },
      data: {
        state: "ACTIVE", // round complete; ACTIVE so /game/cashout can run (roulette parity)
        hands: [base, featureHand] as unknown as object[],
        totalPayout: { increment: feature.totalWin },
      },
    });
    return bal;
  });

  recordAnalyticsEvent(userId, { type: "game_result", win: roundReturn > base.wager }).catch((err) =>
    console.error("[analytics] slots feature event error:", err),
  );
  return { base, feature, roundReturn, balance };
}

function featureBody(session: GameSession, s: SettledFeature): Record<string, unknown> {
  return {
    sessionId: session.id,
    gameType: SLOTS_GAME_TYPE,
    spins: s.feature.spins,
    feature: {
      option: s.feature.option,
      awarded: s.feature.awarded,
      retriggers: s.feature.retriggers,
      played: s.feature.played,
      totalWin: s.feature.totalWin,
      rawWin: s.feature.rawWin,
      capped: s.feature.capped,
    },
    betLevel: s.base.betLevel,
    totalWagered: s.base.wager,
    baseWin: s.base.baseWin,
    totalReturn: s.roundReturn,
    netProfit: s.roundReturn - s.base.wager,
    serverSeed: session.serverSeed, // revealed: round fully resolved
    serverSeedHash: session.serverSeedHash,
    clientSeed: session.clientSeed,
  };
}

// GET /slots/paytable — static, public game rules (help screen + RTP disclosure).
router.get("/paytable", (_req, res) => {
  res.json(publicPaytable());
});

// POST /slots/start-session — commit phase. Any of this user's slot sessions
// still FEATURE_PENDING are auto-resolved first with the default option so a
// player never loses an awarded feature (abandonment / app kill).
const startSchema = z.object({
  clientSeed: z.string().regex(CLIENT_SEED_RE, "clientSeed must match /^[A-Za-z0-9_-]{1,64}$/").optional(),
});

router.post("/start-session", requireAuth, async (req, res, next) => {
  try {
    const { clientSeed: clientSeedOverride } = parse(startSchema, req.body);
    const userId = req.user!.userId;

    const pending = await prisma.gameSession.findMany({
      where: { userId, gameType: SLOTS_GAME_TYPE, state: "FEATURE_PENDING" },
      orderBy: { createdAt: "asc" },
    });
    const autoResolved: Record<string, unknown>[] = [];
    let latestBalance: number | null = null;
    for (const p of pending) {
      try {
        const settled = await settleFeature(p, userId, DEFAULT_FEATURE_OPTION, "auto");
        autoResolved.push(featureBody(p, settled));
        latestBalance = settled.balance;
      } catch (e) {
        // Resolved concurrently by /slots/feature or another start-session.
        if (isP2025(e)) continue;
        throw e;
      }
    }

    const { serverSeed, serverSeedHash, nextServerSeedHash } = await consumeServerSeed(prismaChainStore, userId);
    const clientSeed = clientSeedOverride ?? generateClientSeed();
    const session = await prisma.gameSession.create({
      data: { userId, gameType: SLOTS_GAME_TYPE, betAmount: 0, serverSeed, serverSeedHash, clientSeed },
    });

    res.status(201).json({
      sessionId: session.id,
      gameType: SLOTS_GAME_TYPE,
      serverSeedHash,
      clientSeed,
      nextServerSeedHash,
      autoResolvedFeatures: autoResolved,
      ...(latestBalance !== null ? signBalance(userId, latestBalance) : {}),
    });
  } catch (err) {
    next(err);
  }
});

// POST /slots/spin — base spin (nonce 0). Debit wager, credit base win (ways +
// scatter), write hand record — all atomic. On 3+ scatters the session goes
// FEATURE_PENDING and the seed stays hidden; otherwise the round completes.
const spinSchema = z.object({
  sessionId: z.string().min(1).max(64),
  betLevel: z.number().int().refine((v) => BET_LEVELS.includes(v), { message: `betLevel must be one of ${BET_LEVELS.join(",")}` }),
});

router.post("/spin", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, betLevel } = parse(spinSchema, req.body);
    const userId = req.user!.userId;

    const session = await loadSlotSession(sessionId, userId);
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");
    // One round per session (seed is revealed at round end).
    if ((session.hands as unknown as unknown[]).length >= 1) {
      throw new AppError(409, "This session already spun. Start a new session for the next spin.");
    }

    const r = resolveBaseSpin(session.serverSeed, session.clientSeed, betLevel);

    // UX early-out; the real guard is the atomic conditional debit below.
    const preUser = await prisma.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
    if (!preUser) throw new AppError(404, "User not found");
    if (preUser.coinBalance < r.wager) throw new AppError(402, "Insufficient coin balance");

    const offeredOptions = r.featureTriggered ? FEATURE_OPTIONS.map((o) => o.id) : [];
    const hand: SlotBaseHand = {
      kind: "base",
      mathVersion: SLOTS_MATH_VERSION,
      serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed,
      betLevel,
      wager: r.wager,
      spin: r.spin,
      baseWin: r.baseWin,
      featureTriggered: r.featureTriggered,
      offeredOptions,
      settledAt: new Date().toISOString(),
    };

    let postBalance: number;
    try {
      postBalance = await prisma.$transaction(async (tx) => {
        // Single-statement claim also requiring hands = [] so a concurrent loser
        // re-evaluated after the winner commits (ACTIVE/FEATURE_PENDING with a
        // hand) claims 0 rows.
        const claimed = await tx.$executeRaw`
          UPDATE "GameSession" SET "state" = 'AWAITING_DRAW', "updatedAt" = NOW()
          WHERE "id" = ${sessionId} AND "userId" = ${userId}
            AND "state" = 'ACTIVE' AND "hands" = '[]'::jsonb`;
        if (claimed !== 1) throw Object.assign(new Error("claim lost"), { code: "P2025" });

        const dec = await tx.user.update({
          where: { id: userId, coinBalance: { gte: r.wager } },
          data: { coinBalance: { decrement: r.wager } },
          select: { coinBalance: true },
        });
        let balance = dec.coinBalance;
        await tx.transaction.create({
          data: { userId, type: "GAME_LOSS", coinDelta: -r.wager, balanceAfter: balance, sessionId },
        });
        if (r.baseWin > 0) {
          const inc = await tx.user.update({
            where: { id: userId },
            data: { coinBalance: { increment: r.baseWin } },
            select: { coinBalance: true },
          });
          balance = inc.coinBalance;
          await tx.transaction.create({
            data: { userId, type: "GAME_WIN", coinDelta: r.baseWin, balanceAfter: balance, sessionId },
          });
        }
        await tx.gameSession.update({
          where: { id: sessionId },
          data: {
            state: r.featureTriggered ? "FEATURE_PENDING" : "ACTIVE",
            betAmount: r.wager,
            hands: [hand] as unknown as object[],
            totalPayout: { increment: r.baseWin },
          },
        });
        return balance;
      });
    } catch (e) {
      if (isP2025(e)) throw new AppError(409, "Spin could not be completed atomically — session or balance changed.");
      throw e;
    }

    if (!r.featureTriggered) {
      recordAnalyticsEvent(userId, { type: "game_result", win: r.baseWin > r.wager }).catch((err) =>
        console.error("[analytics] slots spin event error:", err),
      );
    }

    res.json({
      sessionId,
      gameType: SLOTS_GAME_TYPE,
      betLevel,
      totalWagered: r.wager,
      spin: r.spin,
      baseWin: r.baseWin,
      totalReturn: r.baseWin, // round return so far (feature adds to it)
      netProfit: r.baseWin - r.wager,
      feature: r.featureTriggered
        ? { triggered: true, scatterCount: r.spin.scatter.count, options: publicFeatureOptions(), defaultOption: DEFAULT_FEATURE_OPTION }
        : { triggered: false },
      serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed,
      nonce: 0,
      // Seed revealed only when the round is complete.
      ...(r.featureTriggered ? {} : { serverSeed: session.serverSeed }),
      ...signBalance(userId, postBalance),
    });
  } catch (err) {
    next(err);
  }
});

// POST /slots/feature — choose the free-games option and resolve all free spins.
const featureSchema = z.object({
  sessionId: z.string().min(1).max(64),
  option: z.enum(FEATURE_OPTIONS.map((o) => o.id) as [FeatureOptionId, ...FeatureOptionId[]]),
});

router.post("/feature", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, option } = parse(featureSchema, req.body);
    const userId = req.user!.userId;
    const session = await loadSlotSession(sessionId, userId);
    if (session.state !== "FEATURE_PENDING") throw new AppError(409, "No pending feature on this session");

    let settled: SettledFeature;
    try {
      settled = await settleFeature(session, userId, option, "player");
    } catch (e) {
      if (isP2025(e)) throw new AppError(409, "Feature already resolved.");
      throw e;
    }
    res.json({ ...featureBody(session, settled), ...signBalance(userId, settled.balance) });
  } catch (err) {
    next(err);
  }
});

export default router;
