import {
  issueChallenge,
  encodeChallenge,
  verifyChallenge,
} from "../../src/services/deviceAttest/challenge";

const SECRET = "test-secret-at-least-32-chars-long-xxxxx";

describe("attestation challenge (stateless HMAC nonce)", () => {
  it("round-trips a freshly issued challenge", () => {
    const now = 1_700_000_000_000;
    const c = issueChallenge(SECRET, now);
    const res = verifyChallenge(SECRET, encodeChallenge(c), now + 1_000);
    expect(res.valid).toBe(true);
    expect(res.nonce).toBe(c.nonce);
  });

  it("rejects a challenge signed with a different secret", () => {
    const c = issueChallenge(SECRET, 1_700_000_000_000);
    const res = verifyChallenge("another-secret-32-chars-xxxxxxxxxxxxxx", encodeChallenge(c), 1_700_000_000_001);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("challenge-mac");
  });

  it("rejects a tampered nonce (mac no longer matches)", () => {
    const c = issueChallenge(SECRET, 1_700_000_000_000);
    const encoded = encodeChallenge({ ...c, nonce: c.nonce + "x" });
    expect(verifyChallenge(SECRET, encoded, 1_700_000_000_001).valid).toBe(false);
  });

  it("rejects an expired challenge", () => {
    const now = 1_700_000_000_000;
    const c = issueChallenge(SECRET, now, 1_000);
    const res = verifyChallenge(SECRET, encodeChallenge(c), now + 5_000);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("challenge-expired");
  });

  it("rejects reuse when a single-use set is supplied", () => {
    const now = 1_700_000_000_000;
    const c = issueChallenge(SECRET, now);
    const encoded = encodeChallenge(c);
    const seen = new Set<string>();
    expect(verifyChallenge(SECRET, encoded, now + 1, seen).valid).toBe(true);
    const second = verifyChallenge(SECRET, encoded, now + 2, seen);
    expect(second.valid).toBe(false);
    expect(second.reason).toBe("challenge-reused");
  });

  it("rejects a malformed challenge string", () => {
    expect(verifyChallenge(SECRET, "not-a-valid-challenge", Date.now()).reason).toBe("challenge-format");
  });
});
