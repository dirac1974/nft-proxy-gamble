import type { Request, Response, NextFunction } from "express";

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

  if (process.env.NODE_ENV !== "production") {
    const override = req.headers["x-country-override"];
    if (typeof override === "string" && override.length === 2) return override.toUpperCase();
  }

  return null;
}

// Apply to money-paths only — /game/cashout and /iap/verify-purchase.
// Auth + lobby reads (/balance, /nfts, /game/start-session) are not gated,
// so a user from a blocked region can still see they have a wallet connected
// and read state. They just cannot move money in/out.
export function requireAllowedJurisdiction(req: Request, res: Response, next: NextFunction): void {
  const country = detectCountry(req);
  // In testnet beta we don't yet require the header to be set — only block
  // explicit matches. Once headers are guaranteed by the edge, flip to fail-closed.
  if (country && BLOCKED_COUNTRIES.has(country)) {
    res.status(451).json({
      error: "Service not available in your jurisdiction",
      country,
    });
    return;
  }
  next();
}

// Exposed for tests + admin tooling.
export function isJurisdictionBlocked(country: string): boolean {
  return BLOCKED_COUNTRIES.has(country.toUpperCase());
}
