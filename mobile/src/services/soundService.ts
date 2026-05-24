import { Audio } from "expo-av";

// Sound keys
export type SoundKey = "deal" | "hold" | "win" | "bigWin" | "lose" | "coinDrop";

type SoundMap = Partial<Record<SoundKey, Audio.Sound>>;

let sounds: SoundMap = {};
let initialized = false;

// Asset map — add .mp3 files to mobile/src/assets/sounds/ to activate
const SOUND_ASSETS: Record<SoundKey, number | null> = {
  deal: null,      // require("@/assets/sounds/deal.mp3")
  hold: null,      // require("@/assets/sounds/hold.mp3")
  win: null,       // require("@/assets/sounds/win.mp3")
  bigWin: null,    // require("@/assets/sounds/bigwin.mp3")
  lose: null,      // require("@/assets/sounds/lose.mp3")
  coinDrop: null,  // require("@/assets/sounds/coindrop.mp3")
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
