import "reflect-metadata";
import crypto, { webcrypto } from "crypto";
import { encode as cborEncode } from "cbor-x";
import * as x509 from "@peculiar/x509";
import {
  verifyAppleAttestation,
  verifyAppleAssertion,
  parseAuthData,
  extractNonceFromExtension,
  APPLE_NONCE_OID,
} from "../../src/services/deviceAttest/appAttest";

x509.cryptoProvider.set(
  crypto.webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0],
);
const subtle = crypto.webcrypto.subtle;

// ---------------------------------------------------------------------------
// We synthesize a complete Apple-App-Attest attestation the way genuine Apple
// hardware would: our own root CA -> intermediate -> credCert carrying the nonce
// extension, plus WebAuthn authData whose nonce is bound into that cert. If the
// verifier accepts it under our root and rejects every mutation, the CBOR parse,
// chain verification, nonce binding, key-hash binding, rpId/counter/aaguid/keyId
// checks are all correct against real attestations (which differ only by trust
// anchor + real hardware key).
// ---------------------------------------------------------------------------

const TEAM_ID = "ABCDE12345";
const BUNDLE_ID = "com.nftproxygamble.app";
const CHALLENGE = "server-challenge-0xdeadbeef";
const DATE = new Date("2026-01-01T00:00:00Z");

const APPLE_NONCE_OID_LOCAL = APPLE_NONCE_OID;

function sha256(...b: Buffer[]): Buffer {
  const h = crypto.createHash("sha256");
  for (const x of b) h.update(x);
  return h.digest();
}

async function genP256() {
  return subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" };

async function makeCert(opts: {
  subject: string;
  issuer: string;
  publicKey: webcrypto.CryptoKey;
  signingKey: webcrypto.CryptoKey;
  ca?: boolean;
  extensions?: x509.Extension[];
  notBefore?: Date;
  notAfter?: Date;
}): Promise<x509.X509Certificate> {
  const exts: x509.Extension[] = opts.extensions ? [...opts.extensions] : [];
  if (opts.ca) exts.push(new x509.BasicConstraintsExtension(true, undefined, true));
  return x509.X509CertificateGenerator.create({
    serialNumber: crypto.randomBytes(8).toString("hex"),
    subject: opts.subject,
    issuer: opts.issuer,
    notBefore: opts.notBefore ?? new Date("2025-01-01T00:00:00Z"),
    notAfter: opts.notAfter ?? new Date("2027-01-01T00:00:00Z"),
    signingAlgorithm: SIGN_ALG,
    publicKey: opts.publicKey,
    signingKey: opts.signingKey,
    extensions: exts,
  });
}

function buildAuthData(credentialId: Buffer, opts: { aaguid?: Buffer; signCount?: number } = {}): Buffer {
  const rpIdHash = sha256(Buffer.from(`${TEAM_ID}.${BUNDLE_ID}`));
  const flags = Buffer.from([0x40]);
  const signCount = Buffer.alloc(4);
  signCount.writeUInt32BE(opts.signCount ?? 0);
  const aaguid = opts.aaguid ?? Buffer.from("appattest\0\0\0\0\0\0\0", "latin1");
  const credIdLen = Buffer.alloc(2);
  credIdLen.writeUInt16BE(credentialId.length);
  return Buffer.concat([rpIdHash, flags, signCount, aaguid, credIdLen, credentialId]);
}

function nonceExtensionDer(nonce: Buffer): ArrayBuffer {
  // SEQUENCE { [1] OCTET STRING nonce } => 30 24 A1 22 04 20 <nonce>
  const octet = Buffer.concat([Buffer.from([0x04, 0x20]), nonce]);
  const ctx = Buffer.concat([Buffer.from([0xa1, octet.length]), octet]);
  const seq = Buffer.concat([Buffer.from([0x30, ctx.length]), ctx]);
  return seq.buffer.slice(seq.byteOffset, seq.byteOffset + seq.byteLength);
}

interface Fixture {
  attestationObjectB64: string;
  keyId: string;
  rootPem: string;
  leafKeyPair: webcrypto.CryptoKeyPair;
}

// Build a valid attestation, with hooks to corrupt individual pieces.
async function buildFixture(
  opts: {
    aaguid?: Buffer;
    signCount?: number;
    tamperNonce?: boolean;
    wrongRootForChain?: boolean; // sign intermediate with an unrelated key
    challenge?: string;
  } = {},
): Promise<Fixture> {
  const root = await genP256();
  const inter = await genP256();
  const leaf = await genP256();

  const rootCert = await makeCert({
    subject: "CN=Test App Attest Root",
    issuer: "CN=Test App Attest Root",
    publicKey: root.publicKey,
    signingKey: root.privateKey,
    ca: true,
  });

  const badIssuer = opts.wrongRootForChain ? (await genP256()).privateKey : root.privateKey;
  const interCert = await makeCert({
    subject: "CN=Test App Attest CA 1",
    issuer: "CN=Test App Attest Root",
    publicKey: inter.publicKey,
    signingKey: badIssuer,
    ca: true,
  });

  // Leaf public key raw point → credentialId (= keyId).
  const rawPoint = Buffer.from(await subtle.exportKey("raw", leaf.publicKey)); // 65 bytes
  const credentialId = sha256(rawPoint);
  const keyId = credentialId.toString("base64");

  const authData = buildAuthData(credentialId, { aaguid: opts.aaguid, signCount: opts.signCount });
  const clientDataHash = sha256(Buffer.from(opts.challenge ?? CHALLENGE));
  let nonce = sha256(authData, clientDataHash);
  if (opts.tamperNonce) nonce = sha256(Buffer.from("wrong"));

  const leafCert = await makeCert({
    subject: "CN=Test Cred Cert",
    issuer: "CN=Test App Attest CA 1",
    publicKey: leaf.publicKey,
    signingKey: inter.privateKey,
    extensions: [new x509.Extension(APPLE_NONCE_OID_LOCAL, false, nonceExtensionDer(nonce))],
  });

  const attObj = {
    fmt: "apple-appattest",
    attStmt: {
      x5c: [new Uint8Array(leafCert.rawData), new Uint8Array(interCert.rawData)],
    },
    authData: new Uint8Array(authData),
  };

  return {
    attestationObjectB64: Buffer.from(cborEncode(attObj)).toString("base64"),
    keyId,
    rootPem: rootCert.toString("pem"),
    leafKeyPair: leaf,
  };
}

describe("verifyAppleAttestation — happy path", () => {
  it("accepts a genuine attestation bound to our challenge + app", async () => {
    const f = await buildFixture();
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      { teamId: TEAM_ID, bundleId: BUNDLE_ID, date: DATE, rootCaPem: f.rootPem },
    );
    expect(res.reason).toBe("ok");
    expect(res.verified).toBe(true);
    expect(res.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(res.signCount).toBe(0);
  });
});

describe("verifyAppleAttestation — rejection cases", () => {
  const cfg = (rootPem: string) => ({ teamId: TEAM_ID, bundleId: BUNDLE_ID, date: DATE, rootCaPem: rootPem });

  it("rejects a chain not anchored to the trusted root", async () => {
    const f = await buildFixture({ wrongRootForChain: true });
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      cfg(f.rootPem),
    );
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("intermediate-signature");
  });

  it("rejects when the challenge differs (nonce no longer matches)", async () => {
    const f = await buildFixture();
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: "attacker-challenge" },
      cfg(f.rootPem),
    );
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("nonce-mismatch");
  });

  it("rejects a tampered cert nonce extension", async () => {
    const f = await buildFixture({ tamperNonce: true });
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      cfg(f.rootPem),
    );
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("nonce-mismatch");
  });

  it("rejects a non-zero signCount at attestation", async () => {
    const f = await buildFixture({ signCount: 5 });
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      cfg(f.rootPem),
    );
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("signcount-nonzero");
  });

  it("rejects the development aaguid in production (allowDevelopmentEnv=false)", async () => {
    const f = await buildFixture({ aaguid: Buffer.from("appattestdevelopment", "latin1").subarray(0, 16) });
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      cfg(f.rootPem),
    );
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("dev-env-blocked");
  });

  it("accepts the development aaguid when explicitly allowed", async () => {
    const f = await buildFixture({ aaguid: Buffer.from("appattestdevelopment", "latin1").subarray(0, 16) });
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      { ...cfg(f.rootPem), allowDevelopmentEnv: true },
    );
    expect(res.verified).toBe(true);
  });

  it("rejects a keyId that does not match the attested credential", async () => {
    const f = await buildFixture();
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: crypto.randomBytes(32).toString("base64"), challenge: CHALLENGE },
      cfg(f.rootPem),
    );
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("keyid-mismatch");
  });

  it("rejects an rpIdHash for a different app (wrong bundle id)", async () => {
    const f = await buildFixture();
    const res = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      { teamId: TEAM_ID, bundleId: "com.someone.else", date: DATE, rootCaPem: f.rootPem },
    );
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("rpid-mismatch");
  });

  it("rejects a non-CBOR / junk attestation object", async () => {
    const res = await verifyAppleAttestation(
      { attestationObjectB64: Buffer.from("not cbor at all").toString("base64"), keyId: "AAAA", challenge: CHALLENGE },
      cfg("invalid"),
    );
    expect(res.verified).toBe(false);
  });
});

describe("parseAuthData / extractNonceFromExtension unit guards", () => {
  it("parses the documented offsets", () => {
    const credId = crypto.randomBytes(32);
    const ad = buildAuthData(credId);
    const p = parseAuthData(ad);
    expect(p.signCount).toBe(0);
    expect(p.credentialId.equals(credId)).toBe(true);
    expect(p.aaguid.toString("latin1")).toContain("appattest");
  });

  it("rejects a malformed nonce extension framing", () => {
    expect(() => extractNonceFromExtension(Buffer.alloc(10))).toThrow("nonce-ext-length");
  });
});

describe("verifyAppleAssertion", () => {
  it("verifies a signed assertion and enforces increasing signCount", async () => {
    const f = await buildFixture();
    // Attest first to get the stored public key.
    const att = await verifyAppleAttestation(
      { attestationObjectB64: f.attestationObjectB64, keyId: f.keyId, challenge: CHALLENGE },
      { teamId: TEAM_ID, bundleId: BUNDLE_ID, date: DATE, rootCaPem: f.rootPem },
    );
    expect(att.verified).toBe(true);
    const publicKeyPem = att.publicKeyPem!;

    // Build an assertion: authenticatorData (37 bytes) with signCount=1, signed
    // over nonce = SHA256(authData || SHA256(challenge)) with the leaf key.
    const rpIdHash = sha256(Buffer.from(`${TEAM_ID}.${BUNDLE_ID}`));
    const flags = Buffer.from([0x00]);
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(1);
    const authenticatorData = Buffer.concat([rpIdHash, flags, signCount]);
    const requestChallenge = "assertion-challenge-1";
    const nonce = sha256(authenticatorData, sha256(Buffer.from(requestChallenge)));
    const derSig = Buffer.from(
      await subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        f.leafKeyPair.privateKey,
        nonce,
      ),
    );
    // WebCrypto returns raw r||s; convert to DER for the (dsaEncoding:'der') verifier.
    const derSignature = p1363ToDer(derSig);
    const assertion = { signature: new Uint8Array(derSignature), authenticatorData: new Uint8Array(authenticatorData) };
    const assertionB64 = Buffer.from(cborEncode(assertion)).toString("base64");

    const good = verifyAppleAssertion({
      assertionB64,
      clientDataChallenge: requestChallenge,
      storedPublicKeyPem: publicKeyPem,
      storedSignCount: 0,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
    });
    expect(good.reason).toBe("ok");
    expect(good.verified).toBe(true);
    expect(good.newSignCount).toBe(1);

    // Replay at the same signCount is rejected.
    const replay = verifyAppleAssertion({
      assertionB64,
      clientDataChallenge: requestChallenge,
      storedPublicKeyPem: publicKeyPem,
      storedSignCount: 1,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
    });
    expect(replay.verified).toBe(false);
    expect(replay.reason).toBe("signcount-not-increasing");
  });
});

// Convert a JOSE raw r||s (64-byte P-256) signature to ASN.1 DER.
function p1363ToDer(raw: Buffer): Buffer {
  const r = raw.subarray(0, 32);
  const s = raw.subarray(32, 64);
  const enc = (b: Buffer): Buffer => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.subarray(i);
    if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0x00]), v]);
    return Buffer.concat([Buffer.from([0x02, v.length]), v]);
  };
  const body = Buffer.concat([enc(r), enc(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}
