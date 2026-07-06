import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app";
import { prisma, setupTestDb, teardownTestDb } from "./setup";

// Env vars set by tests/setup.ts before this module loads.

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
  // Seed balance + age confirmation (cashout is gated on ageConfirmed; a real
  // user reaches these flows only after accepting the 18+ modal → /auth/confirm-age).
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 1000, ageConfirmed: true } });
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

    // Balance after deal: signed response
    const balanceRes = await request(app)
      .get("/balance")
      .set("Authorization", `Bearer ${authToken}`);
    const balanceAfter = balanceRes.body.coinBalance as number;
    expect(balanceAfter).toBe(balanceBefore - 2);
    // Verify signed balance format
    expect(balanceRes.body.balanceSig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("draw returns rank, payout, serverSeed, signed balance, and final hand", async () => {
    const drawRes = await request(app)
      .post("/game/draw")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId, holds: [true, true, true, true, true] });

    expect(drawRes.status).toBe(200);
    expect((drawRes.body as { drawnCards: number[] }).drawnCards).toHaveLength(5);
    expect(typeof (drawRes.body as { payout: number }).payout).toBe("number");
    expect(typeof (drawRes.body as { rank: string }).rank).toBe("string");
    // Commit-reveal: serverSeed revealed on draw
    expect((drawRes.body as { serverSeed: string }).serverSeed).toBeTruthy();
    // Signed balance: balanceSig + sigTimestamp present
    expect((drawRes.body as { balanceSig: string }).balanceSig).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof (drawRes.body as { sigTimestamp: number }).sigTimestamp).toBe("number");
  });

  it("second draw on same session returns 409", async () => {
    const res = await request(app)
      .post("/game/draw")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId, holds: [false, false, false, false, false] });
    expect(res.status).toBe(409);
  });

  // FABLE-2026-07 C-1 regression: once a hand is drawn the serverSeed is public,
  // so dealing a second hand on the same session (which the exploit relied on to
  // predict the deck) must be rejected. Provably-fair invariant per ADR-002:
  // serverSeed is never usable for a hand the player can influence after reveal.
  it("second deal on same session (after draw) returns 409 — no seed reuse", async () => {
    const res = await request(app)
      .post("/game/deal")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already played its hand/i);
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

  it("creates an NFT voucher and returns 202 with signed balance", async () => {
    const res = await request(app)
      .post("/game/cashout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ sessionId: cashoutSessionId, coinsToCashout: 100 });

    expect(res.status).toBe(202);
    expect((res.body as { voucherId: string }).voucherId).toBeTruthy();
    expect((res.body as { mintStatus: string }).mintStatus).toBe("PENDING");
    // Signed balance in cashout response
    expect((res.body as { balanceSig: string }).balanceSig).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof (res.body as { sigTimestamp: number }).sigTimestamp).toBe("number");
    // Post-cashout balance should be 900 (1000 - 100)
    expect((res.body as { coinBalance: number }).coinBalance).toBe(900);
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
