import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  COOL_OFF_HOURS,
  MAX_LIMIT_COINS,
  PERMANENT_EXCLUSION,
  SELF_EXCLUDE_CONFIRM,
  SELF_EXCLUDE_MONTHS,
  addUtcMonths,
  extendUntil,
  limitData,
  loadRgState,
  lockUser,
  planLimitChange,
  rgSummary,
} from "../services/responsibleGaming.js";

// Responsible-gaming controls. Every mutation writes an RgEvent audit row in
// the same DB transaction as the change. There is intentionally NO route that
// shortens or lifts a cool-off or self-exclusion.
const router = Router();

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new AppError(400, "Invalid request");
  return r.data;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    res.json(await rgSummary(req.user!.userId, new Date()));
  } catch (err) {
    next(err);
  }
});

const limitValue = z.number().int().min(1).max(MAX_LIMIT_COINS).nullable().optional();
const limitsSchema = z
  .object({ dailyDepositLimitCoins: limitValue, dailyLossLimitCoins: limitValue })
  .strict()
  .refine((b) => b.dailyDepositLimitCoins !== undefined || b.dailyLossLimitCoins !== undefined);

// POST /rg/limits — null removes a limit. Tightening applies now; loosening
// (raise/remove) is queued for 24h.
router.post("/limits", requireAuth, async (req, res, next) => {
  try {
    const body = parse(limitsSchema, req.body);
    const userId = req.user!.userId;
    const now = new Date();
    const plan = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const current = await loadRgState(userId, now, tx);
      const p = planLimitChange(current, body, now);
      await tx.user.update({ where: { id: userId }, data: limitData(p.state) });
      if (p.immediate.length > 0) {
        await tx.rgEvent.create({
          data: { userId, type: "LIMIT_DECREASE", payload: { fields: p.immediate, requested: body } },
        });
      }
      if (p.queued.length > 0) {
        await tx.rgEvent.create({
          data: {
            userId,
            type: "LIMIT_INCREASE_QUEUED",
            payload: { fields: p.queued, requested: body, effectiveAt: p.state.limitChangePendingAt?.toISOString() ?? null },
          },
        });
      }
      return p;
    });
    res.json({ applied: plan.immediate, queued: plan.queued, ...(await rgSummary(userId, now)) });
  } catch (err) {
    next(err);
  }
});

const coolOffSchema = z.object({
  hours: z.number().refine((h) => (COOL_OFF_HOURS as readonly number[]).includes(h)),
});

// POST /rg/cool-off — take a break. Extend-only.
router.post("/cool-off", requireAuth, async (req, res, next) => {
  try {
    const { hours } = parse(coolOffSchema, req.body);
    const userId = req.user!.userId;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const s = await loadRgState(userId, now, tx);
      const until = extendUntil(s.coolOffUntil, new Date(now.getTime() + hours * 60 * 60 * 1000));
      await tx.user.update({ where: { id: userId }, data: { coolOffUntil: until } });
      await tx.rgEvent.create({ data: { userId, type: "COOL_OFF", payload: { hours, until: until.toISOString() } } });
    });
    res.json(await rgSummary(userId, now));
  } catch (err) {
    next(err);
  }
});

const selfExcludeSchema = z.object({
  months: z.union([z.literal("permanent"), z.number().refine((m) => (SELF_EXCLUDE_MONTHS as readonly number[]).includes(m))]),
  confirm: z.string().optional(),
});

// POST /rg/self-exclude — irreversible until expiry. Requires the exact
// confirmation token so it can never be triggered by an accidental tap/retry.
router.post("/self-exclude", requireAuth, async (req, res, next) => {
  try {
    const { months, confirm } = parse(selfExcludeSchema, req.body);
    if (confirm !== SELF_EXCLUDE_CONFIRM) {
      throw new AppError(400, `Self-exclusion requires confirm: "${SELF_EXCLUDE_CONFIRM}"`, { code: "RG_CONFIRM_REQUIRED" });
    }
    const userId = req.user!.userId;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const s = await loadRgState(userId, now, tx);
      const requested = months === "permanent" ? PERMANENT_EXCLUSION : addUtcMonths(now, months);
      const until = extendUntil(s.selfExcludedUntil, requested);
      await tx.user.update({ where: { id: userId }, data: { selfExcludedUntil: until } });
      await tx.rgEvent.create({ data: { userId, type: "SELF_EXCLUDE", payload: { months, until: until.toISOString() } } });
    });
    res.json(await rgSummary(userId, now));
  } catch (err) {
    next(err);
  }
});

export default router;
