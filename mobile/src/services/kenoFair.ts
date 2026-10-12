import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";
import { hashServerSeed } from "./provablyFair";

// Client-side re-derivation of a keno draw (v2 spec):
//   bytes = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:keno:${counter}`) for counter = 0,1,…
//   read big-endian uint32s; partial Fisher–Yates over [1..80] for 20 picks,
//   rejecting v ≥ floor(2^32 / n)·n.
// TODO(keno): cross-check KENO_TEST_VECTOR against backend/src/services/keno.ts once it lands.

export const KENO_POOL = 80;
export const KENO_DRAWS = 20;

class ByteStream {
  private counter = 0;
  private buf: Uint8Array = new Uint8Array(0);
  private pos = 0;

  constructor(
    private readonly key: Uint8Array,
    private readonly clientSeed: string,
    private readonly nonce: number,
  ) {}

  nextUint32(): number {
    if (this.pos + 4 > this.buf.length) {
      this.buf = hmac(sha256, this.key, utf8ToBytes(`${this.clientSeed}:${this.nonce}:keno:${this.counter}`));
      this.counter += 1;
      this.pos = 0;
    }
    const b = this.buf;
    const p = this.pos;
    this.pos += 4;
    return ((b[p]! << 24) >>> 0) + (b[p + 1]! << 16) + (b[p + 2]! << 8) + b[p + 3]!;
  }
}

export function kenoDraw(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const stream = new ByteStream(utf8ToBytes(serverSeed), clientSeed, nonce);
  const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
  const drawn: number[] = [];
  for (let i = 0; i < KENO_DRAWS; i++) {
    const n = KENO_POOL - i;
    const limit = Math.floor(0x1_0000_0000 / n) * n;
    let v = stream.nextUint32();
    while (v >= limit) v = stream.nextUint32();
    const j = i + (v % n);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
    drawn.push(pool[i]!);
  }
  return drawn;
}

export interface KenoVerificationResult {
  seedHashMatches: boolean;
  drawMatches: boolean;
  expectedDrawn: number[];
}

export function verifyKenoDraw(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number,
  drawn: readonly number[],
): KenoVerificationResult {
  const expectedDrawn = kenoDraw(serverSeed, clientSeed, nonce);
  return {
    seedHashMatches: hashServerSeed(serverSeed).toLowerCase() === serverSeedHash.toLowerCase(),
    drawMatches: drawn.length === KENO_DRAWS && drawn.every((d, i) => d === expectedDrawn[i]),
    expectedDrawn,
  };
}

export function isKenoVerified(v: KenoVerificationResult | null | undefined): boolean {
  return !!v && v.seedHashMatches && v.drawMatches;
}
