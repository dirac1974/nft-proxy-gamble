import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { verifyAppleReceipt, verifyGoogleReceipt } from "../services/iapVerifier.js";
import { signBalance } from "../services/balanceSigning.js";
import { queuePurchaseCommitment } from "../services/purchaseCommitmentService.js";
import { recordAnalyticsEvent } from "../services/analyticsService.js";

const router = Router();

const purchaseSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("apple"),
    receiptData: z.string().min(1),
  }),
  z.object({
    platform: z.literal("google"),
    purchaseToken: z.string().min(1),
    productId: z.string().min(1),
  }),
]);

router.post("/verify-purchase", requireAuth, async (req, res, next) => {
  try {
    const body = purchaseSchema.parse(req.body);
    const userId = req.user!.userId;

    const result =
      body.platform === "apple"
        ? await verifyAppleReceipt(body.receiptData)
        : await verifyGoogleReceipt(body.purchaseToken, body.productId);

    if (!result.valid) throw new AppError(422, "Receipt is invalid or unrecognized product");

    // Atomic: create receipt + credit balance in one transaction
    const [receipt, user] = await prisma.$transaction([
      prisma.iAPReceipt.create({
        data: {
          userId,
          platform: body.platform,
          receiptHash: result.receiptHash,
          productId: result.productId,
          coinsGranted: result.coinsGranted,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: result.coinsGranted } },
        select: { coinBalance: true, walletAddress: true },
      }),
    ]);

    // Non-blocking analytics event for IAP purchase
    recordAnalyticsEvent(userId, { type: "iap_purchase", coinsAdded: result.coinsGranted }).catch(
      (err) => console.error("[analytics] iap event error:", err),
    );

    // Queue on-chain commitment (async — does not block coin credit)
    queuePurchaseCommitment({
      user: user.walletAddress as `0x${string}`,
      coinsAdded: result.coinsGranted,
      receiptHash: `0x${result.receiptHash}` as `0x${string}`,
      iapRecordId: receipt.id,
    }).catch((err) => console.error("[commitPurchase] queue failed", err));

    res.json({
      coinsGranted: result.coinsGranted,
      ...signBalance(userId, user.coinBalance),
    });
  } catch (err: unknown) {
    // Prisma unique violation on receiptHash = replay attack
    if ((err as { code?: string }).code === "P2002") {
      next(new AppError(409, "Receipt already redeemed"));
      return;
    }
    next(err);
  }
});

export default router;
