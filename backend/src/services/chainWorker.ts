import { randomUUID } from "crypto";
import { hostname } from "os";
import { prisma } from "../db/client.js";
import { config } from "../config/index.js";
import { getMinterChain } from "./mintOrchestrator.js";
import { runMintPass } from "./mintWorker.js";
import { runCommitPass } from "./purchaseCommitmentService.js";

// Background chain worker: runs on boot and every MINT_WORKER_INTERVAL_MS, and
// is kicked right after a cashout / IAP commit. Single-flight in-process
// (one tick at a time) and across instances (WorkerLease row), so only one
// process ever broadcasts from the minter key.

const LEASE_NAME = "chain-sender";
const HOLDER = `${hostname()}:${process.pid}:${randomUUID()}`;

function leaseTtlMs(): number {
  return Math.max(120_000, config.MINT_TX_TIMEOUT_MS);
}

export async function acquireLease(holder: string = HOLDER): Promise<boolean> {
  // Columns are timestamp WITHOUT time zone holding UTC (Prisma convention).
  // Raw Date params arrive as timestamptz, so convert explicitly to UTC; never
  // use now(), which depends on the session TimeZone.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseTtlMs());
  const rows = await prisma.$queryRaw<{ holder: string }[]>`
    INSERT INTO "WorkerLease" ("name", "holder", "expiresAt", "updatedAt")
    VALUES (${LEASE_NAME}, ${holder}, (${expiresAt}::timestamptz AT TIME ZONE 'UTC'), (${now}::timestamptz AT TIME ZONE 'UTC'))
    ON CONFLICT ("name") DO UPDATE
      SET "holder" = EXCLUDED."holder", "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = EXCLUDED."updatedAt"
      WHERE "WorkerLease"."expiresAt" < (${now}::timestamptz AT TIME ZONE 'UTC') OR "WorkerLease"."holder" = EXCLUDED."holder"
    RETURNING "holder"`;
  return rows.length === 1 && rows[0].holder === holder;
}

let running = false;
let rerun = false;

export async function runChainWorkerTick(): Promise<void> {
  const chain = getMinterChain();
  if (!chain) return; // minter not configured (dev/test): vouchers stay PENDING
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      if (!(await acquireLease())) return;
      const keep = () => acquireLease();
      await runMintPass(chain, keep);
      await runCommitPass(chain, keep);
    } while (rerun);
  } finally {
    running = false;
  }
}

export function kickChainWorker(): void {
  setImmediate(() => {
    runChainWorkerTick().catch((err) => console.error("[chainWorker] tick failed", err));
  });
}

export function startChainWorker(): () => void {
  kickChainWorker();
  const timer = setInterval(kickChainWorker, config.MINT_WORKER_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
