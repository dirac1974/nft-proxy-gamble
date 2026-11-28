import { createHmac, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { config } from "../config/index.js";

// Balance responses are signed with Ed25519 (H2). The mobile app embeds only
// the PUBLIC key (EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY), so a decompiled bundle
// can no longer forge balance signatures the way the old shared HMAC key could.
//
// The keypair is derived deterministically from JWT_SECRET so no new secret is
// needed: seed = HMAC-SHA256(JWT_SECRET, "nfpg_balance_ed25519_v1").
// Rotating JWT_SECRET rotates the keypair — re-run
// `npx tsx scripts/print-balance-pubkey.ts` and ship the new pubkey.
//
// Payload is unchanged: `${userId}:${coinBalance}:${sigTimestamp}` (UTF-8).

export const BALANCE_SIG_ALG = "ed25519" as const;
const SEED_LABEL = "nfpg_balance_ed25519_v1";
// RFC 8410 PKCS#8 wrapper for a raw 32-byte Ed25519 seed.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519_PREFIX_LEN = 12;

interface BalanceKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyHex: string;
}

function deriveKeys(): BalanceKeys {
  // Use process.env directly so _resetSigningKeyForTest() works in unit tests
  // (config object caches values at startup, env mutations aren't reflected through it).
  const secret = process.env.JWT_SECRET ?? config.JWT_SECRET;
  const seed = createHmac("sha256", secret).update(SEED_LABEL).digest();
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ format: "der", type: "spki" });
  return { privateKey, publicKey, publicKeyHex: spki.subarray(SPKI_ED25519_PREFIX_LEN).toString("hex") };
}

let _keys: BalanceKeys | null = null;
function getKeys(): BalanceKeys {
  if (!_keys) _keys = deriveKeys();
  return _keys;
}

/** Raw 32-byte Ed25519 public key, hex — value for EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY. */
export function getBalancePublicKeyHex(): string {
  return getKeys().publicKeyHex;
}

export interface SignedBalance {
  coinBalance: number;
  balanceSig: string;
  sigTimestamp: number;
  sigAlg: typeof BALANCE_SIG_ALG;
}

function payloadOf(userId: string, coinBalance: number, sigTimestamp: number): Buffer {
  return Buffer.from(`${userId}:${coinBalance}:${sigTimestamp}`, "utf8");
}

export function signBalance(userId: string, coinBalance: number): SignedBalance {
  const sigTimestamp = Math.floor(Date.now() / 1000);
  const balanceSig = sign(null, payloadOf(userId, coinBalance, sigTimestamp), getKeys().privateKey).toString("hex");
  return { coinBalance, balanceSig, sigTimestamp, sigAlg: BALANCE_SIG_ALG };
}

// Test/diagnostic helper ONLY. Never use this to accept a balance the client
// sends back: a balance signature proves what the server said at sigTimestamp,
// not what the user owns now. The DB is the sole source of truth for balances.
export function verifyBalanceSig(
  userId: string,
  coinBalance: number,
  sigTimestamp: number,
  balanceSig: string,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now - sigTimestamp > 60) return false;
  if (!/^[0-9a-f]{128}$/i.test(balanceSig)) return false;
  try {
    return verify(null, payloadOf(userId, coinBalance, sigTimestamp), getKeys().publicKey, Buffer.from(balanceSig, "hex"));
  } catch {
    return false;
  }
}

export function _resetSigningKeyForTest(): void {
  _keys = null;
}
