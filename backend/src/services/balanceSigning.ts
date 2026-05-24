import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config/index.js";

// Derived from JWT_SECRET so no new env var is needed.
// Separate key means a balance token cannot be confused with a JWT.
function deriveSigningKey(): Buffer {
  return createHmac("sha256", config.JWT_SECRET).update("nfpg_balance_v1").digest();
}

let _signingKey: Buffer | null = null;
function getSigningKey(): Buffer {
  if (!_signingKey) _signingKey = deriveSigningKey();
  return _signingKey;
}

export interface SignedBalance {
  coinBalance: number;
  balanceSig: string;
  sigTimestamp: number;
}

export function signBalance(userId: string, coinBalance: number): SignedBalance {
  const sigTimestamp = Math.floor(Date.now() / 1000);
  const payload = `${userId}:${coinBalance}:${sigTimestamp}`;
  const balanceSig = createHmac("sha256", getSigningKey()).update(payload).digest("hex");
  return { coinBalance, balanceSig, sigTimestamp };
}

export function verifyBalanceSig(
  userId: string,
  coinBalance: number,
  sigTimestamp: number,
  balanceSig: string,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now - sigTimestamp > 60) return false;

  const payload = `${userId}:${coinBalance}:${sigTimestamp}`;
  const expected = createHmac("sha256", getSigningKey()).update(payload).digest("hex");

  // timingSafeEqual requires equal-length Buffers — both are 64-char hex strings
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(balanceSig, "hex"));
  } catch {
    // Catches invalid hex (wrong format) without leaking timing
    return false;
  }
}

export function _resetSigningKeyForTest(): void {
  _signingKey = null;
}
