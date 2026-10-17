import type { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "../config/index.js";

// Two-letter ISO 3166-1 country codes for jurisdictions where the app is not
// permitted. List is intentionally conservative for closed-beta launch — every
// jurisdiction here either bans real-money gambling-adjacent products, has a
// state-monopoly model that excludes private operators, or has restrictive
// virtual-asset rules that the team has not cleared.
//
// Update with legal counsel before each market expansion. The country code
// comes from the `cf-ipcountry` header (Cloudflare) or `x-vercel-ip-country`
// (Vercel) — both are populated edge-side from the request IP and cannot be
// spoofed by the client (the underlying TCP source IP is the actual source).
const BLOCKED_COUNTRIES = new Set<string>([
  // Real-money gambling banned outright
  "AE", // United Arab Emirates
  "CN", // China — also has virtual asset restrictions
  "QA", // Qatar
  "SA", // Saudi Arabia
  "KW", // Kuwait
  "IR", // Iran — sanctions + gambling ban
  "KP", // North Korea — sanctions
  // OFAC / heavily sanctioned
  "CU", // Cuba
  "SY", // Syria
  // States with comprehensive ban on consumer gambling apps
  "SG", // Singapore — restricted; revisit with legal counsel before opening
]);

// Read the country code in priority order:
//   1. CF-IPCountry (Cloudflare)
//   2. X-Vercel-IP-Country (Vercel)
//   3. X-Country-Override (TEST ONLY — only honored when NODE_ENV !== "production")
function detectCountry(req: Request): string | null {
  const cf = req.headers["cf-ipcountry"];
  if (typeof cf === "string" && cf.length === 2) return cf.toUpperCase();

  const vercel = req.headers["x-vercel-ip-country"];
  if (typeof vercel === "string" && vercel.length === 2) return vercel.toUpperCase();

  // TEST ONLY. Previously honored whenever NODE_ENV !== "production", but the
  // deployed config ships NODE_ENV=development (backend/.env), which would let any
  // client spoof its country and bypass the geo-block on the money paths
  // (FABLE-2026-07 M-2). Restrict to the automated test runner.
  if (process.env.NODE_ENV === "test") {
    const override = req.headers["x-country-override"];
    if (typeof override === "string" && override.length === 2) return override.toUpperCase();
  }

  return null;
}

// Apply to money-paths only — /game/cashout, /wallet/cashout, /iap/verify-purchase.
// Auth + lobby reads (/balance, /nfts, /game/start-session) are not gated,
// so a user from a blocked region can still see they have a wallet connected
// and read state. They just cannot move money in/out.
//
// Fail-closed (red-team HIGH, geo-block bypass): with headerRequired=true
// (GEO_HEADER_REQUIRED, default true in production) a request WITHOUT a trusted
// edge country header is refused with 403. Otherwise an attacker reaching the
// origin directly, or via any path that strips the header, bypassed the block.
//
// DEPLOYMENT REQUIREMENT: the origin must ONLY be reachable through the edge
// (Cloudflare / Vercel) that sets CF-IPCountry / X-Vercel-IP-Country, e.g.
// firewall the origin to the edge's IP ranges or use an authenticated tunnel.
// If clients can reach the origin directly they can send these headers
// themselves and claim any country.
export function createJurisdictionGuard(opts: { headerRequired: boolean }): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const country = detectCountry(req);
    if (!country) {
      if (opts.headerRequired) {
        res.status(403).json({ error: "We couldn't confirm your location", code: "GEO_UNVERIFIED" });
        return;
      }
      next();
      return;
    }
    if (BLOCKED_COUNTRIES.has(country)) {
      res.status(451).json({
        error: "Service not available in your jurisdiction",
        country,
      });
      return;
    }
    next();
  };
}

export const requireAllowedJurisdiction: RequestHandler = (req, res, next) =>
  createJurisdictionGuard({ headerRequired: config.GEO_HEADER_REQUIRED })(req, res, next);

// Exposed for tests + admin tooling.
export function isJurisdictionBlocked(country: string): boolean {
  return BLOCKED_COUNTRIES.has(country.toUpperCase());
}
