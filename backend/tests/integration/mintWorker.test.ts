import { Wallet, encodeBytes32String, keccak256, toUtf8Bytes } from "ethers";
import { prisma, setupTestDb, teardownTestDb } from "./setup";
import { FakeChain, revertError } from "../helpers/fakeChain";
import { manualRefund, processVoucher, runMintPass } from "../../src/services/mintWorker";
import { processCommitment, runCommitPass } from "../../src/services/purchaseCommitmentService";
import { acquireLease } from "../../src/services/chainWorker";
import { sessionIdToBytes32, setMinterChainForTest } from "../../src/services/mintOrchestrator";

let userId: string;
let wallet: string;
const keep = async () => true;

async function makeVoucher(coins: number, opts: { legacy?: boolean; status?: "PENDING" | "FAILED" | "MINTING"; balanceAfter?: number } = {}) {
  const s = await prisma.gameSession.create({
    data: { userId, gameType: "wallet-cashout", betAmount: 0, serverSeed: "", serverSeedHash: "", clientSeed: "", state: "CASHED_OUT" },
  });
  const v = await prisma.nFTVoucher.create({
    data: {
      userId,
      sessionId: s.id,
      coinBalance: coins,
      gameType: "wallet-cashout",
      mintStatus: opts.status ?? "PENDING",
      onChainSessionId: opts.legacy ? null : sessionIdToBytes32(s.id),
    },
  });
  await prisma.transaction.create({
    data: { userId, type: "CASHOUT_MINT", coinDelta: -coins, balanceAfter: opts.balanceAfter ?? 0, sessionId: s.id, nftVoucherId: v.id },
  });
  return v;
}

async function job(id: string) {
  return prisma.nFTVoucher.findUniqueOrThrow({ where: { id }, include: { user: { select: { walletAddress: true } } } });
}

async function balance(): Promise<number> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance;
}

beforeAll(async () => {
  await setupTestDb();
  wallet = Wallet.createRandom().address;
  userId = (await prisma.user.create({ data: { walletAddress: wallet.toLowerCase(), coinBalance: 0 } })).id;
});
afterAll(async () => {
  setMinterChainForTest(undefined);
  await teardownTestDb();
});
beforeEach(async () => {
  await prisma.transaction.deleteMany({});
  await prisma.nFTVoucher.deleteMany({});
  await prisma.iAPReceipt.deleteMany({});
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 0 } });
});

describe("mint worker — nonce handling (red-team HIGH: NonceManager desync)", () => {
  it("a failed gas estimate does not consume a nonce: the next mint uses the chain nonce and lands", async () => {
    const chain = new FakeChain();
    const bad = await makeVoucher(500);
    const good = await makeVoucher(300);
    // First voucher's estimate fails with an RPC error (the old NonceManager
    // incremented its local counter here and every later tx hung on the gap).
    chain.signError = (call) => ((call.args[1] as bigint) === 500n ? Object.assign(new Error("rpc timeout"), { code: "TIMEOUT" }) : null);
    await processVoucher(await job(bad.id), chain);
    await processVoucher(await job(good.id), chain);

    const g = await job(good.id);
    expect(g.mintStatus).toBe("MINTED");
    expect(g.mintNonce).toBe(0);
    expect(chain.latestNonce).toBe(1);
    expect(chain.mempool.size).toBe(0);
    const b = await job(bad.id);
    expect(b.mintStatus).toBe("PENDING");
    expect(b.lastMintError).toMatch(/^TRANSIENT/);
    expect(b.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("happy path: tx hash + nonce persisted, tokenId from VoucherMinted, sessionId = keccak256(utf8(sessionId))", async () => {
    const chain = new FakeChain();
    chain.nextTokenId = 7n;
    const v = await makeVoucher(1_000);
    await processVoucher(await job(v.id), chain);
    const m = await job(v.id);
    expect(m).toMatchObject({ mintStatus: "MINTED", tokenId: "7", mintNonce: 0, mintAttempts: 1 });
    expect(m.txHash).toBe(chain.broadcasts[0]);
    expect(chain.minted[0].sessionId).toBe(keccak256(toUtf8Bytes(v.sessionId)));
    expect(chain.minted[0].to.toLowerCase()).toBe(wallet.toLowerCase());
  });

  it("persists the tx hash BEFORE broadcasting; a failed broadcast is rebroadcast at the same nonce", async () => {
    const chain = new FakeChain();
    const v = await makeVoucher(400);
    let seenInDb: string | null = null;
    chain.broadcastError = (p) => {
      void prisma.nFTVoucher.findUnique({ where: { id: v.id } }).then((r) => (seenInDb = r?.txHash ?? null));
      return chain.broadcasts.length === 0 && p ? new Error("connection reset") : null;
    };
    await processVoucher(await job(v.id), chain);
    let row = await job(v.id);
    expect(row.mintStatus).toBe("MINTING");
    expect(row.txHash).toBeTruthy();
    expect(row.mintNonce).toBe(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(seenInDb).toBe(row.txHash);

    chain.broadcastError = null;
    await processVoucher(row, chain); // txSentAt=epoch → immediate rebroadcast
    row = await job(v.id);
    expect(row.mintStatus).toBe("MINTED");
    expect(chain.minted).toHaveLength(1);
  });

  it("stuck tx: waits until MINT_TX_TIMEOUT_MS, then replaces at the same nonce with bumped fees; mints exactly once", async () => {
    const chain = new FakeChain();
    chain.automine = false;
    const v = await makeVoucher(200);
    await processVoucher(await job(v.id), chain);
    let row = await job(v.id);
    expect(row.mintStatus).toBe("MINTING");
    const firstHash = row.txHash!;

    await processVoucher(row, chain); // not timed out yet → no action
    expect(chain.broadcasts).toHaveLength(1);

    await prisma.nFTVoucher.update({ where: { id: v.id }, data: { txSentAt: new Date(Date.now() - 10 * 60_000) } });
    await processVoucher(await job(v.id), chain);
    row = await job(v.id);
    expect(chain.broadcasts).toHaveLength(2);
    expect(row.txHash).not.toBe(firstHash);
    expect(row.mintNonce).toBe(0);
    const replacement = chain.mempool.get(row.txHash!)!;
    expect(replacement.nonce).toBe(0);
    expect(replacement.fees.maxFeePerGas!).toBeGreaterThan(100n);
    expect(chain.mempool.has(firstHash)).toBe(false);

    chain.mineAll();
    await processVoucher(await job(v.id), chain);
    expect((await job(v.id)).mintStatus).toBe("MINTED");
    expect(chain.minted).toHaveLength(1);
  });

  it("dropped tx whose nonce was consumed by another tx is resent (session re-checked first)", async () => {
    const chain = new FakeChain();
    chain.dropOnBroadcast = true;
    const v = await makeVoucher(200);
    await processVoucher(await job(v.id), chain);
    expect((await job(v.id)).mintStatus).toBe("MINTING");
    chain.dropOnBroadcast = false;
    chain.latestNonce = 1; // something else used nonce 0
    await processVoucher(await job(v.id), chain);
    const row = await job(v.id);
    expect(row.mintStatus).toBe("MINTED");
    expect(row.mintNonce).toBe(1);
    expect(chain.minted).toHaveLength(1);
  });
});

describe("mint worker — idempotency (never double-mint)", () => {
  it("a voucher already minted on-chain is marked MINTED without sending", async () => {
    const chain = new FakeChain();
    const v = await makeVoucher(300, { status: "FAILED" });
    chain.sessions.set(v.onChainSessionId!, 42n);
    await processVoucher(await job(v.id), chain);
    expect(await job(v.id)).toMatchObject({ mintStatus: "MINTED", tokenId: "42" });
    expect(chain.broadcasts).toHaveLength(0);
  });

  it("'Session id already used' revert is treated as success via tokenIdForSession", async () => {
    const chain = new FakeChain();
    const v = await makeVoucher(300);
    const real = chain.sessionMint.bind(chain);
    let calls = 0;
    chain.sessionMint = async (sid) => (calls++ === 0 ? { minted: false } : real(sid)); // race: minted between check and send
    chain.sessions.set(v.onChainSessionId!, 9n);
    await processVoucher(await job(v.id), chain);
    expect(await job(v.id)).toMatchObject({ mintStatus: "MINTED", tokenId: "9" });
    expect(chain.broadcasts).toHaveLength(0);
  });

  it("pre-hardening contract (no usedSessionId view): falls back to VoucherMinted log scan", async () => {
    const chain = new FakeChain();
    const v = await makeVoucher(300);
    await processVoucher(await job(v.id), chain);
    const minted = await job(v.id);
    // DB later loses the result (e.g. crash before the MINTED write).
    await prisma.nFTVoucher.update({ where: { id: v.id }, data: { mintStatus: "PENDING", tokenId: null } });
    chain.legacyContract = true;
    await processVoucher(await job(v.id), chain);
    expect(await job(v.id)).toMatchObject({ mintStatus: "MINTED", tokenId: minted.tokenId, txHash: minted.txHash });
    expect(chain.minted).toHaveLength(1);
  });

  it("legacy rows (onChainSessionId NULL) keep the legacy bytes32 encoding so orphaned old txs dedupe", async () => {
    const chain = new FakeChain();
    const v = await makeVoucher(300, { legacy: true, status: "FAILED" });
    await processVoucher(await job(v.id), chain);
    const row = await job(v.id);
    expect(row.onChainSessionId).toBe(encodeBytes32String(v.sessionId.slice(0, 31)));
    expect(row.mintStatus).toBe("MINTED");
    expect(chain.minted[0].sessionId).toBe(row.onChainSessionId);
  });

  it("L-4: two session ids sharing a 31-char prefix map to different bytes32", () => {
    const a = "x".repeat(31) + "A";
    const b = "x".repeat(31) + "B";
    expect(sessionIdToBytes32(a)).not.toBe(sessionIdToBytes32(b));
  });

  it("L-3: a successful receipt without VoucherMinted never records tokenId '0'", async () => {
    const chain = new FakeChain();
    chain.omitVoucherEvent = true;
    chain.legacyContract = true; // force the receipt path
    const v = await makeVoucher(300);
    await processVoucher(await job(v.id), chain).catch(() => undefined);
    const row = await job(v.id);
    expect(row.tokenId).toBeNull();
    expect(row.mintStatus).toBe("MINTING");
    await expect(processVoucher(row, chain)).rejects.toThrow(/VoucherMinted event not found/);
    expect((await job(v.id)).mintStatus).toBe("MINTING");
  });
});

describe("mint worker — retry / refund policy", () => {
  it("daily cap: mintBudgetAvailable < coins → stays queued, nothing sent, NOT refunded", async () => {
    const chain = new FakeChain();
    chain.budget = 100n;
    const v = await makeVoucher(500);
    await processVoucher(await job(v.id), chain);
    const row = await job(v.id);
    expect(row.mintStatus).toBe("PENDING");
    expect(row.lastMintError).toMatch(/^RETRY_CAP/);
    expect(row.refundedAt).toBeNull();
    expect(chain.broadcasts).toHaveLength(0);
    expect(await balance()).toBe(0);
    chain.budget = 10_000n;
    await prisma.nFTVoucher.update({ where: { id: v.id }, data: { nextAttemptAt: new Date() } });
    await runMintPass(chain, keep);
    expect((await job(v.id)).mintStatus).toBe("MINTED");
  });

  it("'Insufficient backing' and paused → stay queued + alert, NOT refunded", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const chain = new FakeChain();
    const v1 = await makeVoucher(300);
    chain.preflightError = () => revertError("Insufficient backing");
    await processVoucher(await job(v1.id), chain);
    expect(await job(v1.id)).toMatchObject({ mintStatus: "PENDING", refundedAt: null });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("[ALERT][mint] mint blocked: RETRY_BACKING"))).toBe(true);
    chain.preflightError = () => Object.assign(revertError(null, "0xd93c0665"), { reason: null });
    await processVoucher(await job(v1.id), chain);
    expect((await job(v1.id)).lastMintError).toMatch(/^RETRY_PAUSED/);
    expect(await balance()).toBe(0);
    spy.mockRestore();
  });

  it("unknown revert: retried, flagged MANUAL_REVIEW after MINT_MAX_ATTEMPTS, never auto-refunded", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const chain = new FakeChain();
    chain.preflightError = () => revertError("Something new");
    const v = await makeVoucher(300);
    for (let i = 0; i < 6; i++) await processVoucher(await job(v.id), chain);
    const row = await job(v.id);
    expect(row.mintStatus).toBe("PENDING");
    expect(row.lastMintError).toMatch(/^MANUAL_REVIEW: UNKNOWN_REVERT/);
    expect(await balance()).toBe(0);
    spy.mockRestore();
  });

  it("terminal revert → atomic compensating refund (CASHOUT_REFUND), idempotent", async () => {
    const chain = new FakeChain();
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 50 } });
    const v = await makeVoucher(300, { balanceAfter: 50 });
    chain.preflightError = () => revertError("Above max coin balance");
    await processVoucher(await job(v.id), chain);
    const row = await job(v.id);
    expect(row.mintStatus).toBe("FAILED_REFUNDED");
    expect(row.refundedAt).not.toBeNull();
    expect(await balance()).toBe(350);
    const refunds = await prisma.transaction.findMany({ where: { userId, type: "CASHOUT_REFUND" } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ coinDelta: 300, balanceAfter: 350, nftVoucherId: v.id, sessionId: v.sessionId });
    // Re-processing / concurrent manual refund never double-credits.
    await Promise.all([processVoucher(row, chain), manualRefund(v.id, "dup", chain), manualRefund(v.id, "dup", chain)]);
    expect(await balance()).toBe(350);
    expect(await prisma.transaction.count({ where: { userId, type: "CASHOUT_REFUND" } })).toBe(1);
    expect(chain.broadcasts).toHaveLength(0);
  });

  it("refund is refused while a tx for the voucher could still land (nonce not consumed)", async () => {
    const chain = new FakeChain();
    chain.automine = false;
    const v = await makeVoucher(300);
    await processVoucher(await job(v.id), chain);
    expect((await job(v.id)).mintStatus).toBe("MINTING");
    expect(await manualRefund(v.id, "ops", chain)).toBe("NOT_SAFE");
    expect(await balance()).toBe(0);
    chain.mineAll();
    expect(await manualRefund(v.id, "ops", chain)).toBe("MINTED");
    expect((await job(v.id)).mintStatus).toBe("MINTED");
  });

  it("manual refund after the in-flight tx's nonce was consumed without minting", async () => {
    const chain = new FakeChain();
    chain.dropOnBroadcast = true;
    const v = await makeVoucher(300);
    await processVoucher(await job(v.id), chain);
    chain.latestNonce = 5;
    expect(await manualRefund(v.id, "contract paused 48h", chain)).toBe("REFUNDED");
    expect(await balance()).toBe(300);
    expect(await manualRefund(v.id, "again", chain)).toBe("NOT_REFUNDABLE");
  });

  it("a refunded voucher is never sent again", async () => {
    const chain = new FakeChain();
    const v = await makeVoucher(300);
    chain.preflightError = () => revertError("Invalid game type");
    await processVoucher(await job(v.id), chain);
    chain.preflightError = null;
    await prisma.nFTVoucher.update({ where: { id: v.id }, data: { nextAttemptAt: new Date(0) } });
    await runMintPass(chain, keep);
    expect(chain.broadcasts).toHaveLength(0);
    expect((await job(v.id)).mintStatus).toBe("FAILED_REFUNDED");
  });

  it("concurrent passes send one tx per voucher (single-flight sender)", async () => {
    const chain = new FakeChain();
    const vs = await Promise.all([makeVoucher(100), makeVoucher(200), makeVoucher(300)]);
    await Promise.all([runMintPass(chain, keep), runMintPass(chain, keep)]);
    for (const v of vs) expect((await job(v.id)).mintStatus).toBe("MINTED");
    expect(chain.minted).toHaveLength(3);
    expect(new Set(chain.minted.map((m) => m.sessionId)).size).toBe(3);
  });
});

describe("worker lease", () => {
  it("only one holder at a time; the holder can renew", async () => {
    await prisma.workerLease.deleteMany({});
    expect(await acquireLease("A")).toBe(true);
    const lease = await prisma.workerLease.findUniqueOrThrow({ where: { name: "chain-sender" } });
    expect(lease.expiresAt.getTime() - Date.now()).toBeGreaterThan(60_000); // stored as UTC, not session TZ
    expect(lease.expiresAt.getTime() - Date.now()).toBeLessThan(10 * 60_000);
    expect(await acquireLease("B")).toBe(false);
    expect(await acquireLease("A")).toBe(true);
    await prisma.workerLease.update({ where: { name: "chain-sender" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await acquireLease("B")).toBe(true);
    await prisma.workerLease.deleteMany({});
  });
});

describe("purchase commitments (M-4: durable queue, shared serialized sender)", () => {
  async function makeReceipt(extra: Record<string, unknown> = {}) {
    return prisma.iAPReceipt.create({
      data: {
        userId,
        platform: "google",
        receiptHash: keccak256(toUtf8Bytes(String(Math.random()))).slice(2),
        productId: "nfpg.coins.100",
        coinsGranted: 100,
        ...extra,
      },
    });
  }
  const rjob = (id: string) => prisma.iAPReceipt.findUniqueOrThrow({ where: { id }, include: { user: { select: { walletAddress: true } } } });

  it("PENDING receipt → commitPurchase sent (hash persisted) → COMMITTED", async () => {
    const chain = new FakeChain();
    const r = await makeReceipt();
    await runCommitPass(chain, keep);
    let row = await rjob(r.id);
    expect(row.commitStatus).toBe("SENT");
    expect(row.onChainTxHash).toBe(chain.broadcasts[0]);
    expect(row.commitTxHashes).toEqual([chain.broadcasts[0]]);
    await processCommitment(row, chain);
    row = await rjob(r.id);
    expect(row.commitStatus).toBe("COMMITTED");
    expect(chain.commits).toEqual([{ user: wallet.toLowerCase(), coins: 100n, receiptHash: `0x${r.receiptHash}` }]);
  });

  it("mints and commits share one nonce sequence", async () => {
    const chain = new FakeChain();
    const v = await makeVoucher(300);
    const r = await makeReceipt();
    await runMintPass(chain, keep);
    await runCommitPass(chain, keep);
    expect((await job(v.id)).mintNonce).toBe(0);
    expect((await rjob(r.id)).commitNonce).toBe(1);
  });

  it("transient failure stays PENDING with backoff; terminal revert → FAILED; balances untouched", async () => {
    const chain = new FakeChain();
    const a = await makeReceipt();
    chain.preflightError = () => Object.assign(new Error("rpc down"), { code: "SERVER_ERROR" });
    await processCommitment(await rjob(a.id), chain);
    expect(await rjob(a.id)).toMatchObject({ commitStatus: "PENDING", commitAttempts: 1 });
    const b = await makeReceipt();
    chain.preflightError = () => revertError("Zero coins");
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await processCommitment(await rjob(b.id), chain);
    expect((await rjob(b.id)).commitStatus).toBe("FAILED");
    expect(await balance()).toBe(0);
  });

  it("legacy row with a confirmed onChainTxHash is marked COMMITTED without resending", async () => {
    const chain = new FakeChain();
    chain.receipts.set("0xlegacy", { hash: "0xlegacy", status: 1, logs: [] });
    const r = await makeReceipt({ onChainTxHash: "0xlegacy" });
    await processCommitment(await rjob(r.id), chain);
    expect((await rjob(r.id)).commitStatus).toBe("COMMITTED");
    expect(chain.broadcasts).toHaveLength(0);
  });
});
