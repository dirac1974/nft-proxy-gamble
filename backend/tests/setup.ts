// Set required env vars before any module imports config/index.ts.
// Unconditional assignment ensures config/index.ts always caches the same
// secret regardless of what the CI environment injects.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://nftp:nftp_dev@localhost:5432/nft_proxy_gamble_test";
process.env.JWT_SECRET = "test_secret_that_is_long_enough_for_zod_validation";
process.env.JWT_EXPIRY = "24h";
process.env.NODE_ENV = "test";
// Expected iOS bundle id — exercises the RT-MED-2 receipt-binding check.
process.env.APPLE_APP_ATTEST_BUNDLE_ID = process.env.APPLE_APP_ATTEST_BUNDLE_ID ?? "com.nftproxygamble.app";
