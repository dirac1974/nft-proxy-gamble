import { create } from "zustand";

// App-wide sheets that any screen (incl. games) can open.
interface UiState {
  iapOpen: boolean;
  cashOutOpen: boolean;
  connectOpen: boolean;
  // True once the user starts a wallet connection from the Connect sheet, so the
  // sheet can re-surface with progress/errors after the WalletConnect modal closes.
  connectPending: boolean;
  openIAP: () => void;
  openCashOut: () => void;
  openConnect: () => void;
  setConnectPending: (pending: boolean) => void;
  closeAll: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  iapOpen: false,
  cashOutOpen: false,
  connectOpen: false,
  connectPending: false,
  openIAP: () => set({ iapOpen: true, cashOutOpen: false, connectOpen: false }),
  openCashOut: () => set({ cashOutOpen: true, iapOpen: false, connectOpen: false }),
  openConnect: () => set({ connectOpen: true, iapOpen: false, cashOutOpen: false }),
  setConnectPending: (connectPending) => set({ connectPending }),
  closeAll: () => set({ iapOpen: false, cashOutOpen: false, connectOpen: false }),
}));
