import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "settings.v1";

interface Persisted {
  soundOn: boolean;
  voiceOn: boolean;
  hapticsOn: boolean;
  reduceMotion: boolean;
  onboardingSeen: boolean;
  ageConfirmedLocal: boolean;
  sessionReminderMin: number;
}

interface SettingsState extends Persisted {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof Persisted>(key: K, value: Persisted[K]) => void;
}

const DEFAULTS: Persisted = {
  soundOn: true,
  voiceOn: true,
  hapticsOn: true,
  reduceMotion: false,
  onboardingSeen: false,
  ageConfirmedLocal: false,
  sessionReminderMin: 60,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
      set({ ...DEFAULTS, ...saved, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  set: (key, value) => {
    set({ [key]: value } as Pick<Persisted, typeof key>);
    const s = get();
    const snapshot: Persisted = {
      soundOn: s.soundOn,
      voiceOn: s.voiceOn,
      hapticsOn: s.hapticsOn,
      reduceMotion: s.reduceMotion,
      onboardingSeen: s.onboardingSeen,
      ageConfirmedLocal: s.ageConfirmedLocal,
      sessionReminderMin: s.sessionReminderMin,
    };
    AsyncStorage.setItem(KEY, JSON.stringify(snapshot)).catch(() => null);
  },
}));
