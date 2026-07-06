import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app.js";
import { prisma, setupTestDb, teardownTestDb } from "./setup.js";
import { generateShoe } from "../../src/services/blackjack.js";

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;
let userId: string;

async function auth() {
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = (authRes.body as { token: string }).token;
  userId = (authRes.body as { userId: string }).userId;
}

const bearer = () => ({ Authorization: `Bearer ${token}` });

async function startSession(): Promise<{ sessionId: string; serverSeedHash: string; clientSeed: string }> {
  const res = await request(app).post("/blackjack/start-session").set(bearer()).send({});
  return res.body;
}

interface RoundResp {
  phase: string;
  dealer: number[];
  dealerHoleHidden: boolean;
  hands: { cards: number[] }[];
  active: number;
  legalActions: string[];
  serverSeed?: string;
  clientSeed: string;
  numDecks?: number;
  netProfit?: number;
  totalReturn?: number;
  coinBalance: number;
}

beforeAll(async () => {
  await setupTestDb();
  await auth();
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 5000, ageConfirmed: true } });
});

afterAll(() => teardownTestDb());

beforeEach(async () => {
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 5000 } });
});

// Drive a round to settlement by declining insurance and standing on every hand.
async function playToSettle(sessionId: string, bet: number): Promise<RoundResp> {
  let resp = (await request(app).post("/blackjack/deal").set(bearer()).send({ sessionId, bet })).body as RoundResp;
  let guard = 0;
  while (resp.phase !== "settled" && guard++ < 30) {
    if (resp.phase === "insurance") {
      resp = (await request(app).post("/blackjack/insurance").set(bearer()).send({ sessionId, take: false })).body as RoundResp;
    } else {
      resp = (await request(app).post("/blackjack/action").set(bearer()).send({ sessionId, action: "stand" })).body as RoundResp;
    }
  }
  return resp;
}

describe("POST /blackjack/start-session", () => {
  it("returns a provably-fair commit", async () => {
    const s = await startSession();
    expect(s.sessionId).toBeTruthy();
    expect(s.serverSeedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.clientSeed).toBeTruthy();
  });
});

describe("POST /blackjack/deal", () => {
  it("debits the bet and hides the dealer hole card mid-round", async () => {
    const s = await startSession();
    const before = (await request(app).get("/balance").set(bearer())).body.coinBalance;
    const resp = (await request(app).post("/blackjack/deal").set(bearer()).send({ sessionId: s.sessionId, bet: 25 })).body as RoundResp;

    if (resp.phase !== "settled") {
      expect(resp.dealerHoleHidden).toBe(true);
      expect(resp.dealer.length).toBe(1);
      expect(resp.serverSeed).toBeUndefined(); // never leaked mid-round
    }
    // Bet was debited (win/settle may re-credit, but balance moved off `before`).
    expect(resp.coinBalance).toBeLessThanOrEqual(before);
  });

  it("rejects a second deal on the same session (one round per session)", async () => {
    const s = await startSession();
    await request(app).post("/blackjack/deal").set(bearer()).send({ sessionId: s.sessionId, bet: 10 });
    const res2 = await request(app).post("/blackjack/deal").set(bearer()).send({ sessionId: s.sessionId, bet: 10 });
    expect(res2.status).toBe(409);
  });

  it("rejects a bet above the player's balance", async () => {
    await prisma.user.update({ where: { id: userId }, data: { coinBalance: 5 } });
    const s = await startSession();
    const res = await request(app).post("/blackjack/deal").set(bearer()).send({ sessionId: s.sessionId, bet: 500 });
    expect(res.status).toBe(409); // atomic debit failed
  });
});

describe("full round settlement + provably-fair", () => {
  it("settles, reveals the serverSeed, and the revealed seed reproduces the dealt cards", async () => {
    const s = await startSession();
    const before = (await request(app).get("/balance").set(bearer())).body.coinBalance;
    const resp = await playToSettle(s.sessionId, 20);

    expect(resp.phase).toBe("settled");
    expect(resp.serverSeed).toBeTruthy();
    expect(resp.numDecks).toBeGreaterThan(0);

    // Reproduce the shoe from the revealed seed + committed client seed and check
    // the opening cards match: player=[shoe0,shoe2], dealer=[shoe1,shoe3].
    const shoe = generateShoe(resp.serverSeed!, resp.clientSeed, resp.numDecks!);
    expect(resp.hands[0].cards[0]).toBe(shoe[0]);
    expect(resp.hands[0].cards[1]).toBe(shoe[2]);
    expect(resp.dealer[0]).toBe(shoe[1]);
    expect(resp.dealer[1]).toBe(shoe[3]);

    // Balance conservation: final = before + netProfit.
    expect(resp.coinBalance).toBe(before + resp.netProfit!);
  });

  it("rejects any action after the round is settled", async () => {
    const s = await startSession();
    await playToSettle(s.sessionId, 10);
    const res = await request(app).post("/blackjack/action").set(bearer()).send({ sessionId: s.sessionId, action: "hit" });
    expect(res.status).toBe(409);
  });
});

describe("red team", () => {
  it("cannot act on another user's session", async () => {
    const s = await startSession();
    const other = Wallet.createRandom();
    const nonceRes = await request(app).get(`/auth/nonce?address=${other.address}`);
    const sig = await other.signMessage((nonceRes.body as { nonce: string }).nonce);
    const otherToken = (await request(app).post("/auth/verify").send({ address: other.address, signature: sig })).body.token;

    const res = await request(app)
      .post("/blackjack/deal")
      .set({ Authorization: `Bearer ${otherToken}` })
      .send({ sessionId: s.sessionId, bet: 10 });
    expect(res.status).toBe(404);
  });

  it("cannot double once the hand has more than two cards", async () => {
    // Find a hand where a hit keeps us in the player phase with 3+ cards, then
    // attempt an illegal double (only legal on the first two cards).
    for (let attempt = 0; attempt < 20; attempt++) {
      const s = await startSession();
      const dealt = (await request(app).post("/blackjack/deal").set(bearer()).send({ sessionId: s.sessionId, bet: 10 })).body as RoundResp;
      if (dealt.phase !== "player" || !dealt.legalActions.includes("hit")) continue;

      const afterHit = (await request(app).post("/blackjack/action").set(bearer()).send({ sessionId: s.sessionId, action: "hit" })).body as RoundResp;
      if (afterHit.phase === "player" && afterHit.hands[afterHit.active]?.cards.length >= 3) {
        const res = await request(app).post("/blackjack/action").set(bearer()).send({ sessionId: s.sessionId, action: "double" });
        expect(res.status).toBe(400);
        return;
      }
    }
    // If no 3-card non-bust arose in 20 tries the invariant is still covered by unit tests.
  });
});
