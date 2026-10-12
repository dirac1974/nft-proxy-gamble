import { prisma } from "../db/client.js";
import { AppError } from "../middleware/errorHandler.js";
import { mintVoucher } from "./mintOrchestrator.js";
import { recordAnalyticsEvent, getRiskLevel } from "./analyticsService.js";
import { checkDeviceAttestation } from "./deviceAttestationService.js";
import type { Request } from "express";
import type { AttestationPlatform } from "../types/index.js";

// Shared cashout core for POST /game/cashout (session-anchored, legacy) and
// POST /wallet/cashout (no game session). Both routes get identical limits,
// risk/attestation gates, atomic debit, ledger rows and async mint.

// Bounds mirror contracts/src/NFTProxyVoucher.sol mint(): MIN_COIN_BALANCE = 100,
// MAX_COIN_BALANCE = 100_000. A larger amount would be debited here and then
// revert on-chain, leaving a FAILED voucher for coins already removed.
// (The contract's NatSpec says "multiple of COINS_PER_USDC" but mint() does not
// enforce it and redeem() pays coins * USDC_UNITS_PER_COIN, so any integer works.)
export const MIN_CASHOUT_COINS = 100;
export const MAX_CASHOUT_COINS = 100_000;
export const MAX_CASHOUTS_PER_DAY = 5;
export const WALLET_CASHOUT_GAME_TYPE = "wallet-cashout";
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Session game types that must never serve as a /game/cashout anchor. Internal
// wallet-cashout rows are created already CASHED_OUT, but the explicit denylist
// keeps that true even if a row is ever reset.
const NON_ANCHOR_GAME_TYPES = new Set([WALLET_CASHOUT_GAME_TYPE]);

export type CashoutAnchor =
  | { kind: "session"; sessionId: string }
  | { kind: "wallet"; idempotencyKey?: string };

export interface CashoutRequest {
  userId: string;
  coinsToCashout: number;
  anchor: CashoutAnchor;
  ip: string | undefined;
  attestation: { platform?: AttestationPlatform; token?: string; challenge?: string };
}

export interface CashoutResult {
  voucherId: string;
  mintStatus: string;
  postBalance: number;
  remainingToday: number;
  replayed: boolean;
}

export function attestationFromHeaders(req: Request): CashoutRequest["attestation"] {
  return {
    platform: req.headers["x-attestation-platform"] as AttestationPlatform | undefined,
    token: req.headers["x-attestation-token"] as string | undefined,
    challenge: req.headers["x-attestation-challenge"] as string | undefined,
  };
}

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function assertAmount(coins: number): void {
  if (!Number.isInteger(coins) || coins < MIN_CASHOUT_COINS || coins > MAX_CASHOUT_COINS) {
    throw new AppError(400, `coinsToCashout must be an integer between ${MIN_CASHOUT_COINS} and ${MAX_CASHOUT_COINS}`);
  }
}

// Replays an earlier wallet cashout with the same idempotency key. The key is
// stored as the internal session's clientSeed (no schema change needed).
async function findReplay(
  db: Pick<typeof prisma, "nFTVoucher">,
  userId: string,
  key: string,
  coins: number,
): Promise<{ voucherId: string; mintStatus: string } | null> {
  const prior = await db.nFTVoucher.findFirst({
    where: { userId, session: { gameType: WALLET_CASHOUT_GAME_TYPE, clientSeed: key } },
    select: { id: true, mintStatus: true, coinBalance: true },
  });
  if (!prior) return null;
  if (prior.coinBalance !== coins) {
    throw new AppError(409, "idempotencyKey was already used for a different amount");
  }
  return { voucherId: prior.id, mintStatus: prior.mintStatus };
}

export async function performCashout(req: CashoutRequest): Promise<CashoutResult> {
  const { userId, coinsToCashout, anchor } = req;
  assertAmount(coinsToCashout);

  const idemKey = anchor.kind === "wallet" ? anchor.idempotencyKey : undefined;
  if (idemKey !== undefined && !IDEMPOTENCY_KEY_RE.test(idemKey)) {
    throw new AppError(400, "idempotencyKey must match [A-Za-z0-9_-]{8,64}");
  }

  // Replay short-circuit before any balance check: a retry after the first
  // request drained the balance must still return the original voucher.
  if (idemKey) {
    const replay = await findReplay(prisma, userId, idemKey, coinsToCashout);
    if (replay) return replayResult(userId, replay);
  }

  let gameType: string = WALLET_CASHOUT_GAME_TYPE;
  if (anchor.kind === "session") {
    const session = await prisma.gameSession.findUnique({ where: { id: anchor.sessionId } });
    if (!session || session.userId !== userId) throw new AppError(404, "Session not found");
    if (NON_ANCHOR_GAME_TYPES.has(session.gameType)) throw new AppError(409, "Session cannot be used for cashout");
    if (session.state !== "ACTIVE") throw new AppError(409, "Session must be ACTIVE to cashout");
    gameType = session.gameType;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ageConfirmed: true, coinBalance: true, walletAddress: true },
  });
  if (!user) throw new AppError(404, "User not found");
  if (!user.ageConfirmed) throw new AppError(403, "Age confirmation required before cashout.");
  // UX early-outs (balance here, daily limit below) are skipped for keyed
  // requests: a duplicate in flight may drain the balance before this read, and
  // it must resolve to a replay inside the locked transaction, not a 402/429.
  // The real guards are the in-transaction count and conditional decrement.
  if (!idemKey && user.coinBalance < coinsToCashout) throw new AppError(402, "Insufficient coin balance");

  if ((await getRiskLevel(userId)) === "BLOCKED") {
    throw new AppError(403, "Account flagged for suspicious activity. Please contact support.");
  }

  // Device attestation (shadow mode until DEVICE_ATTESTATION_ENFORCE=true).
  const { platform, token, challenge } = req.attestation;
  const { allowed: attestOk } = await checkDeviceAttestation(platform, token, userId, req.ip, challenge);
  if (!attestOk) throw new AppError(403, "Device attestation failed. Please update the app.");

  const dailyLimitError = () =>
    new AppError(429, `Daily cashout limit reached (${MAX_CASHOUTS_PER_DAY}/day). Try again tomorrow.`);
  const countToday = (db: Pick<typeof prisma, "transaction">) =>
    db.transaction.count({ where: { userId, type: "CASHOUT_MINT", createdAt: { gte: startOfUtcDay() } } });
  if (!idemKey && (await countToday(prisma)) >= MAX_CASHOUTS_PER_DAY) throw dailyLimitError();

  let result: { voucherId: string; mintStatus: string; sessionId: string; postBalance: number; cashoutsToday: number } | { replay: { voucherId: string; mintStatus: string } };
  try {
    result = await prisma.$transaction(async (tx) => {
      // Per-user serialization point. Every cashout for this user queues here, so
      // the daily-limit count and the idempotency lookup below are race-free
      // (the pre-tx count above is only a UX early-out).
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;

      if (idemKey) {
        const replay = await findReplay(tx, userId, idemKey, coinsToCashout);
        if (replay) return { replay };
      }

      const cashoutsToday = await countToday(tx);
      if (cashoutsToday >= MAX_CASHOUTS_PER_DAY) throw dailyLimitError();

      // Atomic conditional debit: concurrent cashouts cannot overdraw.
      const updatedUser = await tx.user.update({
        where: { id: userId, coinBalance: { gte: coinsToCashout } },
        data: { coinBalance: { decrement: coinsToCashout } },
        select: { coinBalance: true },
      });

      let sessionId: string;
      if (anchor.kind === "session") {
        await tx.gameSession.update({
          where: { id: anchor.sessionId, state: "ACTIVE" },
          data: { state: "CASHED_OUT" },
        });
        sessionId = anchor.sessionId;
      } else {
        // Internal anchor row: NFTVoucher.sessionId is a required unique FK, and
        // mint() needs a non-zero bytes32 sessionId. Seeds are not used by any
        // game (state is terminal from creation); clientSeed carries the
        // idempotency key when one was supplied.
        const s = await tx.gameSession.create({
          data: {
            userId,
            gameType: WALLET_CASHOUT_GAME_TYPE,
            betAmount: 0,
            serverSeed: "",
            serverSeedHash: "",
            clientSeed: idemKey ?? "",
            state: "CASHED_OUT",
          },
          select: { id: true },
        });
        sessionId = s.id;
      }

      const v = await tx.nFTVoucher.create({
        data: { userId, sessionId, coinBalance: coinsToCashout, gameType, mintStatus: "PENDING" },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: "CASHOUT_MINT",
          coinDelta: -coinsToCashout,
          balanceAfter: updatedUser.coinBalance,
          sessionId,
          nftVoucherId: v.id,
        },
      });
      return { voucherId: v.id, mintStatus: v.mintStatus, sessionId, postBalance: updatedUser.coinBalance, cashoutsToday };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") {
      throw new AppError(409, "Cashout could not be completed atomically — balance or session state changed.");
    }
    throw e;
  }

  if ("replay" in result) return replayResult(userId, result.replay);

  recordAnalyticsEvent(userId, { type: "cashout" }).catch((err) =>
    console.error("[analytics] cashout event error:", err),
  );

  // Async mint — client polls /nfts/:id for status.
  const { voucherId, sessionId } = result;
  triggerMint(voucherId, user.walletAddress, coinsToCashout, gameType, sessionId).catch((err) =>
    console.error("[mint] failed for voucher", voucherId, err),
  );

  return {
    voucherId,
    mintStatus: result.mintStatus,
    postBalance: result.postBalance,
    remainingToday: MAX_CASHOUTS_PER_DAY - result.cashoutsToday - 1,
    replayed: false,
  };
}

async function replayResult(userId: string, replay: { voucherId: string; mintStatus: string }): Promise<CashoutResult> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
  const today = await prisma.transaction.count({
    where: { userId, type: "CASHOUT_MINT", createdAt: { gte: startOfUtcDay() } },
  });
  return {
    voucherId: replay.voucherId,
    mintStatus: replay.mintStatus,
    postBalance: u.coinBalance,
    remainingToday: Math.max(0, MAX_CASHOUTS_PER_DAY - today),
    replayed: true,
  };
}

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
