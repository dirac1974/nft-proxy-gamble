import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;
let userId: string;

const auth = () => ({ Authorization: `Bearer ${token}` });
const walletCashout = (body: Record<string, unknown>) => request(app).post("/wallet/cashout").set(auth()).send(body);

async function setBalance(coinBalance: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { coinBalance } });
}
async function balance(): Promise<number> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance;
}
async function cashoutRows(): Promise<number> {
  return prisma.transaction.count({ where: { userId, type: "CASHOUT_MINT" } });
}

beforeAll(async () => {
  await setupTestDb();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = (authRes.body as { token: string }).token;
  userId = (authRes.body as { userId: string }).userId;
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 0, ageConfirmed: true } });
});

// Each test starts with a clean daily-limit window.
beforeEach(async () => {
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.nFTVoucher.deleteMany({ where: { userId } });
});

afterAll(() => teardownTestDb());

describe("POST /wallet/cashout", () => {
  it("cashes out without any game session; voucher anchored to an internal wallet-cashout session", async () => {
    await setBalance(1_000);
    const res = await walletCashout({ coinsToCashout: 300 });
    expect(res.status).toBe(202);
    expect(res.body.mintStatus).toBe("PENDING");
    expect(res.body.coinBalance).toBe(700);
    expect(typeof res.body.balanceSig).toBe("string");
    expect(res.headers["x-cashout-remaining"]).toBe("4");
    expect(await balance()).toBe(700);

    const v = await prisma.nFTVoucher.findUniqueOrThrow({ where: { id: res.body.voucherId }, include: { session: true } });
    expect(v.coinBalance).toBe(300);
    expect(v.gameType).toBe("wallet-cashout");
    expect(v.session.gameType).toBe("wallet-cashout");
    expect(v.session.state).toBe("CASHED_OUT");
    expect(v.session.userId).toBe(userId);
    expect(v.sessionId.length).toBeLessThanOrEqual(31); // fits bytes32 for mint
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId, type: "CASHOUT_MINT" } });
    expect(tx).toMatchObject({ coinDelta: -300, balanceAfter: 700, sessionId: v.sessionId });
  });

  it("6 parallel cashouts of the full balance → exactly one succeeds (x5 rounds)", async () => {
    for (let round = 0; round < 5; round++) {
      await prisma.transaction.deleteMany({ where: { userId } });
      await setBalance(500);
      const results = await Promise.all(Array.from({ length: 6 }, () => walletCashout({ coinsToCashout: 500 })));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 202)).toHaveLength(1);
      expect(statuses.every((s) => s === 202 || s === 402 || s === 409)).toBe(true);
      expect(await balance()).toBe(0);
      expect(await cashoutRows()).toBe(1);
    }
    expect(await prisma.nFTVoucher.count({ where: { userId, coinBalance: 500 } })).toBe(5);
  });

  it("daily limit holds under concurrency: 6 parallel small cashouts → exactly 5", async () => {
    await setBalance(10_000);
    const results = await Promise.all(Array.from({ length: 6 }, () => walletCashout({ coinsToCashout: 100 })));
    expect(results.filter((r) => r.status === 202)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(1);
    expect(await cashoutRows()).toBe(5);
    expect(await balance()).toBe(9_500);
  });

  it("enforces min, max-per-voucher (contract MAX_COIN_BALANCE) and integer amounts", async () => {
    await setBalance(500_000);
    expect((await walletCashout({ coinsToCashout: 99 })).status).toBe(400);
    expect((await walletCashout({ coinsToCashout: 100_001 })).status).toBe(400);
    expect((await walletCashout({ coinsToCashout: 150.5 })).status).toBe(400);
    expect((await walletCashout({})).status).toBe(400);
    expect((await walletCashout({ coinsToCashout: 100_000 })).status).toBe(202);
    expect(await balance()).toBe(400_000);
  });

  it("402 on insufficient balance, 403 without age confirmation", async () => {
    await setBalance(150);
    expect((await walletCashout({ coinsToCashout: 200 })).status).toBe(402);
    await prisma.user.update({ where: { id: userId }, data: { ageConfirmed: false } });
    expect((await walletCashout({ coinsToCashout: 100 })).status).toBe(403);
    await prisma.user.update({ where: { id: userId }, data: { ageConfirmed: true } });
    expect(await balance()).toBe(150);
  });

  it("idempotencyKey: retries and parallel duplicates mint one voucher and debit once", async () => {
    await setBalance(1_000);
    const key = "retry-key-0001";
    const results = await Promise.all(Array.from({ length: 6 }, () => walletCashout({ coinsToCashout: 200, idempotencyKey: key })));
    expect(results.every((r) => r.status === 202 || r.status === 200)).toBe(true);
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(new Set(results.map((r) => r.body.voucherId)).size).toBe(1);
    expect(await balance()).toBe(800);
    expect(await cashoutRows()).toBe(1);

    const replay = await walletCashout({ coinsToCashout: 200, idempotencyKey: key });
    expect(replay.status).toBe(200);
    expect(replay.body.voucherId).toBe(results[0].body.voucherId);
    expect(await balance()).toBe(800);

    // Same key, different amount → conflict, not a silent replay.
    expect((await walletCashout({ coinsToCashout: 300, idempotencyKey: key })).status).toBe(409);
    expect((await walletCashout({ coinsToCashout: 200, idempotencyKey: "bad:key" })).status).toBe(400);
  });

  it("requires auth", async () => {
    expect((await request(app).post("/wallet/cashout").send({ coinsToCashout: 100 })).status).toBe(401);
  });
});

describe("POST /game/cashout (shared core, backward compatible)", () => {
  async function rouletteSession(): Promise<string> {
    const s = await request(app).post("/roulette/start-session").set(auth()).send({});
    return s.body.sessionId as string;
  }

  it("still cashes out against an ACTIVE game session", async () => {
    await setBalance(1_000);
    const sid = await rouletteSession();
    const res = await request(app).post("/game/cashout").set(auth()).send({ sessionId: sid, coinsToCashout: 100 });
    expect(res.status).toBe(202);
    expect(await balance()).toBe(900);
    const v = await prisma.nFTVoucher.findUniqueOrThrow({ where: { id: res.body.voucherId } });
    expect(v.gameType).toBe("roulette-euro-1-0");
    expect(v.sessionId).toBe(sid);
  });

  it("6 parallel full-balance cashouts on 6 distinct sessions → exactly one succeeds", async () => {
    await setBalance(700);
    const sids = await Promise.all(Array.from({ length: 6 }, rouletteSession));
    const results = await Promise.all(
      sids.map((sessionId) => request(app).post("/game/cashout").set(auth()).send({ sessionId, coinsToCashout: 700 })),
    );
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(await balance()).toBe(0);
    expect(await cashoutRows()).toBe(1);
  });

  it("daily limit holds under concurrency across sessions (6 parallel → exactly 5)", async () => {
    await setBalance(10_000);
    const sids = await Promise.all(Array.from({ length: 6 }, rouletteSession));
    const results = await Promise.all(
      sids.map((sessionId) => request(app).post("/game/cashout").set(auth()).send({ sessionId, coinsToCashout: 100 })),
    );
    expect(results.filter((r) => r.status === 202)).toHaveLength(5);
    expect(await cashoutRows()).toBe(5);
  });

  it("rejects amounts above the contract max-per-voucher", async () => {
    await setBalance(200_000);
    const sid = await rouletteSession();
    const res = await request(app).post("/game/cashout").set(auth()).send({ sessionId: sid, coinsToCashout: 100_001 });
    expect(res.status).toBe(400);
    expect(await balance()).toBe(200_000);
  });

  it("refuses to use an internal wallet-cashout session as an anchor", async () => {
    await setBalance(1_000);
    const w = await walletCashout({ coinsToCashout: 100 });
    const v = await prisma.nFTVoucher.findUniqueOrThrow({ where: { id: w.body.voucherId } });
    // Even if the internal row were somehow ACTIVE, the game-type allowlist rejects it.
    await prisma.gameSession.update({ where: { id: v.sessionId }, data: { state: "ACTIVE" } });
    const res = await request(app).post("/game/cashout").set(auth()).send({ sessionId: v.sessionId, coinsToCashout: 100 });
    expect(res.status).toBe(409);
    expect(await balance()).toBe(900);
  });
});
