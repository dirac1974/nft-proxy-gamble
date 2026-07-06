import { config } from "../config/index.js";

export type AttestationPlatform = "ios" | "android";

export interface AttestationResult {
  valid: boolean;
  shadowMode: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// FABLE-2026-07 M-1 hardening.
//
// IMPORTANT: the platform verifiers below are still STUBS — they only check that
// the attestation token is present and structurally well-formed. They do NOT yet
// perform real Apple App Attest / Google Play Integrity server-side verification,
// so a determined attacker can forge a well-formed token. This is therefore a
// weak control, not a strong one. The hardening here does three concrete things
// the audit asked for while real verification is built:
//   1. Fail CLOSED in production (or when DEVICE_ATTESTATION_ENFORCE=true):
//      a missing or malformed attestation token blocks the money path.
//   2. Log every failure (missing / malformed / shadow-fail) with context.
//   3. Unattested requests are additionally rate-limited (see
//      middleware/attestationRateLimit.ts) so they can't be spammed.
// Do not describe this as a strong control until the TODOs below are done.
// ---------------------------------------------------------------------------

// Enforcement is on when explicitly enabled OR whenever we run in production.
// Pure + exported so it can be unit-tested without mutating global config.
export function isAttestationEnforced(nodeEnv: string, enforceFlag: boolean): boolean {
  return enforceFlag || nodeEnv === "production";
}

// Structural checks only (shape, not authenticity). Pure + exported for tests.
export function appleTokenWellFormed(token: string): boolean {
  try {
    return Buffer.from(token, "base64").length >= 32;
  } catch {
    return false;
  }
}

export function androidTokenWellFormed(token: string): boolean {
  // Play Integrity tokens are compact JWS: three non-empty base64url segments.
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export interface AttestationDecision {
  allowed: boolean;
  blocked: boolean; // true only when enforcement actively rejected the request
  reason: string;
}

// Pure decision core (FABLE-2026-07 M-1). Fully unit-testable.
// - Shadow mode (!enforced): never blocks, but still surfaces a reason for logging.
// - Enforced: a present, well-formed token is required; anything else is blocked.
export function evaluateAttestation(params: {
  enforced: boolean;
  present: boolean;
  wellFormed: boolean;
  configured: boolean;
}): AttestationDecision {
  const { enforced, present, wellFormed, configured } = params;

  let reason: string;
  if (!present) reason = "missing-token";
  else if (!wellFormed) reason = "malformed-token";
  else reason = configured ? "well-formed(stub-verify)" : "well-formed(shape-only,unconfigured)";

  const ok = present && wellFormed;
  return {
    allowed: enforced ? ok : true, // shadow mode never blocks
    blocked: enforced && !ok,
    reason,
  };
}

function isPlatformConfigured(platform: AttestationPlatform): boolean {
  return platform === "ios"
    ? Boolean(config.APPLE_APP_ATTEST_TEAM_ID && config.APPLE_APP_ATTEST_BUNDLE_ID)
    : Boolean(config.GOOGLE_PLAY_INTEGRITY_PACKAGE);
}

function isTokenWellFormed(platform: AttestationPlatform, token: string): boolean {
  return platform === "ios" ? appleTokenWellFormed(token) : androidTokenWellFormed(token);
}

// Called by money-path routes (cashout, IAP). Returns whether the request may
// proceed. `shadowMode` is true when enforcement is off (result is advisory).
export async function checkDeviceAttestation(
  platform: AttestationPlatform | undefined,
  token: string | undefined,
  userId: string,
  ip?: string,
): Promise<{ allowed: boolean; shadowMode: boolean }> {
  const enforced = isAttestationEnforced(config.NODE_ENV, config.DEVICE_ATTESTATION_ENFORCE);

  const present = Boolean(platform && token);
  const wellFormed = present ? isTokenWellFormed(platform!, token!) : false;
  const configured = present ? isPlatformConfigured(platform!) : false;

  const decision = evaluateAttestation({ enforced, present, wellFormed, configured });

  // Log every non-clean outcome with context (FABLE-2026-07 M-1). In enforce mode
  // a block is a warning; in shadow mode the same condition is informational but
  // still recorded so we can see how much traffic *would* be blocked pre-rollout.
  if (decision.blocked) {
    console.warn(
      `[attestation] BLOCKED userId=${userId} ip=${ip ?? "?"} platform=${platform ?? "none"} reason=${decision.reason}`,
    );
  } else if (decision.reason !== "well-formed(stub-verify)") {
    console.info(
      `[attestation] ${enforced ? "enforce" : "shadow"} userId=${userId} ip=${ip ?? "?"} platform=${platform ?? "none"} reason=${decision.reason} allowed=${decision.allowed}`,
    );
  }

  return { allowed: decision.allowed, shadowMode: !enforced };
}
