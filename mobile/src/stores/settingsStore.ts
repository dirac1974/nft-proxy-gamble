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
  // True once the user picks a reminder interval themselves; until then we may move them to a new default.
  sessionReminderCustom: boolean;
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
  sessionReminderMin: 30,
  sessionReminderCustom: false,
};

// Older builds defaulted to 60 and persisted it without a "custom" flag. A stored 60 without the flag is the
// old default, so move it to the new default; any other stored value was a user choice and is kept.
const LEGACY_REMINDER_DEFAULT = 60;

export function migrateSettings(saved: Partial<Persisted>): Persisted {
  const merged: Persisted = { ...DEFAULTS, ...saved };
  if (saved.sessionReminderCustom === undefined && saved.sessionReminderMin !== undefined) {
    if (saved.sessionReminderMin === LEGACY_REMINDER_DEFAULT) {
      merged.sessionReminderMin = DEFAULTS.sessionReminderMin;
      merged.sessionReminderCustom = false;
    } else {
      merged.sessionReminderCustom = true;
    }
  }
  if (!merged.sessionReminderCustom) merged.sessionReminderMin = DEFAULTS.sessionReminderMin;
  return merged;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
      set({ ...migrateSettings(saved), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  set: (key, value) => {
    set({ [key]: value } as Pick<Persisted, typeof key>);
    if (key === "sessionReminderMin") set({ sessionReminderCustom: true });
    const s = get();
    const snapshot: Persisted = {
      soundOn: s.soundOn,
      voiceOn: s.voiceOn,
      hapticsOn: s.hapticsOn,
      reduceMotion: s.reduceMotion,
      onboardingSeen: s.onboardingSeen,
      ageConfirmedLocal: s.ageConfirmedLocal,
      sessionReminderMin: s.sessionReminderMin,
      sessionReminderCustom: s.sessionReminderCustom,
    };
    AsyncStorage.setItem(KEY, JSON.stringify(snapshot)).catch(() => null);
  },
}));
