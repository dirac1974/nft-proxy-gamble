import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// z.coerce.boolean() maps the STRING "false" to true (Boolean("false")), which
// silently inverted flags like APP_ATTEST_ALLOW_DEV_ENV=false. Parse explicitly.
const envBool = (fallback: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return fallback;
      if (typeof v === "boolean") return v;
      const s = v.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(s)) return true;
      if (["0", "false", "no", "off"].includes(s)) return false;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be true/false" });
      return z.NEVER;
    });

const optionalBool = envBool(false);

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
  APP_ATTEST_ALLOW_DEV_ENV: optionalBool, // accept development aaguid (never in prod)
  GOOGLE_PLAY_INTEGRITY_PACKAGE: z.string().optional(), // e.g. com.nftproxygamble.app
  // Play Integrity classic (local) verification keys from Play Console. Both
  // must be set for Android real verification; otherwise Android is shape-only.
  GOOGLE_PLAY_INTEGRITY_AES_KEY_B64: z.string().optional(),        // base64 AES-256 KEK
  GOOGLE_PLAY_INTEGRITY_EC_PUBLIC_KEY_B64: z.string().optional(),  // base64 DER SPKI P-256
  GOOGLE_PLAY_INTEGRITY_REQUIRE_STRONG: optionalBool,
  DEVICE_ATTESTATION_ENFORCE: optionalBool, // false = shadow mode
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Geo-block: when true, money paths fail CLOSED if the trusted edge country
  // header is missing. Default: true in production, false elsewhere.
  GEO_HEADER_REQUIRED: z.string().optional(),
  // Reverse-proxy hops in front of the app (express "trust proxy"). Default 1 in
  // production (one edge/LB hop), 0 elsewhere.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional(),
  // Comma-separated browser origins allowed by CORS. Production default: none.
  // Native mobile apps send no Origin header and are unaffected.
  CORS_ORIGINS: z.string().optional(),

  // EIP-4361 (Sign-In with Ethereum). SIWE_DOMAIN is required in production.
  SIWE_DOMAIN: z.string().optional(),
  SIWE_URI: z.string().url().optional(),
  SIWE_CHAIN_ID: z.coerce.number().int().positive().default(80002),
  SIWE_NONCE_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

  // Mint / commitment worker.
  MINT_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  MINT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(6),
  MINT_TX_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(120_000),
  MINT_EVENT_LOOKBACK_BLOCKS: z.coerce.number().int().min(0).default(50_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === "production";

function resolveBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  console.error(`Invalid boolean env value: ${v}`);
  process.exit(1);
}

if (isProd && !raw.SIWE_DOMAIN) {
  console.error("Invalid environment variables: SIWE_DOMAIN is required in production");
  process.exit(1);
}

const siweDomain = raw.SIWE_DOMAIN ?? "localhost";

export const config = {
  ...raw,
  GEO_HEADER_REQUIRED: resolveBool(raw.GEO_HEADER_REQUIRED, isProd),
  TRUST_PROXY: raw.TRUST_PROXY ?? (isProd ? 1 : 0),
  CORS_ORIGINS: (raw.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  CORS_ORIGINS_SET: raw.CORS_ORIGINS !== undefined,
  SIWE_DOMAIN: siweDomain,
  SIWE_URI: raw.SIWE_URI ?? `https://${siweDomain}`,
};

export type AppConfig = typeof config;
