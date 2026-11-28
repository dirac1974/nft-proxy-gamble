// Single source for user-facing brand strings. Rename the product here.
export const BRAND = {
  name: "Aurum",
  wordmark: "AURUM",
  sub: "CASINO",
  tagline: "Casino classics. Provably fair. Real cash-outs.",
  supportEmail: "support@nftproxygamble.app",
  coinsPerUsd: 100,
} as const;

export function coinsToUsd(coins: number): string {
  return `$${(coins / BRAND.coinsPerUsd).toFixed(2)}`;
}

export function formatCoins(coins: number): string {
  return Math.round(coins).toLocaleString("en-US");
}
