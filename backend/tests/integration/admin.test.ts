import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";

// FABLE-2026-07 H-3 regression: admin access must come from the DB (User.isAdmin),
// not from a JWT claim. A normal authenticated user must be rejected even though
// their token is valid; only a user whose DB row has isAdmin=true may pass.

const app = createApp();

async function authAs(wallet: ReturnType<typeof Wallet.createRandom>): Promise<{ token: string; userId: string }> {
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  return { token: (authRes.body as { token: string }).token, userId: (authRes.body as { userId: string }).userId };
}

const adminWallet = Wallet.createRandom();
const userWallet = Wallet.createRandom();
let adminToken: string;
let adminUserId: string;
let userToken: string;
let normalUserId: string;

beforeAll(async () => {
  await setupTestDb();
  ({ token: adminToken, userId: adminUserId } = await authAs(adminWallet));
  ({ token: userToken, userId: normalUserId } = await authAs(userWallet));
  // Grant admin out-of-band (as ops would) — never via the token.
  await prisma.user.update({ where: { id: adminUserId }, data: { isAdmin: true } });
});

afterAll(() => teardownTestDb());

describe("admin authorization (DB-backed)", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/admin/flagged-users");
    expect(res.status).toBe(401);
  });

  it("rejects a valid non-admin token with 403", async () => {
    const res = await request(app)
      .get("/admin/flagged-users")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin access required/i);
  });

  it("allows a user whose DB row has isAdmin=true", async () => {
    const res = await request(app)
      .get("/admin/flagged-users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("revoking isAdmin in the DB immediately blocks the same token", async () => {
    await prisma.user.update({ where: { id: adminUserId }, data: { isAdmin: false } });
    const res = await request(app)
      .get("/admin/flagged-users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    // Restore for later tests
    await prisma.user.update({ where: { id: adminUserId }, data: { isAdmin: true } });
  });
});

describe("admin action audit logging", () => {
  it("writes an audit row for set-risk with admin, target, and detail", async () => {
    const before = await prisma.adminAuditLog.count();
    const res = await request(app)
      .post(`/admin/users/${normalUserId}/set-risk`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ riskLevel: "HIGH", reason: "manual review" });
    expect(res.status).toBe(200);

    const logs = await prisma.adminAuditLog.findMany({
      where: { action: "set-risk", targetUserId: normalUserId },
      orderBy: { createdAt: "desc" },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(await prisma.adminAuditLog.count()).toBeGreaterThan(before);
    expect(logs[0].adminUserId).toBe(adminUserId);
    expect(logs[0].detail).toMatchObject({ riskLevel: "HIGH", reason: "manual review" });
  });

  it("does not write an audit row when a non-admin is rejected", async () => {
    const before = await prisma.adminAuditLog.count();
    await request(app)
      .post(`/admin/users/${normalUserId}/set-risk`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ riskLevel: "LOW", reason: "should not apply" });
    expect(await prisma.adminAuditLog.count()).toBe(before);
  });
});
