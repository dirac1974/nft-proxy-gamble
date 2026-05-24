import { prisma } from "../db/client.js";

const WIN_RATE_THRESHOLD = 0.42;   // >42% wins in last hour is anomalous for VP
const COINS_PER_HOUR_THRESHOLD = 10_000;
const CASHOUTS_PER_DAY_THRESHOLD = 5;
const HANDS_PER_HOUR_THRESHOLD = 400; // ~6.6/min sustained — bot territory

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export type AnalyticsEvent =
  | { type: "game_result"; win: boolean }
  | { type: "iap_purchase"; coinsAdded: number }
  | { type: "cashout" };

export async function recordAnalyticsEvent(
  userId: string,
  event: AnalyticsEvent,
): Promise<RiskLevel> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  // Pull real counts from DB for the rolling window — not the cached counters
  const [handsLastHour, winsLastHour, coinsLastHour, cashoutsToday] =
    await Promise.all([
      prisma.transaction.count({
        where: {
          userId,
          type: { in: ["GAME_WIN", "GAME_LOSS"] },
          createdAt: { gte: oneHourAgo },
        },
      }),
      prisma.transaction.count({
        where: { userId, type: "GAME_WIN", createdAt: { gte: oneHourAgo } },
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          type: { in: ["GAME_WIN", "IAP_PURCHASE"] },
          createdAt: { gte: oneHourAgo },
          coinDelta: { gt: 0 },
        },
        _sum: { coinDelta: true },
      }),
      prisma.transaction.count({
        where: { userId, type: "CASHOUT_MINT", createdAt: { gte: startOfDay } },
      }),
    ]);

  const coinsAddedLastHour = coinsLastHour._sum.coinDelta ?? 0;
  const winRate = handsLastHour > 0 ? winsLastHour / handsLastHour : 0;

  const flags: string[] = [];

  if (handsLastHour > HANDS_PER_HOUR_THRESHOLD) {
    flags.push(`high_velocity:${handsLastHour}_hands/hr`);
  }
  if (handsLastHour >= 20 && winRate > WIN_RATE_THRESHOLD) {
    flags.push(`high_win_rate:${(winRate * 100).toFixed(1)}%`);
  }
  if (coinsAddedLastHour > COINS_PER_HOUR_THRESHOLD) {
    flags.push(`high_coins_added:${coinsAddedLastHour}/hr`);
  }
  if (cashoutsToday >= CASHOUTS_PER_DAY_THRESHOLD) {
    flags.push(`cashout_limit_reached:${cashoutsToday}/day`);
  }

  let riskLevel: RiskLevel = "LOW";
  if (flags.length >= 3) {
    riskLevel = "BLOCKED";
  } else if (flags.length === 2) {
    riskLevel = "HIGH";
  } else if (flags.length === 1) {
    riskLevel = "MEDIUM";
  }

  await prisma.userAnalytics.upsert({
    where: { userId },
    create: {
      userId,
      handsLastHour,
      winsLastHour,
      coinsAddedLastHour,
      cashoutsToday,
      totalCoinsAdded: coinsAddedLastHour,
      totalCashoutsAllTime: cashoutsToday,
      riskLevel,
      riskFlags: flags,
      lastEvaluatedAt: now,
    },
    update: {
      handsLastHour,
      winsLastHour,
      coinsAddedLastHour,
      cashoutsToday,
      riskLevel,
      riskFlags: flags,
      lastEvaluatedAt: now,
    },
  });

  if (riskLevel !== "LOW") {
    console.warn(
      `[analytics] userId=${userId} riskLevel=${riskLevel} flags=${flags.join(", ")}`,
    );
  }

  return riskLevel;
}

export async function getRiskLevel(userId: string): Promise<RiskLevel> {
  const row = await prisma.userAnalytics.findUnique({ where: { userId } });
  return (row?.riskLevel as RiskLevel | undefined) ?? "LOW";
}
