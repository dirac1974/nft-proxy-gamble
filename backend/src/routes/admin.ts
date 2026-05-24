import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import type { JwtPayload } from "../types/index.js";

const router = Router();

// All admin routes require a valid JWT with `isAdmin: true` claim
function requireAdmin(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]): void {
  requireAuth(req, res, () => {
    const payload = req.user as (JwtPayload & { isAdmin?: boolean }) | undefined;
    if (!payload?.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

// GET /admin/flagged-users?riskLevel=MEDIUM&page=0&limit=50
const querySchema = z.object({
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "BLOCKED"]).optional(),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get("/flagged-users", requireAdmin, async (req, res, next) => {
  try {
    const { riskLevel, page, limit } = querySchema.parse(req.query);

    type RL = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
    const where = riskLevel
      ? { riskLevel: riskLevel as RL }
      : { riskLevel: { in: ["MEDIUM", "HIGH", "BLOCKED"] as RL[] } };

    const [rows, total] = await Promise.all([
      prisma.userAnalytics.findMany({
        where,
        include: { user: { select: { walletAddress: true, createdAt: true } } },
        orderBy: [{ riskLevel: "desc" }, { lastEvaluatedAt: "desc" }],
        skip: page * limit,
        take: limit,
      }),
      prisma.userAnalytics.count({ where }),
    ]);

    res.json({
      total,
      page,
      limit,
      users: rows.map((r) => ({
        userId: r.userId,
        walletAddress: r.user.walletAddress,
        riskLevel: r.riskLevel,
        riskFlags: r.riskFlags,
        cashoutsToday: r.cashoutsToday,
        coinsAddedLastHour: r.coinsAddedLastHour,
        handsLastHour: r.handsLastHour,
        winsLastHour: r.winsLastHour,
        lastEvaluatedAt: r.lastEvaluatedAt,
        accountCreatedAt: r.user.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/users/:userId/set-risk — manual override
const setRiskSchema = z.object({
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "BLOCKED"]),
  reason: z.string().min(1),
});

router.post("/users/:userId/set-risk", requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { riskLevel, reason } = setRiskSchema.parse(req.body);

    const updated = await prisma.userAnalytics.upsert({
      where: { userId },
      create: {
        userId,
        riskLevel,
        riskFlags: [`manual_override:${reason}`],
      },
      update: {
        riskLevel,
        riskFlags: { push: `manual_override:${reason}` },
      },
    });

    res.json({ userId, riskLevel: updated.riskLevel });
  } catch (err) {
    // Prisma P2025 = record not found; still handled by upsert above, so this is a fallthrough
    if ((err as { code?: string }).code === "P2025") {
      next(new AppError(404, "User not found"));
      return;
    }
    next(err);
  }
});

export default router;
