import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Storage } from "@reown/appkit-react-native";

// AppKit persists its session/pairing state through this Storage adapter so a connected
// wallet survives app restarts. Backed by AsyncStorage (already a project dependency).
function parse<T>(value: string | null): T | undefined {
  if (value == null) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export const storage: Storage = {
  async getKeys(): Promise<string[]> {
    return [...(await AsyncStorage.getAllKeys())];
  },
  async getEntries<T = unknown>(): Promise<[string, T][]> {
    const keys = await AsyncStorage.getAllKeys();
    const entries = await AsyncStorage.multiGet(keys);
    return entries.map(([key, value]) => [key, parse<T>(value) as T]);
  },
  async getItem<T = unknown>(key: string): Promise<T | undefined> {
    return parse<T>(await AsyncStorage.getItem(key));
  },
  async setItem<T = unknown>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
