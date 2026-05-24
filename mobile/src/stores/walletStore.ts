import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const JWT_KEY = "nfpg_jwt";
const WALLET_KEY = "nfpg_wallet";
const USERID_KEY = "nfpg_userid";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "authenticating"
  | "connected"
  | "authenticated"
  | "error";

interface WalletState {
  address: string | null;
  userId: string | null;
  jwtToken: string | null;
  isConnecting: boolean;
  isAuthenticated: boolean;
  ageConfirmed: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  networkMismatch: boolean;
  connect: (address: string) => void;
  setJwt: (token: string, userId?: string, ageConfirmed?: boolean) => void;
  setAgeConfirmed: () => void;
  setStatus: (status: ConnectionStatus) => void;
  setConnectionError: (error: string | null) => void;
  setNetworkMismatch: (mismatch: boolean) => void;
  disconnect: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  userId: null,
  jwtToken: null,
  isConnecting: false,
  isAuthenticated: false,
  ageConfirmed: false,
  connectionStatus: "idle",
  connectionError: null,
  networkMismatch: false,

  connect: (address) => {
    SecureStore.setItemAsync(WALLET_KEY, address).catch(() => null);
    set({ address, isConnecting: false, connectionStatus: "connected" });
  },

  setJwt: (token, userId, ageConfirmed = false) => {
    SecureStore.setItemAsync(JWT_KEY, token).catch(() => null);
    if (userId) SecureStore.setItemAsync(USERID_KEY, userId).catch(() => null);
    set({
      jwtToken: token,
      userId: userId ?? null,
      isAuthenticated: true,
      ageConfirmed,
      connectionStatus: "authenticated",
    });
  },

  setAgeConfirmed: () => set({ ageConfirmed: true }),

  setStatus: (status) => set({ connectionStatus: status }),

  setConnectionError: (error) =>
    set({
      connectionError: error,
      connectionStatus: error ? "error" : "idle",
    }),

  setNetworkMismatch: (mismatch) => set({ networkMismatch: mismatch }),

  disconnect: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(JWT_KEY).catch(() => null),
      SecureStore.deleteItemAsync(WALLET_KEY).catch(() => null),
      SecureStore.deleteItemAsync(USERID_KEY).catch(() => null),
    ]);
    set({
      address: null,
      userId: null,
      jwtToken: null,
      isAuthenticated: false,
      ageConfirmed: false,
      connectionStatus: "idle",
      connectionError: null,
      networkMismatch: false,
    });
  },

  hydrate: async () => {
    const [token, address, userId] = await Promise.all([
      SecureStore.getItemAsync(JWT_KEY).catch(() => null),
      SecureStore.getItemAsync(WALLET_KEY).catch(() => null),
      SecureStore.getItemAsync(USERID_KEY).catch(() => null),
    ]);
    if (token && address && userId) {
      set({
        jwtToken: token,
        address,
        userId,
        isAuthenticated: true,
        connectionStatus: "authenticated",
      });
      // ageConfirmed is fetched fresh from server on next auth check — not persisted locally
    }
  },
}));
