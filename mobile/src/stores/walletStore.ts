import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const JWT_KEY = "nfpg_jwt";
const WALLET_KEY = "nfpg_wallet";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "authenticating"
  | "authenticated"
  | "error";

interface WalletState {
  address: string | null;
  jwtToken: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  networkMismatch: boolean;
  isAuthenticated: boolean;

  setStatus: (status: ConnectionStatus) => void;
  setConnectionError: (error: string | null) => void;
  setNetworkMismatch: (mismatch: boolean) => void;
  connect: (address: string) => void;
  setJwt: (token: string) => void;
  disconnect: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  jwtToken: null,
  connectionStatus: "idle",
  connectionError: null,
  networkMismatch: false,
  isAuthenticated: false,

  setStatus: (connectionStatus) => set({ connectionStatus }),

  setConnectionError: (connectionError) =>
    set({ connectionError, connectionStatus: connectionError ? "error" : "idle" }),

  setNetworkMismatch: (networkMismatch) => set({ networkMismatch }),

  connect: (address) => {
    SecureStore.setItemAsync(WALLET_KEY, address).catch(() => null);
    set({ address, connectionStatus: "connected" });
  },

  setJwt: (token) => {
    SecureStore.setItemAsync(JWT_KEY, token).catch(() => null);
    set({ jwtToken: token, isAuthenticated: true, connectionStatus: "authenticated" });
  },

  disconnect: async () => {
    await SecureStore.deleteItemAsync(JWT_KEY).catch(() => null);
    await SecureStore.deleteItemAsync(WALLET_KEY).catch(() => null);
    set({
      address: null,
      jwtToken: null,
      isAuthenticated: false,
      connectionStatus: "idle",
      connectionError: null,
      networkMismatch: false,
    });
  },

  hydrate: async () => {
    const [token, address] = await Promise.all([
      SecureStore.getItemAsync(JWT_KEY).catch(() => null),
      SecureStore.getItemAsync(WALLET_KEY).catch(() => null),
    ]);
    if (token && address) {
      set({ jwtToken: token, address, isAuthenticated: true, connectionStatus: "authenticated" });
    }
  },
}));
