import "reflect-metadata";
import crypto from "crypto";
import { decode as cborDecode } from "cbor-x";
import * as x509 from "@peculiar/x509";

// Route @peculiar/x509 through Node's built-in WebCrypto (Node 20+).
x509.cryptoProvider.set(
  crypto.webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0],
);

// ---------------------------------------------------------------------------
// Apple App Attest — server-side verification of the one-time ATTESTATION object.
//
// The iOS client generates a hardware-backed key with DCAppAttestService, then
// calls attestKey(keyId, clientDataHash) where clientDataHash = SHA256(a
// server-issued single-use challenge). It sends us the base64 attestation object
// + the keyId. We verify, per Apple's "Validating apps that connect to your
// server" algorithm, that the object was produced by genuine Apple hardware for
// OUR app and bound to OUR challenge. On success we persist the attested public
// key + signCount, and later requests are authenticated with cheap assertions
// (verifyAppleAssertion).
//
// Everything is verified server-side. The only trust anchor is the pinned Apple
// App Attestation Root CA below (public). No Apple secret is required.
// ---------------------------------------------------------------------------

// Apple App Attestation Root CA — https://www.apple.com/certificateauthority/
// Subject: CN=Apple App Attestation Root CA, O=Apple Inc., ST=California.
export const APPLE_APP_ATTEST_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;

export const APPLE_NONCE_OID = "1.2.840.113635.100.8.2";
const AAGUID_PROD = Buffer.from("appattest\0\0\0\0\0\0\0", "latin1"); // 16 bytes
const AAGUID_DEV = Buffer.from("appattestdevelopment", "latin1"); // 20? -> truncated below

export interface AppAttestConfig {
  teamId: string; // Apple 10-char team id
  bundleId: string; // e.g. com.nftproxygamble.app
  /** Allow the development attestation environment. MUST be false in production. */
  allowDevelopmentEnv?: boolean;
  /** Injectable validity date for deterministic tests. */
  date?: Date;
  /** Override the trust anchor (tests use their own root). */
  rootCaPem?: string;
}

export interface AppAttestResult {
  verified: boolean;
  reason: string;
  /** PEM of the attested device public key — persist for assertion verification. */
  publicKeyPem?: string;
  /** signCount at attestation time (always 0 on success); persist it. */
  signCount?: number;
}

function sha256(...bufs: Buffer[]): Buffer {
  const h = crypto.createHash("sha256");
  for (const b of bufs) h.update(b);
  return h.digest();
}

// Parse WebAuthn authenticator data as laid out for App Attest.
export interface ParsedAuthData {
  rpIdHash: Buffer; // [0:32]
  flags: number; // [32]
  signCount: number; // [33:37] uint32 BE
  aaguid: Buffer; // [37:53]
  credentialId: Buffer; // [55:55+L]
}

export function parseAuthData(authData: Buffer): ParsedAuthData {
  if (authData.length < 55) throw new Error("authdata-too-short");
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const signCount = authData.readUInt32BE(33);
  const aaguid = authData.subarray(37, 53);
  const credIdLen = authData.readUInt16BE(53);
  if (authData.length < 55 + credIdLen) throw new Error("authdata-credid-overflow");
  const credentialId = authData.subarray(55, 55 + credIdLen);
  return { rpIdHash, flags, signCount, aaguid, credentialId };
}

// Pull the 32-byte nonce out of the credCert's Apple extension (OID
// 1.2.840.113635.100.8.2). extnValue content is DER `SEQUENCE { [1] OCTET
// STRING nonce }` => bytes `30 24 A1 22 04 20 <32-byte nonce>`.
export function extractNonceFromExtension(extValue: Buffer): Buffer {
  // Validate the documented ASN.1 framing rather than blindly slicing, so a
  // malformed/attacker-shaped extension is rejected instead of yielding garbage.
  if (extValue.length !== 0x26) throw new Error("nonce-ext-length");
  if (extValue[0] !== 0x30 || extValue[1] !== 0x24) throw new Error("nonce-ext-seq");
  if (extValue[2] !== 0xa1 || extValue[3] !== 0x22) throw new Error("nonce-ext-ctx");
  if (extValue[4] !== 0x04 || extValue[5] !== 0x20) throw new Error("nonce-ext-octet");
  return extValue.subarray(6, 38);
}

// Uncompressed EC point (0x04 || X || Y) of a cert's P-256 public key.
function uncompressedPoint(spkiDer: Buffer): Buffer {
  const jwk = crypto.createPublicKey({ key: spkiDer, format: "der", type: "spki" }).export({
    format: "jwk",
  }) as { x?: string; y?: string; crv?: string };
  if (jwk.crv !== "P-256" || !jwk.x || !jwk.y) throw new Error("cred-key-not-p256");
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  if (x.length !== 32 || y.length !== 32) throw new Error("cred-key-coord-length");
  return Buffer.concat([Buffer.from([0x04]), x, y]);
}

interface AttestationObject {
  fmt: string;
  attStmt: { x5c: Uint8Array[]; receipt?: Uint8Array };
  authData: Uint8Array;
}

// Full attestation verification. Never throws; returns a structured result so
// the caller can log the precise reason. The order follows Apple's numbered
// steps; the first failing check short-circuits.
export async function verifyAppleAttestation(
  params: { attestationObjectB64: string; keyId: string; challenge: string },
  cfg: AppAttestConfig,
): Promise<AppAttestResult> {
  const date = cfg.date ?? new Date();
  try {
    // 1. CBOR-decode.
    const raw = Buffer.from(params.attestationObjectB64, "base64");
    const att = cborDecode(raw) as AttestationObject;
    if (att.fmt !== "apple-appattest") return { verified: false, reason: "bad-fmt" };
    if (!att.attStmt?.x5c || att.attStmt.x5c.length < 2) {
      return { verified: false, reason: "x5c-missing" };
    }
    const authData = Buffer.from(att.authData);
    const credCertDer = Buffer.from(att.attStmt.x5c[0]);
    const interDer = Buffer.from(att.attStmt.x5c[1]);

    // 2. Verify cert chain credCert -> intermediate -> pinned Apple root.
    const credCert = new x509.X509Certificate(credCertDer);
    const inter = new x509.X509Certificate(interDer);
    const root = new x509.X509Certificate(cfg.rootCaPem ?? APPLE_APP_ATTEST_ROOT_CA_PEM);

    const credOk = await credCert.verify({ publicKey: inter.publicKey, date });
    const interOk = await inter.verify({ publicKey: root.publicKey, date });
    if (!credOk) return { verified: false, reason: "credcert-signature" };
    if (!interOk) return { verified: false, reason: "intermediate-signature" };

    // 3. clientDataHash + 4. nonce = SHA256(authData || clientDataHash).
    const clientDataHash = sha256(Buffer.from(params.challenge));
    const nonce = sha256(authData, clientDataHash);

    // 5. Nonce must match the credCert extension.
    const ext = credCert.getExtension(APPLE_NONCE_OID);
    if (!ext) return { verified: false, reason: "nonce-ext-absent" };
    const certNonce = extractNonceFromExtension(Buffer.from(ext.value));
    if (!crypto.timingSafeEqual(certNonce, nonce)) {
      return { verified: false, reason: "nonce-mismatch" };
    }

    // 6. credentialId == SHA256(uncompressed credCert public key).
    const parsed = parseAuthData(authData);
    const pubPoint = uncompressedPoint(Buffer.from(credCert.publicKey.rawData));
    const publicKeyHash = sha256(pubPoint);
    if (!bufEq(publicKeyHash, parsed.credentialId)) {
      return { verified: false, reason: "credential-id-key-mismatch" };
    }

    // 7. rpIdHash == SHA256(appID).
    const appId = `${cfg.teamId}.${cfg.bundleId}`;
    if (!bufEq(parsed.rpIdHash, sha256(Buffer.from(appId)))) {
      return { verified: false, reason: "rpid-mismatch" };
    }

    // 8. counter == 0 at attestation.
    if (parsed.signCount !== 0) return { verified: false, reason: "signcount-nonzero" };

    // 9. aaguid — prod "appattest", dev "appattestdevelopment"; reject dev unless allowed.
    const isProd = bufEq(parsed.aaguid, AAGUID_PROD);
    const isDev = bufEq(parsed.aaguid, AAGUID_DEV.subarray(0, 16));
    if (!isProd && !isDev) return { verified: false, reason: "aaguid-unknown" };
    if (isDev && !cfg.allowDevelopmentEnv) return { verified: false, reason: "dev-env-blocked" };

    // 10. credentialId == client-supplied keyId.
    const keyId = Buffer.from(params.keyId, "base64");
    if (!bufEq(parsed.credentialId, keyId)) {
      return { verified: false, reason: "keyid-mismatch" };
    }

    const publicKeyPem = crypto
      .createPublicKey({ key: Buffer.from(credCert.publicKey.rawData), format: "der", type: "spki" })
      .export({ format: "pem", type: "spki" })
      .toString();

    return { verified: true, reason: "ok", publicKeyPem, signCount: 0 };
  } catch (e) {
    return { verified: false, reason: `error:${(e as Error).message}` };
  }
}

// Constant-time-ish equality that tolerates differing lengths (timingSafeEqual
// throws on length mismatch).
function bufEq(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Assertion verification (per-request, after attestation). The client calls
// generateAssertion(keyId, clientDataHash) and sends the CBOR assertion + the
// request payload (which must embed a fresh server challenge). We verify the
// signature with the STORED public key and enforce a strictly-increasing
// signCount (replay protection).
// ---------------------------------------------------------------------------

export interface AppAssertionResult {
  verified: boolean;
  reason: string;
  newSignCount?: number;
}

interface AssertionObject {
  signature: Uint8Array;
  authenticatorData: Uint8Array;
}

export function verifyAppleAssertion(
  params: {
    assertionB64: string;
    clientDataChallenge: string; // the payload/challenge the client signed
    storedPublicKeyPem: string;
    storedSignCount: number;
    teamId: string;
    bundleId: string;
  },
): AppAssertionResult {
  try {
    const asrt = cborDecode(Buffer.from(params.assertionB64, "base64")) as AssertionObject;
    const authenticatorData = Buffer.from(asrt.authenticatorData);
    const signature = Buffer.from(asrt.signature);
    if (authenticatorData.length < 37) return { verified: false, reason: "authdata-short" };

    // nonce = SHA256(authenticatorData || SHA256(challenge)).
    const clientDataHash = sha256(Buffer.from(params.clientDataChallenge));
    const nonce = sha256(authenticatorData, clientDataHash);

    const ok = crypto.verify(
      "sha256",
      nonce,
      { key: params.storedPublicKeyPem, dsaEncoding: "der" },
      signature,
    );
    if (!ok) return { verified: false, reason: "signature-invalid" };

    // rpIdHash check.
    const appId = `${params.teamId}.${params.bundleId}`;
    if (!bufEq(authenticatorData.subarray(0, 32), sha256(Buffer.from(appId)))) {
      return { verified: false, reason: "rpid-mismatch" };
    }

    // Strictly-increasing signCount → replay protection.
    const newSignCount = authenticatorData.readUInt32BE(33);
    if (newSignCount <= params.storedSignCount) {
      return { verified: false, reason: "signcount-not-increasing" };
    }

    return { verified: true, reason: "ok", newSignCount };
  } catch (e) {
    return { verified: false, reason: `error:${(e as Error).message}` };
  }
}
