import request from "supertest";
import { Wallet } from "ethers";
import { createHmac } from "crypto";
import { createApp } from "../../src/app.js";
import { hashServerSeed } from "../../src/services/videoPoker.js";
import { resolveBaseSpin, resolveFeature, REEL_STRIPS, SLOTS_GAME_TYPE } from "../../src/services/slots.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";

// Independent recompute of a reel stop from the revealed seed (spec message format).
function refStop(serverSeed: string, clientSeed: string, nonce: number, reel: number): number {
  const n = REEL_STRIPS[reel].length;
  const limit = Math.floor(2 ** 32 / n) * n;
  for (let round = 0; ; round++) {
    const d = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:reel:${reel}:${round}`).digest();
    for (let i = 0; i < 32; i += 4) {
      const v = d.readUInt32BE(i);
      if (v < limit) return v % n;
    }
  }
}

const app = createApp();
let token: string;
let userId: string;
let otherToken: string;

async function login(): Promise<{ token: string; userId: string }> {
  const wallet = Wallet.createRandom();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  return { token: authRes.body.token, userId: authRes.body.userId };
}

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
const setBalance = (coinBalance: number) => prisma.user.update({ where: { id: userId }, data: { coinBalance } });
const balance = async (): Promise<number> => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance;

async function start(clientSeed?: string) {
  const res = await request(app).post("/slots/start-session").set(auth()).send(clientSeed ? { clientSeed } : {});
  expect(res.status).toBe(201);
  return res.body as { sessionId: string; serverSeedHash: string; clientSeed: string; nextServerSeedHash: string; autoResolvedFeatures: Array<Record<string, unknown>> };
}

// Brute-force a clientSeed against the user's committed next serverSeed (read
// from the DB — test-only) so the base spin does / does not trigger.
async function findClientSeed(trigger: boolean): Promise<string> {
  let u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.nextServerSeed) {
    await start();
    u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }
  for (let i = 0; i < 20000; i++) {
    const cs = `${trigger ? "t" : "n"}${i}`;
    if (resolveBaseSpin(u.nextServerSeed!, cs, 1).featureTriggered === trigger) return cs;
  }
  throw new Error("no seed found");
}

async function startTriggered() {
  const cs = await findClientSeed(true);
  return start(cs);
}

async function spin(sessionId: string, betLevel = 1, t = token) {
  return request(app).post("/slots/spin").set(auth(t)).send({ sessionId, betLevel });
}

beforeAll(async () => {
  await setupTestDb();
  ({ token, userId } = await login());
  ({ token: otherToken } = await login());
  await setBalance(100_000);
  await prisma.user.update({ where: { id: userId }, data: { ageConfirmed: true } });
});

afterAll(() => teardownTestDb());

describe("GET /slots/paytable", () => {
  it("returns paytable, bet levels, options with RTP, max win", async () => {
    const res = await request(app).get("/slots/paytable");
    expect(res.status).toBe(200);
    expect(res.body.betLevels).toEqual([1, 2, 5, 10, 20]);
    expect(res.body.maxWin).toBe(500000);
    expect(res.body.paytable.PEONY_FAN).toEqual([20, 50, 150]);
    expect(res.body.paytable.KOI_FAN).toBeUndefined();
    expect(res.body.options.map((o: { id: string }) => o.id)).toEqual(["jade", "ruby", "gold", "imperial"]);
    for (const o of res.body.options) expect(typeof o.rtp).toBe("number");
  });
});

describe("POST /slots/start-session", () => {
  it("commits a seed and honors a valid clientSeed", async () => {
    const s = await start("my_seed-1");
    expect(s.serverSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.nextServerSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.clientSeed).toBe("my_seed-1");
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.gameType).toBe(SLOTS_GAME_TYPE);
  });

  it.each(["bad:seed", "", "x".repeat(65), "spa ce"])("rejects clientSeed %p with 400", async (cs) => {
    const res = await request(app).post("/slots/start-session").set(auth()).send({ clientSeed: cs });
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    expect((await request(app).post("/slots/start-session").send({})).status).toBe(401);
  });
});

describe("POST /slots/spin — base game", () => {
  it("settles a non-trigger spin, reveals a seed reproducing the stops, writes transactions + hand", async () => {
    await setBalance(100_000);
    const s = await start(await findClientSeed(false));
    const res = await spin(s.sessionId, 2);
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.feature).toEqual({ triggered: false });
    expect(b.totalWagered).toBe(50);
    expect(hashServerSeed(b.serverSeed)).toBe(s.serverSeedHash);
    expect(b.spin.stops).toEqual([0, 1, 2, 3, 4].map((r) => refStop(b.serverSeed, s.clientSeed, 0, r)));
    expect(b.spin.grid).toHaveLength(3);
    expect(b.spin.grid[0]).toHaveLength(5);
    expect(b.totalReturn).toBe(b.spin.totalWin);
    expect(b.netProfit).toBe(b.totalReturn - 50);
    expect(b.coinBalance).toBe(100_000 - 50 + b.totalReturn);
    expect(b.balanceSig).toMatch(/^[0-9a-f]{64}$/);
    expect(await balance()).toBe(b.coinBalance);

    const txs = await prisma.transaction.findMany({ where: { sessionId: s.sessionId }, orderBy: { createdAt: "asc" } });
    expect(txs[0]).toMatchObject({ type: "GAME_LOSS", coinDelta: -50 });
    if (b.totalReturn > 0) expect(txs[1]).toMatchObject({ type: "GAME_WIN", coinDelta: b.totalReturn });
    else expect(txs).toHaveLength(1);

    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.state).toBe("ACTIVE");
    expect(row.betAmount).toBe(50);
    const hands = row.hands as unknown as Array<{ spin: { stops: number[] }; betLevel: number; wager: number; baseWin: number }>;
    expect(hands).toHaveLength(1);
    // Replay from the stored hand record.
    expect(hands[0].spin.stops).toEqual(b.spin.stops);
    expect(resolveBaseSpin(b.serverSeed, s.clientSeed, hands[0].betLevel).baseWin).toBe(hands[0].baseWin);
  });

  it("rejects a second spin on the same session", async () => {
    const s = await start(await findClientSeed(false));
    expect((await spin(s.sessionId)).status).toBe(200);
    const res = await spin(s.sessionId);
    expect(res.status).toBe(409);
  });

  it.each([[0], [3], [40], [1.5], ["1"]])("rejects betLevel %p with 400", async (lvl) => {
    const s = await start();
    const res = await request(app).post("/slots/spin").set(auth()).send({ sessionId: s.sessionId, betLevel: lvl });
    expect(res.status).toBe(400);
  });

  it("400 on missing sessionId; 404 on unknown or other user's session", async () => {
    expect((await request(app).post("/slots/spin").set(auth()).send({ betLevel: 1 })).status).toBe(400);
    expect((await spin("nope")).status).toBe(404);
    const s = await start();
    expect((await spin(s.sessionId, 1, otherToken)).status).toBe(404);
  });

  it("returns 402 when balance < wager and leaves the session unspun", async () => {
    await setBalance(100);
    const s = await start();
    const res = await spin(s.sessionId, 5); // 125 coins
    expect(res.status).toBe(402);
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.hands).toEqual([]);
    expect(await balance()).toBe(100);
    await setBalance(100_000);
  });

  it("parallel spins on one session: exactly one succeeds, one debit", async () => {
    await setBalance(100_000);
    const s = await start(await findClientSeed(false));
    const results = await Promise.all(Array.from({ length: 6 }, () => spin(s.sessionId, 1)));
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    results.filter((r) => r.status !== 200).forEach((r) => expect(r.status).toBe(409));
    const losses = await prisma.transaction.count({ where: { sessionId: s.sessionId, type: "GAME_LOSS" } });
    expect(losses).toBe(1);
    expect(await balance()).toBe(100_000 - 25 + ok[0].body.totalReturn);
  });
});

describe("free-games feature (FEATURE_PENDING)", () => {
  it("trigger → pending (seed hidden) → resolve → reveal; double resolve rejected", async () => {
    await setBalance(100_000);
    const s = await startTriggered();
    const res = await spin(s.sessionId, 1);
    expect(res.status).toBe(200);
    expect(res.body.feature.triggered).toBe(true);
    expect(res.body.feature.scatterCount).toBeGreaterThanOrEqual(3);
    expect(res.body.feature.options).toHaveLength(4);
    expect(res.body.serverSeed).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("serverSeed\":\"");
    const baseWin = res.body.baseWin as number;
    expect(baseWin).toBeGreaterThan(0); // scatter pay
    let row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.state).toBe("FEATURE_PENDING");

    // no second spin / no cashout while pending
    expect((await spin(s.sessionId)).status).toBe(409);
    const cash = await request(app).post("/game/cashout").set(auth()).send({ sessionId: s.sessionId, coinsToCashout: 100 });
    expect(cash.status).toBe(409);
    // bad option
    expect((await request(app).post("/slots/feature").set(auth()).send({ sessionId: s.sessionId, option: "emerald" })).status).toBe(400);
    // other user
    expect((await request(app).post("/slots/feature").set(auth(otherToken)).send({ sessionId: s.sessionId, option: "gold" })).status).toBe(404);

    const before = await balance();
    const f = await request(app).post("/slots/feature").set(auth()).send({ sessionId: s.sessionId, option: "gold" });
    expect(f.status).toBe(200);
    expect(hashServerSeed(f.body.serverSeed)).toBe(s.serverSeedHash);
    const expected = resolveFeature(f.body.serverSeed, s.clientSeed, 1, "gold", baseWin);
    expect(f.body.feature.totalWin).toBe(expected.totalWin);
    expect(f.body.spins).toHaveLength(expected.played);
    expect(f.body.spins[0].nonce).toBe(1);
    expect(f.body.spins[0].stops).toEqual([0, 1, 2, 3, 4].map((r) => refStop(f.body.serverSeed, s.clientSeed, 1, r)));
    expect(f.body.totalReturn).toBe(baseWin + expected.totalWin);
    expect(f.body.coinBalance).toBe(before + expected.totalWin);
    expect(await balance()).toBe(before + expected.totalWin);

    row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.state).toBe("ACTIVE");
    expect(row.totalPayout).toBe(baseWin + expected.totalWin);
    const hands = row.hands as unknown as Array<{ kind: string; resolvedBy?: string; option?: string }>;
    expect(hands.map((h) => h.kind)).toEqual(["base", "feature"]);
    expect(hands[1]).toMatchObject({ option: "gold", resolvedBy: "player" });

    const again = await request(app).post("/slots/feature").set(auth()).send({ sessionId: s.sessionId, option: "gold" });
    expect(again.status).toBe(409);
    const wins = await prisma.transaction.count({ where: { sessionId: s.sessionId, type: "GAME_WIN" } });
    expect(wins).toBe(expected.totalWin > 0 ? 2 : 1);
  });

  it("feature on a non-pending session is rejected", async () => {
    const unspun = await start();
    expect((await request(app).post("/slots/feature").set(auth()).send({ sessionId: unspun.sessionId, option: "ruby" })).status).toBe(409);
    const done = await start(await findClientSeed(false));
    await spin(done.sessionId);
    expect((await request(app).post("/slots/feature").set(auth()).send({ sessionId: done.sessionId, option: "ruby" })).status).toBe(409);
  });

  it("parallel feature calls: exactly one resolves and credits", async () => {
    await setBalance(100_000);
    const s = await startTriggered();
    expect((await spin(s.sessionId)).status).toBe(200);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => request(app).post("/slots/feature").set(auth()).send({ sessionId: s.sessionId, option: ["jade", "ruby", "gold", "imperial", "ruby"][i] })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    results.filter((r) => r.status !== 200).forEach((r) => expect(r.status).toBe(409));
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect((row.hands as unknown[]).length).toBe(2);
    const featureWins = await prisma.transaction.count({ where: { sessionId: s.sessionId, type: "GAME_WIN" } });
    expect(featureWins).toBeLessThanOrEqual(2);
  });

  it("abandoned feature is auto-resolved (ruby) by the next start-session", async () => {
    await setBalance(100_000);
    const s = await startTriggered();
    const sp = await spin(s.sessionId);
    expect(sp.body.feature.triggered).toBe(true);
    const before = await balance();

    const next = await start();
    expect(next.autoResolvedFeatures).toHaveLength(1);
    const ar = next.autoResolvedFeatures[0] as { sessionId: string; feature: { option: string; totalWin: number }; serverSeed: string };
    expect(ar.sessionId).toBe(s.sessionId);
    expect(ar.feature.option).toBe("ruby");
    expect(hashServerSeed(ar.serverSeed)).toBe(s.serverSeedHash);
    const expected = resolveFeature(ar.serverSeed, s.clientSeed, 1, "ruby", sp.body.baseWin);
    expect(ar.feature.totalWin).toBe(expected.totalWin);
    expect(await balance()).toBe(before + expected.totalWin);
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.state).toBe("ACTIVE");
    expect((row.hands as Array<{ resolvedBy?: string }>)[1].resolvedBy).toBe("auto");
    // nothing pending any more
    expect((await start()).autoResolvedFeatures).toHaveLength(0);
  });

  it("feature call racing start-session auto-resolve: resolved exactly once", async () => {
    await setBalance(100_000);
    const s = await startTriggered();
    await spin(s.sessionId);
    const [f, st] = await Promise.all([
      request(app).post("/slots/feature").set(auth()).send({ sessionId: s.sessionId, option: "imperial" }),
      request(app).post("/slots/start-session").set(auth()).send({}),
    ]);
    expect(st.status).toBe(201);
    const byFeature = f.status === 200 ? 1 : 0;
    const byAuto = (st.body.autoResolvedFeatures as unknown[]).length;
    expect(byFeature + byAuto).toBe(1);
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect((row.hands as unknown[]).length).toBe(2);
  });
});

describe("cross-game guards", () => {
  it("other games' routes reject a slots session", async () => {
    const s = await start();
    expect((await request(app).post("/game/deal").set(auth()).send({ sessionId: s.sessionId })).status).toBe(409);
    expect((await request(app).post("/roulette/spin").set(auth()).send({ sessionId: s.sessionId, bets: [{ type: "red", amount: 1 }] })).status).toBe(409);
    expect((await request(app).post("/blackjack/deal").set(auth()).send({ sessionId: s.sessionId, bet: 10 })).status).toBe(409);
    const keno = await request(app).post("/keno/play").set(auth()).send({ sessionId: s.sessionId, cards: [{ spots: [1, 2, 3], bet: 10 }] });
    expect(keno.status).toBe(409);
  });

  it("slots routes reject a roulette session", async () => {
    const r = await request(app).post("/roulette/start-session").set(auth()).send({});
    expect((await spin(r.body.sessionId)).status).toBe(409);
    expect((await request(app).post("/slots/feature").set(auth()).send({ sessionId: r.body.sessionId, option: "ruby" })).status).toBe(409);
  });
});
