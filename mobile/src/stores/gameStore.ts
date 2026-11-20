import { create } from "zustand";
import type { PokerVariant } from "@/services/api";

export type GamePhase = "idle" | "session_started" | "dealt" | "drawn" | "cashed_out";

export interface GameSession {
  sessionId: string;
  serverSeedHash: string;
  clientSeed: string;
  betAmount: number;
}

export interface DealtState {
  dealtCards: number[];
  holds: boolean[];
}

export interface DrawResult {
  drawnCards: number[];
  rank: string;
  payout: number;
  serverSeed: string;
}

interface GameState {
  phase: GamePhase;
  coinBalance: number;
  session: GameSession | null;
  dealt: DealtState | null;
  result: DrawResult | null;
  betAmount: number;
  variant: PokerVariant;

  setBalance: (balance: number) => void;
  setBetAmount: (amount: number) => void;
  setVariant: (variant: PokerVariant) => void;
  setSession: (session: GameSession) => void;
  setDealt: (cards: number[]) => void;
  toggleHold: (index: number) => void;
  setResult: (result: DrawResult, newBalance: number) => void;
  reset: () => void;
}

const INITIAL: Pick<GameState, "phase" | "session" | "dealt" | "result" | "betAmount" | "variant"> = {
  phase: "idle",
  session: null,
  dealt: null,
  result: null,
  betAmount: 1,
  variant: "jacks-or-better",
};

export const useGameStore = create<GameState>((set) => ({
  ...INITIAL,
  coinBalance: 0,

  setBalance: (balance) => set({ coinBalance: balance }),

  setBetAmount: (amount) => set({ betAmount: Math.min(5, Math.max(1, amount)) }),

  // Variant is locked mid-hand; switching only applies between hands.
  setVariant: (variant) =>
    set((state) => (state.phase === "dealt" ? state : { variant })),

  setSession: (session) =>
    set({ session, phase: "session_started", dealt: null, result: null }),

  setDealt: (dealtCards) =>
    set({
      phase: "dealt",
      dealt: { dealtCards, holds: [false, false, false, false, false] },
    }),

  toggleHold: (index) =>
    set((state) => {
      if (!state.dealt) return state;
      const holds = [...state.dealt.holds];
      holds[index] = !holds[index];
      return { dealt: { ...state.dealt, holds } };
    }),

  setResult: (result, newBalance) =>
    set({ result, phase: "drawn", coinBalance: newBalance }),

  // Keeps bet size, variant and balance — only the hand state is cleared.
  reset: () => set({ phase: "idle", session: null, dealt: null, result: null }),
}));
