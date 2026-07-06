import crypto from "crypto";

// ---------------------------------------------------------------------------
// Google Play Integrity — CLASSIC (local / offline) token verification.
//
// The Android client calls the Play Integrity API and forwards the returned
// integrity token to us. In the "classic" request path Google returns the token
// encrypted+signed with keys that Play Console lets you download and manage
// yourself, so we can verify it entirely offline (no server-to-server call to
// Google, no service-account round trip on the money path).
//
// Wire format (nested JOSE, compact serialization):
//   integrityToken = JWE( JWS( verdictJson ) )
//   * Outer JWE: alg="A256KW", enc="A256GCM". 5 dot-separated base64url parts:
//       protectedHeader . encryptedKey . iv . ciphertext . tag
//     The Play Console AES-256 key is a KEK: RFC-3394 key-unwrap `encryptedKey`
//     to recover the per-token content-encryption key (CEK), then A256GCM-decrypt
//     the ciphertext with the CEK to get the JWS.
//   * Inner JWS: alg="ES256". 3 dot-separated base64url parts:
//       protectedHeader . payload . signature
//     Verified with the Play Console EC (P-256) public key. Payload is the
//     verdict JSON.
//
// Everything here uses Node's built-in `crypto` — no extra dependency. Pure and
// fully unit-testable: the tests generate their own AES key + EC keypair, encode
// a synthetic token exactly as Google does, and assert we accept it and reject
// every tamper.
// ---------------------------------------------------------------------------

export type DeviceRecognitionVerdict =
  | "MEETS_DEVICE_INTEGRITY"
  | "MEETS_BASIC_INTEGRITY"
  | "MEETS_STRONG_INTEGRITY"
  | "MEETS_VIRTUAL_INTEGRITY";

export type AppRecognitionVerdict =
  | "PLAY_RECOGNIZED"
  | "UNRECOGNIZED_VERSION"
  | "UNEVALUATED";

export interface PlayIntegrityVerdict {
  requestDetails?: {
    requestPackageName?: string;
    timestampMillis?: string;
    nonce?: string;
    requestHash?: string;
  };
  appIntegrity?: {
    appRecognitionVerdict?: AppRecognitionVerdict;
    packageName?: string;
    certificateSha256Digest?: string[];
    versionCode?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: DeviceRecognitionVerdict[];
  };
  accountDetails?: {
    appLicensingVerdict?: "LICENSED" | "UNLICENSED" | "UNEVALUATED";
  };
}

export interface PlayIntegrityConfig {
  /** Base64 (standard) AES-256 decryption key from Play Console. */
  aesKeyB64: string;
  /** Base64 (standard) DER SubjectPublicKeyInfo EC P-256 verification key from Play Console. */
  ecPublicKeyB64: string;
  /** Expected Android application id, e.g. com.nftproxygamble.app. */
  packageName: string;
  /**
   * When true, only MEETS_STRONG_INTEGRITY passes. Default false: a device
   * passes on MEETS_DEVICE_INTEGRITY (or stronger). MEETS_BASIC_INTEGRITY and
   * MEETS_VIRTUAL_INTEGRITY (emulators) never pass the money path — see
   * evaluateDeviceIntegrity.
   */
  requireStrongIntegrity?: boolean;
  /**
   * Optional expected server challenge. When provided, the verdict's
   * requestDetails.nonce MUST match (base64url of the challenge) — this binds
   * the token to a specific server-issued challenge and defeats replay.
   */
  expectedNonce?: string;
  /** Max token age in ms (default 5 min) checked against requestDetails.timestampMillis. */
  maxAgeMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface PlayIntegrityResult {
  verified: boolean;
  reason: string;
  verdict?: PlayIntegrityVerdict;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

// A rooted phone or emulator can still return a well-formed, correctly-signed
// token — the signature only proves Google minted it, not that the device is
// trustworthy. The verdict array is where the trust decision lives.
export function evaluateDeviceIntegrity(
  verdicts: DeviceRecognitionVerdict[] | undefined,
  requireStrong: boolean,
): { pass: boolean; reason: string } {
  const set = new Set(verdicts ?? []);
  if (set.size === 0) {
    // Empty array = failed every integrity check (rooted / tampered / unknown).
    return { pass: false, reason: "device-integrity-empty" };
  }
  if (requireStrong) {
    return set.has("MEETS_STRONG_INTEGRITY")
      ? { pass: true, reason: "strong-integrity" }
      : { pass: false, reason: "strong-integrity-required" };
  }
  if (set.has("MEETS_STRONG_INTEGRITY") || set.has("MEETS_DEVICE_INTEGRITY")) {
    return { pass: true, reason: "device-integrity" };
  }
  // MEETS_BASIC_INTEGRITY alone = likely rooted but not obviously compromised;
  // MEETS_VIRTUAL_INTEGRITY = emulator. Neither is acceptable on the money path.
  if (set.has("MEETS_VIRTUAL_INTEGRITY")) return { pass: false, reason: "emulator" };
  return { pass: false, reason: "basic-integrity-only" };
}

// RFC-3394 default IV for AES key wrap.
const KEY_WRAP_IV = Buffer.from("A6A6A6A6A6A6A6A6", "hex");

// AES-256 key-unwrap (A256KW): recover the 32-byte CEK from the wrapped key.
export function aesKeyUnwrap(wrapped: Buffer, kek: Buffer): Buffer {
  if (kek.length !== 32) throw new Error("kek-length");
  // A 32-byte CEK wraps to 40 bytes (n+1 64-bit blocks). Guard so a malformed
  // encryptedKey can't reach the native layer with an odd length.
  if (wrapped.length !== 40) throw new Error("wrapped-cek-length");
  const dec = crypto.createDecipheriv("id-aes256-wrap", kek, KEY_WRAP_IV);
  dec.setAutoPadding(false);
  const cek = Buffer.concat([dec.update(wrapped), dec.final()]);
  if (cek.length !== 32) throw new Error("cek-length");
  return cek;
}

// Decrypt the outer JWE (alg=A256KW, enc=A256GCM) → inner JWS compact string.
export function decryptJwe(token: string, kek: Buffer): string {
  const parts = token.split(".");
  if (parts.length !== 5) throw new Error("jwe-parts");
  const [protectedHeaderB64, encryptedKeyB64, ivB64, ciphertextB64, tagB64] = parts;

  const header = JSON.parse(b64urlToBuf(protectedHeaderB64).toString("utf8")) as {
    alg?: string;
    enc?: string;
  };
  if (header.alg !== "A256KW") throw new Error("jwe-alg");
  if (header.enc !== "A256GCM") throw new Error("jwe-enc");
  if (kek.length !== 32) throw new Error("kek-length");

  const cek = aesKeyUnwrap(b64urlToBuf(encryptedKeyB64), kek);

  const iv = b64urlToBuf(ivB64);
  const ciphertext = b64urlToBuf(ciphertextB64);
  const tag = b64urlToBuf(tagB64);
  if (iv.length !== 12) throw new Error("jwe-iv-length");
  if (tag.length !== 16) throw new Error("jwe-tag-length");

  const decipher = crypto.createDecipheriv("aes-256-gcm", cek, iv);
  // Per RFC 7516 the AAD for compact serialization is the ASCII of the encoded
  // protected header. A wrong tag or tampered header throws in final().
  decipher.setAAD(Buffer.from(protectedHeaderB64, "ascii"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

// Verify the inner JWS (alg=ES256) and return the parsed verdict payload.
export function verifyJws(jws: string, ecPublicKey: crypto.KeyObject): PlayIntegrityVerdict {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("jws-parts");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(b64urlToBuf(headerB64).toString("utf8")) as { alg?: string };
  if (header.alg !== "ES256") throw new Error("jws-alg");

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "ascii");
  const signature = b64urlToBuf(sigB64); // JOSE raw r||s (64 bytes)
  if (signature.length !== 64) throw new Error("jws-sig-length");

  const ok = crypto.verify(
    "sha256",
    signingInput,
    { key: ecPublicKey, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!ok) throw new Error("jws-signature-invalid");

  return JSON.parse(b64urlToBuf(payloadB64).toString("utf8")) as PlayIntegrityVerdict;
}

export function loadEcPublicKey(ecPublicKeyB64: string): crypto.KeyObject {
  const der = Buffer.from(ecPublicKeyB64, "base64");
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

// Full classic verification: decrypt → verify signature → validate the verdict
// contents against our expectations. Never throws; returns a structured result.
export function verifyPlayIntegrityToken(
  token: string,
  cfg: PlayIntegrityConfig,
): PlayIntegrityResult {
  const now = cfg.now ?? (() => Date.now());
  const maxAgeMs = cfg.maxAgeMs ?? 5 * 60_000;

  let verdict: PlayIntegrityVerdict;
  try {
    const aesKey = Buffer.from(cfg.aesKeyB64, "base64");
    const jws = decryptJwe(token, aesKey);
    const pub = loadEcPublicKey(cfg.ecPublicKeyB64);
    verdict = verifyJws(jws, pub);
  } catch (e) {
    return { verified: false, reason: `crypto:${(e as Error).message}` };
  }

  // ---- Content checks (only reached once cryptographic authenticity holds) ----

  const pkgFromRequest = verdict.requestDetails?.requestPackageName;
  const pkgFromApp = verdict.appIntegrity?.packageName;
  if (pkgFromRequest && pkgFromRequest !== cfg.packageName) {
    return { verified: false, reason: "package-mismatch-request", verdict };
  }
  if (pkgFromApp && pkgFromApp !== cfg.packageName) {
    return { verified: false, reason: "package-mismatch-app", verdict };
  }
  if (!pkgFromRequest && !pkgFromApp) {
    return { verified: false, reason: "package-absent", verdict };
  }

  // Freshness — a signed-but-old token is a replay.
  const tsRaw = verdict.requestDetails?.timestampMillis;
  if (tsRaw) {
    const ts = Number(tsRaw);
    if (!Number.isFinite(ts)) return { verified: false, reason: "timestamp-nan", verdict };
    const age = now() - ts;
    if (age > maxAgeMs) return { verified: false, reason: "token-stale", verdict };
    if (age < -60_000) return { verified: false, reason: "token-future", verdict };
  } else {
    return { verified: false, reason: "timestamp-absent", verdict };
  }

  // Replay binding to a server-issued challenge, when supplied.
  if (cfg.expectedNonce !== undefined) {
    const expected = Buffer.from(cfg.expectedNonce).toString("base64url");
    if (verdict.requestDetails?.nonce !== expected) {
      return { verified: false, reason: "nonce-mismatch", verdict };
    }
  }

  // App must be the genuine Play-distributed binary.
  const appVerdict = verdict.appIntegrity?.appRecognitionVerdict;
  if (appVerdict !== "PLAY_RECOGNIZED") {
    return { verified: false, reason: `app-integrity:${appVerdict ?? "absent"}`, verdict };
  }

  // Device trust.
  const dev = evaluateDeviceIntegrity(
    verdict.deviceIntegrity?.deviceRecognitionVerdict,
    Boolean(cfg.requireStrongIntegrity),
  );
  if (!dev.pass) return { verified: false, reason: `device:${dev.reason}`, verdict };

  return { verified: true, reason: "ok", verdict };
}
