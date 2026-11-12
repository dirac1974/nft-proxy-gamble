import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

// Production-shaped config: limiters active, trust proxy = 1 hop, CORS allowlist.
jest.mock("../../src/config/index.js", () => {
  const actual = jest.requireActual("../../src/config/index.js") as { config: Record<string, unknown> };
  return {
    config: {
      ...actual.config,
      NODE_ENV: "production",
      TRUST_PROXY: 1,
      CORS_ORIGINS: ["https://admin.casino.example"],
      CORS_ORIGINS_SET: true,
    },
  };
});
jest.mock("../../src/services/purchaseCommitmentService.js", () => ({ getPendingBatchSize: () => 0 }));

import { createApp } from "../../src/app";
import { moneyPathRateLimit, userOrIpKey } from "../../src/middleware/attestationRateLimit";

const SECRET = process.env.JWT_SECRET!;
const tokenFor = (userId: string) => jwt.sign({ userId, walletAddress: "0x0" }, SECRET, { algorithm: "HS256" });

function limitedApp(): express.Application {
  const app = express();
  app.set("trust proxy", 1);
  app.post("/cashout", moneyPathRateLimit, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("trust proxy + CORS (createApp)", () => {
  const app = createApp();

  it("trusts exactly TRUST_PROXY hops", () => {
    expect(app.get("trust proxy")).toBe(1);
  });

  it("allows only allowlisted browser origins", async () => {
    const ok = await request(app).get("/health").set("Origin", "https://admin.casino.example");
    expect(ok.headers["access-control-allow-origin"]).toBe("https://admin.casino.example");
    const evil = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("requests without Origin (native mobile) are unaffected", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});

describe("userOrIpKey", () => {
  it("keys on the verified userId", () => {
    const req = { headers: { authorization: `Bearer ${tokenFor("user-1")}` }, ip: "1.2.3.4" } as unknown as express.Request;
    expect(userOrIpKey(req)).toBe("u:user-1");
  });

  it("falls back to IP for a forged/invalid token (cannot pick its own bucket)", () => {
    const forged = jwt.sign({ userId: "victim", walletAddress: "0x0" }, "wrong-secret-wrong-secret-wrong-secret");
    const req = { headers: { authorization: `Bearer ${forged}` }, ip: "1.2.3.4" } as unknown as express.Request;
    expect(userOrIpKey(req)).toBe("ip:1.2.3.4");
  });
});

describe("moneyPathRateLimit (red-team L-5 / M-4)", () => {
  it("does NOT skip requests that merely carry attestation headers", async () => {
    const app = limitedApp();
    const t = tokenFor("attacker");
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await request(app)
        .post("/cashout")
        .set("Authorization", `Bearer ${t}`)
        .set("x-attestation-platform", "android")
        .set("x-attestation-token", "junk");
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it("budgets per user, not per proxy IP: users behind one edge IP are independent", async () => {
    const app = limitedApp();
    for (let i = 0; i < 10; i++) {
      await request(app).post("/cashout").set("Authorization", `Bearer ${tokenFor("noisy")}`).set("X-Forwarded-For", "9.9.9.9");
    }
    const noisy = await request(app).post("/cashout").set("Authorization", `Bearer ${tokenFor("noisy")}`).set("X-Forwarded-For", "9.9.9.9");
    const quiet = await request(app).post("/cashout").set("Authorization", `Bearer ${tokenFor("quiet")}`).set("X-Forwarded-For", "9.9.9.9");
    expect(noisy.status).toBe(429);
    expect(quiet.status).toBe(200);
  });

  it("unauthenticated traffic is keyed on the forwarded client IP (trust proxy), not the proxy IP", async () => {
    const app = limitedApp();
    for (let i = 0; i < 10; i++) await request(app).post("/cashout").set("X-Forwarded-For", "5.5.5.5");
    expect((await request(app).post("/cashout").set("X-Forwarded-For", "5.5.5.5")).status).toBe(429);
    expect((await request(app).post("/cashout").set("X-Forwarded-For", "6.6.6.6")).status).toBe(200);
  });
});
