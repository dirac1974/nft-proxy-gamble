import request from "supertest";
import { Wallet } from "ethers";
import { createHmac } from "crypto";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";

// Independently recompute the provably-fair number the same way the server does,
// to assert the revealed serverSeed actually produces the returned winningNumber.
function expectedNumber(serverSeed: string, clientSeed: string, nonce: number): number {
  const digest = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  return Number(BigInt("0x" + digest) % 37n);
}

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;
let userId: string;

async function startSession(clientSeed?: string): Promise<{ sessionId: string; gameType: string; serverSeedHash: string; clientSeed: string; nextServerSeedHash: string }> {
  const res = await request(app)
    .post("/roulette/start-session")
    .set("Authorization", `Bearer ${token}`)
    .send(clientSeed ? { clientSeed } : {});
  return res.body;
}

beforeAll(async () => {
  await setupTestDb();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = (authRes.body as { token: string }).token;
  userId = (authRes.body as { userId: string }).userId;
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 5000, ageConfirmed: true } });
});

afterAll(() => teardownTestDb());

describe("POST /roulette/start-session", () => {
  it("returns a session with serverSeedHash + clientSeed", async () => {
    const s = await startSession();
    expect(s.sessionId).toBeTruthy();
    expect(s.gameType).toBe("roulette-euro-1-0");
    expect(s.serverSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.clientSeed).toBeTruthy();
  });

  it("honors a client-supplied clientSeed", async () => {
    const s = await startSession("my-entropy-123");
    expect(s.clientSeed).toBe("my-entropy-123");
  });
});

describe("POST /roulette/spin", () => {
  it("resolves a spin, reveals a serverSeed that reproduces the winning number, and adjusts balance", async () => {
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 5000 } });
    const s = await startSession();
    const balBefore = (await request(app).get("/balance").set("Authorization", `Bearer ${token}`)).body.coinBalance;

    const res = await request(app)
      .post("/roulette/spin")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionId: s.sessionId, bets: [{ type: "red", amount: 10 }, { type: "straight", amount: 5, numbers: [17] }] });

    expect(res.status).toBe(200);
    const { winningNumber, serverSeed, clientSeed, nonce, totalWagered, totalReturn } = res.body;
    expect(winningNumber).toBeGreaterThanOrEqual(0);
    expect(winningNumber).toBeLessThanOrEqual(36);
    // serverSeed hash commitment holds + reproduces the number.
    expect(expectedNumber(serverSeed, clientSeed, nonce)).toBe(winningNumber);
    expect(totalWagered).toBe(15);

    const balAfter = (await request(app).get("/balance").set("Authorization", `Bearer ${token}`)).body.coinBalance;
    expect(balAfter).toBe(balBefore - totalWagered + totalReturn);
    // signed balance present
    expect(res.body.balanceSig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a second spin on the same session (no seed reuse)", async () => {
    const s = await startSession();
    await request(app).post("/roulette/spin").set("Authorization", `Bearer ${token}`)
      .send({ sessionId: s.sessionId, bets: [{ type: "black", amount: 1 }] });
    const res = await request(app).post("/roulette/spin").set("Authorization", `Bearer ${token}`)
      .send({ sessionId: s.sessionId, bets: [{ type: "black", amount: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already spun/i);
  });

  it("rejects an invalid (non-adjacent) split with 400", async () => {
    const s = await startSession();
    const res = await request(app).post("/roulette/spin").set("Authorization", `Bearer ${token}`)
      .send({ sessionId: s.sessionId, bets: [{ type: "split", amount: 1, numbers: [1, 5] }] });
    expect(res.status).toBe(400);
  });

  it("returns 402 when the total wager exceeds balance", async () => {
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 3 } });
    const s = await startSession();
    const res = await request(app).post("/roulette/spin").set("Authorization", `Bearer ${token}`)
      .send({ sessionId: s.sessionId, bets: [{ type: "red", amount: 10 }] });
    expect(res.status).toBe(402);
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 5000 } });
  });

  it("cross-game guard: /game/deal rejects a roulette session", async () => {
    const s = await startSession();
    const res = await request(app).post("/game/deal").set("Authorization", `Bearer ${token}`)
      .send({ sessionId: s.sessionId });
    expect(res.status).toBe(409);
    // /game/deal now positively gates on "is a video poker variant", so a
    // roulette session is rejected as not-a-poker-session.
    expect(res.body.error).toMatch(/not a video poker session/i);
  });
});
