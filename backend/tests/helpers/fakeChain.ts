import { keccak256, toUtf8Bytes } from "ethers";
import {
  voucherInterface,
  type ChainCall,
  type ChainReceipt,
  type ChainTxInfo,
  type FeeFields,
  type MinterChain,
  type SessionMintInfo,
  type SignedTx,
} from "../../src/services/mintOrchestrator";

// In-memory model of the minter account + voucher contract: account nonce,
// mempool, mining (automine or manual), on-chain sessionId uniqueness, the
// leaky-bucket mint budget and VoucherMinted logs.

interface Pending {
  hash: string;
  nonce: number;
  call: ChainCall;
  fees: FeeFields;
}

export function revertError(reason: string | null, data = "0x"): Error {
  return Object.assign(new Error(`execution reverted: ${reason ?? ""}`), {
    code: "CALL_EXCEPTION",
    reason,
    data: reason ? "0x08c379a0" : data,
    shortMessage: "execution reverted",
  });
}

export class FakeChain implements MinterChain {
  latestNonce = 0;
  automine = true;
  legacyContract = false; // no usedSessionId / tokenIdForSession / mintBudgetAvailable
  budget: bigint | null = 1_000_000n;
  mempool = new Map<string, Pending>();
  signed = new Map<string, Pending>();
  receipts = new Map<string, ChainReceipt>();
  sessions = new Map<string, bigint>();
  nextTokenId = 0n;
  broadcasts: string[] = [];
  minted: { sessionId: string; tokenId: bigint; to: string; coins: bigint }[] = [];
  commits: { user: string; coins: bigint; receiptHash: string }[] = [];
  // Hooks to inject failures.
  preflightError: ((call: ChainCall) => Error | null) | null = null;
  signError: ((call: ChainCall) => Error | null) | null = null;
  broadcastError: ((p: Pending) => Error | null) | null = null;
  dropOnBroadcast = false; // accepted but never reaches the mempool
  omitVoucherEvent = false;
  private counter = 0;

  minterAddress(): string {
    return "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  }

  async nonce(tag: "latest" | "pending"): Promise<number> {
    if (tag === "latest") return this.latestNonce;
    let n = this.latestNonce;
    const nonces = new Set([...this.mempool.values()].map((p) => p.nonce));
    while (nonces.has(n)) n++;
    return n;
  }

  private contractError(call: ChainCall): Error | null {
    if (call.fn === "mint") {
      const [, coins, , sid] = call.args as [string, bigint, string, string];
      if (coins < 100n) return revertError("Below min coin balance");
      if (coins > 100_000n) return revertError("Above max coin balance");
      if (this.sessions.has(sid)) return revertError("Session id already used");
      if (this.budget !== null && coins > this.budget) return revertError("Daily mint cap exceeded");
    }
    return null;
  }

  async preflight(call: ChainCall): Promise<void> {
    const e = this.preflightError?.(call) ?? this.contractError(call);
    if (e) throw e;
  }

  async sign(call: ChainCall, nonce: number, fees?: FeeFields): Promise<SignedTx> {
    const e = this.signError?.(call) ?? this.contractError(call); // populateTransaction estimates gas
    if (e) throw e;
    const f = fees && Object.keys(fees).length ? fees : { maxFeePerGas: 100n, maxPriorityFeePerGas: 10n };
    const hash = keccak256(toUtf8Bytes(`${nonce}:${call.fn}:${String(call.args)}:${f.maxFeePerGas}:${this.counter++}`));
    this.signed.set(hash, { hash, nonce, call, fees: f });
    return { raw: hash, hash, nonce };
  }

  async broadcast(raw: string): Promise<void> {
    const p = this.signed.get(raw)!;
    const e = this.broadcastError?.(p);
    if (e) throw e;
    this.broadcasts.push(p.hash);
    if (p.nonce < this.latestNonce) throw Object.assign(new Error("nonce too low"), { code: "NONCE_EXPIRED" });
    if (this.dropOnBroadcast) return;
    for (const [h, q] of this.mempool) {
      if (q.nonce === p.nonce) {
        if ((p.fees.maxFeePerGas ?? 0n) * 10n < (q.fees.maxFeePerGas ?? 0n) * 11n) throw new Error("replacement transaction underpriced");
        this.mempool.delete(h);
      }
    }
    this.mempool.set(p.hash, p);
    if (this.automine) this.mineAll();
  }

  // Mines contiguous pending txs from latestNonce.
  mineAll(): void {
    for (;;) {
      const next = [...this.mempool.values()].find((p) => p.nonce === this.latestNonce);
      if (!next) return;
      this.mempool.delete(next.hash);
      this.latestNonce++;
      this.receipts.set(next.hash, this.execute(next));
    }
  }

  private execute(p: Pending): ChainReceipt {
    if (this.contractError(p.call)) return { hash: p.hash, status: 0, logs: [] };
    if (p.call.fn === "commitPurchase") {
      const [user, coins, receiptHash] = p.call.args as [string, bigint, string];
      this.commits.push({ user, coins, receiptHash });
      return { hash: p.hash, status: 1, logs: [] };
    }
    const [to, coins, gameType, sid] = p.call.args as [string, bigint, string, string];
    const tokenId = this.nextTokenId++;
    this.sessions.set(sid, tokenId);
    if (this.budget !== null) this.budget -= coins;
    this.minted.push({ sessionId: sid, tokenId, to, coins });
    const ev = voucherInterface.encodeEventLog("VoucherMinted", [tokenId, to, coins, gameType, sid]);
    const transferSingle = { topics: [keccak256(toUtf8Bytes("TransferSingle(address,address,address,uint256,uint256)"))], data: "0x" };
    return { hash: p.hash, status: 1, logs: this.omitVoucherEvent ? [transferSingle] : [transferSingle, ev] };
  }

  async getReceipt(hash: string): Promise<ChainReceipt | null> {
    return this.receipts.get(hash) ?? null;
  }

  async getTx(hash: string): Promise<ChainTxInfo | null> {
    const p = this.mempool.get(hash);
    return p ? { hash, nonce: p.nonce, ...p.fees } : null;
  }

  async waitForReceipt(hash: string): Promise<ChainReceipt | null> {
    return this.receipts.get(hash) ?? null;
  }

  async sessionMint(sid: string): Promise<SessionMintInfo | null> {
    if (this.legacyContract) return null;
    const t = this.sessions.get(sid);
    return t === undefined ? { minted: false } : { minted: true, tokenId: t.toString() };
  }

  async findMintEvent(to: string, sid: string): Promise<SessionMintInfo> {
    for (const [hash, r] of this.receipts) {
      for (const log of r.logs) {
        try {
          const parsed = voucherInterface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === "VoucherMinted" && parsed.args.sessionId === sid && (parsed.args.to as string).toLowerCase() === to.toLowerCase()) {
            return { minted: true, tokenId: (parsed.args.tokenId as bigint).toString(), txHash: hash };
          }
        } catch {
          // not ours
        }
      }
    }
    return { minted: false };
  }

  async mintBudgetAvailable(): Promise<bigint | null> {
    return this.legacyContract ? null : this.budget;
  }
}
