import Constants from "expo-constants";
import { useWalletStore } from "@/stores/walletStore";
import { verifyAndExtractBalance, type SignedBalanceResponse } from "./balanceVerification";
import { getAttestationHeaders } from "./deviceAttestationService";
import { withClientSeed } from "./clientSeed";

// M2: release builds may only talk to an allow-listed https backend.
export const API_HOST_ALLOWLIST: readonly string[] = ["api.nftproxygamble.com", "api-staging.nftproxygamble.com"];

function httpsHost(url: string | undefined): string | null {
  const m = url ? /^https:\/\/([a-z0-9.-]+)(:\d+)?(\/.*)?$/i.exec(url.trim()) : null;
  return m ? m[1]!.toLowerCase() : null;
}

// Bundle-time env wins over the config embedded at native build time, so a
// rebuilt JS bundle always talks to the backend it was bundled for.
export function resolveApiBaseUrl(envUrl: string | undefined, extraUrl: string | undefined, isDev: boolean): string {
  const url = envUrl || extraUrl;
  if (isDev) return (url ?? "http://localhost:3000").replace(/\/+$/, "");
  if (!url) throw new Error("API URL not configured (EXPO_PUBLIC_API_URL) — refusing to start a release build");
  const host = httpsHost(url);
  if (!host) throw new Error(`API URL must be https:// in release builds (got ${url})`);
  const allowed = new Set(API_HOST_ALLOWLIST);
  const extraHost = httpsHost(extraUrl);
  if (extraHost) allowed.add(extraHost);
  if (!allowed.has(host)) throw new Error(`API host ${host} is not allow-listed`);
  return url.trim().replace(/\/+$/, "");
}

const BASE_URL = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  Constants.expoConfig?.extra?.apiUrl as string | undefined,
  __DEV__,
);

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    // 401 = token rejected by backend (expired, invalidated, or backend's JWT_SECRET rotated).
    // Force-disconnect so the user lands back at the connect screen instead of seeing
    // a cryptic error and a stale "authenticated" state that can't make any API calls.
    // Skip during the auth flow itself (nonce + verify) — those have their own 401 semantics
    // ("nonce expired" doesn't mean the user's session is dead, just that they need a new nonce).
    if (res.status === 401 && !path.startsWith("/auth/")) {
      // Fire-and-forget: don't block the throw on the disconnect promise.
      void useWalletStore.getState().disconnect();
      throw new Error("Session expired. Please reconnect your wallet.");
    }
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// Verify a signed balance response and extract the coin balance.
// Throws if signature is invalid or expired — prevents showing untrusted balance.
export function extractVerifiedBalance(response: SignedBalanceResponse): number {
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
    request<{ token: string; userId: string; ageConfirmed: boolean; serverSeedChainHash: string | null }>(
      "/auth/verify",
      {
        method: "POST",
        body: JSON.stringify({ address, signature }),
      },
    ),

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
export type PokerVariant = "jacks-or-better" | "bonus-poker" | "deuces-wild";

export const gameApi = {
  startSession: (betAmount: number, variant: PokerVariant = "jacks-or-better", clientSeed?: string) =>
    withClientSeed("Video poker", clientSeed, (seed) =>
      request<{
        sessionId: string;
        gameType: string;
        serverSeedHash: string;
        clientSeed: string;
        nextServerSeedHash?: string; // H-2 chain commitment for the next session
      }>(
        "/game/start-session",
        { method: "POST", body: JSON.stringify({ betAmount, variant, clientSeed: seed }) },
      ),
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

// Wallet — session-less cashout (POST /wallet/cashout). Same server gates as
// /game/cashout. idempotencyKey ([A-Za-z0-9_-]{8,64}) makes a retry of the same
// request return the original voucher instead of cashing out twice.
export function newIdempotencyKey(): string {
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const walletApi = {
  cashout: async (
    coinsToCashout: number,
    idempotencyKey?: string,
  ): Promise<{ voucherId: string; mintStatus: string; newBalance: number }> => {
    const attestHeaders = await getAttestationHeaders();
    const resp = await request<SignedBalanceResponse & { voucherId: string; mintStatus: string }>(
      "/wallet/cashout",
      {
        method: "POST",
        body: JSON.stringify(idempotencyKey ? { coinsToCashout, idempotencyKey } : { coinsToCashout }),
        headers: attestHeaders,
      },
    );
    const newBalance = extractVerifiedBalance(resp);
    return { voucherId: resp.voucherId, mintStatus: resp.mintStatus, newBalance };
  },
};

// Roulette
export type RouletteBetType =
  | "straight" | "split" | "street" | "corner" | "line"
  | "dozen" | "column" | "red" | "black" | "odd" | "even" | "high" | "low";

export interface RouletteBet {
  type: RouletteBetType;
  amount: number;
  numbers?: number[]; // inside bets
  value?: number;     // dozen/column selector (1|2|3)
}

export interface RouletteBetResult extends RouletteBet {
  won: boolean;
  payout: number;
}

export interface RouletteSpinResult {
  winningNumber: number;
  color: "red" | "black" | "green";
  totalWagered: number;
  totalReturn: number;
  netProfit: number;
  results: RouletteBetResult[];
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  newBalance: number;
}

export const rouletteApi = {
  startSession: (clientSeed?: string) =>
    withClientSeed("Roulette", clientSeed, (seed) =>
      request<{
        sessionId: string;
        gameType: string;
        serverSeedHash: string;
        clientSeed: string;
        nextServerSeedHash?: string;
      }>("/roulette/start-session", { method: "POST", body: JSON.stringify({ clientSeed: seed }) }),
    ),

  spin: async (sessionId: string, bets: RouletteBet[]): Promise<RouletteSpinResult> => {
    const resp = await request<
      SignedBalanceResponse & Omit<RouletteSpinResult, "newBalance">
    >("/roulette/spin", {
      method: "POST",
      body: JSON.stringify({ sessionId, bets }),
    });
    const newBalance = extractVerifiedBalance(resp);
    return {
      winningNumber: resp.winningNumber,
      color: resp.color,
      totalWagered: resp.totalWagered,
      totalReturn: resp.totalReturn,
      netProfit: resp.netProfit,
      results: resp.results,
      serverSeed: resp.serverSeed,
      serverSeedHash: resp.serverSeedHash,
      clientSeed: resp.clientSeed,
      nonce: resp.nonce,
      newBalance,
    };
  },
};

// Blackjack
export type BlackjackActionName = "hit" | "stand" | "double" | "split";
export type BlackjackPhase = "insurance" | "player" | "dealer" | "settled";

export interface BlackjackHandView {
  cards: number[];
  value: number;
  soft: boolean;
  bet: number;
  busted: boolean;
  done: boolean;
  isSplitAces: boolean;
}

export interface BlackjackRound {
  phase: BlackjackPhase;
  dealer: number[];
  dealerValue: number;
  dealerHoleHidden: boolean;
  hands: BlackjackHandView[];
  active: number;
  insurance: number;
  legalActions: BlackjackActionName[];
  results?: { outcome: string; bet: number; ret: number }[];
  totalWagered: number;
  totalReturn?: number;
  netProfit?: number;
  serverSeedHash: string;
  clientSeed: string;
  serverSeed?: string; // revealed only when settled
  numDecks?: number;
  newBalance: number;
}

type RawRound = SignedBalanceResponse & Omit<BlackjackRound, "newBalance">;

function toRound(resp: RawRound): BlackjackRound {
  const newBalance = extractVerifiedBalance(resp); // verifies the signed balance
  const { coinBalance: _c, balanceSig: _b, sigTimestamp: _t, sigAlg: _a, ...rest } = resp;
  return { ...(rest as Omit<BlackjackRound, "newBalance">), newBalance };
}

export const blackjackApi = {
  startSession: (clientSeed?: string) =>
    withClientSeed("Blackjack", clientSeed, (seed) =>
      request<{
        sessionId: string;
        gameType: string;
        serverSeedHash: string;
        clientSeed: string;
        nextServerSeedHash?: string;
        numDecks: number;
        dealerHitsSoft17: boolean;
      }>("/blackjack/start-session", { method: "POST", body: JSON.stringify({ clientSeed: seed }) }),
    ),

  deal: async (sessionId: string, bet: number): Promise<BlackjackRound> =>
    toRound(await request<RawRound>("/blackjack/deal", { method: "POST", body: JSON.stringify({ sessionId, bet }) })),

  action: async (sessionId: string, action: BlackjackActionName): Promise<BlackjackRound> =>
    toRound(await request<RawRound>("/blackjack/action", { method: "POST", body: JSON.stringify({ sessionId, action }) })),

  insurance: async (sessionId: string, take: boolean): Promise<BlackjackRound> =>
    toRound(await request<RawRound>("/blackjack/insurance", { method: "POST", body: JSON.stringify({ sessionId, take }) })),
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
