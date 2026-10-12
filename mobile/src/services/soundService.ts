import { Audio } from "expo-av";
import { useSettingsStore } from "@/stores/settingsStore";
import { SFX_ASSETS, VOICE_ASSETS, ROULETTE_NUMBER_ASSETS } from "@/assets/sounds/manifest";

// Audio direction: understated casino foley + a single calm dealer voice
// (ElevenLabs, see scripts/gen-audio.mjs). Never celebrate losses; no voice on losses.

export type SfxKey = keyof typeof SFX_ASSETS;
export type VoiceKey = keyof typeof VOICE_ASSETS;
/** @deprecated legacy keys kept for older call sites */
export type LegacySoundKey = "deal" | "hold" | "win" | "bigWin" | "lose" | "coinDrop";
export type SoundKey = SfxKey | LegacySoundKey;

const LEGACY: Record<LegacySoundKey, SfxKey> = {
  deal: "card_deal",
  hold: "card_hold",
  win: "win_small",
  bigWin: "win_big",
  lose: "lose",
  coinDrop: "chip_place",
};

const VOLUME: Partial<Record<SfxKey, number>> = {
  ui_tap: 0.35,
  ui_toggle: 0.45,
  count_tick: 0.3,
  lose: 0.5,
  card_hold: 0.6,
};

const sfx: Partial<Record<SfxKey, Audio.Sound>> = {};
const voices = new Map<string, Audio.Sound>();
let initPromise: Promise<void> | null = null;
let currentVoice: Audio.Sound | null = null;

export function initSounds(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch {
      // Audio mode unavailable (tests/web) — continue.
    }
    await Promise.all(
      (Object.entries(SFX_ASSETS) as [SfxKey, number][]).map(async ([key, asset]) => {
        try {
          const { sound } = await Audio.Sound.createAsync(asset, {
            shouldPlay: false,
            volume: VOLUME[key] ?? 0.8,
          });
          sfx[key] = sound;
        } catch {
          // Missing/unsupported asset — game works silently.
        }
      }),
    );
  })();
  return initPromise;
}

export async function playSound(key: SoundKey): Promise<void> {
  if (!useSettingsStore.getState().soundOn) return;
  const resolved: SfxKey = key in LEGACY ? LEGACY[key as LegacySoundKey] : (key as SfxKey);
  const sound = sfx[resolved];
  if (!sound) return;
  try {
    await sound.replayAsync();
  } catch {
    // Swallow audio errors.
  }
}

export async function stopSound(key: SfxKey): Promise<void> {
  await sfx[key]?.stopAsync().catch(() => null);
}

async function playVoiceAsset(id: string, asset: number | undefined): Promise<void> {
  const s = useSettingsStore.getState();
  if (!s.soundOn || !s.voiceOn || asset === undefined) return;
  try {
    let sound = voices.get(id);
    if (!sound) {
      ({ sound } = await Audio.Sound.createAsync(asset, { shouldPlay: false, volume: 1 }));
      voices.set(id, sound);
    }
    if (currentVoice && currentVoice !== sound) await currentVoice.stopAsync().catch(() => null);
    currentVoice = sound;
    await sound.replayAsync();
  } catch {
    // Voice is optional.
  }
}

export function playVoice(key: VoiceKey): Promise<void> {
  return playVoiceAsset(key, VOICE_ASSETS[key]);
}

export function playRouletteNumber(n: number): Promise<void> {
  return playVoiceAsset(`n${n}`, ROULETTE_NUMBER_ASSETS[n]);
}

export async function unloadSounds(): Promise<void> {
  const all = [...Object.values(sfx), ...voices.values()];
  await Promise.all(all.map((s) => s?.unloadAsync().catch(() => null)));
  for (const k of Object.keys(sfx)) delete sfx[k as SfxKey];
  voices.clear();
  currentVoice = null;
  initPromise = null;
}

/** Pick the win sound by NET result relative to stake (responsible-gaming: no fanfare for pushes/losses). */
export function winSoundFor(net: number, bet: number): SfxKey {
  if (net < 0) return "lose";
  if (net === 0) return "push";
  const mult = bet > 0 ? net / bet : 0;
  if (mult >= 25) return "win_big";
  if (mult >= 5) return "win_medium";
  return "win_small";
}
