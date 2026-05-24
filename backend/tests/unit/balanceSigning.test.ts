import { signBalance, verifyBalanceSig, _resetSigningKeyForTest } from "../../src/services/balanceSigning.js";

// Set a stable JWT_SECRET before the service loads its key
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-32-chars-minimum-len!";
});

beforeEach(() => {
  _resetSigningKeyForTest();
});

describe("signBalance", () => {
  it("returns coinBalance, balanceSig (64 hex chars), and sigTimestamp", () => {
    const result = signBalance("user_abc", 500);
    expect(result.coinBalance).toBe(500);
    expect(result.balanceSig).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sigTimestamp).toBeGreaterThan(0);
  });

  it("produces different sigs for different userIds", () => {
    const a = signBalance("user_a", 500);
    const b = signBalance("user_b", 500);
    expect(a.balanceSig).not.toBe(b.balanceSig);
  });

  it("produces different sigs for different balances", () => {
    const a = signBalance("user_a", 100);
    const b = signBalance("user_a", 200);
    expect(a.balanceSig).not.toBe(b.balanceSig);
  });

  it("produces different sigs at different timestamps (deterministic within call)", () => {
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

  it("rejects wrong userId", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    expect(verifyBalanceSig("user_xyz", coinBalance, sigTimestamp, balanceSig)).toBe(false);
  });

  it("rejects wrong balance", () => {
    const { balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    expect(verifyBalanceSig("user_abc", 751, sigTimestamp, balanceSig)).toBe(false);
  });

  it("rejects tampered sig", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    const tampered = balanceSig.slice(0, -2) + "ff";
    expect(verifyBalanceSig("user_abc", coinBalance, sigTimestamp, tampered)).toBe(false);
  });

  it("rejects expired token (> 60 seconds old)", () => {
    const past = Math.floor(Date.now() / 1000) - 61;
    // Build a valid sig but with an old timestamp
    const payload = `user_abc:750:${past}`;
    const { createHmac } = require("crypto");
    const key = createHmac("sha256", process.env.JWT_SECRET!).update("nfpg_balance_v1").digest();
    const sig = createHmac("sha256", key).update(payload).digest("hex");
    expect(verifyBalanceSig("user_abc", 750, past, sig)).toBe(false);
  });

  it("rejects invalid hex in balanceSig (wrong format)", () => {
    const { sigTimestamp } = signBalance("user_abc", 750);
    expect(verifyBalanceSig("user_abc", 750, sigTimestamp, "not-valid-hex")).toBe(false);
  });

  it("rejects sig from a different JWT_SECRET", () => {
    const { coinBalance, balanceSig, sigTimestamp } = signBalance("user_abc", 750);
    // Change the secret, reset key cache — sig should no longer verify
    process.env.JWT_SECRET = "different-secret-32-chars-min!!";
    _resetSigningKeyForTest();
    expect(verifyBalanceSig("user_abc", coinBalance, sigTimestamp, balanceSig)).toBe(false);
    // Restore
    process.env.JWT_SECRET = "test-secret-32-chars-minimum-len!";
    _resetSigningKeyForTest();
  });
});
