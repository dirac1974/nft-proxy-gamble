import { hashServerSeed } from "@/services/provablyFair";
import { isKenoVerified, kenoDraw, verifyKenoDraw } from "@/services/kenoFair";

// Pinned vector for the v2 domain-tagged message `${clientSeed}:${nonce}:keno:${counter}`.
// Computed independently with node:crypto; the same algorithm with the untagged v1 message
// reproduces the v1 spec vector [22,61,39,53,…] exactly.
// TODO(keno): cross-check against backend/src/services/keno.ts pinned vector when it lands.
const SEED = "a".repeat(64);
const VECTOR = [51, 15, 17, 37, 65, 57, 78, 8, 4, 16, 41, 79, 36, 56, 23, 21, 73, 35, 71, 43];

describe("kenoFair", () => {
  it("matches the pinned tagged vector", () => {
    expect(kenoDraw(SEED, "client", 0)).toEqual(VECTOR);
    expect(kenoDraw("b".repeat(64), "player_1", 3)).toEqual([33, 22, 17, 29, 42, 32, 54, 41, 6, 76, 44, 46, 40, 16, 70, 23, 7, 43, 35, 79]);
  });

  it("draws 20 unique numbers in 1..80", () => {
    for (let n = 0; n < 50; n++) {
      const d = kenoDraw(`seed-${n}`, "c", n);
      expect(d).toHaveLength(20);
      expect(new Set(d).size).toBe(20);
      d.forEach((x) => expect(x >= 1 && x <= 80).toBe(true));
    }
  });

  it("verifies an honest draw and flags tampering", () => {
    const hash = hashServerSeed(SEED);
    expect(isKenoVerified(verifyKenoDraw(SEED, hash, "client", 0, VECTOR))).toBe(true);
    const swapped = [...VECTOR];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(verifyKenoDraw(SEED, hash, "client", 0, swapped).drawMatches).toBe(false);
    expect(verifyKenoDraw(SEED, "0xdead", "client", 0, VECTOR).seedHashMatches).toBe(false);
  });
});
