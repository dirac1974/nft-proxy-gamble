import request from "supertest";
import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import { createHmac } from "crypto";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";

// Independent re-derivation of the v2 keno draw (does not import the service).
function expectedDraw(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const pool = Array.from({ length: 80 }, (_, i) => i + 1);
  const out: number[] = [];
  let counter = 0;
  let buf = Buffer.alloc(0);
  let pos = 0;
  const u32 = (): number => {
    if (pos + 4 > buf.length) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:keno:${counter++}`).digest();
      pos = 0;
    }
    const v = buf.readUInt32BE(pos);
    pos += 4;
    return v;
  };
  for (let i = 0; i < 20; i++) {
    const n = 80 - i;
    const lim = Math.floor(2 ** 32 / n) * n;
    let v = u32();
    while (v >= lim) v = u32();
    const j = i + (v % n);
    [pool[i], pool[j]] = [pool[j], pool[i]];
    out.push(pool[i]);
  }
  return out;
}

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;
let userId: string;

type Session = { sessionId: string; gameType: string; serverSeedHash: string; clientSeed: string; nextServerSeedHash: string };

async function startSession(body: Record<string, unknown> = { mode: "single" }): Promise<request.Response> {
  return request(app).post("/keno/start-session").set("Authorization", `Bearer ${token}`).send(body);
}
async function start(mode: "single" | "quad" = "single", clientSeed?: string): Promise<Session> {
  const res = await startSession(clientSeed ? { mode, clientSeed } : { mode });
  expect(res.status).toBe(201);
  return res.body as Session;
}
function play(sessionId: string, cards: unknown): request.Test {
  return request(app).post("/keno/play").set("Authorization", `Bearer ${token}`).send({ sessionId, cards });
}
async function setBalance(coinBalance: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { coinBalance } });
}
async function balance(): Promise<number> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance;
}

beforeAll(async () => {
  await setupTestDb();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = (authRes.body as { token: string }).token;
  userId = (authRes.body as { userId: string }).userId;
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 5000, ageConfirmed: true } });
});

afterAll(() => teardownTestDb());

describe("GET /keno/paytable", () => {
  it("returns paytable, bet levels, max win and RTPs", async () => {
    const res = await request(app).get("/keno/paytable");
    expect(res.status).toBe(200);
    expect(res.body.betLevels).toEqual([10, 20, 50]);
    expect(res.body.maxWin).toBe(500000);
    expect(res.body.paytable["1"]["1"]).toBe(3.7);
    expect(res.body.paytable["10"]["10"]).toBe(10000);
    expect(res.body.rtpBySpots["3"]).toBe(94.352);
  });
});

describe("POST /keno/start-session", () => {
  it("commits a single-mode session", async () => {
    const s = await start("single");
    expect(s.gameType).toBe("keno-80-20-1-0");
    expect(s.serverSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.nextServerSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.clientSeed).toMatch(/^[0-9a-f]{32}$/);
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.state).toBe("ACTIVE");
    expect(row.hands).toEqual([]);
  });

  it("commits a quad-mode session and honours a valid clientSeed", async () => {
    const s = await start("quad", "My_seed-123");
    expect(s.gameType).toBe("keno4-80-20-1-0");
    expect(s.clientSeed).toBe("My_seed-123");
  });

  it("chains commitments: this session's hash was the previous nextServerSeedHash", async () => {
    const a = await start();
    const b = await start();
    expect(b.serverSeedHash).toBe(a.nextServerSeedHash);
  });

  it("rejects bad mode / clientSeed with 400", async () => {
    expect((await startSession({})).status).toBe(400);
    expect((await startSession({ mode: "triple" })).status).toBe(400);
    for (const clientSeed of ["has:colon", "", "x".repeat(65), "spa ce", "ünï"]) {
      expect((await startSession({ mode: "single", clientSeed })).status).toBe(400);
    }
  });

  it("requires auth", async () => {
    const res = await request(app).post("/keno/start-session").send({ mode: "single" });
    expect(res.status).toBe(401);
  });
});

describe("POST /keno/play", () => {
  it("settles, reveals a seed that reproduces the draw, adjusts balance and writes Transactions + hand record", async () => {
    await setBalance(5000);
    const s = await start("single", "replay-seed");
    const spots = [1, 2, 3, 4, 5, 6, 7];
    const res = await play(s.sessionId, [{ spots, bet: 20 }]);
    expect(res.status).toBe(200);
    const b = res.body;

    // commitment + draw reproduction
    expect(keccak256(toUtf8Bytes(b.serverSeed))).toBe(s.serverSeedHash);
    expect(b.serverSeedHash).toBe(s.serverSeedHash);
    expect(b.clientSeed).toBe("replay-seed");
    expect(b.nonce).toBe(0);
    expect(b.drawn).toEqual(expectedDraw(b.serverSeed, b.clientSeed, 0));

    // settlement
    const hits = b.drawn.filter((n: number) => spots.includes(n));
    expect(b.results).toHaveLength(1);
    expect(b.results[0]).toMatchObject({ cardIndex: 0, spots, hits, catches: hits.length, bet: 20 });
    expect(b.results[0].payout).toBe(Math.round(20 * b.results[0].multiplier));
    expect(b.totalWagered).toBe(20);
    expect(b.totalReturn).toBe(b.results[0].payout);
    expect(b.netProfit).toBe(b.totalReturn - 20);
    expect(b.capped).toBe(false);
    expect(b.coinBalance).toBe(5000 - 20 + b.totalReturn);
    expect(b.balanceSig).toMatch(/^[0-9a-f]{128}$/);
    expect(await balance()).toBe(b.coinBalance);

    const txs = await prisma.transaction.findMany({ where: { sessionId: s.sessionId }, orderBy: { createdAt: "asc" } });
    expect(txs.find((t) => t.type === "GAME_LOSS")?.coinDelta).toBe(-20);
    if (b.totalReturn > 0) expect(txs.find((t) => t.type === "GAME_WIN")?.coinDelta).toBe(b.totalReturn);
    else expect(txs.filter((t) => t.type === "GAME_WIN")).toHaveLength(0);

    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    const hands = row.hands as unknown as Array<Record<string, unknown>>;
    expect(hands).toHaveLength(1);
    expect(hands[0]).toMatchObject({ nonce: 0, mode: "single", drawn: b.drawn, totalReturn: b.totalReturn });
    expect(row.totalPayout).toBe(b.totalReturn);
    expect(row.state).toBe("ACTIVE");
  });

  it("rejects a second play on the same session with 409", async () => {
    await setBalance(5000);
    const s = await start();
    expect((await play(s.sessionId, [{ spots: [10], bet: 10 }])).status).toBe(200);
    const res = await play(s.sessionId, [{ spots: [10], bet: 10 }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already played/i);
  });

  it("returns 402 when balance is insufficient and does not touch the session", async () => {
    await setBalance(15);
    const s = await start();
    const res = await play(s.sessionId, [{ spots: [10], bet: 20 }]);
    expect(res.status).toBe(402);
    expect(await balance()).toBe(15);
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.hands).toEqual([]);
    await setBalance(5000);
  });

  it("concurrent double-play: exactly one succeeds, debit happens once", async () => {
    await setBalance(5000);
    const s = await start();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => play(s.sessionId, [{ spots: [1, 2, 3], bet: 50 }])),
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await balance()).toBe(5000 - 50 + ok[0].body.totalReturn);
    const losses = await prisma.transaction.count({ where: { sessionId: s.sessionId, type: "GAME_LOSS" } });
    expect(losses).toBe(1);
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect((row.hands as unknown[]).length).toBe(1);
    expect(row.totalPayout).toBe(ok[0].body.totalReturn);
  });

  it("quad mode settles up to 4 cards on one shared draw", async () => {
    await setBalance(5000);
    const s = await start("quad");
    const cards = [
      { spots: [1, 2, 3, 4, 5], bet: 50 },
      { spots: [6, 7, 8], bet: 50 },
      { spots: [40, 41], bet: 50 },
      { spots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bet: 50 },
    ];
    const res = await play(s.sessionId, cards);
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.drawn).toEqual(expectedDraw(b.serverSeed, b.clientSeed, 0));
    expect(b.results).toHaveLength(4);
    expect(b.totalWagered).toBe(200);
    expect(b.totalReturn).toBe(b.results.reduce((a: number, r: { payout: number }) => a + r.payout, 0));
    b.results.forEach((r: { cardIndex: number; hits: number[]; catches: number }, i: number) => {
      expect(r.cardIndex).toBe(i);
      expect(r.hits).toEqual(b.drawn.filter((n: number) => cards[i].spots.includes(n)));
      expect(r.catches).toBe(r.hits.length);
    });
    expect(b.coinBalance).toBe(5000 - 200 + b.totalReturn);
  });

  it("validation → 400 (and no debit)", async () => {
    await setBalance(5000);
    const cases: Array<["single" | "quad", unknown]> = [
      ["single", [{ spots: [1, 1], bet: 10 }]], // duplicate
      ["quad", [{ spots: [1, 2], bet: 10 }, { spots: [2, 1], bet: 10 }]], // identical cards
      ["single", [{ spots: [1], bet: 25 }]], // bet not in ladder
      ["single", [{ spots: [1], bet: 100 }]], // v1 level no longer allowed
      ["quad", [{ spots: [1], bet: 10 }, { spots: [2], bet: 20 }]], // mixed bets
      ["single", [{ spots: [1], bet: 10 }, { spots: [2], bet: 10 }]], // single takes exactly 1
      ["quad", [1, 2, 3, 4, 5].map((n) => ({ spots: [n], bet: 10 }))], // >4 cards
      ["single", [{ spots: [0], bet: 10 }]], // out of range
      ["single", [{ spots: [81], bet: 10 }]],
      ["single", [{ spots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], bet: 10 }]], // >10 spots
      ["single", [{ spots: [], bet: 10 }]], // <1 spot
      ["single", [{ spots: [1.5], bet: 10 }]], // non-integer
      ["single", []], // no cards
      ["single", "nope"],
    ];
    for (const [mode, cards] of cases) {
      const s = await start(mode);
      const res = await play(s.sessionId, cards);
      expect([res.status, JSON.stringify(cards)]).toEqual([400, JSON.stringify(cards)]);
    }
    expect(await balance()).toBe(5000);
  });

  it("404 for unknown or foreign sessions", async () => {
    expect((await play("does-not-exist", [{ spots: [1], bet: 10 }])).status).toBe(404);
    const other = Wallet.createRandom();
    const n = await request(app).get(`/auth/nonce?address=${other.address}`);
    const sig = await other.signMessage((n.body as { nonce: string }).nonce);
    const auth = await request(app).post("/auth/verify").send({ address: other.address, signature: sig });
    const s = await start();
    const res = await request(app)
      .post("/keno/play")
      .set("Authorization", `Bearer ${(auth.body as { token: string }).token}`)
      .send({ sessionId: s.sessionId, cards: [{ spots: [1], bet: 10 }] });
    expect(res.status).toBe(404);
  });
});

describe("cross-game guards", () => {
  it("/game/deal, /roulette/spin and /blackjack/deal reject a keno session", async () => {
    await setBalance(5000);
    for (const mode of ["single", "quad"] as const) {
      const s = await start(mode);
      const auth = { Authorization: `Bearer ${token}` };
      const deal = await request(app).post("/game/deal").set(auth).send({ sessionId: s.sessionId });
      expect(deal.status).toBe(409);
      const spin = await request(app).post("/roulette/spin").set(auth)
        .send({ sessionId: s.sessionId, bets: [{ type: "red", amount: 10 }] });
      expect(spin.status).toBe(409);
      const bj = await request(app).post("/blackjack/deal").set(auth).send({ sessionId: s.sessionId, bet: 10 });
      expect(bj.status).toBe(409);
      const draw = await request(app).post("/game/draw").set(auth).send({ sessionId: s.sessionId, holds: [false, false, false, false, false] });
      expect(draw.status).toBe(409);
    }
    expect(await balance()).toBe(5000);
  });

  it("/keno/play rejects a roulette session", async () => {
    const r = await request(app).post("/roulette/start-session").set("Authorization", `Bearer ${token}`).send({});
    const res = await play(r.body.sessionId, [{ spots: [1], bet: 10 }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not a keno session/i);
  });
});
