import type { ChainCall, FeeFields, MinterChain, SignedTx } from "./mintOrchestrator.js";

// Single-flight sender for the minter account. Every write (mint and
// commitPurchase) is: read the chain's PENDING nonce -> sign -> persist the tx
// hash + nonce to the DB -> broadcast. Persisting before broadcast means a crash
// can never leave an on-chain tx the DB does not know about, and reading the
// nonce from the chain (instead of a local counter) means a failed estimate or a
// dropped tx can never leave a permanent nonce gap.

let tail: Promise<unknown> = Promise.resolve();

export function withSenderLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}

// EIP-1559 replacement needs >= +10% on both fee fields; use +12.5% (+1 wei).
export function bumpFees(f: FeeFields): FeeFields {
  const bump = (v: bigint) => v + v / 8n + 1n;
  if (f.maxFeePerGas !== undefined && f.maxPriorityFeePerGas !== undefined) {
    return { maxFeePerGas: bump(f.maxFeePerGas), maxPriorityFeePerGas: bump(f.maxPriorityFeePerGas) };
  }
  if (f.gasPrice !== undefined) return { gasPrice: bump(f.gasPrice) };
  return {};
}

export function backoffMs(attempts: number): number {
  return Math.min(15_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
}

export class BroadcastError extends Error {
  constructor(public readonly signed: SignedTx, public readonly cause: unknown) {
    super(`broadcast failed for ${signed.hash}: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = "BroadcastError";
  }
}

// Errors meaning the node already has this tx or the nonce is already used.
// Either way the reconcile path (receipt / nonce-consumed checks) resolves it.
function benignBroadcastError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = (e?.message ?? "").toLowerCase();
  return (
    e?.code === "NONCE_EXPIRED" ||
    msg.includes("already known") ||
    msg.includes("nonce too low") ||
    msg.includes("known transaction")
  );
}

// Must be called inside withSenderLock.
export async function signPersistBroadcast(
  chain: MinterChain,
  call: ChainCall,
  opts: { nonce?: number; fees?: FeeFields },
  persist: (signed: SignedTx) => Promise<void>,
): Promise<SignedTx> {
  const nonce = opts.nonce ?? (await chain.nonce("pending"));
  const signed = await chain.sign(call, nonce, opts.fees);
  await persist(signed);
  try {
    await chain.broadcast(signed.raw);
  } catch (err) {
    if (!benignBroadcastError(err)) throw new BroadcastError(signed, err);
  }
  return signed;
}
