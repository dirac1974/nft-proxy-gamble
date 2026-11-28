import type { MintStatus, NFTVoucher } from "@prisma/client";
import { prisma } from "../db/client.js";
import { config } from "../config/index.js";
import {
  classifyChainError,
  gameTypeToBytes32,
  legacySessionIdToBytes32,
  tokenIdFromLogs,
  type ChainCall,
  type MinterChain,
  type SessionMintInfo,
} from "./mintOrchestrator.js";
import { BroadcastError, backoffMs, bumpFees, signPersistBroadcast, withSenderLock } from "./chainSender.js";

// Durable mint worker (red-team HIGH x2: nonce desync, failed mint keeps coins).
// Each NFTVoucher row IS the job. States:
//   PENDING  -> due for a (re)send at nextAttemptAt
//   MINTING  -> tx signed + hash/nonce persisted + broadcast; awaiting receipt
//   MINTED   -> terminal success (tokenId from VoucherMinted / tokenIdForSession)
//   FAILED   -> legacy rows from the old fire-and-forget path; treated as PENDING
//   FAILED_REFUNDED -> terminal; coins credited back (CASHOUT_REFUND)
//
// Never double-mint: before every send the worker asks the chain whether the
// voucher's bytes32 sessionId was already minted (usedSessionId/tokenIdForSession,
// or a VoucherMinted log scan on pre-hardening deployments), and the contract
// itself rejects a reused sessionId.
//
// Refund policy (contract hardening 2026-10):
//   * auto-refund ONLY on terminal reverts: amount out of bounds, invalid game
//     type / session id, recipient rejects ERC1155 (ERC1155InvalidReceiver).
//   * "Daily mint cap exceeded", "Insufficient backing", paused, missing minter
//     role, RPC failures: stay queued and retry with backoff (alerts logged).
//   * unknown reverts: retried; after MINT_MAX_ATTEMPTS flagged MANUAL_REVIEW
//     (still retried hourly-ish). Ops may then refund via
//     POST /admin/vouchers/:id/refund (e.g. contract paused for > N hours).
//   * a refund additionally requires proof the voucher can no longer mint:
//     sessionId unused on-chain AND every nonce used for it already consumed.

export const ACTIVE_MINT_STATUSES: MintStatus[] = ["PENDING", "MINTING", "FAILED"];
export const MANUAL_REVIEW_PREFIX = "MANUAL_REVIEW: ";
const INLINE_WAIT_MS = 20_000;

type VoucherJob = NFTVoucher & { user: { walletAddress: string } };

function alert(msg: string, extra?: Record<string, unknown>): void {
  console.error(`[ALERT][mint] ${msg}`, extra ?? "");
}

function mintCall(v: VoucherJob, sessionId32: string): ChainCall {
  return { fn: "mint", args: [v.user.walletAddress, BigInt(v.coinBalance), gameTypeToBytes32(v.gameType), sessionId32] };
}

async function lookupOnChain(chain: MinterChain, sessionId32: string, to: string): Promise<SessionMintInfo> {
  const view = await chain.sessionMint(sessionId32);
  if (view === null) return chain.findMintEvent(to, sessionId32);
  if (view.minted) {
    try {
      const ev = await chain.findMintEvent(to, sessionId32);
      if (ev.minted) view.txHash = ev.txHash;
    } catch {
      // txHash is best-effort; tokenId from the view is authoritative.
    }
  }
  return view;
}

async function markMinted(v: VoucherJob, tokenId: string, txHash: string | null | undefined): Promise<void> {
  const r = await prisma.nFTVoucher.updateMany({
    where: { id: v.id, mintStatus: { in: ACTIVE_MINT_STATUSES } },
    data: { mintStatus: "MINTED", tokenId, txHash: txHash ?? v.txHash, lastMintError: null },
  });
  if (r.count === 0) {
    const cur = await prisma.nFTVoucher.findUnique({ where: { id: v.id }, select: { mintStatus: true } });
    if (cur?.mintStatus === "FAILED_REFUNDED") {
      alert("CRITICAL: voucher was refunded but is minted on-chain — manual recovery required", { voucherId: v.id, tokenId });
    }
  }
}

async function deferRetry(v: VoucherJob, kind: string, detail: string): Promise<void> {
  const attempts = v.mintAttempts + 1;
  let lastMintError = `${kind}: ${detail}`.slice(0, 500);
  if (kind === "UNKNOWN_REVERT" && attempts >= config.MINT_MAX_ATTEMPTS) {
    lastMintError = (MANUAL_REVIEW_PREFIX + lastMintError).slice(0, 500);
    alert("voucher needs manual review (repeated unknown revert)", { voucherId: v.id, detail });
  } else if (kind === "RETRY_BACKING" || kind === "RETRY_CONFIG" || kind === "RETRY_PAUSED") {
    alert(`mint blocked: ${kind}`, { voucherId: v.id, detail });
  } else if (kind === "RETRY_CAP" && attempts >= config.MINT_MAX_ATTEMPTS) {
    alert("daily mint cap exhaustion persists", { voucherId: v.id, attempts });
  }
  await prisma.nFTVoucher.updateMany({
    where: { id: v.id, mintStatus: { in: ACTIVE_MINT_STATUSES } },
    data: {
      mintStatus: "PENDING",
      mintAttempts: attempts,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      lastMintError,
    },
  });
}

// Atomic compensating credit. Idempotent: only one caller can flip the status.
export async function refundVoucherInDb(voucherId: string, reason: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const v = await tx.nFTVoucher.findUnique({ where: { id: voucherId } });
    if (!v) return false;
    const flipped = await tx.nFTVoucher.updateMany({
      where: { id: voucherId, mintStatus: { in: ACTIVE_MINT_STATUSES }, refundedAt: null },
      data: { mintStatus: "FAILED_REFUNDED", refundedAt: new Date(), lastMintError: reason.slice(0, 500) },
    });
    if (flipped.count !== 1) return false;
    const u = await tx.user.update({
      where: { id: v.userId },
      data: { coinBalance: { increment: v.coinBalance } },
      select: { coinBalance: true },
    });
    await tx.transaction.create({
      data: {
        userId: v.userId,
        type: "CASHOUT_REFUND",
        coinDelta: v.coinBalance,
        balanceAfter: u.coinBalance,
        sessionId: v.sessionId,
        nftVoucherId: v.id,
      },
    });
    return true;
  });
}

export type RefundOutcome = "REFUNDED" | "MINTED" | "NOT_SAFE" | "NOT_REFUNDABLE";

// Refund only when the voucher provably can no longer mint.
export async function refundIfSafe(v: VoucherJob, chain: MinterChain, reason: string): Promise<RefundOutcome> {
  const sid = v.onChainSessionId ?? legacySessionIdToBytes32(v.sessionId);
  const to = v.user.walletAddress;
  let onChain = await lookupOnChain(chain, sid, to);
  if (onChain.minted) {
    await markMinted(v, onChain.tokenId!, onChain.txHash);
    return "MINTED";
  }
  if (v.mintNonce !== null) {
    if (v.txHash) {
      const r = await chain.getReceipt(v.txHash);
      if (r?.status === 1) {
        await markMinted(v, tokenIdFromLogs(r.logs, sid), r.hash);
        return "MINTED";
      }
    }
    const latest = await chain.nonce("latest");
    if (latest <= v.mintNonce) return "NOT_SAFE"; // our tx could still land
    onChain = await lookupOnChain(chain, sid, to); // re-check after the nonce check
    if (onChain.minted) {
      await markMinted(v, onChain.tokenId!, onChain.txHash);
      return "MINTED";
    }
  }
  const ok = await refundVoucherInDb(v.id, reason);
  if (ok) console.warn("[mint] voucher refunded", { voucherId: v.id, coins: v.coinBalance, reason });
  return ok ? "REFUNDED" : "NOT_REFUNDABLE";
}

async function handleSendError(v: VoucherJob, chain: MinterChain, sid: string, err: unknown): Promise<void> {
  const { kind, detail } = classifyChainError(err);
  if (kind === "ALREADY_MINTED") {
    const onChain = await lookupOnChain(chain, sid, v.user.walletAddress);
    if (onChain.minted) {
      await markMinted(v, onChain.tokenId!, onChain.txHash);
      return;
    }
    await deferRetry(v, kind, detail);
    return;
  }
  if (kind === "TERMINAL") {
    const outcome = await refundIfSafe(v, chain, `TERMINAL: ${detail}`);
    if (outcome === "NOT_SAFE") await deferRetry(v, kind, `${detail} (refund deferred: in-flight tx)`);
    return;
  }
  await deferRetry(v, kind, detail);
}

class StateChanged extends Error {}

async function sendFresh(v: VoucherJob, chain: MinterChain, sid: string): Promise<void> {
  const call = mintCall(v, sid);
  let sentHash: string | null = null;
  await withSenderLock(async () => {
    const cur = await prisma.nFTVoucher.findUnique({ where: { id: v.id } });
    if (!cur || !ACTIVE_MINT_STATUSES.includes(cur.mintStatus) || cur.refundedAt || cur.txHash !== v.txHash) return;

    const budget = await chain.mintBudgetAvailable();
    if (budget !== null && budget < BigInt(v.coinBalance)) {
      await deferRetry(v, "RETRY_CAP", `mintBudgetAvailable ${budget} < ${v.coinBalance}`);
      return;
    }
    try {
      await chain.preflight(call);
    } catch (err) {
      await handleSendError(v, chain, sid, err);
      return;
    }
    try {
      const signed = await signPersistBroadcast(chain, call, {}, async (s) => {
        const r = await prisma.nFTVoucher.updateMany({
          where: { id: v.id, mintStatus: { in: ACTIVE_MINT_STATUSES }, refundedAt: null },
          data: {
            mintStatus: "MINTING",
            txHash: s.hash,
            mintNonce: s.nonce,
            txSentAt: new Date(),
            mintAttempts: { increment: 1 },
            lastMintError: null,
          },
        });
        if (r.count !== 1) throw new StateChanged();
      });
      sentHash = signed.hash;
    } catch (err) {
      if (err instanceof StateChanged) return;
      if (err instanceof BroadcastError) {
        // Hash + nonce are persisted; force an immediate rebroadcast next tick.
        await prisma.nFTVoucher.update({
          where: { id: v.id },
          data: { txSentAt: new Date(0), lastMintError: `BROADCAST: ${err.message}`.slice(0, 500) },
        });
        return;
      }
      await handleSendError(v, chain, sid, err); // estimate reverted while signing
    }
  });

  if (sentHash) {
    const r = await chain.waitForReceipt(sentHash, Math.min(INLINE_WAIT_MS, config.MINT_TX_TIMEOUT_MS));
    if (r?.status === 1) {
      const fresh = await prisma.nFTVoucher.findUniqueOrThrow({ where: { id: v.id }, include: { user: { select: { walletAddress: true } } } });
      await markMinted(fresh, tokenIdFromLogs(r.logs, sid), r.hash);
    }
  }
}

// Returns true when handled (minted / still waiting / replaced); false when the
// in-flight tx is provably dead and a fresh send should happen now.
async function reconcileInFlight(v: VoucherJob, chain: MinterChain, sid: string): Promise<boolean> {
  const receipt = await chain.getReceipt(v.txHash!);
  if (receipt?.status === 1) {
    await markMinted(v, tokenIdFromLogs(receipt.logs, sid), receipt.hash);
    return true;
  }
  const latest = await chain.nonce("latest");
  if (receipt || latest > v.mintNonce!) {
    // Nonce consumed (by our reverted tx, or something else). Our tx can never
    // land now; re-check the session in case a replacement of ours minted.
    const onChain = await lookupOnChain(chain, sid, v.user.walletAddress);
    if (onChain.minted) {
      await markMinted(v, onChain.tokenId!, onChain.txHash);
      return true;
    }
    return false;
  }
  const age = Date.now() - (v.txSentAt?.getTime() ?? 0);
  if (age < config.MINT_TX_TIMEOUT_MS) return true;

  // Stuck (or dropped) with the nonce still open: replace at the same nonce
  // with bumped fees. Same calldata, so at most one of them can mint.
  let replacedHash: string | null = null;
  await withSenderLock(async () => {
    const cur = await prisma.nFTVoucher.findUnique({ where: { id: v.id } });
    if (!cur || cur.mintStatus !== "MINTING" || cur.txHash !== v.txHash) return;
    const prev = await chain.getTx(v.txHash!);
    try {
      const signed = await signPersistBroadcast(chain, mintCall(v, sid), { nonce: v.mintNonce!, fees: prev ? bumpFees(prev) : undefined }, async (s) => {
        const r = await prisma.nFTVoucher.updateMany({
          where: { id: v.id, mintStatus: "MINTING", txHash: v.txHash },
          data: { txHash: s.hash, txSentAt: new Date(), mintAttempts: { increment: 1 } },
        });
        if (r.count !== 1) throw new StateChanged();
      });
      replacedHash = signed.hash;
      console.warn("[mint] replaced stuck tx", { voucherId: v.id, nonce: v.mintNonce, old: v.txHash, new: signed.hash });
    } catch (err) {
      if (err instanceof StateChanged) return;
      const { kind, detail } = classifyChainError(err instanceof BroadcastError ? err.cause : err);
      await prisma.nFTVoucher.update({ where: { id: v.id }, data: { lastMintError: `REPLACE ${kind}: ${detail}`.slice(0, 500) } });
    }
  });
  if (replacedHash) {
    const r = await chain.waitForReceipt(replacedHash, Math.min(INLINE_WAIT_MS, config.MINT_TX_TIMEOUT_MS));
    if (r?.status === 1) await markMinted(v, tokenIdFromLogs(r.logs, sid), r.hash);
  }
  return true;
}

export async function processVoucher(v: VoucherJob, chain: MinterChain): Promise<void> {
  let sid = v.onChainSessionId;
  if (!sid) {
    sid = legacySessionIdToBytes32(v.sessionId);
    await prisma.nFTVoucher.update({ where: { id: v.id }, data: { onChainSessionId: sid } });
    v = { ...v, onChainSessionId: sid };
  }
  const onChain = await lookupOnChain(chain, sid, v.user.walletAddress);
  if (onChain.minted) {
    await markMinted(v, onChain.tokenId!, onChain.txHash);
    return;
  }
  if (v.mintStatus === "MINTING" && v.txHash && v.mintNonce !== null) {
    if (await reconcileInFlight(v, chain, sid)) return;
  }
  await sendFresh(v, chain, sid);
}

// Ops-initiated refund (e.g. contract paused for > N hours, or a MANUAL_REVIEW
// voucher). Same on-chain safety proof as the automatic path; serialized with
// the sender so no mint for this voucher can be in the middle of broadcasting.
export async function manualRefund(voucherId: string, reason: string, chain: MinterChain | null): Promise<RefundOutcome | "NO_CHAIN"> {
  if (!chain) return "NO_CHAIN";
  return withSenderLock(async () => {
    const v = await prisma.nFTVoucher.findUnique({ where: { id: voucherId }, include: { user: { select: { walletAddress: true } } } });
    if (!v || !ACTIVE_MINT_STATUSES.includes(v.mintStatus)) return "NOT_REFUNDABLE";
    return refundIfSafe(v, chain, `MANUAL: ${reason}`);
  });
}

export async function runMintPass(chain: MinterChain, keepLease: () => Promise<boolean>): Promise<void> {
  const due = await prisma.nFTVoucher.findMany({
    where: { mintStatus: { in: ACTIVE_MINT_STATUSES }, nextAttemptAt: { lte: new Date() } },
    include: { user: { select: { walletAddress: true } } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  for (const v of due) {
    if (!(await keepLease())) return;
    try {
      await processVoucher(v, chain);
    } catch (err) {
      console.error("[mint] voucher processing error", v.id, err);
      await prisma.nFTVoucher
        .update({ where: { id: v.id }, data: { lastMintError: `ERROR: ${(err as Error)?.message ?? String(err)}`.slice(0, 500) } })
        .catch(() => undefined);
    }
  }
}
