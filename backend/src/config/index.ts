import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default("24h"),
  POLYGON_RPC: z.string().url().default("https://rpc-amoy.polygon.technology"),
  MINTER_PRIVATE_KEY: z.string().optional(),
  CONTRACT_ADDRESS: z.string().optional(),
  APPLE_SHARED_SECRET: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_B64: z.string().optional(),
  // Device attestation (optional — shadow mode when not set)
  APPLE_APP_ATTEST_TEAM_ID: z.string().optional(),   // Apple 10-char team ID
  APPLE_APP_ATTEST_BUNDLE_ID: z.string().optional(), // e.g. com.nftproxygamble.app
  GOOGLE_PLAY_INTEGRITY_PACKAGE: z.string().optional(), // e.g. com.nftproxygamble.app
  DEVICE_ATTESTATION_ENFORCE: z.coerce.boolean().default(false), // false = shadow mode
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
