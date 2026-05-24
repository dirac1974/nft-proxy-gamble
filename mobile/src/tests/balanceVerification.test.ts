import { verifyAndExtractBalance } from "@/services/balanceVerification";

// Mock walletStore to provide userId
jest.mock("@/stores/walletStore", () => ({
  useWalletStore: {
    getState: () => ({ userId: "user_abc123" }),
  },
}));

// Mock @noble/hashes modules
const mockHmacFn = jest.fn();
jest.mock("@noble/hashes/hmac", () => ({
  hmac: (...args: unknown[]) => mockHmacFn(...args),
}));
jest.mock("@noble/hashes/sha256", () => ({ sha256: "sha256-stub" }));
jest.mock("@noble/hashes/utils", () => ({
  bytesToHex: (b: Uint8Array) => Buffer.from(b).toString("hex"),
  hexToBytes: (s: string) => Buffer.from(s, "hex"),
}));

const VALID_KEY_HEX = "a".repeat(64); // 64-char hex = 32 bytes
const VALID_SIG = "b".repeat(64);
const NOW_SEC = Math.floor(Date.now() / 1000);

function makeResponse(overrides: Partial<{ coinBalance: number; balanceSig: string; sigTimestamp: number }> = {}) {
  return {
    coinBalance: 500,
    balanceSig: VALID_SIG,
    sigTimestamp: NOW_SEC,
    ...overrides,
  };
}

beforeEach(() => {
  mockHmacFn.mockReset();
  // Default: return bytes that hex-encode to VALID_SIG
  mockHmacFn.mockReturnValue(Buffer.from(VALID_SIG, "hex"));
  // Set env var for each test
  process.env.EXPO_PUBLIC_BALANCE_VERIFY_KEY = VALID_KEY_HEX;
  (process.env as Record<string, string>).NODE_ENV = "test";
});

describe("verifyAndExtractBalance", () => {
  it("returns coinBalance when signature is valid and fresh", () => {
    const result = verifyAndExtractBalance(makeResponse());
    expect(result).toBe(500);
  });

  it("returns null when balanceSig does not match computed HMAC", () => {
    mockHmacFn.mockReturnValue(Buffer.from("c".repeat(64), "hex")); // different hash
    const result = verifyAndExtractBalance(makeResponse({ balanceSig: VALID_SIG }));
    expect(result).toBeNull();
  });

  it("returns null when sigTimestamp is more than 60 seconds old", () => {
    const oldTimestamp = NOW_SEC - 61;
    const result = verifyAndExtractBalance(makeResponse({ sigTimestamp: oldTimestamp }));
    expect(result).toBeNull();
  });

  it("returns null when EXPO_PUBLIC_BALANCE_VERIFY_KEY is missing in production", () => {
    delete process.env.EXPO_PUBLIC_BALANCE_VERIFY_KEY;
    (process.env as Record<string, string>).NODE_ENV = "production";
    const result = verifyAndExtractBalance(makeResponse());
    expect(result).toBeNull();
  });

  it("returns coinBalance without verification in dev when key is missing", () => {
    delete process.env.EXPO_PUBLIC_BALANCE_VERIFY_KEY;
    (process.env as Record<string, string>).NODE_ENV = "development";
    const result = verifyAndExtractBalance(makeResponse({ coinBalance: 999 }));
    expect(result).toBe(999);
  });

  it("calls hmac with the correct payload format", () => {
    verifyAndExtractBalance(makeResponse({ coinBalance: 300, sigTimestamp: NOW_SEC }));
    expect(mockHmacFn).toHaveBeenCalledTimes(1);
    // Verify the payload string used: "userId:coinBalance:sigTimestamp"
    const callArgs = mockHmacFn.mock.calls[0];
    const payloadBytes: Uint8Array = callArgs[2];
    const payloadStr = new TextDecoder().decode(payloadBytes);
    expect(payloadStr).toBe(`user_abc123:300:${NOW_SEC}`);
  });
});
