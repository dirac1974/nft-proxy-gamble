import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const grantSchema = z.object({
  address: z.string().min(1),
  amount: z.number().int().positive().max(1_000_000),
});

router.post("/grant-coins", async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(403, "Faucet disabled in production");
    }

    const { address, amount } = grantSchema.parse(req.body);
    const walletAddress = address.toLowerCase();

    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) throw new AppError(404, "User not found");

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { coinBalance: { increment: amount } },
        select: { coinBalance: true },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "IAP_PURCHASE",
          coinDelta: amount,
          balanceAfter: user.coinBalance + amount,
        },
      }),
    ]);

    res.json({ coinBalance: updatedUser.coinBalance });
  } catch (err) {
    next(err);
  }
});

export default router;
