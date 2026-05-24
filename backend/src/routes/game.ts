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
import type { HandRecord } from "../types/index.js";

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

    await prisma.$transaction([
      prisma.gameSession.update({
        where: { id: sessionId },
        data: { state: "AWAITING_DRAW", hands: newHands },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { decrement: session.betAmount } },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: "GAME_LOSS",
          coinDelta: -session.betAmount,
          balanceAfter: user.coinBalance - session.betAmount,
          sessionId,
        },
      }),
    ]);

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

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, "User not found");

    const [, updatedUser] = await prisma.$transaction([
      prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          state: "ACTIVE",
          hands: hands as unknown as object[],
          totalPayout: { increment: payout },
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: payout } },
        select: { coinBalance: true },
      }),
      ...(payout > 0
        ? [
            prisma.transaction.create({
              data: {
                userId,
                type: "GAME_WIN",
                coinDelta: payout,
                balanceAfter: user.coinBalance + payout,
                sessionId,
              },
            }),
          ]
        : []),
    ]);

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
    if (user.coinBalance < coinsToCashout) throw new AppError(402, "Insufficient coin balance");

    // Block BLOCKED-risk users from cashing out
    const currentRisk = await getRiskLevel(userId);
    if (currentRisk === "BLOCKED") {
      throw new AppError(403, "Account flagged for suspicious activity. Please contact support.");
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

    const [, voucher] = await prisma.$transaction([
      prisma.gameSession.update({
        where: { id: sessionId },
        data: { state: "CASHED_OUT" },
      }),
      prisma.nFTVoucher.create({
        data: {
          userId,
          sessionId,
          coinBalance: coinsToCashout,
          gameType: session.gameType,
          mintStatus: "PENDING",
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { decrement: coinsToCashout } },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: "CASHOUT_MINT",
          coinDelta: -coinsToCashout,
          balanceAfter: user.coinBalance - coinsToCashout,
          sessionId,
        },
      }),
    ]);

    // Non-blocking analytics event for cashout
    recordAnalyticsEvent(userId, { type: "cashout" }).catch(
      (err) => console.error("[analytics] cashout event error:", err),
    );

    // Async mint — client polls /nfts/:id for status
    triggerMint(voucher.id, user.walletAddress, coinsToCashout, session.gameType, sessionId).catch(
      (err) => console.error("[mint] failed for voucher", voucher.id, err),
    );

    res.status(202).json({
      voucherId: voucher.id,
      mintStatus: "PENDING",
      ...signBalance(userId, user.coinBalance - coinsToCashout),
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
