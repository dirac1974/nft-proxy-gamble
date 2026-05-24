import Constants from "expo-constants";
import { useWalletStore } from "@/stores/walletStore";

const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "http://localhost:3000";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
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

// Auth
export const authApi = {
  nonce: (address: string) =>
    request<{ nonce: string }>(`/auth/nonce?address=${address}`),

  verify: (address: string, signature: string) =>
    request<{ token: string; userId: string }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ address, signature }),
    }),
};

// Balance
export const balanceApi = {
  get: () => request<{ coinBalance: number }>("/balance"),
};

// Game
export const gameApi = {
  startSession: (betAmount: number) =>
    request<{ sessionId: string; serverSeedHash: string; clientSeed: string }>(
      "/game/start-session",
      { method: "POST", body: JSON.stringify({ betAmount }) }
    ),

  deal: (sessionId: string) =>
    request<{ dealtCards: number[] }>("/game/deal", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),

  draw: (sessionId: string, holds: boolean[]) =>
    request<{
      drawnCards: number[];
      rank: string;
      payout: number;
      serverSeed: string;
      newBalance: number;
    }>("/game/draw", {
      method: "POST",
      body: JSON.stringify({ sessionId, holds }),
    }),

  cashout: (sessionId: string, coinsToCashout: number) =>
    request<{ voucherId: string; mintStatus: string }>("/game/cashout", {
      method: "POST",
      body: JSON.stringify({ sessionId, coinsToCashout }),
    }),
};

// NFTs
export const nftApi = {
  list: () =>
    request<
      Array<{
        id: string;
        coinAmount: number;
        mintStatus: string;
        tokenId: number | null;
        createdAt: string;
      }>
    >("/nfts"),
};

// IAP
export const iapApi = {
  verify: (platform: "apple" | "google", receipt: string) =>
    request<{ coinsAdded: number; newBalance: number }>("/iap/verify", {
      method: "POST",
      body: JSON.stringify({ platform, receipt }),
    }),
};
