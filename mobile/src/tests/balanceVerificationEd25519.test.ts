import { createHmac, createPrivateKey, createPublicKey, sign } from "crypto";
import { verifyAndExtractBalance, type SignedBalanceResponse } from "@/services/balanceVerification";

jest.mock("@/stores/walletStore", () => ({
  useWalletStore: { getState: () => ({ userId: "user_abc123" }) },
}));

// Mirrors backend/src/services/balanceSigning.ts key derivation (node:crypto),
// so this is a cross-implementation check: node signs, @noble/curves verifies.
const JWT_SECRET = "test-secret-32-chars-minimum-len!";
const seed = createHmac("sha256", JWT_SECRET).update("nfpg_balance_ed25519_v1").digest();
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
  format: "der",
  type: "pkcs8",
});
const PUBKEY_HEX = (createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("hex");
const LEGACY_HMAC_KEY = createHmac("sha256", JWT_SECRET).update("nfpg_balance_v1").digest();

const env = process.env as Record<string, string | undefined>;
const now = () => Math.floor(Date.now() / 1000);

function signed(coinBalance: number, opts: { userId?: string; ts?: number } = {}): SignedBalanceResponse {
  const ts = opts.ts ?? now();
  const payload = Buffer.from(`${opts.userId ?? "user_abc123"}:${coinBalance}:${ts}`, "utf8");
  return { coinBalance, balanceSig: sign(null, payload, privateKey).toString("hex"), sigTimestamp: ts, sigAlg: "ed25519" };
}

function hmacSigned(coinBalance: number): SignedBalanceResponse {
  const ts = now();
  const balanceSig = createHmac("sha256", LEGACY_HMAC_KEY).update(`user_abc123:${coinBalance}:${ts}`).digest("hex");
  return { coinBalance, balanceSig, sigTimestamp: ts };
}

const ORIGINAL_NODE_ENV = env.NODE_ENV;
beforeEach(() => {
  env.EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY = PUBKEY_HEX;
  delete env.EXPO_PUBLIC_BALANCE_VERIFY_KEY;
  env.NODE_ENV = "test";
});
afterAll(() => {
  env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete env.EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY;
});

describe("verifyAndExtractBalance — ed25519 (H2)", () => {
  it("accepts a valid server signature", () => {
    expect(verifyAndExtractBalance(signed(500))).toBe(500);
  });

  it("accepts a signature without sigAlg (field is optional) and an upper-case pubkey", () => {
    env.EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY = PUBKEY_HEX.toUpperCase();
    const { sigAlg: _a, ...rest } = signed(42);
    expect(verifyAndExtractBalance(rest)).toBe(42);
  });

  it("rejects a modified balance", () => {
    expect(verifyAndExtractBalance({ ...signed(500), coinBalance: 5000 })).toBeNull();
  });

  it("rejects a signature for another user", () => {
    expect(verifyAndExtractBalance(signed(500, { userId: "user_other" }))).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const r = signed(500);
    const flipped = (parseInt(r.balanceSig[0]!, 16) ^ 1).toString(16) + r.balanceSig.slice(1);
    expect(verifyAndExtractBalance({ ...r, balanceSig: flipped })).toBeNull();
  });

  it("rejects malformed signatures", () => {
    expect(verifyAndExtractBalance({ ...signed(500), balanceSig: "zz" })).toBeNull();
    expect(verifyAndExtractBalance({ ...signed(500), balanceSig: "a".repeat(128) })).toBeNull();
  });

  it("rejects stale signatures (> 60s)", () => {
    expect(verifyAndExtractBalance(signed(500, { ts: now() - 61 }))).toBeNull();
  });

  it("rejects HMAC signatures once a pubkey is configured (no downgrade)", () => {
    env.EXPO_PUBLIC_BALANCE_VERIFY_KEY = LEGACY_HMAC_KEY.toString("hex");
    expect(verifyAndExtractBalance(hmacSigned(500))).toBeNull();
    expect(verifyAndExtractBalance({ ...signed(500), sigAlg: "hmac-sha256" })).toBeNull();
  });

  it("works in production with the pubkey", () => {
    env.NODE_ENV = "production";
    expect(verifyAndExtractBalance(signed(77))).toBe(77);
  });
});

describe("verifyAndExtractBalance — legacy HMAC transition", () => {
  beforeEach(() => {
    delete env.EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY;
    env.EXPO_PUBLIC_BALANCE_VERIFY_KEY = LEGACY_HMAC_KEY.toString("hex");
  });

  it("accepts HMAC outside production when only the legacy key exists", () => {
    env.NODE_ENV = "development";
    expect(verifyAndExtractBalance(hmacSigned(300))).toBe(300);
  });

  it("refuses HMAC in production even if the legacy key is bundled", () => {
    env.NODE_ENV = "production";
    expect(verifyAndExtractBalance(hmacSigned(300))).toBeNull();
  });

  it("production with no keys at all returns null", () => {
    delete env.EXPO_PUBLIC_BALANCE_VERIFY_KEY;
    env.NODE_ENV = "production";
    expect(verifyAndExtractBalance(signed(1))).toBeNull();
  });
});
