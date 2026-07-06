import { generateServerSeed, hashServerSeed } from "./videoPoker.js";
import { prisma } from "../db/client.js";

// FABLE-2026-07 H-2: per-user server-seed chain with committed client entropy.
//
// The problem: the old flow generated serverSeed AND clientSeed at session start,
// so a malicious operator could grind serverSeed against the (also server-chosen)
// clientSeed to bias the deck, and the client's "verify" would still pass.
//
// The chain fixes the grinding: each session's serverSeed is COMMITTED (its hash
// published) at the END of the previous session, BEFORE the operator learns the
// next clientSeed. The client generates clientSeed locally and sends it at
// start-session; because serverSeed was fixed and published beforehand, the
// operator cannot re-grind it against that clientSeed.
//
// Chain state lives on User: `nextServerSeed` (secret pre-image, server-only) and
// `nextServerSeedHash` (the published commitment). start-session CONSUMES the
// pending seed for this session and ROTATES a fresh one for the next, returning
// the new commitment so the client can verify continuity across sessions.
//
// Backward compatible: existing clients that ignore `nextServerSeedHash` and let
// the server pick clientSeed keep working; the chain still removes cross-session
// predictability. New clients gain grinding resistance by supplying clientSeed.

export interface ConsumedSeed {
  serverSeed: string; // secret until revealed at draw/spin
  serverSeedHash: string; // commitment for THIS session (was published last session)
  nextServerSeedHash: string; // commitment for the NEXT session
}

// Injected storage so the compare-and-swap rotation can be unit-tested against
// an in-memory concurrency simulation without a real database.
export interface ChainStore {
  read(userId: string): Promise<{ nextServerSeed: string | null; nextServerSeedHash: string | null }>;
  // Compare-and-swap: set the pending seed to `next` ONLY IF it currently equals
  // `expected` (null matches null). Returns true iff exactly one row was updated.
  cas(
    userId: string,
    expected: string | null,
    next: { seed: string; hash: string },
  ): Promise<boolean>;
}

// Pure: given the current pending pre-image (or null for an uninitialized chain),
// produce the seed to use this session plus the freshly rotated next seed.
export function deriveConsumption(pending: {
  nextServerSeed: string | null;
  nextServerSeedHash: string | null;
}): { serverSeed: string; serverSeedHash: string; next: { seed: string; hash: string } } {
  const serverSeed = pending.nextServerSeed ?? generateServerSeed();
  // If the chain was initialized, the committed hash is authoritative; otherwise
  // derive it (first session bootstraps the chain).
  const serverSeedHash = pending.nextServerSeedHash ?? hashServerSeed(serverSeed);
  const seed = generateServerSeed();
  return { serverSeed, serverSeedHash, next: { seed, hash: hashServerSeed(seed) } };
}

// Consume the pending server seed and atomically rotate the next one. The CAS
// guarantees that if two session creations race for the same user, only one wins
// the rotation and the loser retries against the new pending value — so NO two
// sessions ever share a serverSeed (which would re-open the C-1 reuse hole).
export async function consumeServerSeed(
  store: ChainStore,
  userId: string,
  maxAttempts = 5,
): Promise<ConsumedSeed> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pending = await store.read(userId);
    const { serverSeed, serverSeedHash, next } = deriveConsumption(pending);
    const won = await store.cas(userId, pending.nextServerSeed, next);
    if (won) {
      return { serverSeed, serverSeedHash, nextServerSeedHash: next.hash };
    }
    // Lost the race — another session rotated the chain. Loop and retry against
    // the new pending value (which we'll consume instead).
  }
  throw new Error("serverSeedChain: exhausted CAS attempts allocating a fresh seed");
}

// Prisma-backed store. `updateMany` with the observed value in the WHERE clause
// is the compare-and-swap: it updates 0 or 1 rows depending on whether the
// pending seed still matches what we read.
export const prismaChainStore: ChainStore = {
  async read(userId) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { nextServerSeed: true, nextServerSeedHash: true },
    });
    if (!u) throw new Error("serverSeedChain: user not found");
    return { nextServerSeed: u.nextServerSeed, nextServerSeedHash: u.nextServerSeedHash };
  },
  async cas(userId, expected, next) {
    const res = await prisma.user.updateMany({
      where: { id: userId, nextServerSeed: expected },
      data: { nextServerSeed: next.seed, nextServerSeedHash: next.hash },
    });
    return res.count === 1;
  },
};

// Convenience for a brand-new user: an initialized chain so their very first
// session already consumes a pre-committed seed (no bootstrap grinding gap).
export function freshChainInit(): { nextServerSeed: string; nextServerSeedHash: string } {
  const seed = generateServerSeed();
  return { nextServerSeed: seed, nextServerSeedHash: hashServerSeed(seed) };
}
