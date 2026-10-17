// Prints the Ed25519 balance-verification PUBLIC key derived from JWT_SECRET.
// Usage (from backend/, with the target environment's JWT_SECRET in env or .env):
//   npx tsx scripts/print-balance-pubkey.ts
// Set the output as EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY for the matching EAS profile.
// The public key is safe to ship; JWT_SECRET and the derived seed are not — never print them.

async function main(): Promise<void> {
  // The config module validates the full server env; only JWT_SECRET matters here.
  process.env.DATABASE_URL ??= "postgresql://unused";
  const { getBalancePublicKeyHex } = await import("../src/services/balanceSigning.js");
  process.stdout.write(`${getBalancePublicKeyHex()}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
