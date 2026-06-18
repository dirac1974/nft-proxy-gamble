import { Audio } from "expo-av";

// Sound keys
export type SoundKey = "deal" | "hold" | "win" | "bigWin" | "lose" | "coinDrop";

type SoundMap = Partial<Record<SoundKey, Audio.Sound>>;

let sounds: SoundMap = {};
let initialized = false;

// Asset map — generated WAVs (see mobile/scripts/gen-sfx.mjs)
const SOUND_ASSETS: Record<SoundKey, number | null> = {
  deal: require("@/assets/sounds/deal.wav"),
  hold: require("@/assets/sounds/hold.wav"),
  win: require("@/assets/sounds/win.wav"),
  bigWin: require("@/assets/sounds/bigWin.wav"),
  lose: require("@/assets/sounds/lose.wav"),
  coinDrop: require("@/assets/sounds/coin.wav"),
};

export async function initSounds(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: false,
    staysActiveInBackground: false,
  });

  for (const [key, asset] of Object.entries(SOUND_ASSETS) as [SoundKey, number | null][]) {
    if (!asset) continue;
    try {
      const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: false });
      sounds[key] = sound;
    } catch {
      // Missing asset — no-op; game still works without sound
    }
  }
}

export async function playSound(key: SoundKey): Promise<void> {
  const sound = sounds[key];
  if (!sound) return;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Sound system error — swallow silently
  }
}

export async function unloadSounds(): Promise<void> {
  for (const sound of Object.values(sounds)) {
    await sound?.unloadAsync().catch(() => null);
  }
  sounds = {};
  initialized = false;
}
