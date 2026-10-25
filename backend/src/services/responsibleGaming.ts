import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { AppError } from "../middleware/errorHandler.js";

// Responsible-gaming (RG) controls. Standard RG rule: a change that TIGHTENS a
// limit (lower value, or adding a limit where none existed) applies
// immediately; a change that LOOSENS it (higher value, or removal) is queued
// and only takes effect after LIMIT_CHANGE_DELAY_MS. Cool-off and
// self-exclusion can only be extended, never shortened, until they expire.
// "Today" is the UTC calendar day.

export const LIMIT_CHANGE_DELAY_MS = 24 * 60 * 60 * 1000;
export const COOL_OFF_HOURS = [24, 72, 168, 720] as const;
export const SELF_EXCLUDE_MONTHS = [6, 12, 60] as const;
export const PERMANENT_EXCLUSION = new Date("9999-12-31T00:00:00.000Z");
export const MAX_LIMIT_COINS = 100_000_000;
export const SELF_EXCLUDE_CONFIRM = "SELF-EXCLUDE";

export type RgCode = "RG_COOL_OFF" | "RG_SELF_EXCLUDED" | "RG_LOSS_LIMIT" | "RG_DEPOSIT_LIMIT";
export type LimitField = "dailyDepositLimitCoins" | "dailyLossLimitCoins";

export interface RgLimitState {
  dailyDepositLimitCoins: number | null;
  dailyLossLimitCoins: number | null;
  pendingDepositLimitChange: boolean;
  pendingDailyDepositLimitCoins: number | null;
  pendingLossLimitChange: boolean;
  pendingDailyLossLimitCoins: number | null;
  limitChangePendingAt: Date | null;
}

export interface RgUserState extends RgLimitState {
  coolOffUntil: Date | null;
  selfExcludedUntil: Date | null;
}

export interface RgBlock {
  code: RgCode;
  until?: Date;
}

export type LimitRequest = Partial<Record<LimitField, number | null>>;

export const RG_SELECT = {
  dailyDepositLimitCoins: true,
  dailyLossLimitCoins: true,
  pendingDepositLimitChange: true,
  pendingDailyDepositLimitCoins: true,
  pendingLossLimitChange: true,
  pendingDailyLossLimitCoins: true,
  limitChangePendingAt: true,
  coolOffUntil: true,
  selfExcludedUntil: true,
} as const satisfies Prisma.UserSelect;

const PENDING: Record<LimitField, { flag: "pendingDepositLimitChange" | "pendingLossLimitChange"; value: "pendingDailyDepositLimitCoins" | "pendingDailyLossLimitCoins" }> = {
  dailyDepositLimitCoins: { flag: "pendingDepositLimitChange", value: "pendingDailyDepositLimitCoins" },
  dailyLossLimitCoins: { flag: "pendingLossLimitChange", value: "pendingDailyLossLimitCoins" },
};
const FIELDS: LimitField[] = ["dailyDepositLimitCoins", "dailyLossLimitCoins"];

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcDayStart(now: Date): Date {
  return new Date(utcDayStart(now).getTime() + 24 * 60 * 60 * 1000);
}

export function addUtcMonths(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// null = no limit. Removing a limit or raising it loosens protection.
export function isLoosening(current: number | null, requested: number | null): boolean {
  if (requested === null) return current !== null;
  if (current === null) return false;
  return requested > current;
}

// Apply queued increases/removals whose 24h delay has elapsed.
export function resolveDueLimits<T extends RgLimitState>(s: T, now: Date): { state: T; applied: boolean } {
  if (!s.limitChangePendingAt || s.limitChangePendingAt.getTime() > now.getTime()) return { state: s, applied: false };
  const next: T = { ...s };
  for (const f of FIELDS) {
    const p = PENDING[f];
    if (next[p.flag]) next[f] = next[p.value];
    next[p.flag] = false;
    next[p.value] = null;
  }
  next.limitChangePendingAt = null;
  return { state: next, applied: true };
}

// Plan a limit-change request against an already-resolved state. A tightening
// request applies now and cancels any queued loosening of that limit. A new
// loosening request (re)starts the 24h delay for every queued change.
export function planLimitChange<T extends RgLimitState>(
  s: T,
  req: LimitRequest,
  now: Date,
): { state: T; immediate: LimitField[]; queued: LimitField[] } {
  const next: T = { ...s };
  const immediate: LimitField[] = [];
  const queued: LimitField[] = [];
  for (const f of FIELDS) {
    const requested = req[f];
    if (requested === undefined) continue;
    const p = PENDING[f];
    if (isLoosening(next[f], requested)) {
      next[p.flag] = true;
      next[p.value] = requested;
      queued.push(f);
    } else {
      if (next[f] !== requested) immediate.push(f);
      next[f] = requested;
      next[p.flag] = false;
      next[p.value] = null;
    }
  }
  const anyPending = FIELDS.some((f) => next[PENDING[f].flag]);
  if (!anyPending) next.limitChangePendingAt = null;
  else if (queued.length > 0) next.limitChangePendingAt = new Date(now.getTime() + LIMIT_CHANGE_DELAY_MS);
  return { state: next, immediate, queued };
}

export function exclusionBlock(s: Pick<RgUserState, "coolOffUntil" | "selfExcludedUntil">, now: Date): RgBlock | null {
  if (s.selfExcludedUntil && s.selfExcludedUntil.getTime() > now.getTime()) return { code: "RG_SELF_EXCLUDED", until: s.selfExcludedUntil };
  if (s.coolOffUntil && s.coolOffUntil.getTime() > now.getTime()) return { code: "RG_COOL_OFF", until: s.coolOffUntil };
  return null;
}

// New rounds are refused once today's net loss has reached the limit.
export function lossLimitBlock(lossLimit: number | null, netLossToday: number, now: Date): RgBlock | null {
  if (lossLimit === null || netLossToday < lossLimit) return null;
  return { code: "RG_LOSS_LIMIT", until: nextUtcDayStart(now) };
}

export function depositLimitBlock(depositLimit: number | null, depositedToday: number, grant: number, now: Date): RgBlock | null {
  if (depositLimit === null || depositedToday + grant <= depositLimit) return null;
  return { code: "RG_DEPOSIT_LIMIT", until: nextUtcDayStart(now) };
}

// Extend-only: a shorter request never shortens an active cool-off/exclusion.
export function extendUntil(existing: Date | null, requested: Date): Date {
  return existing && existing.getTime() > requested.getTime() ? existing : requested;
}

const MESSAGES: Record<RgCode, string> = {
  RG_COOL_OFF: "You're taking a break. Play and purchases resume when your break ends.",
  RG_SELF_EXCLUDED: "You've self-excluded. Play and purchases are unavailable until your exclusion ends.",
  RG_LOSS_LIMIT: "You've reached your daily loss limit. New rounds are available again tomorrow (UTC).",
  RG_DEPOSIT_LIMIT: "This purchase would exceed your daily deposit limit.",
};

export function rgError(block: RgBlock, message: string = MESSAGES[block.code], extra: Record<string, unknown> = {}): AppError {
  return new AppError(403, message, { code: block.code, ...(block.until ? { until: block.until.toISOString() } : {}), ...extra });
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
type Db = Prisma.TransactionClient;

export async function depositsToday(db: Db, userId: string, now: Date): Promise<number> {
  const r = await db.iAPReceipt.aggregate({
    where: { userId, createdAt: { gte: utcDayStart(now) } },
    _sum: { coinsGranted: true },
  });
  return r._sum.coinsGranted ?? 0;
}

// Net loss = -(sum of GAME_LOSS + GAME_WIN deltas today), floored at 0.
export async function netLossToday(db: Db, userId: string, now: Date): Promise<number> {
  const r = await db.transaction.aggregate({
    where: { userId, type: { in: ["GAME_LOSS", "GAME_WIN"] }, createdAt: { gte: utcDayStart(now) } },
    _sum: { coinDelta: true },
  });
  return Math.max(0, -(r._sum.coinDelta ?? 0));
}

// Load the user's RG state, persisting any queued limit change that has come
// due (idempotent: the conditional updateMany only matches once).
export async function loadRgState(userId: string, now: Date, db: Db = prisma): Promise<RgUserState> {
  const s = await loadRgStateOrNull(userId, now, db);
  if (!s) throw new AppError(404, "User not found");
  return s;
}

async function loadRgStateOrNull(userId: string, now: Date, db: Db): Promise<RgUserState | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: RG_SELECT });
  if (!user) return null;
  const { state, applied } = resolveDueLimits(user, now);
  if (applied) {
    const r = await db.user.updateMany({
      where: { id: userId, limitChangePendingAt: user.limitChangePendingAt },
      data: limitData(state),
    });
    if (r.count === 1) {
      await db.rgEvent.create({
        data: {
          userId,
          type: "LIMIT_APPLIED",
          payload: { dailyDepositLimitCoins: state.dailyDepositLimitCoins, dailyLossLimitCoins: state.dailyLossLimitCoins },
        },
      });
    }
  }
  return state;
}

export function limitData(s: RgLimitState): Prisma.UserUpdateManyMutationInput {
  return {
    dailyDepositLimitCoins: s.dailyDepositLimitCoins,
    dailyLossLimitCoins: s.dailyLossLimitCoins,
    pendingDepositLimitChange: s.pendingDepositLimitChange,
    pendingDailyDepositLimitCoins: s.pendingDailyDepositLimitCoins,
    pendingLossLimitChange: s.pendingLossLimitChange,
    pendingDailyLossLimitCoins: s.pendingDailyLossLimitCoins,
    limitChangePendingAt: s.limitChangePendingAt,
  };
}

// Serialize concurrent RG-sensitive writes for one user (limit changes,
// deposit-limit check + credit) on the User row.
export async function lockUser(db: Db, userId: string): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

export async function wagerBlockFor(userId: string, now: Date): Promise<RgBlock | null> {
  // Unknown user: nothing to enforce here; the route itself rejects it (and
  // request-body validation keeps its 400-before-404 ordering).
  const s = await loadRgStateOrNull(userId, now, prisma);
  if (!s) return null;
  const excluded = exclusionBlock(s, now);
  if (excluded) return excluded;
  if (s.dailyLossLimitCoins === null) return null;
  return lossLimitBlock(s.dailyLossLimitCoins, await netLossToday(prisma, userId, now), now);
}

export interface RgSummary {
  limits: { dailyDepositLimitCoins: number | null; dailyLossLimitCoins: number | null };
  pending: (Partial<Record<LimitField, number | null>> & { effectiveAt: string }) | null;
  coolOffUntil: string | null;
  selfExcludedUntil: string | null;
  selfExclusionPermanent: boolean;
  today: { depositsCoins: number; netLossCoins: number; resetsAt: string };
  options: { coolOffHours: readonly number[]; selfExcludeMonths: readonly number[] };
}

export async function rgSummary(userId: string, now: Date): Promise<RgSummary> {
  const s = await loadRgState(userId, now);
  const [deposits, netLoss] = await Promise.all([depositsToday(prisma, userId, now), netLossToday(prisma, userId, now)]);
  let pending: RgSummary["pending"] = null;
  if (s.limitChangePendingAt) {
    pending = { effectiveAt: s.limitChangePendingAt.toISOString() };
    if (s.pendingDepositLimitChange) pending.dailyDepositLimitCoins = s.pendingDailyDepositLimitCoins;
    if (s.pendingLossLimitChange) pending.dailyLossLimitCoins = s.pendingDailyLossLimitCoins;
  }
  const active = (d: Date | null): string | null => (d && d.getTime() > now.getTime() ? d.toISOString() : null);
  return {
    limits: { dailyDepositLimitCoins: s.dailyDepositLimitCoins, dailyLossLimitCoins: s.dailyLossLimitCoins },
    pending,
    coolOffUntil: active(s.coolOffUntil),
    selfExcludedUntil: active(s.selfExcludedUntil),
    selfExclusionPermanent: !!s.selfExcludedUntil && s.selfExcludedUntil.getTime() >= PERMANENT_EXCLUSION.getTime(),
    today: { depositsCoins: deposits, netLossCoins: netLoss, resetsAt: nextUtcDayStart(now).toISOString() },
    options: { coolOffHours: COOL_OFF_HOURS, selfExcludeMonths: SELF_EXCLUDE_MONTHS },
  };
}
