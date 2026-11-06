import { createHmac, createPublicKey, verify } from "node:crypto";
import {
  signBalance,
  verifyBalanceSig,
  getBalancePublicKeyHex,
  BALANCE_SIG_ALG,
  _resetSigningKeyForTest,
} from "../../src/services/balanceSigning.js";

const SECRET = "test-secret-32-chars-minimum-len!";

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

beforeEach(() => {
  _resetSigningKeyForTest();
});

// Independent verifier: raw 32-byte pubkey -> SPKI DER -> node verify.
function verifyWithRawPub(pubHex: string, payload: string, sigHex: string): boolean {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pubHex, "hex")]);
  const key = createPublicKey({ key: spki, format: "der", type: "spki" });
  return verify(null, Buffer.from(payload, "utf8"), key, Buffer.from(sigHex, "hex"));
}

describe("signBalance (ed25519)", () => {
  it("returns coinBalance, 128-hex balanceSig, sigTimestamp and sigAlg", () => {
    const result = signBalance("user_abc", 500);
    expect(result.coinBalance).toBe(500);
    expect(result.balanceSig).toMatch(/^[0-9a-f]{128}$/);
    expect(result.sigTimestamp).toBeGreaterThan(0);
    expect(result.sigAlg).toBe("ed25519");
    expect(BALANCE_SIG_ALG).toBe("ed25519");
  });

  it("signature verifies against the published raw public key over userId:balance:ts", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    const pub = getBalancePublicKeyHex();
    expect(pub).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyWithRawPub(pub, `user_abc:${coinBalance}:${sigTimestamp}`, balanceSig)).toBe(true);
    expect(verifyWithRawPub(pub, `user_abc:${coinBalance + 1}:${sigTimestamp}`, balanceSig)).toBe(false);
  });

  it("derives the keypair deterministically from JWT_SECRET", () => {
    const a = getBalancePublicKeyHex();
    _resetSigningKeyForTest();
    expect(getBalancePublicKeyHex()).toBe(a);
    process.env.JWT_SECRET = "different-secret-32-chars-min!!";
    _resetSigningKeyForTest();
    expect(getBalancePublicKeyHex()).not.toBe(a);
    process.env.JWT_SECRET = SECRET;
  });

  it("public key does not expose the seed or the legacy HMAC key", () => {
    const pub = getBalancePublicKeyHex();
    const seed = createHmac("sha256", SECRET).update("nfpg_balance_ed25519_v1").digest("hex");
    const legacy = createHmac("sha256", SECRET).update("nfpg_balance_v1").digest("hex");
    expect(pub).not.toBe(seed);
    expect(pub).not.toBe(legacy);
  });

  it("produces different sigs for different userIds / balances / timestamps", () => {
    expect(signBalance("user_a", 500).balanceSig).not.toBe(signBalance("user_b", 500).balanceSig);
    expect(signBalance("user_a", 100).balanceSig).not.toBe(signBalance("user_a", 200).balanceSig);
    jest.spyOn(Date, "now").mockReturnValueOnce(1_716_000_000_000).mockReturnValueOnce(1_716_000_001_000);
    const a = signBalance("user_a", 500);
    const b = signBalance("user_a", 500);
    expect(a.balanceSig).not.toBe(b.balanceSig);
    jest.restoreAllMocks();
  });
});

describe("verifyBalanceSig", () => {
  it("verifies a freshly signed balance", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    expect(verifyBalanceSig("user_abc", coinBalance, sigTimestamp, balanceSig)).toBe(true);
  });

  it("rejects wrong userId / balance", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    expect(verifyBalanceSig("user_xyz", coinBalance, sigTimestamp, balanceSig)).toBe(false);
    expect(verifyBalanceSig("user_abc", 751, sigTimestamp, balanceSig)).toBe(false);
  });

  it("rejects tampered sig", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    const tampered = balanceSig.slice(0, -2) + (balanceSig.endsWith("ff") ? "00" : "ff");
    expect(verifyBalanceSig("user_abc", coinBalance, sigTimestamp, tampered)).toBe(false);
  });

  it("rejects expired token (> 60 seconds old)", () => {
    jest.spyOn(Date, "now").mockReturnValueOnce(Date.now() - 61_000);
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    jest.restoreAllMocks();
    expect(verifyBalanceSig("user_abc", coinBalance, sigTimestamp, balanceSig)).toBe(false);
  });

  it("rejects invalid format and legacy 64-hex HMAC sigs", () => {
    const { sigTimestamp } = signBalance("user_abc", 750);
    expect(verifyBalanceSig("user_abc", 750, sigTimestamp, "not-valid-hex")).toBe(false);
    const key = createHmac("sha256", SECRET).update("nfpg_balance_v1").digest();
    const hmacSig = createHmac("sha256", key).update(`user_abc:750:${sigTimestamp}`).digest("hex");
    expect(verifyBalanceSig("user_abc", 750, sigTimestamp, hmacSig)).toBe(false);
  });

  it("rejects sig from a different JWT_SECRET", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    process.env.JWT_SECRET = "different-secret-32-chars-min!!";
    _resetSigningKeyForTest();
    expect(verifyBalanceSig("user_abc", coinBalance, sigTimestamp, balanceSig)).toBe(false);
    process.env.JWT_SECRET = SECRET;
    _resetSigningKeyForTest();
  });
});
