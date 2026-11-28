import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../src/app.js";
import { CLIENT_SEED_RE } from "../../src/services/serverSeedChain.js";

// Rejected seeds never reach the DB (schema.parse runs first), so this is a unit test.
const app = createApp();
const token = jwt.sign({ userId: "u1", walletAddress: "0x0" }, process.env.JWT_SECRET!);

const routes: [string, Record<string, unknown>][] = [
  ["/roulette/start-session", {}],
  ["/blackjack/start-session", {}],
  ["/game/start-session", { betAmount: 1 }],
];
const bad = ["a:b", "x".repeat(65), "", "spa ce", "ünï", "a/b"];

describe("start-session clientSeed validation /^[A-Za-z0-9_-]{1,64}$/", () => {
  it.each(routes.flatMap(([path, body]) => bad.map((seed) => [path, body, seed] as const)))(
    "%s rejects %j",
    async (path, body, seed) => {
      const res = await request(app).post(path).set("Authorization", `Bearer ${token}`).send({ ...body, clientSeed: seed });
      expect(res.status).toBe(400);
    },
  );

  it("regex accepts server-generated hex seeds and the 64-char boundary", () => {
    expect(CLIENT_SEED_RE.test("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(CLIENT_SEED_RE.test("A_b-".repeat(16))).toBe(true);
  });
});
