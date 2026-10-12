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
  vp_deal: 0.55,
  vp_draw: 0.55,
  vp_credit_tick: 0.4,
  vp_hold: 0.55,
  vp_unhold: 0.45,
  vp_game_over: 0.5,
};

// Rapid-fire keys get a small pool so overlapping plays don't cut each other off.
const POOLED = /^(keno_ball|keno_hit|slot_stop|count_tick|vp_credit_tick|vp_deal|vp_draw|chip_place)/;
const POOL_SIZE = 3;
const MAX_VOICES = 6;

const sfx: Partial<Record<SfxKey, Audio.Sound>> = {};
const pools: Partial<Record<SfxKey, { sounds: Audio.Sound[]; next: number }>> = {};
const loops = new Map<SfxKey, { sound: Audio.Sound; volume: number }>();
let activeVoices = 0;
let ducked = false;
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
          if (POOLED.test(key)) {
            const extra = await Promise.all(
              Array.from({ length: POOL_SIZE - 1 }, () =>
                Audio.Sound.createAsync(asset, { shouldPlay: false, volume: VOLUME[key] ?? 0.8 }).then((r) => r.sound),
              ),
            );
            pools[key] = { sounds: [sound, ...extra], next: 0 };
          }
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
  const pool = pools[resolved];
  let sound = sfx[resolved];
  if (pool) {
    sound = pool.sounds[pool.next];
    pool.next = (pool.next + 1) % pool.sounds.length;
  }
  if (!sound || activeVoices >= MAX_VOICES) return;
  activeVoices++;
  // Fire-and-forget: callers never wait on audio latency.
  sound
    .replayAsync()
    .catch(() => null)
    .finally(() => {
      setTimeout(() => {
        activeVoices = Math.max(0, activeVoices - 1);
      }, 250);
    });
}

/** Start a seamless loop (e.g. reel spin, free-games music). */
export async function playLoop(key: SfxKey, volume = 0.7): Promise<void> {
  if (!useSettingsStore.getState().soundOn) return;
  const asset = SFX_ASSETS[key];
  if (!asset || loops.has(key)) return;
  try {
    const { sound } = await Audio.Sound.createAsync(asset, {
      shouldPlay: true,
      isLooping: true,
      volume: ducked ? volume * 0.4 : volume,
    });
    loops.set(key, { sound, volume });
  } catch {
    // Optional audio.
  }
}

/** Stop a loop with a short fade to avoid clicks. */
export async function stopLoop(key: SfxKey, fadeMs = 80): Promise<void> {
  const loop = loops.get(key);
  if (!loop) return;
  loops.delete(key);
  const steps = 4;
  try {
    for (let i = steps - 1; i >= 0; i--) {
      await loop.sound.setVolumeAsync((loop.volume * i) / steps);
      await new Promise((r) => setTimeout(r, fadeMs / steps));
    }
    await loop.sound.stopAsync();
    await loop.sound.unloadAsync();
  } catch {
    // ignore
  }
}

/** Lower running loops under a win cue (0.4×), restore afterwards. */
export function duckLoops(on: boolean): void {
  ducked = on;
  for (const { sound, volume } of loops.values()) {
    sound.setVolumeAsync(on ? volume * 0.4 : volume).catch(() => null);
  }
}

/** Classic cabinet BET ONE beep — pitch rises with the coin count (1–5). */
export function playBetBeep(coins: number): Promise<void> {
  const n = Math.min(5, Math.max(1, Math.round(coins)));
  return playSound(`vp_bet${n}` as SfxKey);
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
  for (const k of [...loops.keys()]) await stopLoop(k, 0);
  const pooled = Object.values(pools).flatMap((p) => p?.sounds.slice(1) ?? []);
  const all = [...Object.values(sfx), ...pooled, ...voices.values()];
  await Promise.all(all.map((s) => s?.unloadAsync().catch(() => null)));
  for (const k of Object.keys(sfx)) delete sfx[k as SfxKey];
  for (const k of Object.keys(pools)) delete pools[k as SfxKey];
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
