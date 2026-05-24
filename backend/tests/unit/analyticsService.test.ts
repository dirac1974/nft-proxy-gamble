// Mock prisma before importing service
jest.mock("../../src/db/client.js", () => ({
  prisma: {
    transaction: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    userAnalytics: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from "../../src/db/client.js";
import { recordAnalyticsEvent, getRiskLevel, type RiskLevel } from "../../src/services/analyticsService.js";

const mockCount = prisma.transaction.count as jest.Mock;
const mockAggregate = prisma.transaction.aggregate as jest.Mock;
const mockUpsert = prisma.userAnalytics.upsert as jest.Mock;
const mockFindUnique = prisma.userAnalytics.findUnique as jest.Mock;

function setupMocks({
  hands = 10,
  wins = 3,
  coinsAdded = 500,
  cashouts = 0,
}: {
  hands?: number;
  wins?: number;
  coinsAdded?: number;
  cashouts?: number;
}) {
  mockCount
    .mockResolvedValueOnce(hands)   // handsLastHour
    .mockResolvedValueOnce(wins)    // winsLastHour
    .mockResolvedValueOnce(cashouts); // cashoutsToday
  mockAggregate.mockResolvedValueOnce({ _sum: { coinDelta: coinsAdded } });
  mockUpsert.mockResolvedValueOnce({});
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("recordAnalyticsEvent", () => {
  it("returns LOW risk for normal game activity", async () => {
    setupMocks({ hands: 10, wins: 3, coinsAdded: 200, cashouts: 0 });
    const risk = await recordAnalyticsEvent("user1", { type: "game_result", win: false });
    expect(risk).toBe("LOW");
  });

  it("returns MEDIUM when single anomaly flag triggers", async () => {
    // High win rate: 9/10 wins
    setupMocks({ hands: 20, wins: 18, coinsAdded: 200, cashouts: 0 });
    const risk = await recordAnalyticsEvent("user1", { type: "game_result", win: true });
    expect(risk).toBe("MEDIUM");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ riskLevel: "MEDIUM" }),
      }),
    );
  });

  it("returns HIGH when two anomaly flags trigger", async () => {
    // High win rate + high coins
    setupMocks({ hands: 20, wins: 18, coinsAdded: 15_000, cashouts: 0 });
    const risk = await recordAnalyticsEvent("user1", { type: "game_result", win: true });
    expect(risk).toBe("HIGH");
  });

  it("returns BLOCKED when three or more flags trigger", async () => {
    // High hands/hr + high win rate + high coins
    setupMocks({ hands: 450, wins: 300, coinsAdded: 20_000, cashouts: 0 });
    const risk = await recordAnalyticsEvent("user1", { type: "game_result", win: true });
    expect(risk).toBe("BLOCKED");
  });

  it("flags cashout_limit_reached when cashoutsToday >= 5", async () => {
    setupMocks({ hands: 5, wins: 1, coinsAdded: 100, cashouts: 5 });
    const risk = await recordAnalyticsEvent("user1", { type: "cashout" });
    // One flag = MEDIUM
    expect(risk).toBe("MEDIUM");
    const upsertCall = mockUpsert.mock.calls[0][0];
    expect(upsertCall.update.riskFlags).toEqual(
      expect.arrayContaining([expect.stringContaining("cashout_limit_reached")]),
    );
  });

  it("does not flag high_win_rate with fewer than 20 hands (not enough data)", async () => {
    setupMocks({ hands: 5, wins: 5, coinsAdded: 100, cashouts: 0 });
    const risk = await recordAnalyticsEvent("user1", { type: "game_result", win: true });
    expect(risk).toBe("LOW");
  });

  it("upserts with correct userId", async () => {
    setupMocks({});
    await recordAnalyticsEvent("user-abc", { type: "game_result", win: false });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-abc" } }),
    );
  });
});

describe("getRiskLevel", () => {
  it("returns stored risk level", async () => {
    mockFindUnique.mockResolvedValueOnce({ riskLevel: "HIGH" });
    const risk = await getRiskLevel("user1");
    expect(risk).toBe("HIGH");
  });

  it("returns LOW when no analytics row exists", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const risk = await getRiskLevel("user1");
    expect(risk).toBe("LOW");
  });
});
