import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { useWalletStore } from "@/stores/walletStore";

// The public balance verification key is embedded in the app at build time.
// It is derived server-side as: HMAC-SHA256(JWT_SECRET, "nfpg_balance_v1")
// The secret never leaves the server — only the derived key is public.
function getVerifyKey(): Uint8Array | null {
  const keyHex = process.env.EXPO_PUBLIC_BALANCE_VERIFY_KEY;
  if (!keyHex || keyHex.length !== 64) return null;
  try {
    return hexToBytes(keyHex);
  } catch {
    return null;
  }
}

export interface SignedBalanceResponse {
  coinBalance: number;
  balanceSig: string;
  sigTimestamp: number;
}

export function verifyAndExtractBalance(
  response: SignedBalanceResponse,
): number | null {
  const key = getVerifyKey();
  if (!key) {
    // Verification key not configured (dev without env var) — skip verification
    if (process.env.NODE_ENV !== "production") return response.coinBalance;
    return null; // production: require key
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - response.sigTimestamp > 60) return null; // expired

  const userId = useWalletStore.getState().userId;
  if (!userId) return null;

  const payload = `${userId}:${response.coinBalance}:${response.sigTimestamp}`;
  const expected = bytesToHex(hmac(sha256, key, new TextEncoder().encode(payload)));

  if (expected !== response.balanceSig) return null;
  return response.coinBalance;
}
