import request from "supertest";
import { Wallet } from "ethers";

// Production-mode auth: the legacy bare-nonce signature is refused; only the
// EIP-4361 message is accepted, bound to the configured domain/uri/chain id.
jest.mock("../../src/config/index.js", () => {
  const actual = jest.requireActual("../../src/config/index.js") as { config: Record<string, unknown> };
  return {
    config: {
      ...actual.config,
      NODE_ENV: "production",
      SIWE_DOMAIN: "api.casino.example",
      SIWE_URI: "https://api.casino.example",
      SIWE_CHAIN_ID: 137,
    },
  };
});

import { createApp } from "../../src/app";
import { setupTestDb, teardownTestDb } from "./setup";

const app = createApp();
const wallet = Wallet.createRandom();

beforeAll(() => setupTestDb());
afterAll(() => teardownTestDb());

describe("auth in production", () => {
  it("issues a message bound to the configured domain, uri and chain id", async () => {
    const n = await request(app).get(`/auth/nonce?address=${wallet.address}`);
    expect(n.status).toBe(200);
    expect(n.body.message).toMatch(/^api\.casino\.example wants you to sign in/);
    expect(n.body.message).toContain("\nURI: https://api.casino.example\n");
    expect(n.body.message).toContain("\nChain ID: 137\n");
  });

  it("refuses the legacy bare-nonce signature", async () => {
    const n = await request(app).get(`/auth/nonce?address=${wallet.address}`);
    const signature = await wallet.signMessage(n.body.nonce);
    const res = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
    expect(res.status).toBe(401);
  });

  it("accepts the signed EIP-4361 message", async () => {
    const n = await request(app).get(`/auth/nonce?address=${wallet.address}`);
    const signature = await wallet.signMessage(n.body.message);
    const res = await request(app).post("/auth/verify").send({ address: wallet.address, signature, message: n.body.message });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
