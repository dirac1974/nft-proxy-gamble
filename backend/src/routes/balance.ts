import { Router } from "express";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coinBalance: true },
    });
    if (!user) throw new AppError(404, "User not found");
    res.json({ coinBalance: user.coinBalance });
  } catch (err) {
    next(err);
  }
});

export default router;
