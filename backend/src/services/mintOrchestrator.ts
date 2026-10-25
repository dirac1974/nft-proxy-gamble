import {
  Contract,
  Interface,
  JsonRpcProvider,
  Transaction,
  Wallet,
  encodeBytes32String,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { config } from "../config/index.js";

// Chain adapter for the minter key. All writes from the minter account go
// through the single-flight sender in services/chainWorker.ts; this module only
// knows how to talk to the chain. There is deliberately NO ethers NonceManager:
// its local nonce counter desynced permanently after one failed gas estimate
// (red-team HIGH). Every send reads the account nonce from the chain.

export const VOUCHER_ABI = [
  "function mint(address to, uint256 coinAmount, bytes32 gameType, bytes32 sessionId) external returns (uint256)",
  "function commitPurchase(address user, uint256 coinsAdded, bytes32 receiptHash) external",
  // VoucherMinted carries the canonical tokenId. Parse it via the interface; the
  // ERC1155 TransferSingle log comes FIRST and its topics[3] is the recipient.
  "event VoucherMinted(uint256 indexed tokenId, address indexed to, uint256 coinAmount, bytes32 indexed gameType, bytes32 sessionId)",
  "function usedSessionId(bytes32 sessionId) external view returns (bool)",
  "function tokenIdForSession(bytes32 sessionId) external view returns (uint256)",
  "function mintBudgetAvailable() external view returns (uint256)",
  "error EnforcedPause()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error ERC1155InvalidReceiver(address receiver)",
];

export const voucherInterface = new Interface(VOUCHER_ABI);

// L-4: the full session id, hashed — never truncated. This is the ONLY
// encoding for new vouchers; it is stored on NFTVoucher.onChainSessionId.
export function sessionIdToBytes32(sessionId: string): string {
  if (!sessionId) throw new Error("sessionId required");
  return keccak256(toUtf8Bytes(sessionId));
}

// Encoding used before L-4. Only for vouchers created before the change (their
// onChainSessionId is NULL), so on-chain usedSessionId still dedupes against any
// orphaned legacy transaction for the same voucher.
export function legacySessionIdToBytes32(sessionId: string): string {
  return encodeBytes32String(sessionId.slice(0, 31));
}

export function gameTypeToBytes32(gameType: string): string {
  return encodeBytes32String(gameType.slice(0, 31));
}

export interface ChainLog {
  topics: readonly string[];
  data: string;
}

// L-3: never default to "0" — a missing/garbled event must surface as an error.
export function tokenIdFromLogs(logs: readonly ChainLog[], expectedSessionId?: string): string {
  for (const log of logs) {
    let parsed;
    try {
      parsed = voucherInterface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue; // not ours (e.g. ERC1155 TransferSingle)
    }
    if (parsed?.name !== "VoucherMinted") continue;
    if (expectedSessionId && (parsed.args.sessionId as string).toLowerCase() !== expectedSessionId.toLowerCase()) continue;
    return (parsed.args.tokenId as bigint).toString();
  }
  throw new Error("VoucherMinted event not found in receipt");
}

export interface ChainCall {
  fn: "mint" | "commitPurchase";
  args: unknown[];
}

export interface FeeFields {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

export interface SignedTx {
  raw: string;
  hash: string;
  nonce: number;
}

export interface ChainReceipt {
  hash: string;
  status: number; // 1 success, 0 reverted
  logs: readonly ChainLog[];
}

export interface ChainTxInfo extends FeeFields {
  hash: string;
  nonce: number;
}

export interface SessionMintInfo {
  minted: boolean;
  tokenId?: string;
  txHash?: string;
}

export interface MinterChain {
  minterAddress(): string;
  nonce(tag: "latest" | "pending"): Promise<number>;
  preflight(call: ChainCall): Promise<void>;
  sign(call: ChainCall, nonce: number, fees?: FeeFields): Promise<SignedTx>;
  broadcast(raw: string): Promise<void>;
  getReceipt(hash: string): Promise<ChainReceipt | null>;
  getTx(hash: string): Promise<ChainTxInfo | null>;
  waitForReceipt(hash: string, timeoutMs: number): Promise<ChainReceipt | null>;
  // null = contract has no usedSessionId view (pre-hardening deployment).
  sessionMint(sessionId32: string): Promise<SessionMintInfo | null>;
  // Fallback for pre-hardening deployments: scan VoucherMinted logs.
  findMintEvent(to: string, sessionId32: string): Promise<SessionMintInfo>;
  // null = view not available.
  mintBudgetAvailable(): Promise<bigint | null>;
}

// A view that does not exist on the deployed bytecode reverts with empty data.
function isMissingFunction(err: unknown): boolean {
  const e = err as { code?: string; data?: string | null; reason?: string | null };
  return e?.code === "CALL_EXCEPTION" && (!e.data || e.data === "0x") && !e.reason;
}

export class EthersMinterChain implements MinterChain {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly contract: Contract;

  constructor(rpcUrl: string, privateKey: string, private readonly contractAddress: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);
    this.contract = new Contract(contractAddress, VOUCHER_ABI, this.wallet);
  }

  minterAddress(): string {
    return this.wallet.address;
  }

  nonce(tag: "latest" | "pending"): Promise<number> {
    return this.provider.getTransactionCount(this.wallet.address, tag);
  }

  async preflight(call: ChainCall): Promise<void> {
    await this.contract.getFunction(call.fn).staticCall(...call.args, { from: this.wallet.address });
  }

  async sign(call: ChainCall, nonce: number, fees?: FeeFields): Promise<SignedTx> {
    const data = voucherInterface.encodeFunctionData(call.fn, call.args);
    const populated = await this.wallet.populateTransaction({ to: this.contractAddress, data, nonce, ...fees });
    const raw = await this.wallet.signTransaction(populated);
    return { raw, hash: Transaction.from(raw).hash!, nonce };
  }

  async broadcast(raw: string): Promise<void> {
    await this.provider.broadcastTransaction(raw);
  }

  async getReceipt(hash: string): Promise<ChainReceipt | null> {
    const r = await this.provider.getTransactionReceipt(hash);
    return r ? { hash: r.hash, status: r.status ?? 0, logs: r.logs } : null;
  }

  async getTx(hash: string): Promise<ChainTxInfo | null> {
    const t = await this.provider.getTransaction(hash);
    if (!t) return null;
    return {
      hash: t.hash,
      nonce: t.nonce,
      maxFeePerGas: t.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: t.maxPriorityFeePerGas ?? undefined,
      gasPrice: t.maxFeePerGas ? undefined : t.gasPrice ?? undefined,
    };
  }

  async waitForReceipt(hash: string, timeoutMs: number): Promise<ChainReceipt | null> {
    try {
      const r = await this.provider.waitForTransaction(hash, 1, timeoutMs);
      return r ? { hash: r.hash, status: r.status ?? 0, logs: r.logs } : null;
    } catch (err) {
      if ((err as { code?: string }).code === "TIMEOUT") return null;
      throw err;
    }
  }

  async sessionMint(sessionId32: string): Promise<SessionMintInfo | null> {
    let used: boolean;
    try {
      used = (await this.contract.getFunction("usedSessionId").staticCall(sessionId32)) as boolean;
    } catch (err) {
      if (isMissingFunction(err)) return null;
      throw err;
    }
    if (!used) return { minted: false };
    const tokenId = (await this.contract.getFunction("tokenIdForSession").staticCall(sessionId32)) as bigint;
    return { minted: true, tokenId: tokenId.toString() };
  }

  async findMintEvent(to: string, sessionId32: string): Promise<SessionMintInfo> {
    const latest = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - config.MINT_EVENT_LOOKBACK_BLOCKS);
    const logs = await this.contract.queryFilter(this.contract.filters.VoucherMinted(null, to), fromBlock, latest);
    for (const log of logs) {
      const parsed = voucherInterface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && (parsed.args.sessionId as string).toLowerCase() === sessionId32.toLowerCase()) {
        return { minted: true, tokenId: (parsed.args.tokenId as bigint).toString(), txHash: log.transactionHash };
      }
    }
    return { minted: false };
  }

  async mintBudgetAvailable(): Promise<bigint | null> {
    try {
      return (await this.contract.getFunction("mintBudgetAvailable").staticCall()) as bigint;
    } catch (err) {
      if (isMissingFunction(err)) return null;
      throw err;
    }
  }
}

let _chain: MinterChain | null | undefined;

// null when the minter is not configured (dev/test without a chain).
export function getMinterChain(): MinterChain | null {
  if (_chain === undefined) {
    _chain =
      config.MINTER_PRIVATE_KEY && config.CONTRACT_ADDRESS
        ? new EthersMinterChain(config.POLYGON_RPC, config.MINTER_PRIVATE_KEY, config.CONTRACT_ADDRESS)
        : null;
  }
  return _chain;
}

export function setMinterChainForTest(chain: MinterChain | null | undefined): void {
  _chain = chain;
}

// ---------------------------------------------------------------------------
// Revert classification (contract hardening 2026-10 policy).
// ---------------------------------------------------------------------------

export type ChainErrorKind =
  | "ALREADY_MINTED" // "Session id already used": success, read tokenIdForSession
  | "RETRY_CAP" // "Daily mint cap exceeded": keep queued
  | "RETRY_BACKING" // "Insufficient backing": keep queued + alert ops
  | "RETRY_PAUSED" // paused: keep queued; refund only by manual ops decision
  | "RETRY_CONFIG" // minter lacks role etc.: keep queued + alert ops
  | "TERMINAL" // can never succeed for this voucher: refund
  | "UNKNOWN_REVERT" // deterministic revert we do not recognise: retry, then manual review
  | "TRANSIENT"; // RPC / network / timeout: retry

const TERMINAL_REASONS = [
  "Below min coin balance",
  "Above max coin balance",
  "Invalid game type",
  "Invalid session id",
  "Zero user address",
  "Zero coins",
  "Empty receipt hash",
];

export function classifyChainError(err: unknown): { kind: ChainErrorKind; detail: string } {
  const e = err as {
    code?: string;
    reason?: string | null;
    revert?: { name?: string } | null;
    data?: string | null;
    shortMessage?: string;
    message?: string;
  };
  if (e?.code !== "CALL_EXCEPTION") {
    return { kind: "TRANSIENT", detail: e?.shortMessage ?? e?.message ?? String(err) };
  }
  let reason = e.reason ?? e.revert?.name ?? null;
  if (!reason && e.data && e.data !== "0x") {
    try {
      reason = voucherInterface.parseError(e.data)?.name ?? null;
    } catch {
      reason = null;
    }
  }
  const detail = reason ?? e.shortMessage ?? "execution reverted";
  if (!reason) return { kind: "UNKNOWN_REVERT", detail };
  if (reason.includes("Session id already used")) return { kind: "ALREADY_MINTED", detail };
  if (reason.includes("Daily mint cap exceeded")) return { kind: "RETRY_CAP", detail };
  if (reason.includes("Insufficient backing")) return { kind: "RETRY_BACKING", detail };
  if (reason === "EnforcedPause" || reason.includes("paused")) return { kind: "RETRY_PAUSED", detail };
  if (reason === "AccessControlUnauthorizedAccount" || reason.includes("AccessControl")) return { kind: "RETRY_CONFIG", detail };
  if (reason === "ERC1155InvalidReceiver") return { kind: "TERMINAL", detail };
  if (TERMINAL_REASONS.some((r) => reason!.includes(r))) return { kind: "TERMINAL", detail };
  return { kind: "UNKNOWN_REVERT", detail };
}
