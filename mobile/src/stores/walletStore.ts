import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const JWT_KEY = "nfpg_jwt";
const WALLET_KEY = "nfpg_wallet";
const USERID_KEY = "nfpg_userid";

interface WalletState {
  address: string | null;
  userId: string | null;
  jwtToken: string | null;
  isConnecting: boolean;
  isAuthenticated: boolean;
  connect: (address: string) => void;
  setJwt: (token: string, userId: string) => void;
  disconnect: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  userId: null,
  jwtToken: null,
  isConnecting: false,
  isAuthenticated: false,

  connect: (address) => {
    SecureStore.setItemAsync(WALLET_KEY, address).catch(() => null);
    set({ address, isConnecting: false });
  },

  setJwt: (token, userId) => {
    SecureStore.setItemAsync(JWT_KEY, token).catch(() => null);
    SecureStore.setItemAsync(USERID_KEY, userId).catch(() => null);
    set({ jwtToken: token, userId, isAuthenticated: true });
  },

  disconnect: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(JWT_KEY).catch(() => null),
      SecureStore.deleteItemAsync(WALLET_KEY).catch(() => null),
      SecureStore.deleteItemAsync(USERID_KEY).catch(() => null),
    ]);
    set({ address: null, userId: null, jwtToken: null, isAuthenticated: false });
  },

  hydrate: async () => {
    const [token, address, userId] = await Promise.all([
      SecureStore.getItemAsync(JWT_KEY).catch(() => null),
      SecureStore.getItemAsync(WALLET_KEY).catch(() => null),
      SecureStore.getItemAsync(USERID_KEY).catch(() => null),
    ]);
    if (token && address && userId) {
      set({ jwtToken: token, address, userId, isAuthenticated: true });
    }
  },
}));
