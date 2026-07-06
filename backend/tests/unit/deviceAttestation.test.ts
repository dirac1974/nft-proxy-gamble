import {
  isAttestationEnforced,
  appleTokenWellFormed,
  androidTokenWellFormed,
  evaluateAttestation,
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

describe("token shape checks", () => {
  it("apple: base64 decoding to >= 32 bytes is well-formed", () => {
    const good = Buffer.alloc(32, 7).toString("base64");
    expect(appleTokenWellFormed(good)).toBe(true);
  });
  it("apple: short token is malformed", () => {
    expect(appleTokenWellFormed(Buffer.alloc(8).toString("base64"))).toBe(false);
    expect(appleTokenWellFormed("")).toBe(false);
  });
  it("android: three non-empty dot-separated parts is well-formed", () => {
    expect(androidTokenWellFormed("aaa.bbb.ccc")).toBe(true);
  });
  it("android: wrong segment count or empty segment is malformed", () => {
    expect(androidTokenWellFormed("aaa.bbb")).toBe(false);
    expect(androidTokenWellFormed("aaa..ccc")).toBe(false);
    expect(androidTokenWellFormed("aaabbbccc")).toBe(false);
  });
});

describe("evaluateAttestation (fail-open shadow, fail-closed enforce)", () => {
  it("shadow mode never blocks, even with a missing token", () => {
    const d = evaluateAttestation({ enforced: false, present: false, wellFormed: false, configured: false });
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.reason).toBe("missing-token");
  });

  it("shadow mode never blocks a malformed token but records the reason", () => {
    const d = evaluateAttestation({ enforced: false, present: true, wellFormed: false, configured: false });
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.reason).toBe("malformed-token");
  });

  it("enforce mode BLOCKS a missing token", () => {
    const d = evaluateAttestation({ enforced: true, present: false, wellFormed: false, configured: false });
    expect(d.allowed).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toBe("missing-token");
  });

  it("enforce mode BLOCKS a malformed token", () => {
    const d = evaluateAttestation({ enforced: true, present: true, wellFormed: false, configured: false });
    expect(d.allowed).toBe(false);
    expect(d.blocked).toBe(true);
  });

  it("enforce mode allows a present, well-formed token (stub-verify when configured)", () => {
    const d = evaluateAttestation({ enforced: true, present: true, wellFormed: true, configured: true });
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.reason).toBe("well-formed(stub-verify)");
  });

  it("flags shape-only checks when the platform is unconfigured", () => {
    const d = evaluateAttestation({ enforced: true, present: true, wellFormed: true, configured: false });
    expect(d.allowed).toBe(true);
    expect(d.reason).toContain("shape-only");
  });
});
