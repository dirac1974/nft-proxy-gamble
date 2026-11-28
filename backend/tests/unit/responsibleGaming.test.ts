import {
  LIMIT_CHANGE_DELAY_MS,
  addUtcMonths,
  depositLimitBlock,
  exclusionBlock,
  extendUntil,
  isLoosening,
  lossLimitBlock,
  nextUtcDayStart,
  planLimitChange,
  resolveDueLimits,
  utcDayStart,
  type RgLimitState,
} from "../../src/services/responsibleGaming.js";

const NOW = new Date("2026-10-12T15:30:00.000Z");
const base: RgLimitState = {
  dailyDepositLimitCoins: null,
  dailyLossLimitCoins: null,
  pendingDepositLimitChange: false,
  pendingDailyDepositLimitCoins: null,
  pendingLossLimitChange: false,
  pendingDailyLossLimitCoins: null,
  limitChangePendingAt: null,
};
const later = (ms: number): Date => new Date(NOW.getTime() + ms);

describe("UTC day boundaries", () => {
  it("day start / next day start", () => {
    expect(utcDayStart(NOW).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(nextUtcDayStart(NOW).toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });
  it("addUtcMonths", () => {
    expect(addUtcMonths(NOW, 6).toISOString()).toBe("2027-04-12T15:30:00.000Z");
    expect(addUtcMonths(NOW, 60).toISOString()).toBe("2031-10-12T15:30:00.000Z");
  });
});

describe("isLoosening", () => {
  it.each([
    [null, 100, false], // adding a limit tightens
    [100, 50, false],
    [100, 100, false],
    [100, 150, true],
    [100, null, true], // removal loosens
    [null, null, false],
  ])("current %p → requested %p = %p", (c, r, expected) => {
    expect(isLoosening(c, r)).toBe(expected);
  });
});

describe("planLimitChange", () => {
  it("setting a first limit applies immediately", () => {
    const p = planLimitChange(base, { dailyDepositLimitCoins: 500 }, NOW);
    expect(p.state.dailyDepositLimitCoins).toBe(500);
    expect(p.immediate).toEqual(["dailyDepositLimitCoins"]);
    expect(p.queued).toEqual([]);
    expect(p.state.limitChangePendingAt).toBeNull();
  });

  it("decrease applies immediately", () => {
    const p = planLimitChange({ ...base, dailyLossLimitCoins: 300 }, { dailyLossLimitCoins: 100 }, NOW);
    expect(p.state.dailyLossLimitCoins).toBe(100);
    expect(p.immediate).toEqual(["dailyLossLimitCoins"]);
  });

  it("increase is queued for 24h, current limit unchanged", () => {
    const p = planLimitChange({ ...base, dailyLossLimitCoins: 100 }, { dailyLossLimitCoins: 1000 }, NOW);
    expect(p.state.dailyLossLimitCoins).toBe(100);
    expect(p.state.pendingLossLimitChange).toBe(true);
    expect(p.state.pendingDailyLossLimitCoins).toBe(1000);
    expect(p.state.limitChangePendingAt).toEqual(later(LIMIT_CHANGE_DELAY_MS));
    expect(p.queued).toEqual(["dailyLossLimitCoins"]);
  });

  it("removal is queued (pending value null + flag)", () => {
    const p = planLimitChange({ ...base, dailyDepositLimitCoins: 100 }, { dailyDepositLimitCoins: null }, NOW);
    expect(p.state.dailyDepositLimitCoins).toBe(100);
    expect(p.state.pendingDepositLimitChange).toBe(true);
    expect(p.state.pendingDailyDepositLimitCoins).toBeNull();
  });

  it("a decrease cancels a queued increase of the same limit", () => {
    const queued = planLimitChange({ ...base, dailyLossLimitCoins: 100 }, { dailyLossLimitCoins: 1000 }, NOW).state;
    const p = planLimitChange(queued, { dailyLossLimitCoins: 50 }, NOW);
    expect(p.state.dailyLossLimitCoins).toBe(50);
    expect(p.state.pendingLossLimitChange).toBe(false);
    expect(p.state.limitChangePendingAt).toBeNull();
  });

  it("re-submitting the same value cancels a queued increase without counting as a change", () => {
    const queued = planLimitChange({ ...base, dailyLossLimitCoins: 100 }, { dailyLossLimitCoins: 1000 }, NOW).state;
    const p = planLimitChange(queued, { dailyLossLimitCoins: 100 }, NOW);
    expect(p.immediate).toEqual([]);
    expect(p.state.pendingLossLimitChange).toBe(false);
  });

  it("a new increase restarts the delay for all queued changes", () => {
    const first = planLimitChange({ ...base, dailyLossLimitCoins: 100, dailyDepositLimitCoins: 100 }, { dailyLossLimitCoins: 200 }, NOW).state;
    const t2 = later(60 * 60 * 1000);
    const p = planLimitChange(first, { dailyDepositLimitCoins: 300 }, t2);
    expect(p.state.limitChangePendingAt).toEqual(new Date(t2.getTime() + LIMIT_CHANGE_DELAY_MS));
    expect(p.state.pendingLossLimitChange).toBe(true);
    expect(p.state.pendingDepositLimitChange).toBe(true);
  });

  it("a decrease on one limit keeps the other's queued change and its timer", () => {
    const first = planLimitChange({ ...base, dailyLossLimitCoins: 100, dailyDepositLimitCoins: 100 }, { dailyLossLimitCoins: 200 }, NOW).state;
    const p = planLimitChange(first, { dailyDepositLimitCoins: 50 }, later(1000));
    expect(p.state.limitChangePendingAt).toEqual(first.limitChangePendingAt);
    expect(p.state.dailyDepositLimitCoins).toBe(50);
  });
});

describe("resolveDueLimits", () => {
  const queued = planLimitChange({ ...base, dailyLossLimitCoins: 100, dailyDepositLimitCoins: 100 }, { dailyLossLimitCoins: 900, dailyDepositLimitCoins: null }, NOW).state;

  it("not applied before 24h", () => {
    const r = resolveDueLimits(queued, later(LIMIT_CHANGE_DELAY_MS - 1));
    expect(r.applied).toBe(false);
    expect(r.state.dailyLossLimitCoins).toBe(100);
  });

  it("applied at 24h, including removal", () => {
    const r = resolveDueLimits(queued, later(LIMIT_CHANGE_DELAY_MS));
    expect(r.applied).toBe(true);
    expect(r.state.dailyLossLimitCoins).toBe(900);
    expect(r.state.dailyDepositLimitCoins).toBeNull();
    expect(r.state.pendingLossLimitChange).toBe(false);
    expect(r.state.limitChangePendingAt).toBeNull();
  });
});

describe("blocks", () => {
  it("self-exclusion outranks cool-off; expired ones do not block", () => {
    expect(exclusionBlock({ coolOffUntil: later(1000), selfExcludedUntil: later(5000) }, NOW)?.code).toBe("RG_SELF_EXCLUDED");
    expect(exclusionBlock({ coolOffUntil: later(1000), selfExcludedUntil: null }, NOW)).toEqual({ code: "RG_COOL_OFF", until: later(1000) });
    expect(exclusionBlock({ coolOffUntil: later(-1), selfExcludedUntil: later(-1) }, NOW)).toBeNull();
  });

  it("loss limit blocks at >= limit until next UTC midnight", () => {
    expect(lossLimitBlock(null, 1e9, NOW)).toBeNull();
    expect(lossLimitBlock(100, 99, NOW)).toBeNull();
    expect(lossLimitBlock(100, 100, NOW)).toEqual({ code: "RG_LOSS_LIMIT", until: nextUtcDayStart(NOW) });
  });

  it("deposit limit blocks only when today's deposits + grant exceed it", () => {
    expect(depositLimitBlock(null, 1e9, 1e9, NOW)).toBeNull();
    expect(depositLimitBlock(1000, 500, 500, NOW)).toBeNull();
    expect(depositLimitBlock(1000, 500, 501, NOW)?.code).toBe("RG_DEPOSIT_LIMIT");
  });

  it("extendUntil never shortens", () => {
    expect(extendUntil(later(5000), later(1000))).toEqual(later(5000));
    expect(extendUntil(later(1000), later(5000))).toEqual(later(5000));
    expect(extendUntil(null, later(1000))).toEqual(later(1000));
  });
});
