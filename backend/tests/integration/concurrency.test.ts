import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";
import {
  DEFAULT_NUM_DECKS,
  applyAction,
  deal,
  generateShoe,
  legalActions,
} from "../../src/services/blackjack.js";

// Concurrency regression suite for the per-session claim on every money path.
// Each test fires N identical/conflicting requests at one session in parallel
// and asserts the ledger (Transaction rows) and balance agree with exactly the
// set of requests that returned 200.

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;
let userId: string;
const PARALLEL = 6;
const ROUNDS = 5;

const auth = () => ({ Authorization: `Bearer ${token}` });
async function setBalance(coinBalance: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { coinBalance } });
}
async function balance(): Promise<number> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance;
}
async function ledgerSum(sessionId: string, type: "GAME_LOSS" | "GAME_WIN"): Promise<{ count: number; sum: number }> {
  const rows = await prisma.transaction.findMany({ where: { sessionId, type } });
  return { count: rows.length, sum: rows.reduce((a, r) => a + r.coinDelta, 0) };
}

beforeAll(async () => {
  await setupTestDb();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = (authRes.body as { token: string }).token;
  userId = (authRes.body as { userId: string }).userId;
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 100_000, ageConfirmed: true } });
});

afterAll(() => teardownTestDb());

describe("roulette /spin concurrency", () => {
  it(`${PARALLEL} parallel spins on one session → exactly one 200, one GAME_LOSS, one hand (x${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await setBalance(10_000);
      const s = await request(app).post("/roulette/start-session").set(auth()).send({});
      expect(s.status).toBe(201);
      const sessionId = s.body.sessionId as string;

      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          request(app).post("/roulette/spin").set(auth()).send({ sessionId, bets: [{ type: "red", amount: 100 }] }),
        ),
      );
      const ok = results.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(PARALLEL - 1);

      const loss = await ledgerSum(sessionId, "GAME_LOSS");
      expect(loss).toEqual({ count: 1, sum: -100 });
      const win = await ledgerSum(sessionId, "GAME_WIN");
      expect(win.count).toBe(ok[0].body.totalReturn > 0 ? 1 : 0);
      expect(await balance()).toBe(10_000 - 100 + ok[0].body.totalReturn);

      const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect((row.hands as unknown[]).length).toBe(1);
      expect(row.totalPayout).toBe(ok[0].body.totalReturn);
    }
  });
});

describe("video poker concurrency", () => {
  it(`${PARALLEL} parallel /game/deal on one session → exactly one debit (x${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await setBalance(1_000);
      const s = await request(app).post("/game/start-session").set(auth()).send({ betAmount: 5 });
      expect(s.status).toBe(201);
      const sessionId = s.body.sessionId as string;

      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () => request(app).post("/game/deal").set(auth()).send({ sessionId })),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(PARALLEL - 1);
      expect(await ledgerSum(sessionId, "GAME_LOSS")).toEqual({ count: 1, sum: -5 });
      expect(await balance()).toBe(995);
      const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect((row.hands as unknown[]).length).toBe(1);
    }
  });

  it(`${PARALLEL} parallel /game/draw → exactly one payout (x${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await setBalance(1_000);
      const s = await request(app).post("/game/start-session").set(auth()).send({ betAmount: 5 });
      const sessionId = s.body.sessionId as string;
      expect((await request(app).post("/game/deal").set(auth()).send({ sessionId })).status).toBe(200);

      const holds = [true, true, true, true, true]; // deterministic hand → same payout for everyone
      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () => request(app).post("/game/draw").set(auth()).send({ sessionId, holds })),
      );
      const ok = results.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);
      const payout = ok[0].body.payout as number;
      const win = await ledgerSum(sessionId, "GAME_WIN");
      expect(win).toEqual(payout > 0 ? { count: 1, sum: payout } : { count: 0, sum: 0 });
      expect(await balance()).toBe(995 + payout);
      const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.totalPayout).toBe(payout);
      expect(row.state).toBe("ACTIVE");
    }
  });
});

describe("blackjack concurrency", () => {
  type BjBody = { phase: string; totalWagered: number; totalReturn?: number; legalActions: string[] };

  async function newSession(): Promise<string> {
    const s = await request(app).post("/blackjack/start-session").set(auth()).send({});
    expect(s.status).toBe(201);
    return s.body.sessionId as string;
  }

  // Ledger invariant: debits recorded == wager on the persisted state, and the
  // balance moved by exactly -totalWagered (+totalReturn once settled).
  async function assertLedger(sessionId: string, startBalance: number): Promise<void> {
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
    const st = (row.hands as unknown as { totalWagered: number; totalReturn: number; phase: string }[])[0];
    const loss = await ledgerSum(sessionId, "GAME_LOSS");
    const win = await ledgerSum(sessionId, "GAME_WIN");
    expect(-loss.sum).toBe(st.totalWagered);
    const credited = st.phase === "settled" ? st.totalReturn : 0;
    expect(win.sum).toBe(credited);
    expect(row.totalPayout).toBe(credited);
    expect(await balance()).toBe(startBalance - st.totalWagered + credited);
  }

  it(`${PARALLEL} parallel /blackjack/deal → exactly one debit (x${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await setBalance(10_000);
      const sessionId = await newSession();
      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          request(app).post("/blackjack/deal").set(auth()).send({ sessionId, bet: 100 }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await ledgerSum(sessionId, "GAME_LOSS")).toEqual({ count: 1, sum: -100 });
      await assertLedger(sessionId, 10_000);
    }
  });

  it(`${PARALLEL} parallel mixed actions (hit/stand/double) → exactly one applied, ledger consistent (x${ROUNDS} rounds)`, async () => {
    let exercised = 0;
    for (let round = 0; exercised < ROUNDS && round < ROUNDS * 10; round++) {
      await setBalance(10_000);
      const sessionId = await newSession();
      const d = await request(app).post("/blackjack/deal").set(auth()).send({ sessionId, bet: 100 });
      expect(d.status).toBe(200);
      if ((d.body as BjBody).phase !== "player") continue; // need an open decision
      exercised++;
      const actions = ["double", "stand", "hit", "double", "stand", "hit"].slice(0, PARALLEL);
      const results = await Promise.all(
        actions.map((action) => request(app).post("/blackjack/action").set(auth()).send({ sessionId, action })),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      await assertLedger(sessionId, 10_000);
    }
    expect(exercised).toBe(ROUNDS);
  });

  // Stale prevWagered: after a split, a parallel `double` (hand 1) + `stand`
  // used to both apply; the stand computed its wager delta against the pre-double
  // totalWagered and debited the double a second time.
  it("parallel double + stand after a split cannot double-debit", async () => {
    const BET = 100;
    let exercised = 0;
    for (let attempt = 0; exercised < ROUNDS && attempt < 400; attempt++) {
      await setBalance(10_000);
      const sessionId = await newSession();
      const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
      // Find a clientSeed whose opening deal is a splittable non-ace pair (test-only grind).
      let seed: string | null = null;
      for (let i = 0; i < 2000 && !seed; i++) {
        const cs = `split-${attempt}-${i}`;
        const shoe = generateShoe(row.serverSeed, cs, DEFAULT_NUM_DECKS);
        const st = deal(shoe, BET, { numDecks: DEFAULT_NUM_DECKS, dealerHitsSoft17: true });
        if (st.phase !== "player" || !legalActions(st).includes("split")) continue;
        const after = applyAction(st, "split", shoe);
        if (after.phase === "player" && legalActions(after).includes("double")) seed = cs;
      }
      if (!seed) continue;
      await prisma.gameSession.update({ where: { id: sessionId }, data: { clientSeed: seed } });

      expect((await request(app).post("/blackjack/deal").set(auth()).send({ sessionId, bet: BET })).status).toBe(200);
      expect((await request(app).post("/blackjack/action").set(auth()).send({ sessionId, action: "split" })).status).toBe(200);
      exercised++;

      const actions = ["double", "stand", "double", "stand", "double", "stand"].slice(0, PARALLEL);
      await Promise.all(
        actions.map((action) => request(app).post("/blackjack/action").set(auth()).send({ sessionId, action })),
      );
      await assertLedger(sessionId, 10_000);
    }
    expect(exercised).toBe(ROUNDS);
  });

  it(`${PARALLEL} parallel /blackjack/insurance → at most one applied, ledger consistent`, async () => {
    let exercised = 0;
    for (let attempt = 0; exercised < 2 && attempt < 400; attempt++) {
      await setBalance(10_000);
      const sessionId = await newSession();
      const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
      let seed: string | null = null;
      for (let i = 0; i < 2000 && !seed; i++) {
        const cs = `ins-${attempt}-${i}`;
        const st = deal(generateShoe(row.serverSeed, cs, DEFAULT_NUM_DECKS), 100, {
          numDecks: DEFAULT_NUM_DECKS,
          dealerHitsSoft17: true,
        });
        if (st.phase === "insurance") seed = cs;
      }
      if (!seed) continue;
      await prisma.gameSession.update({ where: { id: sessionId }, data: { clientSeed: seed } });
      expect((await request(app).post("/blackjack/deal").set(auth()).send({ sessionId, bet: 100 })).status).toBe(200);
      exercised++;
      const results = await Promise.all(
        Array.from({ length: PARALLEL }, (_, i) =>
          request(app).post("/blackjack/insurance").set(auth()).send({ sessionId, take: i % 2 === 0 }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      await assertLedger(sessionId, 10_000);
    }
    expect(exercised).toBe(2);
  });
});
