import { prisma } from "../db/client.js";
import { getCommitContract } from "./mintOrchestrator.js";
import type { Address } from "../types/index.js";

const BATCH_SIZE = 20;
const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export interface PendingCommitment {
  user: Address;
  coinsAdded: number;
  receiptHash: `0x${string}`;
  iapRecordId: string;
}

let pendingBatch: PendingCommitment[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

export async function queuePurchaseCommitment(c: PendingCommitment): Promise<void> {
  pendingBatch.push(c);
  if (pendingBatch.length >= BATCH_SIZE) {
    await flushBatch();
  } else if (!batchTimer) {
    batchTimer = setTimeout(() => {
      flushBatch().catch((err) => console.error("[commitPurchase] flush error", err));
    }, BATCH_WINDOW_MS);
  }
}

async function flushBatch(): Promise<void> {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  const batch = pendingBatch.splice(0);
  if (batch.length === 0) return;

  let contract: ReturnType<typeof getCommitContract>;
  try {
    contract = getCommitContract();
  } catch {
    // Contract not configured (dev/test without MINTER_PRIVATE_KEY) — log and skip
    console.warn("[commitPurchase] contract not configured; skipping batch of", batch.length);
    return;
  }

  for (const c of batch) {
    try {
      // coinsAdded as BigInt for Solidity uint256
      const tx = await contract.commitPurchase(c.user, BigInt(c.coinsAdded), c.receiptHash);
      const receipt = await tx.wait(1);
      // Store tx hash on the IAP receipt record for audit trail
      await prisma.iAPReceipt.update({
        where: { id: c.iapRecordId },
        data: { onChainTxHash: receipt.hash as string },
      });
    } catch (err) {
      console.error("[commitPurchase] failed for iapRecordId", c.iapRecordId, err);
      // Non-fatal: coins are already credited; this is the audit log step
    }
  }
}

// Exported for tests and graceful shutdown
export async function flushPendingCommitments(): Promise<void> {
  await flushBatch();
}

export function getPendingBatchSize(): number {
  return pendingBatch.length;
}

export function _resetForTest(): void {
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = null;
  pendingBatch = [];
}
