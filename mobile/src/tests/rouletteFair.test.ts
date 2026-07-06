import { describe, it, expect } from "@jest/globals";
import { rouletteSpinNumber, verifyRouletteSpin, hashServerSeed } from "@/services/provablyFair";

// Reference vectors computed from backend/src/services/roulette.ts:spinNumber
// (HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`) mod 37). These MUST match
// the backend byte-for-byte or players' independent verification would fail.
describe("rouletteSpinNumber — backend parity", () => {
  it("matches known backend vectors", () => {
    expect(rouletteSpinNumber("a".repeat(64), "b".repeat(32), 0)).toBe(13);
    expect(rouletteSpinNumber("a".repeat(64), "b".repeat(32), 1)).toBe(13);
    expect(rouletteSpinNumber("srv", "cli", 0)).toBe(23);
  });

  it("always returns a pocket in 0..36", () => {
    for (let i = 0; i < 1000; i++) {
      const n = rouletteSpinNumber("server", `client-${i}`, i);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(36);
    }
  });

  it("is deterministic", () => {
    expect(rouletteSpinNumber("s", "c", 7)).toBe(rouletteSpinNumber("s", "c", 7));
  });
});

describe("verifyRouletteSpin", () => {
  const serverSeed = "srv";
  const clientSeed = "cli";
  const nonce = 0;
  const serverSeedHash = hashServerSeed(serverSeed);
  const winningNumber = rouletteSpinNumber(serverSeed, clientSeed, nonce); // 23

  it("passes for a self-consistent spin", () => {
    const r = verifyRouletteSpin(serverSeed, serverSeedHash, clientSeed, nonce, winningNumber);
    expect(r.seedHashMatches).toBe(true);
    expect(r.numberMatches).toBe(true);
    expect(r.expectedNumber).toBe(23);
  });

  it("fails when the server reports a different number (tampering)", () => {
    const r = verifyRouletteSpin(serverSeed, serverSeedHash, clientSeed, nonce, (winningNumber + 1) % 37);
    expect(r.numberMatches).toBe(false);
  });

  it("fails when serverSeed does not match its committed hash", () => {
    const r = verifyRouletteSpin(serverSeed, hashServerSeed("different"), clientSeed, nonce, winningNumber);
    expect(r.seedHashMatches).toBe(false);
  });
});
