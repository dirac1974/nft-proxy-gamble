import { Router } from "express";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const vouchers = await prisma.nFTVoucher.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tokenId: true,
        coinBalance: true,
        gameType: true,
        mintStatus: true,
        txHash: true,
        createdAt: true,
      },
    });
    res.json(vouchers);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const voucher = await prisma.nFTVoucher.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        userId: true,
        tokenId: true,
        coinBalance: true,
        gameType: true,
        mintStatus: true,
        txHash: true,
        createdAt: true,
      },
    });
    if (!voucher || voucher.userId !== req.user!.userId) {
      throw new AppError(404, "Voucher not found");
    }
    res.json(voucher);
  } catch (err) {
    next(err);
  }
});

export default router;
