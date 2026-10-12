import { ed25519 } from "@noble/curves/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { useWalletStore } from "@/stores/walletStore";

// H2: balances are signed server-side with Ed25519; the app only embeds the
// PUBLIC key (EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY, 32-byte hex), so nothing in
// the bundle can forge a signature. Print it with backend/scripts/print-balance-pubkey.ts.
//
// Transition: the legacy HMAC key (EXPO_PUBLIC_BALANCE_VERIFY_KEY) is a shared
// secret — anyone holding the bundle can forge with it — so it is accepted only
// when NODE_ENV !== "production" and no pubkey is configured.

const HEX64 = /^[0-9a-fA-F]{64}$/;
const HEX128 = /^[0-9a-fA-F]{128}$/;
const MAX_AGE_SEC = 60;

function readHexKey(name: "EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY" | "EXPO_PUBLIC_BALANCE_VERIFY_KEY"): Uint8Array | null {
  // Static property access so babel-preset-expo can inline EXPO_PUBLIC_* at bundle time.
  // The legacy secret sits behind a NODE_ENV check that is constant-folded in release
  // bundles, so it is stripped even if someone sets it for a production export.
  const hex =
    name === "EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY"
      ? process.env.EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY
      : process.env.NODE_ENV !== "production"
        ? process.env.EXPO_PUBLIC_BALANCE_VERIFY_KEY
        : undefined;
  if (!hex || !HEX64.test(hex)) return null;
  return hexToBytes(hex.toLowerCase());
}

export interface SignedBalanceResponse {
  coinBalance: number;
  balanceSig: string;
  sigTimestamp: number;
  sigAlg?: "ed25519" | "hmac-sha256";
}

export function balancePayload(userId: string, coinBalance: number, sigTimestamp: number): string {
  return `${userId}:${coinBalance}:${sigTimestamp}`;
}

function verifyEd25519(pub: Uint8Array, payload: Uint8Array, sigHex: string): boolean {
  if (!HEX128.test(sigHex)) return false;
  try {
    return ed25519.verify(hexToBytes(sigHex.toLowerCase()), payload, pub, { zip215: false });
  } catch {
    return false;
  }
}

export function verifyAndExtractBalance(response: SignedBalanceResponse): number | null {
  const isProd = process.env.NODE_ENV === "production";
  const pub = readHexKey("EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY");
  const legacy = pub || isProd ? null : readHexKey("EXPO_PUBLIC_BALANCE_VERIFY_KEY");

  if (!pub && !legacy) {
    // Dev without any key configured — skip verification. Production: require the pubkey.
    return isProd ? null : response.coinBalance;
  }

  if (typeof response.sigTimestamp !== "number" || typeof response.balanceSig !== "string") return null;
  const now = Math.floor(Date.now() / 1000);
  if (now - response.sigTimestamp > MAX_AGE_SEC) return null;

  const userId = useWalletStore.getState().userId;
  if (!userId) return null;

  const payload = new TextEncoder().encode(balancePayload(userId, response.coinBalance, response.sigTimestamp));

  if (pub) {
    if (response.sigAlg !== undefined && response.sigAlg !== "ed25519") return null;
    return verifyEd25519(pub, payload, response.balanceSig) ? response.coinBalance : null;
  }

  const expected = bytesToHex(hmac(sha256, legacy!, payload));
  return expected === response.balanceSig ? response.coinBalance : null;
}
