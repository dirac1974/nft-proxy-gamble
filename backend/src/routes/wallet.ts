import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireAllowedJurisdiction } from "../middleware/jurisdictionBlock.js";
import { moneyPathRateLimit } from "../middleware/attestationRateLimit.js";
import { signBalance } from "../services/balanceSigning.js";
import {
  IDEMPOTENCY_KEY_RE,
  MAX_CASHOUT_COINS,
  MIN_CASHOUT_COINS,
  attestationFromHeaders,
  performCashout,
} from "../services/cashoutService.js";

const router = Router();

// POST /wallet/cashout — cash out coins without a game session. Same gates as
// /game/cashout (shared core in services/cashoutService.ts). The voucher is
// anchored to a server-created internal session of gameType "wallet-cashout"
// whose id is the on-chain bytes32 sessionId. Optional idempotencyKey makes
// client retries safe: the same key returns the original voucher (200).
const cashoutSchema = z.object({
  coinsToCashout: z.number().int().min(MIN_CASHOUT_COINS).max(MAX_CASHOUT_COINS),
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_RE).optional(),
});

router.post("/cashout", requireAuth, requireAllowedJurisdiction, moneyPathRateLimit, async (req, res, next) => {
  try {
    const { coinsToCashout, idempotencyKey } = cashoutSchema.parse(req.body);
    const userId = req.user!.userId;
    const r = await performCashout({
      userId,
      coinsToCashout,
      anchor: { kind: "wallet", idempotencyKey },
      ip: req.ip,
      attestation: attestationFromHeaders(req),
    });
    res.status(r.replayed ? 200 : 202)
      .header("X-Cashout-Remaining", String(r.remainingToday))
      .json({ voucherId: r.voucherId, mintStatus: r.mintStatus, ...signBalance(userId, r.postBalance) });
  } catch (err) {
    next(err);
  }
});

export default router;
