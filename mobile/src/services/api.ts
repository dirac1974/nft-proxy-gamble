import Constants from "expo-constants";
import { useWalletStore } from "@/stores/walletStore";
import { verifyAndExtractBalance, type SignedBalanceResponse } from "./balanceVerification";
import { getAttestationHeaders } from "./deviceAttestationService";

const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "http://localhost:3000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useWalletStore.getState().jwtToken;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// Verify a signed balance response and extract the coin balance.
// Throws if signature is invalid or expired — prevents showing untrusted balance.
function extractVerifiedBalance(response: SignedBalanceResponse): number {
  const balance = verifyAndExtractBalance(response);
  if (balance === null) {
    throw new Error("Balance signature verification failed — please reconnect.");
  }
  return balance;
}

// Auth
export const authApi = {
  nonce: (address: string) =>
    request<{ nonce: string }>(`/auth/nonce?address=${address}`),

  verify: (address: string, signature: string) =>
    request<{ token: string; userId: string; ageConfirmed: boolean }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ address, signature }),
    }),

  confirmAge: () =>
    request<{ ageConfirmed: boolean }>("/auth/confirm-age", { method: "POST" }),
};

// Balance — returns verified balance only
export const balanceApi = {
  get: async (): Promise<number> => {
    const resp = await request<SignedBalanceResponse>("/balance");
    return extractVerifiedBalance(resp);
  },
};

// Game
export const gameApi = {
  startSession: (betAmount: number) =>
    request<{ sessionId: string; serverSeedHash: string; clientSeed: string }>(
      "/game/start-session",
      { method: "POST", body: JSON.stringify({ betAmount }) },
    ),

  deal: (sessionId: string) =>
    request<{ dealtCards: number[] }>("/game/deal", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),

  draw: async (
    sessionId: string,
    holds: boolean[],
  ): Promise<{
    drawnCards: number[];
    rank: string;
    payout: number;
    serverSeed: string;
    newBalance: number;
  }> => {
    const resp = await request<
      SignedBalanceResponse & { drawnCards: number[]; rank: string; payout: number; serverSeed: string }
    >("/game/draw", {
      method: "POST",
      body: JSON.stringify({ sessionId, holds }),
    });
    const newBalance = extractVerifiedBalance(resp);
    return { drawnCards: resp.drawnCards, rank: resp.rank, payout: resp.payout, serverSeed: resp.serverSeed, newBalance };
  },

  cashout: async (
    sessionId: string,
    coinsToCashout: number,
  ): Promise<{ voucherId: string; mintStatus: string; newBalance: number }> => {
    const attestHeaders = await getAttestationHeaders();
    const resp = await request<SignedBalanceResponse & { voucherId: string; mintStatus: string }>(
      "/game/cashout",
      { method: "POST", body: JSON.stringify({ sessionId, coinsToCashout }), headers: attestHeaders },
    );
    const newBalance = extractVerifiedBalance(resp);
    return { voucherId: resp.voucherId, mintStatus: resp.mintStatus, newBalance };
  },
};

// NFTs
export interface Voucher {
  id: string;
  coinBalance: number;
  mintStatus: string;
  tokenId: string | null;
  txHash: string | null;
  gameType: string;
  createdAt: string;
}

export const nftApi = {
  list: () => request<Voucher[]>("/nfts"),
  getById: (id: string) => request<Voucher>(`/nfts/${id}`),
};

// IAP — path corrected to match backend route
export const iapApi = {
  verify: async (
    platform: "apple" | "google",
    receipt: string,
  ): Promise<{ coinsGranted: number; newBalance: number }> => {
    const attestHeaders = await getAttestationHeaders();
    const resp = await request<SignedBalanceResponse & { coinsGranted: number }>(
      "/iap/verify-purchase",
      { method: "POST", body: JSON.stringify({ platform, receiptData: receipt }), headers: attestHeaders },
    );
    const newBalance = extractVerifiedBalance(resp);
    return { coinsGranted: resp.coinsGranted, newBalance };
  },
};
