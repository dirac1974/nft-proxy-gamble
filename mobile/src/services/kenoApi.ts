import { extractVerifiedBalance, request } from "./api";
import type { SignedBalanceResponse } from "./balanceVerification";

export type KenoApiMode = "single" | "quad";

export interface KenoSession {
  sessionId: string;
  gameType: string;
  serverSeedHash: string;
  clientSeed: string;
  nextServerSeedHash?: string;
}

export interface KenoCardBet {
  spots: number[];
  bet: number;
}

export interface KenoCardResult {
  cardIndex: number;
  spots: number[];
  hits: number[];
  catches: number;
  multiplier: number;
  bet: number;
  payout: number;
}

export interface KenoPlayResult {
  drawn: number[];
  results: KenoCardResult[];
  totalWagered: number;
  totalReturn: number;
  netProfit: number;
  capped: boolean;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  newBalance: number;
}

export interface KenoPaytableResponse {
  paytable: Record<string, Record<string, number>>;
  betLevels: number[];
  maxWin: number;
  rtpBySpots: Record<string, number>;
}

type RawPlay = SignedBalanceResponse & Omit<KenoPlayResult, "newBalance">;

export const kenoApi = {
  startSession: (mode: KenoApiMode, clientSeed?: string) =>
    request<KenoSession>("/keno/start-session", {
      method: "POST",
      body: JSON.stringify(clientSeed ? { mode, clientSeed } : { mode }),
    }),

  play: async (sessionId: string, cards: KenoCardBet[]): Promise<KenoPlayResult> => {
    const resp = await request<RawPlay>("/keno/play", {
      method: "POST",
      body: JSON.stringify({ sessionId, cards }),
    });
    const newBalance = extractVerifiedBalance(resp);
    return {
      drawn: resp.drawn,
      results: resp.results,
      totalWagered: resp.totalWagered,
      totalReturn: resp.totalReturn,
      netProfit: resp.netProfit,
      capped: resp.capped,
      serverSeed: resp.serverSeed,
      serverSeedHash: resp.serverSeedHash,
      clientSeed: resp.clientSeed,
      nonce: resp.nonce,
      newBalance,
    };
  },

  paytable: () => request<KenoPaytableResponse>("/keno/paytable"),
};
