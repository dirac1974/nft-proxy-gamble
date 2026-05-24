import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app";
import { prisma, setupTestDb, teardownTestDb } from "./setup";

process.env.JWT_SECRET = "test_secret_that_is_long_enough_for_zod_32chars";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://nftp:nftp_dev@localhost:5432/nft_proxy_gamble_test";
process.env.NODE_ENV = "test";

const app = createApp();
const testWallet = Wallet.createRandom();
let authToken: string;
let userId: string;

beforeAll(async () => {
  await setupTestDb();
  // Authenticate
  const nonceRes = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
  const signature = await testWallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: testWallet.address, signature });
  authToken = (authRes.body as { token: string }).token;
  userId = (authRes.body as { userId: string }).userId;
  // Seed balance
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 1000 } });
});

afterAll(() => teardownTestDb());

describe("POST /game/start-session", () => {
  it("creates a session and returns serverSeedHash + clientSeed", async () => {
    const res = await request(app)
      .post("/game/start-session")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ betAmount: 1 });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.serverSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(res.body.clientSeed).toBeTruthy();
  });

  it("returns 402 when balance is insufficient", async () => {
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 0 } });
    const res = await request(app)
      .post("/game/start-session")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ betAmount: 5 });
    expect(res.status).toBe(402);
    // Restore balance
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 1000 } });
  });
});

describe("full game flow: start → deal → draw", () => {
  let sessionId: string;

  it("deal returns 5 cards and deducts bet from balance", async () => {
    const startRes = await request(app)
      .post("/game/start-session")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ betAmount: 2 });
    sessionId = (startRes.body as { sessionId: string }).sessionId;

    const balanceBefore = (
      await request(app).get("/balance").set("Authorization", `Bearer ${authToken}`)
    ).body.coinBalance as number;

    const dealRes = await request(app)
      .post("/game/deal")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId });

    expect(dealRes.status).toBe(200);
    expect((dealRes.body as { dealtCards: number[] }).dealtCards).toHaveLength(5);

    const balanceAfter = (
      await request(app).get("/balance").set("Authorization", `Bearer ${authToken}`)
    ).body.coinBalance as number;
    expect(balanceAfter).toBe(balanceBefore - 2);
  });

  it("draw returns rank, payout, and final hand", async () => {
    const drawRes = await request(app)
      .post("/game/draw")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId, holds: [true, true, true, true, true] });

    expect(drawRes.status).toBe(200);
    expect((drawRes.body as { drawnCards: number[] }).drawnCards).toHaveLength(5);
    expect(typeof (drawRes.body as { payout: number }).payout).toBe("number");
    expect(typeof (drawRes.body as { rank: string }).rank).toBe("string");
  });

  it("second draw on same session returns 409", async () => {
    const res = await request(app)
      .post("/game/draw")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId, holds: [false, false, false, false, false] });
    expect(res.status).toBe(409);
  });
});

describe("POST /game/cashout", () => {
  let cashoutSessionId: string;

  beforeEach(async () => {
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 1000 } });
    const startRes = await request(app)
      .post("/game/start-session")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ betAmount: 1 });
    cashoutSessionId = (startRes.body as { sessionId: string }).sessionId;
  });

  it("creates an NFT voucher and returns 202", async () => {
    const res = await request(app)
      .post("/game/cashout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId: cashoutSessionId, coinsToCashout: 100 });

    expect(res.status).toBe(202);
    expect((res.body as { voucherId: string }).voucherId).toBeTruthy();
    expect((res.body as { mintStatus: string }).mintStatus).toBe("PENDING");
  });

  it("returns 402 when coinsToCashout > balance", async () => {
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 50 } });
    const res = await request(app)
      .post("/game/cashout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId: cashoutSessionId, coinsToCashout: 100 });
    expect(res.status).toBe(402);
  });
});

describe("GET /nfts", () => {
  it("returns a list of vouchers for the user", async () => {
    const res = await request(app).get("/nfts").set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
