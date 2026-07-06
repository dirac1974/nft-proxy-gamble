import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

// FABLE-2026-07 H-3: admin authority is decided by the DB `User.isAdmin` column,
// NEVER by a self-asserted JWT claim. Previously `requireAdmin` trusted
// `req.user.isAdmin`, but nothing ever set that claim server-side and there was
// no server-side role — so anyone who could forge/leak a token (see C-3) could
// self-grant admin. Now the token only identifies *who* you are; whether you are
// an admin is looked up fresh from the database on every request.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    void (async () => {
      try {
        const userId = req.user?.userId;
        if (!userId) {
          res.status(401).json({ error: "Unauthenticated" });
          return;
        }
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { isAdmin: true },
        });
        if (!user?.isAdmin) {
          res.status(403).json({ error: "Admin access required" });
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    })();
  });
}

// Append-only audit record of a privileged admin action (FABLE-2026-07 H-3).
// Fire-and-forget: an audit-write failure must never break the admin operation
// itself, but it is logged loudly so a missing trail is detectable.
async function logAdminAction(
  adminUserId: string,
  action: string,
  targetUserId: string | null,
  detail: Prisma.InputJsonValue,
  ip: string | undefined,
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: { adminUserId, action, targetUserId, detail, ip: ip ?? null },
    });
  } catch (err) {
    console.error("[admin-audit] failed to record action", action, adminUserId, err);
  }
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

    // Reading flagged users exposes wallet addresses + risk data — a privileged
    // read, so it is audited too (who looked at whom, and with what filter).
    await logAdminAction(
      req.user!.userId,
      "read-flagged-users",
      null,
      { riskLevel: riskLevel ?? "ALL", page, limit, returned: rows.length },
      req.ip,
    );

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

    // Overriding a user's risk level can unblock a flagged account — a
    // sensitive, abuse-prone action, so it is always audited.
    await logAdminAction(
      req.user!.userId,
      "set-risk",
      userId,
      { riskLevel, reason },
      req.ip,
    );

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
