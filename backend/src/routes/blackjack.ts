import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { signBalance } from "../services/balanceSigning.js";
import { recordAnalyticsEvent } from "../services/analyticsService.js";
import { consumeServerSeed, prismaChainStore } from "../services/serverSeedChain.js";
import {
  BLACKJACK_GAME_TYPE,
  DEFAULT_NUM_DECKS,
  generateClientSeed,
  generateShoe,
  deal,
  applyAction,
  resolveInsurance,
  publicView,
  BlackjackError,
  type BlackjackState,
  type BlackjackAction,
} from "../services/blackjack.js";

const router = Router();

const BJ_MIN_BET = 1;
const BJ_MAX_BET = 500;
const DEALER_HITS_SOFT_17 = true; // matches BLACKJACK_GAME_TYPE (…-h17-…)

// The engine is deterministic in the shoe, so we always recompute the shoe from
// the session's committed serverSeed + clientSeed rather than storing it (storing
// it would risk leaking undealt cards). numDecks is fixed per game type.
function shoeFor(session: { serverSeed: string; clientSeed: string }): number[] {
  return generateShoe(session.serverSeed, session.clientSeed, DEFAULT_NUM_DECKS);
}

function readState(session: { hands: unknown }): BlackjackState | null {
  const arr = session.hands as unknown[];
  return arr.length > 0 ? (arr[0] as BlackjackState) : null;
}

// ---------------------------------------------------------------------------
// POST /blackjack/start-session — provably-fair commit (mirrors /game + /roulette).
// Publishes serverSeedHash + clientSeed BEFORE any bet, plus the NEXT session's
// server-seed commitment (H-2 chain). One round per session (C-1).
// ---------------------------------------------------------------------------
const startSchema = z.object({ clientSeed: z.string().min(1).max(256).optional() });

router.post("/start-session", requireAuth, async (req, res, next) => {
  try {
    const { clientSeed: clientSeedOverride } = startSchema.parse(req.body);
    const userId = req.user!.userId;

    const { serverSeed, serverSeedHash, nextServerSeedHash } = await consumeServerSeed(
      prismaChainStore,
      userId,
    );
    const clientSeed = clientSeedOverride ?? generateClientSeed();

    const session = await prisma.gameSession.create({
      data: { userId, gameType: BLACKJACK_GAME_TYPE, betAmount: 0, serverSeed, serverSeedHash, clientSeed },
    });

    res.status(201).json({
      sessionId: session.id,
      gameType: BLACKJACK_GAME_TYPE,
      serverSeedHash,
      clientSeed,
      nextServerSeedHash,
      numDecks: DEFAULT_NUM_DECKS,
      dealerHitsSoft17: DEALER_HITS_SOFT_17,
    });
  } catch (err) {
    next(err);
  }
});

// Shared helper: load + validate a blackjack session for a mutating request.
async function loadSession(sessionId: string, userId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
  if (session.gameType !== BLACKJACK_GAME_TYPE) throw new AppError(409, "Not a blackjack session");
  return session;
}

// Apply a state transition inside a serialized transaction. Claims the session
// (ACTIVE→AWAITING_DRAW) so parallel calls can't both mutate it; debits the
// incremental wager atomically (gte guard) and, on a settled round, credits the
// return. Any BlackjackError → 400 rolls the whole transaction back (no claim,
// no debit). Returns the new state + post balance.
async function transition(
  sessionId: string,
  userId: string,
  prevWagered: number,
  produce: (shoe: number[], prev: BlackjackState | null) => BlackjackState,
  session: { serverSeed: string; clientSeed: string },
): Promise<{ state: BlackjackState; balance: number }> {
  const shoe = shoeFor(session);
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.gameSession.update({
        where: { id: sessionId, state: "ACTIVE" },
        data: { state: "AWAITING_DRAW" },
        select: { hands: true },
      });
      const prev = readState(claimed);

      let next: BlackjackState;
      try {
        next = produce(shoe, prev);
      } catch (e) {
        if (e instanceof BlackjackError) throw new AppError(400, e.message);
        throw e;
      }

      const deltaWager = next.totalWagered - prevWagered;
      let balance: number | undefined;
      if (deltaWager > 0) {
        const dec = await tx.user.update({
          where: { id: userId, coinBalance: { gte: deltaWager } },
          data: { coinBalance: { decrement: deltaWager } },
          select: { coinBalance: true },
        });
        balance = dec.coinBalance;
        await tx.transaction.create({
          data: { userId, type: "GAME_LOSS", coinDelta: -deltaWager, balanceAfter: balance, sessionId },
        });
      }

      if (next.phase === "settled" && next.totalReturn > 0) {
        const inc = await tx.user.update({
          where: { id: userId },
          data: { coinBalance: { increment: next.totalReturn } },
          select: { coinBalance: true },
        });
        balance = inc.coinBalance;
        await tx.transaction.create({
          data: { userId, type: "GAME_WIN", coinDelta: next.totalReturn, balanceAfter: balance, sessionId },
        });
      }

      if (balance === undefined) {
        const u = await tx.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
        balance = u!.coinBalance;
      }

      await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          state: "ACTIVE", // back to ACTIVE (serialization lock released; round continues or is complete)
          hands: [next] as unknown as object[],
          totalPayout: { increment: next.phase === "settled" ? next.totalReturn : 0 },
        },
      });

      return { state: next, balance };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") {
      // Either a parallel action claimed the session, or the balance dropped
      // below the required wager between validation and the atomic debit.
      throw new AppError(409, "Action could not be completed atomically — session or balance changed.");
    }
    throw e;
  }
}

function respond(res: import("express").Response, userId: string, state: BlackjackState, session: { serverSeed: string; serverSeedHash: string; clientSeed: string }, balance: number) {
  const settled = state.phase === "settled";
  res.json({
    ...(publicView(state, { reveal: settled }) as object),
    serverSeedHash: session.serverSeedHash,
    clientSeed: session.clientSeed,
    // serverSeed + shoe params revealed ONLY when the round is over.
    ...(settled ? { serverSeed: session.serverSeed, numDecks: state.numDecks } : {}),
    ...signBalance(userId, balance),
  });
}

// ---------------------------------------------------------------------------
// POST /blackjack/deal — place the base bet + opening deal.
// ---------------------------------------------------------------------------
const dealSchema = z.object({
  sessionId: z.string(),
  bet: z.number().int().min(BJ_MIN_BET).max(BJ_MAX_BET),
});

router.post("/deal", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, bet } = dealSchema.parse(req.body);
    const userId = req.user!.userId;
    const session = await loadSession(sessionId, userId);
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");
    if (readState(session)) throw new AppError(409, "This session already dealt. Start a new session.");

    const { state, balance } = await transition(
      sessionId,
      userId,
      0,
      (shoe, prev) => {
        if (prev) throw new BlackjackError("already dealt");
        return deal(shoe, bet, { numDecks: DEFAULT_NUM_DECKS, dealerHitsSoft17: DEALER_HITS_SOFT_17 });
      },
      session,
    );

    recordAnalyticsEvent(userId, { type: "game_result", win: state.phase === "settled" && state.netProfit > 0 }).catch(
      (err) => console.error("[analytics] blackjack deal event error:", err),
    );
    respond(res, userId, state, session, balance);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /blackjack/action — hit | stand | double | split on the active hand.
// ---------------------------------------------------------------------------
const actionSchema = z.object({
  sessionId: z.string(),
  action: z.enum(["hit", "stand", "double", "split"]),
});

router.post("/action", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, action } = actionSchema.parse(req.body);
    const userId = req.user!.userId;
    const session = await loadSession(sessionId, userId);
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");

    const current = readState(session);
    if (!current) throw new AppError(409, "No active hand — call /blackjack/deal first.");
    if (current.phase === "settled") throw new AppError(409, "Round already complete. Start a new session.");

    const { state, balance } = await transition(
      sessionId,
      userId,
      current.totalWagered,
      (shoe, prev) => {
        if (!prev) throw new BlackjackError("no active round");
        return applyAction(prev, action as BlackjackAction, shoe);
      },
      session,
    );

    if (state.phase === "settled") {
      recordAnalyticsEvent(userId, { type: "game_result", win: state.netProfit > 0 }).catch(
        (err) => console.error("[analytics] blackjack action event error:", err),
      );
    }
    respond(res, userId, state, session, balance);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /blackjack/insurance — take or decline insurance (dealer ace showing).
// ---------------------------------------------------------------------------
const insuranceSchema = z.object({ sessionId: z.string(), take: z.boolean() });

router.post("/insurance", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, take } = insuranceSchema.parse(req.body);
    const userId = req.user!.userId;
    const session = await loadSession(sessionId, userId);
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");

    const current = readState(session);
    if (!current) throw new AppError(409, "No active hand — call /blackjack/deal first.");
    if (current.phase !== "insurance") throw new AppError(409, "Insurance is not available now.");

    const { state, balance } = await transition(
      sessionId,
      userId,
      current.totalWagered,
      (shoe, prev) => {
        if (!prev) throw new BlackjackError("no active round");
        return resolveInsurance(prev, take, shoe);
      },
      session,
    );

    respond(res, userId, state, session, balance);
  } catch (err) {
    next(err);
  }
});

export default router;
