import { create } from "zustand";

// App-wide sheets that any screen (incl. games) can open.
interface UiState {
  iapOpen: boolean;
  cashOutOpen: boolean;
  connectOpen: boolean;
  openIAP: () => void;
  openCashOut: () => void;
  openConnect: () => void;
  closeAll: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  iapOpen: false,
  cashOutOpen: false,
  connectOpen: false,
  openIAP: () => set({ iapOpen: true, cashOutOpen: false, connectOpen: false }),
  openCashOut: () => set({ cashOutOpen: true, iapOpen: false, connectOpen: false }),
  openConnect: () => set({ connectOpen: true, iapOpen: false, cashOutOpen: false }),
  closeAll: () => set({ iapOpen: false, cashOutOpen: false, connectOpen: false }),
}));
