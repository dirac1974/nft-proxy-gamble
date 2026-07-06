import request from "supertest";
import { Wallet } from "ethers";
import { createApp } from "../../src/app";
import { prisma, setupTestDb, teardownTestDb } from "./setup";
import { generateDeck } from "../../src/services/videoPoker";
import { evaluateVariant, type PokerVariant } from "../../src/services/pokerVariants";

const app = createApp();
const wallet = Wallet.createRandom();
let token: string;
let userId: string;

const bearer = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await setupTestDb();
  const nonceRes = await request(app).get(`/auth/nonce?address=${wallet.address}`);
  const signature = await wallet.signMessage((nonceRes.body as { nonce: string }).nonce);
  const authRes = await request(app).post("/auth/verify").send({ address: wallet.address, signature });
  token = (authRes.body as { token: string }).token;
  userId = (authRes.body as { userId: string }).userId;
  await prisma.user.update({ where: { id: userId }, data: { coinBalance: 1000, ageConfirmed: true } });
});

afterAll(() => teardownTestDb());

async function playVariantRound(variant: PokerVariant) {
  const start = await request(app)
    .post("/game/start-session")
    .set(bearer())
    .send({ betAmount: 1, variant });
  expect(start.body.gameType).toContain(variant.split("-")[0]);
  const sessionId = start.body.sessionId as string;

  await request(app).post("/game/deal").set(bearer()).send({ sessionId });
  const holds = [false, false, false, false, false];
  const draw = await request(app).post("/game/draw").set(bearer()).send({ sessionId, holds });
  return { start, sessionId, draw: draw.body as { drawnCards: number[]; rank: string; payout: number; serverSeed: string } };
}

describe("video poker variants", () => {
  it.each<PokerVariant>(["jacks-or-better", "bonus-poker", "deuces-wild"])(
    "plays a %s round and the revealed hand evaluates to the reported rank",
    async (variant) => {
      const { start, draw } = await playVariantRound(variant);

      // Reproduce the deck from the revealed serverSeed and confirm the final
      // 5-card hand evaluates (independently) to exactly the rank the server paid.
      const deck = generateDeck(draw.serverSeed, start.body.clientSeed, 0);
      // With all holds=false the final hand is the draw pool deck[5..9].
      expect(draw.drawnCards).toEqual(deck.slice(5, 10));

      const recomputed = evaluateVariant(draw.drawnCards, variant);
      expect(recomputed).toBe(draw.rank);
      expect(typeof draw.payout).toBe("number");
    },
  );

  it("rejects a Deuces Wild sessionId dealt via the wrong game (roulette route)", async () => {
    const start = await request(app).post("/game/start-session").set(bearer()).send({ betAmount: 1, variant: "deuces-wild" });
    const res = await request(app)
      .post("/roulette/spin")
      .set(bearer())
      .send({ sessionId: start.body.sessionId, bets: [{ type: "red", amount: 1 }] });
    expect(res.status).toBe(409);
  });
});
