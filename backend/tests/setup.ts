// Set required env vars before any module imports config/index.ts
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://nftp:nftp_dev@localhost:5432/nft_proxy_gamble_test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test_secret_that_is_long_enough_for_zod_validation";
process.env.JWT_EXPIRY = "24h";
process.env.NODE_ENV = "test";
