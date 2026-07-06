import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { signBalance } from "../services/balanceSigning.js";
import { recordAnalyticsEvent } from "../services/analyticsService.js";
import { consumeServerSeed, prismaChainStore } from "../services/serverSeedChain.js";
import {
  ROULETTE_GAME_TYPE,
  MAX_BETS_PER_SPIN,
  generateClientSeed,
  spinNumber,
  resolveSpin,
  BetError,
  type RouletteBet,
} from "../services/roulette.js";

const router = Router();

// POST /roulette/start-session — commit phase.
// Mirrors /game/start-session: server commits serverSeed (publishes its hash)
// and fixes clientSeed BEFORE the player places bets. betAmount is unused for
// roulette (wager is placed at spin time), stored as 0.
const startSchema = z.object({
  clientSeed: z.string().min(1).max(256).optional(),
});

router.post("/start-session", requireAuth, async (req, res, next) => {
  try {
    const { clientSeed: clientSeedOverride } = startSchema.parse(req.body);
    const userId = req.user!.userId;

    // Provably-fair server-seed chain (FABLE-2026-07 H-2), shared with video poker.
    const { serverSeed, serverSeedHash, nextServerSeedHash } = await consumeServerSeed(
      prismaChainStore,
      userId,
    );
    const clientSeed = clientSeedOverride ?? generateClientSeed();

    const session = await prisma.gameSession.create({
      data: {
        userId,
        gameType: ROULETTE_GAME_TYPE,
        betAmount: 0,
        serverSeed,
        serverSeedHash,
        clientSeed,
      },
    });

    res.status(201).json({
      sessionId: session.id,
      gameType: ROULETTE_GAME_TYPE,
      serverSeedHash,
      clientSeed,
      nextServerSeedHash,
    });
  } catch (err) {
    next(err);
  }
});

// POST /roulette/spin — bet + reveal phase.
const betSchema = z.object({
  type: z.enum([
    "straight", "split", "street", "corner", "line",
    "dozen", "column", "red", "black", "odd", "even", "high", "low",
  ]),
  amount: z.number().int().min(1),
  numbers: z.array(z.number().int().min(0).max(36)).min(1).max(6).optional(),
  value: z.number().int().min(1).max(3).optional(),
});

const spinSchema = z.object({
  sessionId: z.string(),
  bets: z.array(betSchema).min(1).max(MAX_BETS_PER_SPIN),
});

router.post("/spin", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, bets } = spinSchema.parse(req.body);
    const userId = req.user!.userId;

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
    if (session.gameType !== ROULETTE_GAME_TYPE) {
      throw new AppError(409, "Not a roulette session");
    }
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");

    // One spin per session: after a spin the serverSeed is revealed, so allowing
    // another spin on the same (now-public-seed) session would let the player
    // predict the number before betting — the same class of flaw as C-1. The
    // client starts a fresh session per spin.
    const priorHands = session.hands as unknown as unknown[];
    if (priorHands.length >= 1) {
      throw new AppError(409, "This session already spun. Start a new session for the next spin.");
    }

    // Resolve provably-fair outcome + validate/settle bets (pure). BetError → 400.
    const nonce = 0;
    const winningNumber = spinNumber(session.serverSeed, session.clientSeed, nonce);
    let resolution;
    try {
      resolution = resolveSpin(winningNumber, bets as RouletteBet[]);
    } catch (e) {
      if (e instanceof BetError) throw new AppError(400, e.message);
      throw e;
    }
    const { totalWagered, totalReturn } = resolution;

    // UX early-out for the common insufficient-balance case (real guard is the
    // atomic conditional decrement below).
    const preUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true },
    });
    if (!preUser) throw new AppError(404, "User not found");
    if (preUser.coinBalance < totalWagered) throw new AppError(402, "Insufficient coin balance");

    const handRecord = {
      nonce,
      winningNumber: resolution.winningNumber,
      color: resolution.color,
      totalWagered,
      totalReturn,
      netProfit: resolution.netProfit,
      results: resolution.results,
    };

    let postBalance: number;
    try {
      postBalance = await prisma.$transaction(async (tx) => {
        // Concurrency claim: flip ACTIVE→AWAITING_DRAW so two parallel /spin
        // calls can't both settle. The loser hits P2025 (state no longer ACTIVE).
        // We restore state to ACTIVE at the end so the player can still cashout.
        await tx.gameSession.update({
          where: { id: sessionId, state: "ACTIVE" },
          data: { state: "AWAITING_DRAW" },
        });

        // Atomic conditional debit of the total wager.
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
            state: "ACTIVE", // back to ACTIVE so /game/cashout can run
            hands: [handRecord] as unknown as object[],
            totalPayout: { increment: totalReturn },
          },
        });

        return balance;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        // Either a parallel spin claimed the session first, or the balance
        // dropped below the wager between the pre-check and the debit.
        throw new AppError(409, "Spin could not be completed atomically — session or balance changed.");
      }
      throw e;
    }

    recordAnalyticsEvent(userId, { type: "game_result", win: totalReturn > 0 }).catch(
      (err) => console.error("[analytics] roulette spin event error:", err),
    );

    res.json({
      winningNumber: resolution.winningNumber,
      color: resolution.color,
      totalWagered,
      totalReturn,
      netProfit: resolution.netProfit,
      results: resolution.results,
      serverSeed: session.serverSeed, // revealed for verification
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
