import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";

const app = createApp();

interface TestUser {
  token: string;
  userId: string;
}

async function newUser(coinBalance = 10_000): Promise<TestUser> {
  const wallet = Wallet.createRandom();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  const { token, userId } = authRes.body as TestUser;
  await prisma.user.update({ where: { id: userId }, data: { coinBalance, ageConfirmed: true } });
  return { token, userId };
}

const post = (u: TestUser, path: string, body: Record<string, unknown> = {}) =>
  request(app).post(path).set("Authorization", `Bearer ${u.token}`).send(body);
const get = (u: TestUser, path: string) => request(app).get(path).set("Authorization", `Bearer ${u.token}`);

const NEW_ROUND_STARTS: [string, Record<string, unknown>][] = [
  ["/game/start-session", { betAmount: 1 }],
  ["/roulette/start-session", {}],
  ["/keno/start-session", { mode: "single" }],
  ["/slots/start-session", {}],
  ["/blackjack/start-session", {}],
];

async function addLoss(userId: string, coins: number, createdAt: Date = new Date()): Promise<void> {
  await prisma.transaction.create({ data: { userId, type: "GAME_LOSS", coinDelta: -coins, balanceAfter: 0, createdAt } });
}

let receiptSeq = 0;
const googleBuy = (u: TestUser, productId = "nfpg.coins.100", token = `rg-test-token-${Date.now()}-${receiptSeq++}`) =>
  post(u, "/iap/verify-purchase", { platform: "google", purchaseToken: token, productId });

beforeAll(async () => {
  await setupTestDb();
});

afterAll(() => teardownTestDb());

describe("GET /rg", () => {
  it("returns defaults with today's totals", async () => {
    const u = await newUser();
    await addLoss(u.userId, 40);
    await prisma.transaction.create({ data: { userId: u.userId, type: "GAME_WIN", coinDelta: 15, balanceAfter: 0 } });
    await addLoss(u.userId, 500, new Date(Date.now() - 2 * 24 * 3600 * 1000)); // not today
    const res = await get(u, "/rg");
    expect(res.status).toBe(200);
    expect(res.body.limits).toEqual({ dailyDepositLimitCoins: null, dailyLossLimitCoins: null });
    expect(res.body.pending).toBeNull();
    expect(res.body.coolOffUntil).toBeNull();
    expect(res.body.selfExcludedUntil).toBeNull();
    expect(res.body.today.netLossCoins).toBe(25);
    expect(res.body.today.depositsCoins).toBe(0);
    expect(res.body.options.coolOffHours).toEqual([24, 72, 168, 720]);
  });

  it("requires auth", async () => {
    expect((await request(app).get("/rg")).status).toBe(401);
  });
});

describe("POST /rg/limits", () => {
  it("decrease is immediate, increase is delayed 24h, removal is delayed, applies after the delay", async () => {
    const u = await newUser();
    let res = await post(u, "/rg/limits", { dailyLossLimitCoins: 500 });
    expect(res.status).toBe(200);
    expect(res.body.limits.dailyLossLimitCoins).toBe(500);
    expect(res.body.applied).toEqual(["dailyLossLimitCoins"]);

    res = await post(u, "/rg/limits", { dailyLossLimitCoins: 200 });
    expect(res.body.limits.dailyLossLimitCoins).toBe(200);
    expect(res.body.pending).toBeNull();

    const before = Date.now();
    res = await post(u, "/rg/limits", { dailyLossLimitCoins: 1000, dailyDepositLimitCoins: 300 });
    expect(res.status).toBe(200);
    // Loss limit raise queued; first deposit limit applies now.
    expect(res.body.limits).toEqual({ dailyDepositLimitCoins: 300, dailyLossLimitCoins: 200 });
    expect(res.body.queued).toEqual(["dailyLossLimitCoins"]);
    expect(res.body.pending.dailyLossLimitCoins).toBe(1000);
    expect(res.body.pending).not.toHaveProperty("dailyDepositLimitCoins");
    const effectiveAt = new Date(res.body.pending.effectiveAt).getTime();
    expect(effectiveAt).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000 - 1000);

    res = await post(u, "/rg/limits", { dailyDepositLimitCoins: null });
    expect(res.body.limits.dailyDepositLimitCoins).toBe(300);
    expect(res.body.pending).toMatchObject({ dailyLossLimitCoins: 1000, dailyDepositLimitCoins: null });

    // Still enforced at the old limit while pending.
    await addLoss(u.userId, 250);
    expect((await post(u, "/roulette/start-session")).body.code).toBe("RG_LOSS_LIMIT");

    // Fast-forward: the delay has elapsed.
    await prisma.user.update({ where: { id: u.userId }, data: { limitChangePendingAt: new Date(Date.now() - 1000) } });
    res = await get(u, "/rg");
    expect(res.body.limits).toEqual({ dailyDepositLimitCoins: null, dailyLossLimitCoins: 1000 });
    expect(res.body.pending).toBeNull();
    expect((await post(u, "/roulette/start-session")).status).toBe(201);

    const events = await prisma.rgEvent.findMany({ where: { userId: u.userId }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual([
      "LIMIT_DECREASE",
      "LIMIT_DECREASE",
      "LIMIT_DECREASE",
      "LIMIT_INCREASE_QUEUED",
      "LIMIT_INCREASE_QUEUED",
      "LIMIT_APPLIED",
    ]);
  });

  it("a decrease cancels a pending increase immediately", async () => {
    const u = await newUser();
    await post(u, "/rg/limits", { dailyLossLimitCoins: 100 });
    await post(u, "/rg/limits", { dailyLossLimitCoins: 5000 });
    const res = await post(u, "/rg/limits", { dailyLossLimitCoins: 50 });
    expect(res.body.limits.dailyLossLimitCoins).toBe(50);
    expect(res.body.pending).toBeNull();
  });

  it("rejects invalid bodies", async () => {
    const u = await newUser();
    expect((await post(u, "/rg/limits", {})).status).toBe(400);
    expect((await post(u, "/rg/limits", { dailyLossLimitCoins: 0 })).status).toBe(400);
    expect((await post(u, "/rg/limits", { dailyLossLimitCoins: 1.5 })).status).toBe(400);
    expect((await post(u, "/rg/limits", { foo: 1 })).status).toBe(400);
  });
});

describe("loss limit enforcement", () => {
  it("blocks every new round once today's net loss reaches the limit", async () => {
    const u = await newUser();
    await post(u, "/rg/limits", { dailyLossLimitCoins: 100 });
    await addLoss(u.userId, 99);
    expect((await post(u, "/keno/start-session", { mode: "single" })).status).toBe(201);
    await addLoss(u.userId, 1);
    for (const [path, body] of NEW_ROUND_STARTS) {
      const res = await post(u, path, body);
      expect([path, res.status, res.body.code]).toEqual([path, 403, "RG_LOSS_LIMIT"]);
      expect(new Date(res.body.until).getUTCHours()).toBe(0);
      expect(typeof res.body.error).toBe("string");
    }
  });

  it("does not block deal/spin/play gates for in-progress settlement (blackjack action, video poker draw)", async () => {
    const u = await newUser();
    // Blackjack: deal a round that needs a player decision, THEN hit the limit.
    let bj: request.Response | null = null;
    let sessionId = "";
    for (let i = 0; i < 20 && !bj; i++) {
      const s = await post(u, "/blackjack/start-session");
      sessionId = s.body.sessionId;
      const d = await post(u, "/blackjack/deal", { sessionId, bet: 10 });
      expect(d.status).toBe(200);
      if (d.body.phase !== "settled") bj = d;
    }
    expect(bj).not.toBeNull();
    // Video poker: dealt hand awaiting draw.
    const vp = await post(u, "/game/start-session", { betAmount: 1 });
    expect((await post(u, "/game/deal", { sessionId: vp.body.sessionId })).status).toBe(200);

    await post(u, "/rg/limits", { dailyLossLimitCoins: 1 });
    await addLoss(u.userId, 1000);
    expect((await post(u, "/blackjack/start-session")).body.code).toBe("RG_LOSS_LIMIT");

    const settle =
      bj!.body.phase === "insurance"
        ? await post(u, "/blackjack/insurance", { sessionId, take: false })
        : await post(u, "/blackjack/action", { sessionId, action: "stand" });
    expect(settle.status).toBe(200);
    const draw = await post(u, "/game/draw", { sessionId: vp.body.sessionId, holds: [false, false, false, false, false] });
    expect(draw.status).toBe(200);
  });
});

describe("cool-off", () => {
  it("blocks wagering and purchases, allows cash-out, cannot be shortened", async () => {
    const u = await newUser(2_000);
    expect((await post(u, "/rg/cool-off", { hours: 5 })).status).toBe(400);

    let res = await post(u, "/rg/cool-off", { hours: 72 });
    expect(res.status).toBe(200);
    const until = new Date(res.body.coolOffUntil).getTime();
    expect(until).toBeGreaterThan(Date.now() + 71 * 3600 * 1000);

    res = await post(u, "/rg/cool-off", { hours: 24 });
    expect(new Date(res.body.coolOffUntil).getTime()).toBe(until);

    for (const [path, body] of NEW_ROUND_STARTS) {
      const r = await post(u, path, body);
      expect([path, r.status, r.body.code, r.body.until]).toEqual([path, 403, "RG_COOL_OFF", new Date(until).toISOString()]);
    }

    const buy = await googleBuy(u);
    expect(buy.status).toBe(403);
    expect(buy.body.code).toBe("RG_COOL_OFF");
    expect(await prisma.iAPReceipt.count({ where: { userId: u.userId } })).toBe(0);

    const cash = await post(u, "/wallet/cashout", { coinsToCashout: 500 });
    expect(cash.status).toBe(202);
    expect(cash.body.coinBalance).toBe(1_500);
  });

  it("expired cool-off no longer blocks", async () => {
    const u = await newUser();
    await prisma.user.update({ where: { id: u.userId }, data: { coolOffUntil: new Date(Date.now() - 1000) } });
    expect((await post(u, "/roulette/start-session")).status).toBe(201);
    expect((await get(u, "/rg")).body.coolOffUntil).toBeNull();
  });
});

describe("self-exclusion", () => {
  it("requires the confirmation token", async () => {
    const u = await newUser();
    let res = await post(u, "/rg/self-exclude", { months: 6 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RG_CONFIRM_REQUIRED");
    res = await post(u, "/rg/self-exclude", { months: 6, confirm: "self-exclude" });
    expect(res.status).toBe(400);
    expect((await post(u, "/rg/self-exclude", { months: 7, confirm: "SELF-EXCLUDE" })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).selfExcludedUntil).toBeNull();
  });

  it("blocks wagering + purchases, is irreversible until expiry, cash-out still allowed", async () => {
    const u = await newUser(2_000);
    let res = await post(u, "/rg/self-exclude", { months: 12, confirm: "SELF-EXCLUDE" });
    expect(res.status).toBe(200);
    const until = res.body.selfExcludedUntil as string;
    expect(new Date(until).getTime()).toBeGreaterThan(Date.now() + 360 * 24 * 3600 * 1000);
    expect(res.body.selfExclusionPermanent).toBe(false);

    for (const [path, body] of NEW_ROUND_STARTS) {
      const r = await post(u, path, body);
      expect([path, r.status, r.body.code]).toEqual([path, 403, "RG_SELF_EXCLUDED"]);
    }
    expect((await googleBuy(u)).body.code).toBe("RG_SELF_EXCLUDED");

    // Irreversible: shorter requests, cool-off and limit changes never lift it.
    res = await post(u, "/rg/self-exclude", { months: 6, confirm: "SELF-EXCLUDE" });
    expect(res.body.selfExcludedUntil).toBe(until);
    await post(u, "/rg/cool-off", { hours: 24 });
    await post(u, "/rg/limits", { dailyLossLimitCoins: null });
    expect((await post(u, "/roulette/start-session")).body.code).toBe("RG_SELF_EXCLUDED");
    expect((await get(u, "/rg")).body.selfExcludedUntil).toBe(until);

    // Extending to permanent is allowed and then nothing shortens it.
    res = await post(u, "/rg/self-exclude", { months: "permanent", confirm: "SELF-EXCLUDE" });
    expect(res.body.selfExclusionPermanent).toBe(true);
    res = await post(u, "/rg/self-exclude", { months: 6, confirm: "SELF-EXCLUDE" });
    expect(res.body.selfExclusionPermanent).toBe(true);

    expect((await post(u, "/wallet/cashout", { coinsToCashout: 1_000 })).status).toBe(202);

    const types = (await prisma.rgEvent.findMany({ where: { userId: u.userId } })).map((e) => e.type);
    expect(types.filter((t) => t === "SELF_EXCLUDE")).toHaveLength(4);
  });
});

describe("deposit limit", () => {
  it("rejects a purchase that would exceed the limit BEFORE crediting; receipt is not consumed", async () => {
    const u = await newUser(0);
    await post(u, "/rg/limits", { dailyDepositLimitCoins: 650 });

    expect((await googleBuy(u, "nfpg.coins.100")).status).toBe(200);
    expect((await googleBuy(u, "nfpg.coins.550")).status).toBe(200); // exactly at limit

    const token = "rg-blocked-receipt-token";
    const blocked = await googleBuy(u, "nfpg.coins.100", token);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({
      code: "RG_DEPOSIT_LIMIT",
      depositedTodayCoins: 650,
      dailyDepositLimitCoins: 650,
      attemptedCoins: 100,
    });
    expect(blocked.body.error).toMatch(/not been used/);
    expect(typeof blocked.body.until).toBe("string");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(user.coinBalance).toBe(650);
    expect(await prisma.iAPReceipt.count({ where: { userId: u.userId } })).toBe(2);
    expect(await prisma.rgEvent.count({ where: { userId: u.userId, type: "DEPOSIT_BLOCKED" } })).toBe(1);

    const summary = await get(u, "/rg");
    expect(summary.body.today.depositsCoins).toBe(650);

    // Same receipt redeems once the limit allows it (it was never recorded).
    await prisma.user.update({ where: { id: u.userId }, data: { dailyDepositLimitCoins: null } });
    expect((await googleBuy(u, "nfpg.coins.100", token)).status).toBe(200);
  });

  it("parallel purchases cannot jointly exceed the limit", async () => {
    const u = await newUser(0);
    await post(u, "/rg/limits", { dailyDepositLimitCoins: 300 });
    const results = await Promise.all(Array.from({ length: 6 }, () => googleBuy(u, "nfpg.coins.100")));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 403)).toHaveLength(3);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).coinBalance).toBe(300);
  });
});
