import express from "express";
import request from "supertest";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { AppError, errorHandler } from "../../src/middleware/errorHandler.js";
import { createApp } from "../../src/app.js";

function appThrowing(err: () => unknown): express.Application {
  const app = express();
  app.use(express.json());
  app.post("/x", (req, _res, next) => {
    try {
      err();
    } catch (e) {
      next(e);
    }
  });
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => errSpy.mockRestore());

  it("maps ZodError → 400 with a safe message (no stack / schema internals)", async () => {
    const schema = z.object({ sessionId: z.string(), coinsToCashout: z.number().int().min(100) });
    const app = appThrowing(() => schema.parse({ sessionId: 1, coinsToCashout: "lots" }));
    const res = await request(app).post("/x").send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid request" });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|ZodError|invalid_type|expected/i);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("AppError keeps its status + message", async () => {
    const res = await request(appThrowing(() => { throw new AppError(409, "nope"); })).post("/x");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "nope" });
  });

  it("unknown errors stay 500 without leaking the message", async () => {
    const res = await request(appThrowing(() => { throw new Error("db password is hunter2"); })).post("/x");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });

  it("route-level: invalid body on a real route returns 400, not 500", async () => {
    const token = jwt.sign({ userId: "u1", walletAddress: "0x0" }, process.env.JWT_SECRET!);
    const res = await request(createApp())
      .post("/roulette/start-session")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientSeed: "has:colon" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid request" });
  });
});
