import {
  deriveConsumption,
  consumeServerSeed,
  freshChainInit,
  type ChainStore,
} from "../../src/services/serverSeedChain";
import { hashServerSeed } from "../../src/services/videoPoker";

describe("deriveConsumption", () => {
  it("bootstraps a fresh chain when pending is null", () => {
    const c = deriveConsumption({ nextServerSeed: null, nextServerSeedHash: null });
    expect(c.serverSeed).toHaveLength(64);
    expect(c.serverSeedHash).toBe(hashServerSeed(c.serverSeed));
    expect(c.next.hash).toBe(hashServerSeed(c.next.seed));
    expect(c.next.seed).not.toBe(c.serverSeed);
  });

  it("uses the committed pending seed + its published hash when initialized", () => {
    const init = freshChainInit();
    const c = deriveConsumption({
      nextServerSeed: init.nextServerSeed,
      nextServerSeedHash: init.nextServerSeedHash,
    });
    expect(c.serverSeed).toBe(init.nextServerSeed);
    expect(c.serverSeedHash).toBe(init.nextServerSeedHash);
    // The commitment is honoured (hash of the revealed seed matches).
    expect(hashServerSeed(c.serverSeed)).toBe(c.serverSeedHash);
  });
});

// In-memory store that models the DB compare-and-swap. `cas` succeeds only if the
// stored pending pre-image still equals `expected` — exactly the semantics of
// Prisma updateMany({ where: { nextServerSeed: expected } }).
function memStore(init: { nextServerSeed: string | null; nextServerSeedHash: string | null }): {
  store: ChainStore;
  state: { nextServerSeed: string | null; nextServerSeedHash: string | null };
} {
  const state = { ...init };
  const store: ChainStore = {
    async read() {
      return { nextServerSeed: state.nextServerSeed, nextServerSeedHash: state.nextServerSeedHash };
    },
    async cas(_userId, expected, next) {
      if (state.nextServerSeed === expected) {
        state.nextServerSeed = next.seed;
        state.nextServerSeedHash = next.hash;
        return true;
      }
      return false;
    },
  };
  return { store, state };
}

describe("consumeServerSeed", () => {
  it("consumes the pending seed and rotates the next one, publishing its hash", async () => {
    const init = freshChainInit();
    const { store, state } = memStore(init);
    const c = await consumeServerSeed(store, "u1");
    expect(c.serverSeed).toBe(init.nextServerSeed);
    expect(c.serverSeedHash).toBe(init.nextServerSeedHash);
    // Chain advanced: stored pending is now a new seed, and its hash was returned.
    expect(state.nextServerSeed).not.toBe(init.nextServerSeed);
    expect(c.nextServerSeedHash).toBe(state.nextServerSeedHash);
    expect(hashServerSeed(state.nextServerSeed!)).toBe(c.nextServerSeedHash);
  });

  it("this session's commitment is the previous session's nextServerSeedHash (chain continuity)", async () => {
    const { store } = memStore(freshChainInit());
    const s1 = await consumeServerSeed(store, "u1");
    const s2 = await consumeServerSeed(store, "u1");
    expect(s2.serverSeedHash).toBe(s1.nextServerSeedHash);
    const s3 = await consumeServerSeed(store, "u1");
    expect(s3.serverSeedHash).toBe(s2.nextServerSeedHash);
  });

  it("CONCURRENCY: interleaved consumers never share a serverSeed", async () => {
    // Simulate two session creations racing on the SAME snapshot: both read the
    // same pending value before either rotates. This is the dangerous case — if
    // both used the pending seed, two sessions would share serverSeed (C-1 reuse).
    const shared = memStore(freshChainInit());
    let readCount = 0;
    const firstPending = { ...shared.state };
    const racingStore: ChainStore = {
      async read() {
        // First two reads see the ORIGINAL pending value (the race window).
        readCount++;
        if (readCount <= 2) return { ...firstPending };
        return shared.store.read("u1");
      },
      cas: shared.store.cas,
    };

    const [a, b] = await Promise.all([
      consumeServerSeed(racingStore, "u1"),
      consumeServerSeed(racingStore, "u1"),
    ]);

    // Exactly one got the original pending seed; the loser retried and got the
    // rotated one. Critically, the two serverSeeds must differ.
    expect(a.serverSeed).not.toBe(b.serverSeed);
    const usedOriginal = [a, b].filter((x) => x.serverSeed === firstPending.nextServerSeed);
    expect(usedOriginal).toHaveLength(1);
  });

  it("produces all-distinct seeds across many sequential sessions", async () => {
    const { store } = memStore(freshChainInit());
    const seeds = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const c = await consumeServerSeed(store, "u1");
      expect(seeds.has(c.serverSeed)).toBe(false);
      seeds.add(c.serverSeed);
    }
    expect(seeds.size).toBe(50);
  });

  it("throws if it cannot win the CAS within the attempt budget", async () => {
    const neverWins: ChainStore = {
      async read() {
        return freshChainInit();
      },
      async cas() {
        return false;
      },
    };
    await expect(consumeServerSeed(neverWins, "u1", 3)).rejects.toThrow(/CAS attempts/);
  });
});
