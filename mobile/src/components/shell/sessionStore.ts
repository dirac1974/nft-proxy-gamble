import { create } from "zustand";

// Play-session bookkeeping for the reality check. In-memory only: a session is one app run.
// net = balance now − balance at session start − coins bought this session + coins cashed out this session.
interface SessionState {
  startedAt: number;
  startBalance: number | null;
  purchased: number;
  cashedOut: number;
  observeBalance: (balance: number) => void;
  recordPurchase: (coins: number) => void;
  recordCashOut: (coins: number) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  startedAt: Date.now(),
  startBalance: null,
  purchased: 0,
  cashedOut: 0,
  observeBalance: (balance) => {
    if (get().startBalance === null && Number.isFinite(balance)) set({ startBalance: balance });
  },
  recordPurchase: (coins) => {
    if (coins > 0 && get().startBalance !== null) set((s) => ({ purchased: s.purchased + coins }));
  },
  recordCashOut: (coins) => {
    if (coins > 0 && get().startBalance !== null) set((s) => ({ cashedOut: s.cashedOut + coins }));
  },
  reset: () => set({ startedAt: Date.now(), startBalance: null, purchased: 0, cashedOut: 0 }),
}));

export function sessionNet(
  balanceNow: number,
  s: Pick<SessionState, "startBalance" | "purchased" | "cashedOut">,
): number | null {
  if (s.startBalance === null) return null;
  return balanceNow - s.startBalance - s.purchased + s.cashedOut;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
