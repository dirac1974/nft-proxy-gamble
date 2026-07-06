import crypto from "crypto";
import {
  verifyPlayIntegrityToken,
  evaluateDeviceIntegrity,
  decryptJwe,
  type PlayIntegrityVerdict,
  type DeviceRecognitionVerdict,
} from "../../src/services/deviceAttest/playIntegrity";

// ---------------------------------------------------------------------------
// These tests generate their OWN AES key + EC P-256 keypair and encode a token
// byte-for-byte the way Google's Play Integrity classic path does (JWE dir /
// A256GCM wrapping an ES256 JWS). If our verifier accepts that token and rejects
// every mutation, the decrypt + signature-verify + verdict logic is correct
// against real tokens signed by Google's keys.
// ---------------------------------------------------------------------------

const PACKAGE = "com.nftproxygamble.app";

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function makeKeys() {
  const aesKey = crypto.randomBytes(32);
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const ecPublicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { aesKey, privateKey, ecPublicKeyB64 };
}

// Sign a verdict into an ES256 JWS (compact, JOSE raw r||s signature).
function signJws(verdict: PlayIntegrityVerdict, privateKey: crypto.KeyObject): string {
  const header = b64url(JSON.stringify({ alg: "ES256" }));
  const payload = b64url(JSON.stringify(verdict));
  const signingInput = Buffer.from(`${header}.${payload}`, "ascii");
  const sig = crypto.sign("sha256", signingInput, { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(sig)}`;
}

const KEY_WRAP_IV = Buffer.from("A6A6A6A6A6A6A6A6", "hex");

// Encrypt a JWS into a JWE (A256KW / A256GCM, compact) exactly as Google does:
// generate a per-token CEK, AES-key-wrap it under the Play Console KEK, then
// A256GCM-encrypt the JWS with the CEK.
function encryptJwe(jws: string, kek: Buffer): string {
  const header = b64url(JSON.stringify({ alg: "A256KW", enc: "A256GCM" }));
  const cek = crypto.randomBytes(32);
  const wrap = crypto.createCipheriv("id-aes256-wrap", kek, KEY_WRAP_IV);
  wrap.setAutoPadding(false);
  const wrappedCek = Buffer.concat([wrap.update(cek), wrap.final()]);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cek, iv);
  cipher.setAAD(Buffer.from(header, "ascii"));
  const ct = Buffer.concat([cipher.update(jws, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${header}.${b64url(wrappedCek)}.${b64url(iv)}.${b64url(ct)}.${b64url(tag)}`;
}

function goodVerdict(overrides: Partial<PlayIntegrityVerdict> = {}): PlayIntegrityVerdict {
  return {
    requestDetails: {
      requestPackageName: PACKAGE,
      timestampMillis: String(1_700_000_000_000),
    },
    appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED", packageName: PACKAGE },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
    accountDetails: { appLicensingVerdict: "LICENSED" },
    ...overrides,
  };
}

function mint(verdict: PlayIntegrityVerdict, aesKey: Buffer, privateKey: crypto.KeyObject): string {
  return encryptJwe(signJws(verdict, privateKey), aesKey);
}

const NOW = () => 1_700_000_030_000; // 30s after the token timestamp

describe("verifyPlayIntegrityToken — happy path", () => {
  it("accepts a correctly encrypted + signed token from a genuine device", () => {
    const { aesKey, privateKey, ecPublicKeyB64 } = makeKeys();
    const token = mint(goodVerdict(), aesKey, privateKey);
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(true);
    expect(res.reason).toBe("ok");
    expect(res.verdict?.appIntegrity?.appRecognitionVerdict).toBe("PLAY_RECOGNIZED");
  });
});

describe("verifyPlayIntegrityToken — cryptographic tamper rejection", () => {
  it("rejects a token signed by a DIFFERENT (attacker) key", () => {
    const { aesKey, ecPublicKeyB64 } = makeKeys();
    const attacker = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const token = mint(goodVerdict(), aesKey, attacker.privateKey);
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain("jws-signature-invalid");
  });

  it("rejects a token encrypted with a DIFFERENT AES key", () => {
    const { privateKey, ecPublicKeyB64 } = makeKeys();
    const wrongKey = crypto.randomBytes(32);
    const token = mint(goodVerdict(), wrongKey, privateKey);
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: crypto.randomBytes(32).toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain("crypto:");
  });

  it("rejects a token whose ciphertext bit was flipped (GCM auth tag fails)", () => {
    const { aesKey, privateKey, ecPublicKeyB64 } = makeKeys();
    const token = mint(goodVerdict(), aesKey, privateKey);
    const parts = token.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 0x01;
    parts[3] = ct.toString("base64url");
    const res = verifyPlayIntegrityToken(parts.join("."), {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain("crypto:");
  });

  it("rejects a signature-stripped 'alg:none' style token (wrong parts / alg)", () => {
    const { aesKey, ecPublicKeyB64 } = makeKeys();
    // Build a JWS with alg none and empty sig, then encrypt legitimately.
    const header = b64url(JSON.stringify({ alg: "none" }));
    const payload = b64url(JSON.stringify(goodVerdict()));
    const forged = `${header}.${payload}.`;
    const token = encryptJwe(forged, aesKey);
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain("jws-alg");
  });
});

describe("verifyPlayIntegrityToken — verdict content rejection", () => {
  const base = () => {
    const k = makeKeys();
    return k;
  };

  it("rejects a token for a different package name", () => {
    const { aesKey, privateKey, ecPublicKeyB64 } = base();
    const token = mint(
      goodVerdict({
        requestDetails: { requestPackageName: "com.evil.app", timestampMillis: String(1_700_000_000_000) },
        appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED", packageName: "com.evil.app" },
      }),
      aesKey,
      privateKey,
    );
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain("package-mismatch");
  });

  it("rejects a stale token (older than maxAge)", () => {
    const { aesKey, privateKey, ecPublicKeyB64 } = base();
    const token = mint(goodVerdict(), aesKey, privateKey);
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: () => 1_700_000_000_000 + 10 * 60_000, // 10 min later
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("token-stale");
  });

  it("rejects an UNRECOGNIZED_VERSION app verdict", () => {
    const { aesKey, privateKey, ecPublicKeyB64 } = base();
    const token = mint(
      goodVerdict({ appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED_VERSION", packageName: PACKAGE } }),
      aesKey,
      privateKey,
    );
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain("app-integrity:UNRECOGNIZED_VERSION");
  });

  it("rejects a rooted device (empty deviceRecognitionVerdict)", () => {
    const { aesKey, privateKey, ecPublicKeyB64 } = base();
    const token = mint(
      goodVerdict({ deviceIntegrity: { deviceRecognitionVerdict: [] } }),
      aesKey,
      privateKey,
    );
    const res = verifyPlayIntegrityToken(token, {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("device:device-integrity-empty");
  });

  it("enforces a server-issued nonce when configured", () => {
    const { aesKey, privateKey, ecPublicKeyB64 } = base();
    const challenge = "server-challenge-xyz";
    const good = mint(
      goodVerdict({
        requestDetails: {
          requestPackageName: PACKAGE,
          timestampMillis: String(1_700_000_000_000),
          nonce: Buffer.from(challenge).toString("base64url"),
        },
      }),
      aesKey,
      privateKey,
    );
    const cfg = {
      aesKeyB64: aesKey.toString("base64"),
      ecPublicKeyB64,
      packageName: PACKAGE,
      now: NOW,
      expectedNonce: challenge,
    };
    expect(verifyPlayIntegrityToken(good, cfg).verified).toBe(true);

    const wrong = mint(
      goodVerdict({
        requestDetails: {
          requestPackageName: PACKAGE,
          timestampMillis: String(1_700_000_000_000),
          nonce: Buffer.from("different").toString("base64url"),
        },
      }),
      aesKey,
      privateKey,
    );
    expect(verifyPlayIntegrityToken(wrong, cfg).reason).toBe("nonce-mismatch");
  });
});

describe("evaluateDeviceIntegrity", () => {
  const cases: [DeviceRecognitionVerdict[], boolean, boolean][] = [
    [["MEETS_STRONG_INTEGRITY"], false, true],
    [["MEETS_DEVICE_INTEGRITY"], false, true],
    [["MEETS_BASIC_INTEGRITY"], false, false],
    [["MEETS_VIRTUAL_INTEGRITY"], false, false],
    [[], false, false],
    [["MEETS_DEVICE_INTEGRITY"], true, false], // strong required, only device present
    [["MEETS_STRONG_INTEGRITY"], true, true],
  ];
  it.each(cases)("verdicts=%p requireStrong=%p → pass=%p", (verdicts, requireStrong, pass) => {
    expect(evaluateDeviceIntegrity(verdicts, requireStrong).pass).toBe(pass);
  });
});

describe("decryptJwe structural guards", () => {
  it("rejects a token that is not 5 JWE parts", () => {
    expect(() => decryptJwe("a.b.c", crypto.randomBytes(32))).toThrow("jwe-parts");
  });
});
