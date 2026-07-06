import crypto from "crypto";

// ---------------------------------------------------------------------------
// Stateless single-use-ish attestation challenges.
//
// Both App Attest and Play Integrity must bind their proof to a fresh,
// server-issued nonce to defeat replay. Rather than a DB round trip on every
// money-path request, a challenge is an HMAC(secret, nonce||expiry) token: the
// server can re-derive and verify it without storage, and it self-expires. A
// short in-memory single-use cache (below) additionally rejects reuse within
// the TTL window on the same instance. (For multi-instance strict single-use,
// back the cache with Redis — noted for deployment.)
// ---------------------------------------------------------------------------

export interface Challenge {
  nonce: string; // random, what the client embeds in its attestation
  expiresAt: number; // epoch ms
  mac: string; // HMAC binding nonce+expiresAt to the server secret
}

const DEFAULT_TTL_MS = 5 * 60_000;

function computeMac(secret: string, nonce: string, expiresAt: number): string {
  return crypto.createHmac("sha256", secret).update(`${nonce}:${expiresAt}`).digest("base64url");
}

export function issueChallenge(
  secret: string,
  now: number = Date.now(),
  ttlMs: number = DEFAULT_TTL_MS,
): Challenge {
  const nonce = crypto.randomBytes(24).toString("base64url");
  const expiresAt = now + ttlMs;
  return { nonce, expiresAt, mac: computeMac(secret, nonce, expiresAt) };
}

export interface ChallengeVerifyResult {
  valid: boolean;
  reason: string;
}

// Verify a challenge the client echoes back. `challenge` is the encoded token
// "<nonce>.<expiresAt>.<mac>".
export function verifyChallenge(
  secret: string,
  encoded: string,
  now: number = Date.now(),
  seen?: Set<string>,
): ChallengeVerifyResult & { nonce?: string } {
  const parts = encoded.split(".");
  if (parts.length !== 3) return { valid: false, reason: "challenge-format" };
  const [nonce, expiresRaw, mac] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) return { valid: false, reason: "challenge-expiry-nan" };

  const expectedMac = computeMac(secret, nonce, expiresAt);
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "challenge-mac" };
  }
  if (now > expiresAt) return { valid: false, reason: "challenge-expired" };

  if (seen) {
    if (seen.has(mac)) return { valid: false, reason: "challenge-reused" };
    seen.add(mac);
  }
  return { valid: true, reason: "ok", nonce };
}

export function encodeChallenge(c: Challenge): string {
  return `${c.nonce}.${c.expiresAt}.${c.mac}`;
}
