import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app";
import { prisma, setupTestDb, teardownTestDb } from "./setup";

const app = createApp();
const testWallet = Wallet.createRandom();
let userId: string;

beforeAll(async () => {
  await setupTestDb();
  // Authenticate to create the user record
  const nonceRes = await request(app).get(`/auth/nonce?address=${testWallet.address}`);
  const signature = await testWallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: testWallet.address, signature });
  userId = (authRes.body as { userId: string }).userId;
  // Set a known initial balance
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 500 } });
});

afterAll(() => teardownTestDb());

describe("POST /dev/grant-coins", () => {
  it("returns 200 with incremented coinBalance and creates a Transaction row", async () => {
    const address = testWallet.address.toLowerCase();

    const res = await request(app)
      .post("/dev/grant-coins")
      .send({ address, amount: 100 });

    expect(res.status).toBe(200);
    expect((res.body as { coinBalance: number }).coinBalance).toBe(600);

    const tx = await prisma.transaction.findFirst({
      where: { userId, type: "IAP_PURCHASE", coinDelta: 100 },
      orderBy: { createdAt: "desc" },
    });
    expect(tx).not.toBeNull();
    expect(tx!.balanceAfter).toBe(600);
  });

  it("returns 404 for an unknown wallet address", async () => {
    const res = await request(app)
      .post("/dev/grant-coins")
      .send({ address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", amount: 50 });

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/User not found/i);
  });

  it("returns 403 when NODE_ENV is production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app)
        .post("/dev/grant-coins")
        .send({ address: testWallet.address.toLowerCase(), amount: 10 });

      expect(res.status).toBe(403);
      expect((res.body as { error: string }).error).toMatch(/Faucet disabled in production/i);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
