import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app";
import { setupTestDb, teardownTestDb } from "./setup";

const app = createApp();
const testWallet = Wallet.createRandom();

// Set required env for config module before importing app
process.env.JWT_SECRET = "test_secret_that_is_long_enough_for_zod_32chars";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://nftp:nftp_dev@localhost:5432/nft_proxy_gamble_test";
process.env.NODE_ENV = "test";

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
