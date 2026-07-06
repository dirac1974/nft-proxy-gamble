import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";
import { verifyChallenge } from "../../src/services/deviceAttest/challenge.js";
import { config } from "../../src/config/index.js";

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;

beforeAll(async () => {
  await setupTestDb();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = (authRes.body as { token: string }).token;
});

afterAll(() => teardownTestDb());

describe("POST /attestation/challenge", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/attestation/challenge");
    expect(res.status).toBe(401);
  });

  it("issues a verifiable, unexpired challenge to an authed user", async () => {
    const res = await request(app)
      .post("/attestation/challenge")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.challenge).toBeTruthy();
    expect(res.body.nonce).toBeTruthy();
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());

    // The issued challenge must verify against the server secret + carry the nonce.
    const v = verifyChallenge(config.JWT_SECRET, res.body.challenge as string);
    expect(v.valid).toBe(true);
    expect(v.nonce).toBe(res.body.nonce);
  });

  it("issues a fresh nonce each call", async () => {
    const a = await request(app).post("/attestation/challenge").set("Authorization", `Bearer ${token}`);
    const b = await request(app).post("/attestation/challenge").set("Authorization", `Bearer ${token}`);
    expect(a.body.nonce).not.toBe(b.body.nonce);
  });
});

describe("cashout attestation gate — shadow mode (test env) does not block", () => {
  it("allows a money-path call without attestation headers in non-enforced env", async () => {
    // Regression guard: wiring real verification must not change shadow-mode
    // behavior. A cashout with no attestation headers should not 403 on the
    // attestation check (it may fail later for balance/session reasons).
    const res = await request(app)
      .post("/game/cashout")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionId: "nonexistent", coinsToCashout: 100 });
    expect(res.status).not.toBe(403);
  });
});
