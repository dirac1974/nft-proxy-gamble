import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const JWT_KEY = "nfpg_jwt";
const WALLET_KEY = "nfpg_wallet";

interface WalletState {
  address: string | null;
  jwtToken: string | null;
  isConnecting: boolean;
  isAuthenticated: boolean;
  connect: (address: string) => void;
  setJwt: (token: string) => void;
  disconnect: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  jwtToken: null,
  isConnecting: false,
  isAuthenticated: false,

  connect: (address) => {
    SecureStore.setItemAsync(WALLET_KEY, address).catch(() => null);
    set({ address, isConnecting: false });
  },

  setJwt: (token) => {
    SecureStore.setItemAsync(JWT_KEY, token).catch(() => null);
    set({ jwtToken: token, isAuthenticated: true });
  },

  disconnect: async () => {
    await SecureStore.deleteItemAsync(JWT_KEY).catch(() => null);
    await SecureStore.deleteItemAsync(WALLET_KEY).catch(() => null);
    set({ address: null, jwtToken: null, isAuthenticated: false });
  },

  hydrate: async () => {
    const [token, address] = await Promise.all([
      SecureStore.getItemAsync(JWT_KEY).catch(() => null),
      SecureStore.getItemAsync(WALLET_KEY).catch(() => null),
    ]);
    if (token && address) {
      set({ jwtToken: token, address, isAuthenticated: true });
    }
  },
}));
