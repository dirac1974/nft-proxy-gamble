import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { requireAllowedJurisdiction } from "../middleware/jurisdictionBlock.js";
import { moneyPathRateLimit } from "../middleware/attestationRateLimit.js";
import {
  generateClientSeed,
  createHandRecord,
  resolveHand,
} from "../services/videoPoker.js";
import { CLIENT_SEED_MESSAGE, CLIENT_SEED_RE, consumeServerSeed, prismaChainStore } from "../services/serverSeedChain.js";
import {
  VARIANT_GAME_TYPE,
  variantFromGameType,
  resolveVariantHand,
} from "../services/pokerVariants.js";
import { signBalance } from "../services/balanceSigning.js";
import { recordAnalyticsEvent } from "../services/analyticsService.js";
import {
  MAX_CASHOUT_COINS,
  MIN_CASHOUT_COINS,
  attestationFromHeaders,
  performCashout,
} from "../services/cashoutService.js";
import type { HandRecord } from "../types/index.js";

const router = Router();

// POST /game/start-session
const startSchema = z.object({
  betAmount: z.number().int().min(1).max(5),
  clientSeed: z.string().regex(CLIENT_SEED_RE, CLIENT_SEED_MESSAGE).optional(),
  // Video poker variant (default Jacks or Better). Same deck derivation + seed
  // chain; only hand evaluation + paytable differ (see services/pokerVariants.ts).
  variant: z.enum(["jacks-or-better", "bonus-poker", "deuces-wild"]).optional(),
});

router.post("/start-session", requireAuth, async (req, res, next) => {
  try {
    const { betAmount, clientSeed: clientSeedOverride, variant } = startSchema.parse(req.body);
    const userId = req.user!.userId;
    const gameType = VARIANT_GAME_TYPE[variant ?? "jacks-or-better"];

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true },
    });
    if (!user) throw new AppError(404, "User not found");
    if (user.coinBalance < betAmount) throw new AppError(402, "Insufficient coin balance");

    // Consume the pre-committed server seed from the user's chain (FABLE-2026-07
    // H-2). serverSeedHash for this session was published as nextServerSeedHash
    // in the previous session, so it was fixed before this clientSeed exists.
    const { serverSeed, serverSeedHash, nextServerSeedHash } = await consumeServerSeed(
      prismaChainStore,
      userId,
    );
    const clientSeed = clientSeedOverride ?? generateClientSeed();

    const session = await prisma.gameSession.create({
      data: { userId, betAmount, serverSeed, serverSeedHash, clientSeed, gameType },
    });

    res.status(201).json({
      sessionId: session.id,
      gameType,
      serverSeedHash,
      clientSeed,
      betAmount,
      // Commitment for the NEXT session's server seed (H-2 chain continuity).
      nextServerSeedHash,
    });
  } catch (err) {
    next(err);
  }
});

// POST /game/deal
router.post("/deal", requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
    const userId = req.user!.userId;

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
    // Cross-game guard: /game/deal is video poker only (any variant). Roulette /
    // blackjack sessions resolve via their own routes.
    if (!variantFromGameType(session.gameType)) {
      throw new AppError(409, "Not a video poker session.");
    }
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");

    const hands = session.hands as unknown as HandRecord[];

    // SECURITY (FABLE-2026-07 C-1): one hand per session. A session's serverSeed is
    // revealed to the client in the /draw response (needed for provably-fair
    // verification). After the seed is public, dealing another hand on the SAME
    // session would let the player compute the entire upcoming deck
    // (generateDeck(serverSeed, clientSeed, handNumber)) BEFORE choosing holds —
    // i.e. guaranteed wins. The official client already starts a fresh session per
    // hand ("PLAY AGAIN" -> start-session), so this only removes an unused,
    // exploitable code path. Multi-hand sessions would require per-hand seed
    // rotation with chained commitments (see docs/FABLE_SECURITY_AUDIT_JULY2026.md).
    if (hands.length >= 1) {
      throw new AppError(409, "This session already played its hand. Start a new session for the next hand.");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true },
    });
    if (!user) throw new AppError(404, "User not found");
    if (user.coinBalance < session.betAmount) throw new AppError(402, "Insufficient coin balance");

    const handNumber = hands.length;
    const hand = createHandRecord(handNumber, session.serverSeed, session.clientSeed);
    const newHands = [...hands, hand] as unknown as object[];

    // Atomic conditional decrement closes the race window between the read above
    // and the write here. Without the `coinBalance: { gte: betAmount }` guard,
    // parallel /game/deal calls could each see sufficient balance and all decrement,
    // taking the balance negative.
    //
    // Session claim (one deal per session): a single conditional UPDATE that
    // requires state='ACTIVE' AND hands='[]'. Without it, N parallel /deal calls
    // on one session all passed the read-side checks above and each debited
    // betAmount for the same hand. A loser queued on the row lock re-evaluates
    // the predicate against the winner's committed row (hands=[hand]) → 0 rows → 409.
    let claimLost = false;
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.$executeRaw`
          UPDATE "GameSession"
          SET "state" = 'AWAITING_DRAW', "hands" = ${JSON.stringify(newHands)}::jsonb, "updatedAt" = NOW()
          WHERE "id" = ${sessionId} AND "userId" = ${userId}
            AND "state" = 'ACTIVE' AND "hands" = '[]'::jsonb`;
        if (claimed !== 1) {
          claimLost = true;
          throw Object.assign(new Error("claim lost"), { code: "P2025" });
        }
        const updated = await tx.user.update({
          where: { id: userId, coinBalance: { gte: session.betAmount } },
          data: { coinBalance: { decrement: session.betAmount } },
          select: { coinBalance: true },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: "GAME_LOSS",
            coinDelta: -session.betAmount,
            balanceAfter: updated.coinBalance,
            sessionId,
          },
        });
      });
    } catch (e) {
      if (claimLost) throw new AppError(409, "This session already played its hand. Start a new session for the next hand.");
      if ((e as { code?: string }).code === "P2025") {
        // The conditional update found no matching row → balance dropped below
        // betAmount in a parallel call between our read and write.
        throw new AppError(402, "Insufficient coin balance");
      }
      throw e;
    }

    res.json({
      handNumber,
      dealtCards: hand.deck.slice(0, 5),
      serverSeedHash: session.serverSeedHash,
    });
  } catch (err) {
    next(err);
  }
});

// POST /game/draw
const drawSchema = z.object({
  sessionId: z.string(),
  holds: z.array(z.boolean()).length(5),
});

router.post("/draw", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, holds } = drawSchema.parse(req.body);
    const userId = req.user!.userId;

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
    const variant = variantFromGameType(session.gameType);
    if (!variant) throw new AppError(409, "Not a video poker session.");
    if (session.state !== "AWAITING_DRAW") throw new AppError(409, "Session is not awaiting draw");

    const hands = session.hands as unknown as HandRecord[];
    const currentHand = hands[hands.length - 1];
    if (!currentHand) throw new AppError(500, "No active hand found");

    // Jacks or Better keeps the original code path (unchanged); Bonus Poker and
    // Deuces Wild dispatch to the variant evaluator (same deck, different rules).
    const { drawnCards, rank, payout } =
      variant === "jacks-or-better"
        ? resolveHand(currentHand, holds, session.betAmount)
        : resolveVariantHand(currentHand.deck, holds, session.betAmount, variant);

    currentHand.holds = holds;
    currentHand.rank = rank as HandRecord["rank"];
    currentHand.payout = payout;

    // Atomic conditional session transition: prevents parallel /draw calls
    // from both passing the AWAITING_DRAW check above and both paying out
    // (would have been a double-payout exploit). The session.update's where
    // clause includes `state: "AWAITING_DRAW"` so only the first request
    // succeeds; the second hits P2025 and returns 409.
    let updatedUser: { coinBalance: number };
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.gameSession.update({
          where: { id: sessionId, state: "AWAITING_DRAW" },
          data: {
            state: "ACTIVE",
            hands: hands as unknown as object[],
            totalPayout: { increment: payout },
          },
        });
        const u = await tx.user.update({
          where: { id: userId },
          data: { coinBalance: { increment: payout } },
          select: { coinBalance: true },
        });
        if (payout > 0) {
          await tx.transaction.create({
            data: {
              userId,
              type: "GAME_WIN",
              coinDelta: payout,
              balanceAfter: u.coinBalance,
              sessionId,
            },
          });
        }
        return u;
      });
      updatedUser = result;
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        // Another /draw call won the race — session is no longer AWAITING_DRAW.
        throw new AppError(409, "Session draw already resolved");
      }
      throw e;
    }

    // Non-blocking — analytics should never block game play
    recordAnalyticsEvent(userId, { type: "game_result", win: payout > 0 }).catch(
      (err) => console.error("[analytics] draw event error:", err),
    );

    res.json({
      drawnCards,
      holds,
      rank,
      payout,
      serverSeed: session.serverSeed,
      ...signBalance(userId, updatedUser.coinBalance),
    });
  } catch (err) {
    next(err);
  }
});

// POST /game/cashout — legacy session-anchored cashout. Kept for backward
// compatibility (older mobile builds open an empty roulette session just to
// cash out); new clients use POST /wallet/cashout. Both share
// services/cashoutService.ts, so limits, gates, atomicity and minting are
// identical. The anchor must be an ACTIVE session of a real game type —
// internal "wallet-cashout" rows are rejected.
const cashoutSchema = z.object({
  sessionId: z.string().min(1).max(64),
  coinsToCashout: z.number().int().min(MIN_CASHOUT_COINS).max(MAX_CASHOUT_COINS),
});

router.post("/cashout", requireAuth, requireAllowedJurisdiction, moneyPathRateLimit, async (req, res, next) => {
  try {
    const { sessionId, coinsToCashout } = cashoutSchema.parse(req.body);
    const userId = req.user!.userId;
    const r = await performCashout({
      userId,
      coinsToCashout,
      anchor: { kind: "session", sessionId },
      ip: req.ip,
      attestation: attestationFromHeaders(req),
    });
    res.status(202)
      .header("X-Cashout-Remaining", String(r.remainingToday))
      .json({ voucherId: r.voucherId, mintStatus: r.mintStatus, ...signBalance(userId, r.postBalance) });
  } catch (err) {
    next(err);
  }
});

export default router;
