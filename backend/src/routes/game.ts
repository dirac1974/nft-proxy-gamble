import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  generateServerSeed,
  hashServerSeed,
  generateClientSeed,
  createHandRecord,
  resolveHand,
} from "../services/videoPoker.js";
import { mintVoucher } from "../services/mintOrchestrator.js";
import { signBalance } from "../services/balanceSigning.js";
import { recordAnalyticsEvent, getRiskLevel } from "../services/analyticsService.js";
import { checkDeviceAttestation } from "../services/deviceAttestationService.js";
import type { HandRecord, AttestationPlatform } from "../types/index.js";

const MIN_COIN_BALANCE = 100;
const MAX_CASHOUTS_PER_DAY = 5;

const router = Router();

// POST /game/start-session
const startSchema = z.object({
  betAmount: z.number().int().min(1).max(5),
  clientSeed: z.string().optional(),
});

router.post("/start-session", requireAuth, async (req, res, next) => {
  try {
    const { betAmount, clientSeed: clientSeedOverride } = startSchema.parse(req.body);
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, "User not found");
    if (user.coinBalance < betAmount) throw new AppError(402, "Insufficient coin balance");

    const serverSeed = generateServerSeed();
    const serverSeedHash = hashServerSeed(serverSeed);
    const clientSeed = clientSeedOverride ?? generateClientSeed();

    const session = await prisma.gameSession.create({
      data: { userId, betAmount, serverSeed, serverSeedHash, clientSeed },
    });

    res.status(201).json({
      sessionId: session.id,
      serverSeedHash,
      clientSeed,
      betAmount,
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
    if (session.state !== "ACTIVE") throw new AppError(409, "Session is not in ACTIVE state");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, "User not found");
    if (user.coinBalance < session.betAmount) throw new AppError(402, "Insufficient coin balance");

    const hands = session.hands as unknown as HandRecord[];
    const handNumber = hands.length;
    const hand = createHandRecord(handNumber, session.serverSeed, session.clientSeed);
    const newHands = [...hands, hand] as unknown as object[];

    // Atomic conditional decrement closes the race window between the read above
    // and the write here. Without the `coinBalance: { gte: betAmount }` guard,
    // parallel /game/deal calls could each see sufficient balance and all decrement,
    // taking the balance negative.
    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: userId, coinBalance: { gte: session.betAmount } },
          data: { coinBalance: { decrement: session.betAmount } },
          select: { coinBalance: true },
        });
        await tx.gameSession.update({
          where: { id: sessionId },
          data: { state: "AWAITING_DRAW", hands: newHands },
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
    if (session.state !== "AWAITING_DRAW") throw new AppError(409, "Session is not awaiting draw");

    const hands = session.hands as unknown as HandRecord[];
    const currentHand = hands[hands.length - 1];
    if (!currentHand) throw new AppError(500, "No active hand found");

    const { drawnCards, rank, payout } = resolveHand(currentHand, holds, session.betAmount);

    currentHand.holds = holds;
    currentHand.rank = rank;
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

// POST /game/cashout
const cashoutSchema = z.object({
  sessionId: z.string(),
  coinsToCashout: z.number().int().min(MIN_COIN_BALANCE),
});

router.post("/cashout", requireAuth, async (req, res, next) => {
  try {
    const { sessionId, coinsToCashout } = cashoutSchema.parse(req.body);
    const userId = req.user!.userId;

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
    if (session.state !== "ACTIVE") throw new AppError(409, "Session must be ACTIVE to cashout");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, "User not found");
    if (!user.ageConfirmed) throw new AppError(403, "Age confirmation required before cashout.");
    if (user.coinBalance < coinsToCashout) throw new AppError(402, "Insufficient coin balance");

    // Block BLOCKED-risk users from cashing out
    const currentRisk = await getRiskLevel(userId);
    if (currentRisk === "BLOCKED") {
      throw new AppError(403, "Account flagged for suspicious activity. Please contact support.");
    }

    // Device attestation check (shadow mode until DEVICE_ATTESTATION_ENFORCE=true)
    const attestPlatform = req.headers["x-attestation-platform"] as AttestationPlatform | undefined;
    const attestToken = req.headers["x-attestation-token"] as string | undefined;
    const { allowed: attestOk } = await checkDeviceAttestation(attestPlatform, attestToken, userId);
    if (!attestOk) {
      throw new AppError(403, "Device attestation failed. Please update the app.");
    }

    // Rate limit: max 5 cashouts per calendar day per user
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const cashoutsToday = await prisma.transaction.count({
      where: {
        userId,
        type: "CASHOUT_MINT",
        createdAt: { gte: startOfDay },
      },
    });
    if (cashoutsToday >= MAX_CASHOUTS_PER_DAY) {
      throw new AppError(
        429,
        `Daily cashout limit reached (${MAX_CASHOUTS_PER_DAY}/day). Try again tomorrow.`,
      );
    }

    // Atomic conditional decrement: protects against parallel cashouts on multiple
    // ACTIVE sessions racing past the user.coinBalance < coinsToCashout check above.
    // Without this guard, a user with N ACTIVE sessions could fire N parallel
    // cashouts each draining `coinsToCashout`, taking the balance negative and
    // minting more vouchers than the balance covers.
    let voucher: Awaited<ReturnType<typeof prisma.nFTVoucher.create>>;
    let postBalance: number;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId, coinBalance: { gte: coinsToCashout } },
          data: { coinBalance: { decrement: coinsToCashout } },
          select: { coinBalance: true },
        });
        await tx.gameSession.update({
          where: { id: sessionId, state: "ACTIVE" },
          data: { state: "CASHED_OUT" },
        });
        const v = await tx.nFTVoucher.create({
          data: {
            userId,
            sessionId,
            coinBalance: coinsToCashout,
            gameType: session.gameType,
            mintStatus: "PENDING",
          },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: "CASHOUT_MINT",
            coinDelta: -coinsToCashout,
            balanceAfter: updatedUser.coinBalance,
            sessionId,
          },
        });
        return { v, balance: updatedUser.coinBalance };
      });
      voucher = result.v;
      postBalance = result.balance;
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        // Either the user balance dropped below coinsToCashout in a parallel
        // cashout, or another request transitioned this session out of ACTIVE.
        throw new AppError(409, "Cashout could not be completed atomically — balance or session state changed.");
      }
      throw e;
    }

    // Non-blocking analytics event for cashout
    recordAnalyticsEvent(userId, { type: "cashout" }).catch(
      (err) => console.error("[analytics] cashout event error:", err),
    );

    // Async mint — client polls /nfts/:id for status
    triggerMint(voucher.id, user.walletAddress, coinsToCashout, session.gameType, sessionId).catch(
      (err) => console.error("[mint] failed for voucher", voucher.id, err),
    );

    res.status(202)
      .header("X-Cashout-Remaining", String(MAX_CASHOUTS_PER_DAY - cashoutsToday - 1))
      .json({
        voucherId: voucher.id,
        mintStatus: "PENDING",
        ...signBalance(userId, postBalance),
      });
  } catch (err) {
    next(err);
  }
});

async function triggerMint(
  voucherId: string,
  walletAddress: string,
  coinAmount: number,
  gameType: string,
  sessionId: string,
): Promise<void> {
  await prisma.nFTVoucher.update({ where: { id: voucherId }, data: { mintStatus: "MINTING" } });
  try {
    const { txHash, tokenId } = await mintVoucher(walletAddress, coinAmount, gameType, sessionId);
    await prisma.nFTVoucher.update({
      where: { id: voucherId },
      data: { mintStatus: "MINTED", txHash, tokenId },
    });
  } catch (err) {
    await prisma.nFTVoucher.update({ where: { id: voucherId }, data: { mintStatus: "FAILED" } });
    throw err;
  }
}

export default router;
