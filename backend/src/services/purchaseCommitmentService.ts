import type { IAPReceipt } from "@prisma/client";
import { prisma } from "../db/client.js";
import { config } from "../config/index.js";
import { classifyChainError, type ChainCall, type MinterChain } from "./mintOrchestrator.js";
import { BroadcastError, backoffMs, bumpFees, signPersistBroadcast, withSenderLock } from "./chainSender.js";

// On-chain PurchaseCommitted audit trail (M-4). The IAPReceipt row IS the job
// (commitStatus PENDING -> SENT -> COMMITTED | FAILED), so nothing is lost on
// restart, the IAP request never waits on the chain, and commits share the
// single-flight minter sender with mints (no shared broken nonce state).
// Commitments are audit-only: failure never touches balances.

type CommitJob = IAPReceipt & { user: { walletAddress: string } };

let pendingCount = 0;

// Cached by the worker; /health must not hit the DB.
export function getPendingBatchSize(): number {
  return pendingCount;
}

function commitCall(r: CommitJob): ChainCall {
  return { fn: "commitPurchase", args: [r.user.walletAddress, BigInt(r.coinsGranted), `0x${r.receiptHash}`] };
}

async function markCommitted(id: string, hash: string): Promise<void> {
  await prisma.iAPReceipt.update({
    where: { id },
    data: { commitStatus: "COMMITTED", onChainTxHash: hash, commitLastError: null },
  });
}

async function deferCommit(r: CommitJob, detail: string, terminal: boolean): Promise<void> {
  const attempts = r.commitAttempts + 1;
  const failed = terminal || attempts >= config.MINT_MAX_ATTEMPTS * 2;
  if (failed) console.error("[ALERT][commitPurchase] giving up on audit commitment", { iapReceiptId: r.id, detail });
  await prisma.iAPReceipt.update({
    where: { id: r.id },
    data: {
      commitStatus: failed ? "FAILED" : "PENDING",
      commitAttempts: attempts,
      commitNextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      commitLastError: detail.slice(0, 500),
    },
  });
}

class StateChanged extends Error {}

async function sendCommit(r: CommitJob, chain: MinterChain): Promise<void> {
  const call = commitCall(r);
  await withSenderLock(async () => {
    const cur = await prisma.iAPReceipt.findUnique({ where: { id: r.id } });
    if (!cur || cur.commitStatus === "COMMITTED" || cur.commitStatus === "FAILED" || cur.onChainTxHash !== r.onChainTxHash) return;
    try {
      await chain.preflight(call);
      await signPersistBroadcast(chain, call, {}, async (s) => {
        const u = await prisma.iAPReceipt.updateMany({
          where: { id: r.id, commitStatus: { in: ["PENDING", "SENT"] }, onChainTxHash: r.onChainTxHash },
          data: {
            commitStatus: "SENT",
            onChainTxHash: s.hash,
            commitNonce: s.nonce,
            commitTxHashes: { push: s.hash },
            commitSentAt: new Date(),
            commitAttempts: { increment: 1 },
            commitLastError: null,
          },
        });
        if (u.count !== 1) throw new StateChanged();
      });
    } catch (err) {
      if (err instanceof StateChanged) return;
      if (err instanceof BroadcastError) {
        await prisma.iAPReceipt.update({ where: { id: r.id }, data: { commitSentAt: new Date(0), commitLastError: err.message.slice(0, 500) } });
        return;
      }
      const { kind, detail } = classifyChainError(err);
      await deferCommit(r, `${kind}: ${detail}`, kind === "TERMINAL");
    }
  });
}

async function anyHashSucceeded(chain: MinterChain, hashes: readonly string[]): Promise<string | null> {
  for (const h of hashes) {
    const rec = await chain.getReceipt(h);
    if (rec?.status === 1) return rec.hash;
  }
  return null;
}

export async function processCommitment(r: CommitJob, chain: MinterChain): Promise<void> {
  // Legacy row (pre-worker): hash recorded only after a confirmed commit.
  if (r.commitStatus === "PENDING" && r.onChainTxHash && r.commitTxHashes.length === 0) {
    const ok = await anyHashSucceeded(chain, [r.onChainTxHash]);
    if (ok) {
      await markCommitted(r.id, ok);
      return;
    }
  }
  if (r.commitStatus === "SENT" && r.commitNonce !== null) {
    const hashes = r.commitTxHashes.length ? r.commitTxHashes : r.onChainTxHash ? [r.onChainTxHash] : [];
    const ok = await anyHashSucceeded(chain, hashes);
    if (ok) {
      await markCommitted(r.id, ok);
      return;
    }
    const latest = await chain.nonce("latest");
    if (latest <= r.commitNonce) {
      const age = Date.now() - (r.commitSentAt?.getTime() ?? 0);
      if (age < config.MINT_TX_TIMEOUT_MS) return;
      await withSenderLock(async () => {
        const prev = r.onChainTxHash ? await chain.getTx(r.onChainTxHash) : null;
        try {
          await signPersistBroadcast(chain, commitCall(r), { nonce: r.commitNonce!, fees: prev ? bumpFees(prev) : undefined }, async (s) => {
            const u = await prisma.iAPReceipt.updateMany({
              where: { id: r.id, commitStatus: "SENT", onChainTxHash: r.onChainTxHash },
              data: { onChainTxHash: s.hash, commitTxHashes: { push: s.hash }, commitSentAt: new Date() },
            });
            if (u.count !== 1) throw new StateChanged();
          });
        } catch (err) {
          if (err instanceof StateChanged) return;
          await prisma.iAPReceipt.update({ where: { id: r.id }, data: { commitLastError: `REPLACE: ${(err as Error).message}`.slice(0, 500) } });
        }
      });
      return;
    }
    // Nonce consumed and none of our hashes succeeded: ours reverted or was
    // displaced. Re-check once more (a receipt may have just appeared), then resend.
    const late = await anyHashSucceeded(chain, hashes);
    if (late) {
      await markCommitted(r.id, late);
      return;
    }
  }
  await sendCommit(r, chain);
}

export async function runCommitPass(chain: MinterChain, keepLease: () => Promise<boolean>): Promise<void> {
  const due = await prisma.iAPReceipt.findMany({
    where: { commitStatus: { in: ["PENDING", "SENT"] }, commitNextAttemptAt: { lte: new Date() } },
    include: { user: { select: { walletAddress: true } } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  for (const r of due) {
    if (!(await keepLease())) break;
    try {
      await processCommitment(r, chain);
    } catch (err) {
      console.error("[commitPurchase] processing error", r.id, err);
    }
  }
  pendingCount = await prisma.iAPReceipt.count({ where: { commitStatus: { in: ["PENDING", "SENT"] } } });
}
