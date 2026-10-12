import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { config } from "../config/index.js";
import { userIdFromRequest } from "./auth.js";

// Per-user key (fallback: client IP, which is correct only with TRUST_PROXY set
// to the real hop count). Keying on the authenticated user means one abuser
// behind a shared/NAT IP cannot exhaust everyone's budget, and rotating IPs does
// not reset a user's budget.
export function userOrIpKey(req: Request): string {
  const userId = userIdFromRequest(req);
  return userId ? `u:${userId}` : `ip:${req.ip ?? "unknown"}`;
}

// FABLE-2026-07 M-1 / red-team L-5: money-path throttle. Previously requests
// were SKIPPED whenever x-attestation-* headers were merely present, so any
// client could opt out by sending junk headers. Now the throttle applies to
// every money-path request, per user. Attestation itself is verified in the
// route (checkDeviceAttestation, fail-closed in production). The budget is well
// above legitimate use (cashouts are capped at 5/day; IAP is human-paced).
export const moneyPathRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: userOrIpKey,
  skip: () => config.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute and try again." },
});
