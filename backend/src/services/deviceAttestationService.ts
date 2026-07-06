import { config } from "../config/index.js";
import { verifyPlayIntegrityToken } from "./deviceAttest/playIntegrity.js";
import { verifyAppleAttestation } from "./deviceAttest/appAttest.js";
import { verifyChallenge } from "./deviceAttest/challenge.js";

export type AttestationPlatform = "ios" | "android";

// ---------------------------------------------------------------------------
// FABLE-2026-07 M-1 — REAL device attestation (supersedes the M-1 stubs).
//
// Money-path routes (cashout, IAP) call checkDeviceAttestation. When a platform
// is configured with real verification keys AND enforcement is on (production or
// DEVICE_ATTESTATION_ENFORCE=true), the client's attestation is verified
// cryptographically:
//   * iOS     → Apple App Attest attestation object (see deviceAttest/appAttest).
//   * Android → Google Play Integrity classic token (deviceAttest/playIntegrity).
// Both are bound to a fresh server-issued challenge (deviceAttest/challenge) to
// defeat replay. Failure fails CLOSED under enforcement.
//
// Shadow mode (not enforced) never blocks; it runs the same verification and
// logs what WOULD have happened, so rollout risk is measurable before flipping
// the flag. Unattested traffic is additionally rate-limited (attestationRateLimit).
// ---------------------------------------------------------------------------

// Enforcement is on when explicitly enabled OR whenever we run in production.
// Pure + exported so it can be unit-tested without mutating global config.
export function isAttestationEnforced(nodeEnv: string, enforceFlag: boolean): boolean {
  return enforceFlag || nodeEnv === "production";
}

export function isPlatformConfigured(platform: AttestationPlatform): boolean {
  if (platform === "ios") {
    return Boolean(config.APPLE_APP_ATTEST_TEAM_ID && config.APPLE_APP_ATTEST_BUNDLE_ID);
  }
  return Boolean(
    config.GOOGLE_PLAY_INTEGRITY_PACKAGE &&
      config.GOOGLE_PLAY_INTEGRITY_AES_KEY_B64 &&
      config.GOOGLE_PLAY_INTEGRITY_EC_PUBLIC_KEY_B64,
  );
}

// Cheap structural pre-filter (shape, not authenticity). Kept as a fast reject
// before the heavier cryptographic verification. Pure + exported for tests.
export function appleTokenWellFormed(token: string): boolean {
  try {
    return Buffer.from(token, "base64").length >= 32;
  } catch {
    return false;
  }
}

export function androidTokenWellFormed(token: string): boolean {
  // A JWE compact serialization is five non-empty base64url segments.
  const parts = token.split(".");
  return parts.length === 5 && parts.every((p) => p.length > 0);
}

export interface AttestationDecision {
  allowed: boolean;
  blocked: boolean; // true only when enforcement actively rejected the request
  reason: string;
}

// Pure decision core. Given the facts, decide allow/block. Shadow mode
// (!enforced) never blocks; enforce mode requires present + configured +
// cryptographically verified. Fully unit-testable.
export function decideAttestation(params: {
  enforced: boolean;
  present: boolean;
  configured: boolean;
  verified: boolean;
}): AttestationDecision {
  const { enforced, present, configured, verified } = params;
  let reason: string;
  if (!present) reason = "missing-token";
  else if (!configured) reason = "platform-unconfigured";
  else if (!verified) reason = "verification-failed";
  else reason = "verified";

  const ok = present && configured && verified;
  return {
    allowed: enforced ? ok : true, // shadow mode never blocks
    blocked: enforced && !ok,
    reason,
  };
}

interface IosToken {
  keyId: string;
  attestation: string; // base64 attestation object
}

// In-memory single-use cache of consumed challenge MACs (replay defense within
// the TTL window on this instance). Bounded + pruned so it can't grow unbounded.
// For strict multi-instance single-use, back this with Redis (deployment note).
const consumedChallenges = new Set<string>();
function pruneIfLarge(): void {
  if (consumedChallenges.size > 10_000) consumedChallenges.clear();
}

// Run the real cryptographic verification for a present, configured platform.
// Returns whether the attestation is authentic + a granular reason for logging.
export async function verifyAttestationToken(
  platform: AttestationPlatform,
  token: string,
  challengeToken: string | undefined,
  now: number = Date.now(),
): Promise<{ verified: boolean; reason: string }> {
  if (!challengeToken) return { verified: false, reason: "challenge-missing" };
  pruneIfLarge();
  const ch = verifyChallenge(config.JWT_SECRET, challengeToken, now, consumedChallenges);
  if (!ch.valid || !ch.nonce) return { verified: false, reason: ch.reason };
  const nonce = ch.nonce;

  if (platform === "android") {
    if (!androidTokenWellFormed(token)) return { verified: false, reason: "malformed-token" };
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: config.GOOGLE_PLAY_INTEGRITY_AES_KEY_B64!,
      ecPublicKeyB64: config.GOOGLE_PLAY_INTEGRITY_EC_PUBLIC_KEY_B64!,
      packageName: config.GOOGLE_PLAY_INTEGRITY_PACKAGE!,
      requireStrongIntegrity: config.GOOGLE_PLAY_INTEGRITY_REQUIRE_STRONG,
      expectedNonce: nonce,
      now: () => now,
    });
    return { verified: res.verified, reason: res.reason };
  }

  // iOS: token is base64url JSON { keyId, attestation }.
  let parsed: IosToken;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as IosToken;
    if (!parsed.keyId || !parsed.attestation) throw new Error("fields");
  } catch {
    return { verified: false, reason: "ios-token-format" };
  }
  const res = await verifyAppleAttestation(
    { attestationObjectB64: parsed.attestation, keyId: parsed.keyId, challenge: nonce },
    {
      teamId: config.APPLE_APP_ATTEST_TEAM_ID!,
      bundleId: config.APPLE_APP_ATTEST_BUNDLE_ID!,
      // Development attestations are NEVER accepted in production, regardless of flag.
      allowDevelopmentEnv: config.APP_ATTEST_ALLOW_DEV_ENV && config.NODE_ENV !== "production",
    },
  );
  return { verified: res.verified, reason: res.reason };
}

// Called by money-path routes (cashout, IAP). Returns whether the request may
// proceed. `shadowMode` is true when enforcement is off (result is advisory).
export async function checkDeviceAttestation(
  platform: AttestationPlatform | undefined,
  token: string | undefined,
  userId: string,
  ip?: string,
  challengeToken?: string,
): Promise<{ allowed: boolean; shadowMode: boolean }> {
  const enforced = isAttestationEnforced(config.NODE_ENV, config.DEVICE_ATTESTATION_ENFORCE);
  const present = Boolean(platform && token);
  const configured = present ? isPlatformConfigured(platform!) : false;

  let verified = false;
  let detail = "no-verify";
  if (present && configured) {
    const r = await verifyAttestationToken(platform!, token!, challengeToken);
    verified = r.verified;
    detail = r.reason;
  }

  const decision = decideAttestation({ enforced, present, configured, verified });

  // Log every non-clean outcome with context (FABLE-2026-07 M-1). In enforce
  // mode a block is a warning; in shadow mode the same condition is recorded
  // informationally so we can measure how much traffic *would* be blocked.
  if (decision.blocked) {
    console.warn(
      `[attestation] BLOCKED userId=${userId} ip=${ip ?? "?"} platform=${platform ?? "none"} reason=${decision.reason} detail=${detail}`,
    );
  } else if (decision.reason !== "verified") {
    console.info(
      `[attestation] ${enforced ? "enforce" : "shadow"} userId=${userId} ip=${ip ?? "?"} platform=${platform ?? "none"} reason=${decision.reason} detail=${detail} allowed=${decision.allowed}`,
    );
  }

  return { allowed: decision.allowed, shadowMode: !enforced };
}
