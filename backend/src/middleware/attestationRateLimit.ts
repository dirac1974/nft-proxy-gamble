import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { config } from "../config/index.js";

// FABLE-2026-07 M-1: throttle money-path requests that arrive WITHOUT device
// attestation headers. Attested requests are skipped entirely, so legitimate
// clients (which always send x-attestation-*) are unaffected, while unverified
// traffic — the shape an attacker's forged/replayed requests take — is limited
// to a low rate per IP. This is defense-in-depth alongside checkDeviceAttestation
// (which fails closed in production) and the broader per-route limiter.
function hasAttestationHeaders(req: Request): boolean {
  return Boolean(req.headers["x-attestation-platform"] && req.headers["x-attestation-token"]);
}

export const unattestedRateLimit = rateLimit({
  windowMs: 60_000,
  max: 5,
  // Skip in the test runner (deterministic tests) and for fully-attested requests.
  skip: (req) => config.NODE_ENV === "test" || hasAttestationHeaders(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many unverified requests. Please update the app and try again." },
});
