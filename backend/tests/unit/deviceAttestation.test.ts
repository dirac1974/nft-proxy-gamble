import {
  isAttestationEnforced,
  appleTokenWellFormed,
  androidTokenWellFormed,
  decideAttestation,
} from "../../src/services/deviceAttestationService";

describe("isAttestationEnforced", () => {
  it("enforces in production regardless of flag", () => {
    expect(isAttestationEnforced("production", false)).toBe(true);
    expect(isAttestationEnforced("production", true)).toBe(true);
  });

  it("enforces when the flag is on outside production", () => {
    expect(isAttestationEnforced("development", true)).toBe(true);
    expect(isAttestationEnforced("test", true)).toBe(true);
  });

  it("does not enforce in dev/test when the flag is off", () => {
    expect(isAttestationEnforced("development", false)).toBe(false);
    expect(isAttestationEnforced("test", false)).toBe(false);
  });
});

describe("token shape pre-filters", () => {
  it("apple: base64 decoding to >= 32 bytes is well-formed", () => {
    expect(appleTokenWellFormed(Buffer.alloc(32, 7).toString("base64"))).toBe(true);
  });
  it("apple: short token is malformed", () => {
    expect(appleTokenWellFormed(Buffer.alloc(8).toString("base64"))).toBe(false);
    expect(appleTokenWellFormed("")).toBe(false);
  });
  it("android: a five-segment JWE compact is well-formed", () => {
    expect(androidTokenWellFormed("a.b.c.d.e")).toBe(true);
  });
  it("android: wrong segment count or empty segment is malformed", () => {
    expect(androidTokenWellFormed("a.b.c")).toBe(false);
    expect(androidTokenWellFormed("a.b.c.d")).toBe(false);
    expect(androidTokenWellFormed("a..c.d.e")).toBe(false);
  });
});

describe("decideAttestation (fail-open shadow, fail-closed enforce)", () => {
  it("shadow mode never blocks, even with a missing token", () => {
    const d = decideAttestation({ enforced: false, present: false, configured: false, verified: false });
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.reason).toBe("missing-token");
  });

  it("shadow mode never blocks a failed verification but records the reason", () => {
    const d = decideAttestation({ enforced: false, present: true, configured: true, verified: false });
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.reason).toBe("verification-failed");
  });

  it("enforce mode BLOCKS a missing token", () => {
    const d = decideAttestation({ enforced: true, present: false, configured: false, verified: false });
    expect(d.allowed).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toBe("missing-token");
  });

  it("enforce mode BLOCKS an unconfigured platform (fail closed)", () => {
    const d = decideAttestation({ enforced: true, present: true, configured: false, verified: false });
    expect(d.allowed).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toBe("platform-unconfigured");
  });

  it("enforce mode BLOCKS a token that fails cryptographic verification", () => {
    const d = decideAttestation({ enforced: true, present: true, configured: true, verified: false });
    expect(d.allowed).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toBe("verification-failed");
  });

  it("enforce mode ALLOWS a present, configured, verified attestation", () => {
    const d = decideAttestation({ enforced: true, present: true, configured: true, verified: true });
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.reason).toBe("verified");
  });
});
