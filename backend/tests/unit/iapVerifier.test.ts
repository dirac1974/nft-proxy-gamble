import { hashReceipt, verifyGoogleReceipt, verifyAppleReceipt } from "../../src/services/iapVerifier";

// Apple verifier calls external HTTP — we mock global.fetch to exercise the
// status + bundle_id binding logic without hitting Apple.

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

  // Prototype-pollution defense: a malicious productId that names a property
  // on Object.prototype (constructor, __proto__, toString, hasOwnProperty)
  // must not resolve to a truthy value via the IAP_PRODUCTS lookup. Before
  // hardening, `IAP_PRODUCTS["constructor"]` returned the Object constructor
  // function — truthy, but `coinsGranted > 0` was false so it slipped past
  // by accident. Hardened lookup uses Object.prototype.hasOwnProperty.call.
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "rejects prototype-property productId '%s'",
    async (poisonId) => {
      const result = await verifyGoogleReceipt("validtoken12345", poisonId);
      expect(result.valid).toBe(false);
      expect(result.coinsGranted).toBe(0);
    },
  );
});

// RT-MED-2 regression: Apple returns status 0 for ANY valid receipt from ANY
// app. Without binding the receipt to our bundle id, an attacker could redeem a
// receipt minted by a different (free) app that happens to use a matching
// productId. APPLE_APP_ATTEST_BUNDLE_ID is set to "com.nftproxygamble.app" in
// tests/setup.ts.
describe("verifyAppleReceipt — bundle_id binding", () => {
  const realFetch = global.fetch;
  const mockApple = (body: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    }) as unknown as typeof fetch;
  };

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("rejects a status-0 receipt from a foreign bundle_id", async () => {
    mockApple({
      status: 0,
      receipt: { bundle_id: "com.evil.cloneapp", in_app: [{ product_id: "coins_500" }] },
    });
    const result = await verifyAppleReceipt("forged-but-apple-valid");
    expect(result.valid).toBe(false);
    expect(result.coinsGranted).toBe(0);
  });

  it("accepts a status-0 receipt from our own bundle_id", async () => {
    mockApple({
      status: 0,
      receipt: { bundle_id: "com.nftproxygamble.app", in_app: [{ product_id: "coins_500" }] },
    });
    const result = await verifyAppleReceipt("legit-receipt");
    expect(result.valid).toBe(true);
    expect(result.coinsGranted).toBe(500);
  });
});
