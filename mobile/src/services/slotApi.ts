import { request, extractVerifiedBalance } from "./api";
import type { SignedBalanceResponse } from "./balanceVerification";
import {
  BET_LEVELS,
  FEATURE_OPTIONS,
  MAX_WIN,
  PAYS,
  SCATTER_PAYS,
  normalizeGrid,
  type FeatureOption,
  type FeatureOptionId,
  type Grid,
  type Pos,
  type ScatterResult,
  type SlotSymbolId,
  type WayWin,
} from "@/components/slot/slotMath";

// Lion Lantern Night API (gameType "slots-lantern-night-1-0").
// SYNC: contract per v2 spec. Responses are normalised defensively (grid orientation,
// spin nested vs flat) until backend/src/services/slots.ts is final.

export const SLOT_GAME_TYPE = "slots-lantern-night-1-0";

export interface SlotSession {
  sessionId: string;
  gameType: string;
  serverSeedHash: string;
  clientSeed: string;
  nextServerSeedHash?: string;
  /** FEATURE_PENDING rounds the server auto-resolved (default option) on this start-session. */
  resolvedFeature: { option: FeatureOptionId; totalWin: number; count: number } | null;
}

export interface SlotSpin {
  nonce: number;
  stops: number[];
  grid: Grid;
  multiplier: number | null;
  wins: WayWin[];
  scatter: ScatterResult;
  anticipation: { fromReel: number } | null;
  /** Free spin that awarded extra games (null when the server did not say). */
  retrigger: boolean | null;
}

export interface SlotFeatureOffer {
  triggered: boolean;
  scatterCount: number;
  options: FeatureOption[];
}

export interface SlotSpinResult {
  sessionId: string;
  betLevel: number;
  spin: SlotSpin;
  totalWagered: number;
  totalReturn: number;
  feature: SlotFeatureOffer | null;
  serverSeed: string | null;
  serverSeedHash: string;
  clientSeed: string;
  newBalance: number;
}

export interface SlotFeatureSummary {
  option: FeatureOptionId;
  awarded: number;
  retriggers: number;
  played: number;
  totalWin: number;
  capped: boolean;
}

export interface SlotFeatureResult {
  spins: SlotSpin[];
  feature: SlotFeatureSummary;
  totalReturn: number;
  totalWagered: number | null;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  newBalance: number;
}

export interface SlotPaytable {
  pays: Partial<Record<SlotSymbolId, readonly [number, number, number]>>;
  scatterPays: Record<number, number>;
  betLevels: number[];
  options: FeatureOption[];
  maxWin: number;
  rtp: { min: number; max: number } | null;
}

export const FALLBACK_PAYTABLE: SlotPaytable = {
  pays: PAYS,
  scatterPays: SCATTER_PAYS,
  betLevels: [...BET_LEVELS],
  options: FEATURE_OPTIONS.map((o) => ({ ...o, multipliers: [...o.multipliers], weights: [...o.weights] })),
  maxWin: MAX_WIN,
  rtp: null,
};

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function normPositions(v: unknown): Pos[] {
  return arr<unknown>(v)
    .map((p) => (Array.isArray(p) ? ([num(p[0]), num(p[1])] as Pos) : [num((p as Raw)?.reel), num((p as Raw)?.row)] as Pos));
}

export function normalizeSpin(raw: Raw): SlotSpin {
  const sc = (raw.scatter ?? {}) as Raw;
  const ant = raw.anticipation as Raw | null | undefined;
  return {
    nonce: num(raw.nonce),
    stops: arr<number>(raw.stops),
    grid: normalizeGrid(arr<string[]>(raw.grid)),
    multiplier: typeof raw.multiplier === "number" ? raw.multiplier : null,
    wins: arr<Raw>(raw.wins).map((w) => ({
      symbol: String(w.symbol) as SlotSymbolId,
      count: num(w.count),
      ways: num(w.ways, 1),
      payout: num(w.payout),
      positions: normPositions(w.positions),
    })),
    scatter: { count: num(sc.count), payout: num(sc.payout), positions: normPositions(sc.positions) },
    anticipation: ant && typeof ant.fromReel === "number" ? { fromReel: ant.fromReel } : null,
    retrigger: typeof raw.retrigger === "boolean" ? raw.retrigger : raw.retriggerDenied === true ? false : null,
  };
}

const cap = (v: string): string => (v ? v[0]!.toUpperCase() + v.slice(1) : v);

function normOption(o: Raw): FeatureOption {
  const id = String(o.id) as FeatureOptionId;
  const fb = FEATURE_OPTIONS.find((f) => f.id === id);
  const multipliers = arr<number>(o.multipliers).length ? arr<number>(o.multipliers) : [...(fb?.multipliers ?? [1])];
  const w = arr<number>(o.weights);
  const weights =
    w.length === multipliers.length ? w : fb && fb.weights.length === multipliers.length ? [...fb.weights] : multipliers.map(() => 1);
  return {
    id,
    spins: num(o.spins, fb?.spins ?? 0),
    multipliers,
    weights,
    rtp: num(o.rtp, fb?.rtp ?? 0),
    volatility: cap(typeof o.volatility === "string" ? o.volatility : fb?.volatility ?? ""),
  };
}

export function normalizeSession(raw: Raw): SlotSession {
  const auto = arr<Raw>(raw.autoResolvedFeatures);
  const total = auto.reduce((a, r) => a + num((r.feature as Raw | undefined)?.totalWin), 0);
  const lastOpt = (auto[auto.length - 1]?.feature as Raw | undefined)?.option;
  return {
    sessionId: String(raw.sessionId ?? ""),
    gameType: String(raw.gameType ?? ""),
    serverSeedHash: String(raw.serverSeedHash ?? ""),
    clientSeed: String(raw.clientSeed ?? ""),
    nextServerSeedHash: typeof raw.nextServerSeedHash === "string" ? raw.nextServerSeedHash : undefined,
    resolvedFeature: auto.length ? { option: String(lastOpt ?? "ruby") as FeatureOptionId, totalWin: total, count: auto.length } : null,
  };
}

export function normalizeSpinResponse(resp: Raw, newBalance: number, betLevel: number): SlotSpinResult {
  const spinRaw = (resp.spin as Raw | undefined) ?? (arr<Raw>(resp.spins)[0] as Raw | undefined) ?? resp;
  const f = resp.feature as Raw | null | undefined;
  const spin = normalizeSpin(spinRaw);
  const baseReturn =
    typeof resp.totalReturn === "number"
      ? resp.totalReturn
      : spin.wins.reduce((a, w) => a + w.payout, 0) + spin.scatter.payout;
  return {
    sessionId: String(resp.sessionId ?? ""),
    betLevel: num(resp.betLevel, betLevel),
    spin,
    totalWagered: num(resp.totalWagered),
    totalReturn: baseReturn,
    feature:
      f && f.triggered
        ? { triggered: true, scatterCount: num(f.scatterCount, spin.scatter.count), options: arr<Raw>(f.options).map(normOption) }
        : null,
    serverSeed: typeof resp.serverSeed === "string" ? resp.serverSeed : null,
    serverSeedHash: String(resp.serverSeedHash ?? ""),
    clientSeed: String(resp.clientSeed ?? ""),
    newBalance,
  };
}

export function normalizeFeatureResponse(resp: Raw, newBalance: number): SlotFeatureResult {
  const f = (resp.feature ?? {}) as Raw;
  return {
    spins: arr<Raw>(resp.spins).map(normalizeSpin),
    feature: {
      option: String(f.option) as FeatureOptionId,
      awarded: num(f.awarded),
      retriggers: num(f.retriggers),
      played: num(f.played),
      totalWin: num(f.totalWin),
      capped: !!f.capped,
    },
    totalReturn: num(resp.totalReturn),
    totalWagered: typeof resp.totalWagered === "number" ? resp.totalWagered : null,
    serverSeed: String(resp.serverSeed ?? ""),
    serverSeedHash: String(resp.serverSeedHash ?? ""),
    clientSeed: String(resp.clientSeed ?? ""),
    newBalance,
  };
}

export function normalizePaytable(raw: Raw): SlotPaytable {
  const levels = arr<number>(raw.betLevels).filter((n) => Number.isInteger(n) && n > 0);
  const opts = arr<Raw>(raw.options).map(normOption);
  const pays = (raw.paytable as Raw | undefined)?.pays ?? raw.pays ?? (raw.paytable as Raw | undefined);
  const range = raw.rtpRange;
  const rtp = Array.isArray(range) ? ({ min: range[0], max: range[1] } as Raw) : (raw.rtp as Raw | undefined);
  return {
    pays: pays && typeof pays === "object" ? (pays as SlotPaytable["pays"]) : PAYS,
    scatterPays: (raw.scatterPays as Record<number, number> | undefined) ?? ((raw.paytable as Raw | undefined)?.scatter as Record<number, number> | undefined) ?? SCATTER_PAYS,
    betLevels: levels.length ? levels : [...BET_LEVELS],
    options: opts.length ? opts : FALLBACK_PAYTABLE.options,
    maxWin: num(raw.maxWin, MAX_WIN),
    rtp: rtp && typeof rtp.min === "number" && typeof rtp.max === "number" ? { min: rtp.min, max: rtp.max } : null,
  };
}

export const slotApi = {
  startSession: async (clientSeed?: string): Promise<SlotSession> =>
    normalizeSession(
      await request<Raw>("/slots/start-session", {
        method: "POST",
        body: JSON.stringify(clientSeed ? { clientSeed } : {}),
      }),
    ),

  spin: async (sessionId: string, betLevel: number): Promise<SlotSpinResult> => {
    const resp = await request<SignedBalanceResponse & Raw>("/slots/spin", {
      method: "POST",
      body: JSON.stringify({ sessionId, betLevel }),
    });
    return normalizeSpinResponse(resp, extractVerifiedBalance(resp), betLevel);
  },

  feature: async (sessionId: string, option: FeatureOptionId): Promise<SlotFeatureResult> => {
    const resp = await request<SignedBalanceResponse & Raw>("/slots/feature", {
      method: "POST",
      body: JSON.stringify({ sessionId, option }),
    });
    return normalizeFeatureResponse(resp, extractVerifiedBalance(resp));
  },

  paytable: async (): Promise<SlotPaytable> => normalizePaytable(await request<Raw>("/slots/paytable")),
};
