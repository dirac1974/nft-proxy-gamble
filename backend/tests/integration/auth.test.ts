import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app";
import { decode } from "jsonwebtoken";
import { prisma, setupTestDb, teardownTestDb } from "./setup";

// Env vars are set unconditionally by tests/setup.ts (a Jest setupFile) before
// this module loads, so createApp() picks up the correct JWT_SECRET from config.
const app = createApp();
const testWallet = Wallet.createRandom();

beforeAll(() => setupTestDb());
afterAll(() => teardownTestDb());

describe("GET /auth/nonce", () => {
  it("returns a nonce for a valid address", async () => {
    const res = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    expect(res.status).toBe(200);
    expect(res.body.nonce).toBeTruthy();
  });

  it("returns 400 for invalid address", async () => {
    const res = await request(app).get("/auth/nonce?address=notanaddress");
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/verify", () => {
  it("returns JWT for valid signature", async () => {
    const nonceRes = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const { nonce } = nonceRes.body as { nonce: string };
    const signature = await testWallet.signMessage(nonce);

    const res = await request(app).post("/auth/verify").send({
      address: testWallet.address,
      signature,
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.userId).toBeTruthy();
  });

  it("returns 401 for wrong signature", async () => {
    const nonceRes = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const { nonce } = nonceRes.body as { nonce: string };
    const otherWallet = Wallet.createRandom();
    const signature = await otherWallet.signMessage(nonce);

    const res = await request(app).post("/auth/verify").send({
      address: testWallet.address,
      signature,
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when nonce is consumed (replay)", async () => {
    const nonceRes = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const { nonce } = nonceRes.body as { nonce: string };
    const signature = await testWallet.signMessage(nonce);

    await request(app).post("/auth/verify").send({ address: testWallet.address, signature });
    // Second use of same nonce/signature
    const res = await request(app).post("/auth/verify").send({ address: testWallet.address, signature });
    expect(res.status).toBe(401);
  });
});

describe("GET /balance", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).get("/balance");
    expect(res.status).toBe(401);
  });

  it("returns balance for authenticated user", async () => {
    const nonceRes = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const signature = await testWallet.signMessage((nonceRes.body as { nonce: string }).nonce);
    const authRes = await request(app).post("/auth/verify").send({ address: testWallet.address, signature });
    const { token } = authRes.body as { token: string };

    const res = await request(app).get("/balance").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.coinBalance).toBe("number");
  });
});

async function siweLogin(w: { address: string; signMessage(m: string): Promise<string> }): Promise<{ status: number; body: Record<string, unknown> }> {
  const n = await request(app).get(`/auth/nonce?address=${w.address}`);
  const signature = await w.signMessage(n.body.message as string);
  const res = await request(app).post("/auth/verify").send({ address: w.address, signature, message: n.body.message });
  return { status: res.status, body: res.body as Record<string, unknown> };
}

describe("SIWE (EIP-4361) sign-in", () => {
  it("/auth/nonce returns { nonce, message, expiresAt } with an EIP-4361 message", async () => {
    const res = await request(app).get(`/auth/nonce?address=${testWallet.address.toLowerCase()}`);
    expect(res.status).toBe(200);
    const { nonce, message, expiresAt } = res.body as { nonce: string; message: string; expiresAt: string };
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    const lines = message.split("\n");
    expect(lines[0]).toBe("localhost wants you to sign in with your Ethereum account:");
    expect(lines[1]).toBe(testWallet.address); // EIP-55 checksummed
    expect(message).toContain("\nURI: https://localhost\n");
    expect(message).toContain("\nVersion: 1\n");
    expect(message).toContain("\nChain ID: 80002\n");
    expect(message).toContain(`\nNonce: ${nonce}\n`);
    expect(message).toMatch(/\nIssued At: \d{4}-\d\d-\d\dT[\d:.]+Z\n/);
    expect(message).toContain(`\nExpiration Time: ${expiresAt}`);
  });

  it("verifies a signature over the message and issues a token", async () => {
    const r = await siweLogin(testWallet);
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
  });

  it("rejects a replayed message (single-use nonce)", async () => {
    const n = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const signature = await testWallet.signMessage(n.body.message);
    const body = { address: testWallet.address, signature, message: n.body.message };
    expect((await request(app).post("/auth/verify").send(body)).status).toBe(200);
    expect((await request(app).post("/auth/verify").send(body)).status).toBe(401);
  });

  it("concurrent double-use of one message yields exactly one token", async () => {
    const n = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const signature = await testWallet.signMessage(n.body.message);
    const body = { address: testWallet.address, signature, message: n.body.message };
    const rs = await Promise.all(Array.from({ length: 5 }, () => request(app).post("/auth/verify").send(body)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it("rejects a tampered message (domain changed), even if signed by the wallet", async () => {
    const n = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const tampered = (n.body.message as string).replace("localhost wants", "evil.example wants");
    const signature = await testWallet.signMessage(tampered);
    const res = await request(app).post("/auth/verify").send({ address: testWallet.address, signature, message: tampered });
    expect(res.status).toBe(401);
  });

  it("rejects a message issued for a different address", async () => {
    const other = Wallet.createRandom();
    const n = await request(app).get(`/auth/nonce?address=${other.address}`);
    const signature = await testWallet.signMessage(n.body.message);
    const res = await request(app).post("/auth/verify").send({ address: testWallet.address, signature, message: n.body.message });
    expect(res.status).toBe(401);
  });

  it("third-party nonce requests for my address do not invalidate my pending nonce (no login DoS)", async () => {
    const mine = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    for (let i = 0; i < 3; i++) await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const signature = await testWallet.signMessage(mine.body.message);
    const res = await request(app).post("/auth/verify").send({ address: testWallet.address, signature, message: mine.body.message });
    expect(res.status).toBe(200);
  });

  it("rejects an expired nonce", async () => {
    const n = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    await prisma.authNonce.update({ where: { nonce: n.body.nonce }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const signature = await testWallet.signMessage(n.body.message);
    const res = await request(app).post("/auth/verify").send({ address: testWallet.address, signature, message: n.body.message });
    expect(res.status).toBe(401);
  });

  it("legacy bare-nonce signing still works outside production (transition)", async () => {
    const n = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
    const signature = await testWallet.signMessage(n.body.nonce);
    const res = await request(app).post("/auth/verify").send({ address: testWallet.address, signature });
    expect(res.status).toBe(200);
  });
});

describe("JWT revocation (POST /auth/logout)", () => {
  it("tokens carry a unique jti", async () => {
    const a = await siweLogin(testWallet);
    const b = await siweLogin(testWallet);
    const jtiA = (decode(a.body.token as string) as { jti?: string }).jti;
    const jtiB = (decode(b.body.token as string) as { jti?: string }).jti;
    expect(jtiA).toBeTruthy();
    expect(jtiA).not.toBe(jtiB);
  });

  it("logout revokes only the presented token until expiry", async () => {
    const a = (await siweLogin(testWallet)).body.token as string;
    const b = (await siweLogin(testWallet)).body.token as string;
    const out = await request(app).post("/auth/logout").set("Authorization", `Bearer ${a}`);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ loggedOut: true, revoked: true });
    expect((await request(app).get("/balance").set("Authorization", `Bearer ${a}`)).status).toBe(401);
    expect((await request(app).get("/balance").set("Authorization", `Bearer ${b}`)).status).toBe(200);
    const claims = decode(a) as { jti: string; exp: number };
    const row = await prisma.revokedToken.findUniqueOrThrow({ where: { jti: claims.jti } });
    expect(row.expiresAt.getTime()).toBe(claims.exp * 1000);
  });

  it("logout requires a valid token", async () => {
    expect((await request(app).post("/auth/logout")).status).toBe(401);
  });
});
