import { Router } from "express";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { signBalance } from "../services/balanceSigning.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true },
    });
    if (!user) throw new AppError(404, "User not found");
    res.json(signBalance(userId, user.coinBalance));
  } catch (err) {
    next(err);
  }
});

export default router;
