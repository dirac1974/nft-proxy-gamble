// /health is the canonical liveness endpoint. It does not touch the DB or the
// chain, so we can test it as a unit (no Postgres setup needed).

import request from "supertest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("GET /health", () => {
  it("returns 200 with status 'ok'", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns an ISO timestamp", async () => {
    const res = await request(app).get("/health");
    expect(res.body.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("exposes pendingCommitBatch for monitoring", async () => {
    const res = await request(app).get("/health");
    // On a freshly-booted process with no IAPs in flight the batch is empty.
    expect(typeof res.body.pendingCommitBatch).toBe("number");
    expect(res.body.pendingCommitBatch).toBeGreaterThanOrEqual(0);
  });

  it("does not require authentication", async () => {
    const res = await request(app).get("/health");
    // Same response with or without an Authorization header
    const res2 = await request(app).get("/health").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});
