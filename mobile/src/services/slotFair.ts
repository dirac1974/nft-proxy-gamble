import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";
import { hashServerSeed } from "./provablyFair";
import { REELS, STRIPS, gridFromStops, type Grid, type SlotSymbolId } from "@/components/slot/slotMath";

// Lion Lantern Night provably-fair re-derivation (client side).
// SYNC: mirrors backend/src/services/slots.ts sampler:
//   reel stop r: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:reel:${r}:${round}`)
//   multiplier : HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:mult:${round}`) -> u in [0, sum(weights)),
//                then walk the integer weights (backend drawMultiplier).
// Each digest = 8 big-endian uint32 chunks; first v < floor(2^32/n)·n wins → v mod n;
// if all 8 are rejected, round++ and re-hash. Base spin nonce 0, free spin i nonce i.

const TWO32 = 0x1_0000_0000;
const MAX_ROUNDS = 64;

export const reelMessage = (clientSeed: string, nonce: number, reel: number, round: number): string =>
  `${clientSeed}:${nonce}:reel:${reel}:${round}`;
export const multMessage = (clientSeed: string, nonce: number, round: number): string =>
  `${clientSeed}:${nonce}:mult:${round}`;

export function sampleIndex(serverSeed: string, message: (round: number) => string, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error("sampleIndex: n must be a positive integer");
  const key = utf8ToBytes(serverSeed);
  const limit = Math.floor(TWO32 / n) * n;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const mac = hmac(sha256, key, utf8ToBytes(message(round)));
    for (let i = 0; i < 8; i++) {
      const o = i * 4;
      const v = mac[o]! * 0x100_0000 + ((mac[o + 1]! << 16) | (mac[o + 2]! << 8) | mac[o + 3]!);
      if (v < limit) return v % n;
    }
  }
  throw new Error("sampleIndex: exhausted rounds");
}

export function deriveStops(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  strips: readonly (readonly SlotSymbolId[])[] = STRIPS,
): number[] {
  return Array.from({ length: REELS }, (_, r) =>
    sampleIndex(serverSeed, (round) => reelMessage(clientSeed, nonce, r, round), strips[r]!.length),
  );
}

/** Weighted draw: u in [0, sum(w)) then walk the weights (uniform when weights omitted). */
export function deriveMultiplier(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  multipliers: readonly number[],
  weights?: readonly number[],
): number {
  const w = weights && weights.length === multipliers.length ? weights : multipliers.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  let u = sampleIndex(serverSeed, (round) => multMessage(clientSeed, nonce, round), total);
  for (let i = 0; i < w.length; i++) {
    if (u < w[i]!) return multipliers[i]!;
    u -= w[i]!;
  }
  throw new Error("deriveMultiplier: unreachable");
}

export interface MultiplierSet {
  multipliers: readonly number[];
  weights?: readonly number[];
}

export interface FairSpinInput {
  nonce: number;
  stops: number[];
  grid: Grid;
  multiplier?: number | null;
}

export interface SlotVerification {
  seedHashMatches: boolean;
  stopsMatch: boolean;
  gridMatch: boolean;
  multipliersMatch: boolean;
  checkedSpins: number;
  mismatchNonces: number[];
  expected: { nonce: number; stops: number[]; multiplier: number | null }[];
}

export function verifySlotRound(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  spins: readonly FairSpinInput[],
  feature: MultiplierSet | null = null,
): SlotVerification {
  const seedHashMatches = hashServerSeed(serverSeed) === serverSeedHash;
  let stopsMatch = true;
  let gridMatch = true;
  let multipliersMatch = true;
  const mismatchNonces: number[] = [];
  const expected = spins.map((s) => {
    const stops = deriveStops(serverSeed, clientSeed, s.nonce);
    const grid = gridFromStops(stops);
    const sOk = stops.every((v, i) => v === s.stops[i]);
    const gOk = grid.every((row, ri) => row.every((sym, c) => s.grid[ri]?.[c] === sym));
    let mult: number | null = null;
    let mOk = true;
    if (s.nonce > 0 && feature && feature.multipliers.length > 0) {
      mult = deriveMultiplier(serverSeed, clientSeed, s.nonce, feature.multipliers, feature.weights);
      mOk = s.multiplier == null || s.multiplier === mult;
    }
    if (!sOk) stopsMatch = false;
    if (!gOk) gridMatch = false;
    if (!mOk) multipliersMatch = false;
    if (!sOk || !gOk || !mOk) mismatchNonces.push(s.nonce);
    return { nonce: s.nonce, stops, multiplier: mult };
  });
  return { seedHashMatches, stopsMatch, gridMatch, multipliersMatch, checkedSpins: spins.length, mismatchNonces, expected };
}

export function isSlotVerified(v: SlotVerification | null | undefined): boolean {
  return !!v && v.seedHashMatches && v.stopsMatch && v.gridMatch && v.multipliersMatch;
}
