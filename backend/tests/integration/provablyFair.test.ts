import request from "supertest";
import { Wallet } from "ethers";
import { keccak256, toUtf8Bytes } from "ethers";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";

// FABLE-2026-07 H-2 end-to-end: the per-user server-seed chain must be
// continuous (each session's commitment was published by the previous session)
// and honest (the revealed serverSeed hashes to the committed serverSeedHash).

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;
let userId: string;
let chainHashAtAuth: string | null;

beforeAll(async () => {
  await setupTestDb();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = authRes.body.token;
  userId = authRes.body.userId;
  chainHashAtAuth = authRes.body.serverSeedChainHash;
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 1000, ageConfirmed: true } });
});

afterAll(() => teardownTestDb());

async function startSession(): Promise<{ sessionId: string; serverSeedHash: string; clientSeed: string; nextServerSeedHash: string }> {
  const res = await request(app)
    .post("/game/start-session")
    .set("Authorization", `Bearer ${token}`)
    .send({ betAmount: 1 });
  return res.body;
}

describe("server-seed chain (H-2)", () => {
  it("initializes the chain at account creation", () => {
    expect(chainHashAtAuth).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("the first session's commitment equals the hash published at auth", async () => {
    const s1 = await startSession();
    expect(s1.serverSeedHash).toBe(chainHashAtAuth);
    expect(s1.nextServerSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s1.nextServerSeedHash).not.toBe(s1.serverSeedHash);
  });

  it("each session's commitment equals the previous session's nextServerSeedHash", async () => {
    const a = await startSession();
    const b = await startSession();
    expect(b.serverSeedHash).toBe(a.nextServerSeedHash);
    const c = await startSession();
    expect(c.serverSeedHash).toBe(b.nextServerSeedHash);
  });

  it("the revealed serverSeed hashes to the committed serverSeedHash", async () => {
    const s = await startSession();
    await request(app).post("/game/deal").set("Authorization", `Bearer ${token}`).send({ sessionId: s.sessionId });
    const draw = await request(app)
      .post("/game/draw")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionId: s.sessionId, holds: [false, false, false, false, false] });
    const revealed = draw.body.serverSeed as string;
    expect(keccak256(toUtf8Bytes(revealed))).toBe(s.serverSeedHash);
  });

  it("distinct sessions never reuse a serverSeed (checked via distinct commitments)", async () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const s = await startSession();
      expect(hashes.has(s.serverSeedHash)).toBe(false);
      hashes.add(s.serverSeedHash);
    }
  });
});
