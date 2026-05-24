import { hashReceipt, verifyGoogleReceipt } from "../../src/services/iapVerifier";

// Apple verifier calls external HTTP — tested via integration; unit tests cover helpers.

describe("hashReceipt", () => {
  it("returns a 64-char hex string", () => {
    expect(hashReceipt("someReceipt")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashReceipt("abc")).toBe(hashReceipt("abc"));
  });

  it("is collision-resistant for different inputs", () => {
    expect(hashReceipt("a")).not.toBe(hashReceipt("b"));
  });
});

describe("verifyGoogleReceipt (dev/test mode)", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
  });

  it("returns valid=true for known productId + non-trivial token", async () => {
    const result = await verifyGoogleReceipt("validtoken12345", "coins_500");
    expect(result.valid).toBe(true);
    expect(result.coinsGranted).toBe(500);
    expect(result.productId).toBe("coins_500");
    expect(result.receiptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns valid=false for unknown productId", async () => {
    const result = await verifyGoogleReceipt("validtoken12345", "coins_unknown");
    expect(result.valid).toBe(false);
    expect(result.coinsGranted).toBe(0);
  });

  it("returns valid=false for short (suspicious) token", async () => {
    const result = await verifyGoogleReceipt("short", "coins_100");
    expect(result.valid).toBe(false);
  });
});
