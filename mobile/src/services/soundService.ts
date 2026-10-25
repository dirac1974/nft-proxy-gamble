import { Audio, type AVPlaybackStatus } from "expo-av";
import { useSettingsStore } from "@/stores/settingsStore";
import { SFX_ASSETS, VOICE_ASSETS, ROULETTE_NUMBER_ASSETS } from "@/assets/sounds/manifest";

// Audio direction: understated casino foley + a single calm dealer voice
// (ElevenLabs, see scripts/gen-audio.mjs). Never celebrate losses; no voice on losses.

export type SfxKey = keyof typeof SFX_ASSETS;
export type VoiceKey = keyof typeof VOICE_ASSETS;
/** @deprecated legacy keys kept for older call sites */
export type LegacySoundKey = "deal" | "hold" | "win" | "bigWin" | "lose" | "coinDrop";
export type SoundKey = SfxKey | LegacySoundKey;
export type PreloadGroup = "videopoker" | "blackjack" | "roulette" | "keno" | "slot";

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
  slot_count_tick: 0.3,
  lose: 0.5,
  card_hold: 0.6,
  vp_deal: 0.55,
  vp_draw: 0.55,
  vp_credit_tick: 0.4,
  vp_hold: 0.55,
  vp_unhold: 0.45,
  vp_game_over: 0.5,
};
const DEFAULT_VOLUME = 0.8;
const volumeOf = (key: SfxKey): number => VOLUME[key] ?? DEFAULT_VOLUME;

// Rapid-fire keys get a small pool so overlapping plays don't cut each other off.
const POOLED = /^(slot_stop|slot_count_tick|count_tick|vp_credit_tick|vp_deal|vp_draw|chip_place)/;
const POOL_SIZE = 3;
const MAX_VOICES = 6;
/** A voice still marked active after this long missed its didJustFinish — reclaim it. */
const STALE_VOICE_MS = 6000;
/** Auto-loaded one-shots older than this when their load completes are dropped, not played late. */
const LATE_PLAY_MS = 300;
const VOICE_DUCK = 0.5; // ≈ −6 dB under a dealer line
const WIN_DUCK = 0.4;
const LOOP_FADE_IN_MS = 80;
const LOOP_FADE_STEPS = 8;

const HIGH = /^(win_|slot_win_|vp_win|slot_gong|slot_stop|slot_fg_intro|slot_scatter_chime)/;
const LOW = /^(ui_|count_tick|slot_count_tick|vp_credit_tick|vp_bet|vp_hold|vp_unhold|keno_mark|keno_unmark)/;
/** 2 = wins/gong/reel stops, 1 = cards/chips/balls/other foley, 0 = ticks/UI. */
export function priorityOf(key: SfxKey): number {
  if (HIGH.test(key)) return 2;
  if (LOW.test(key)) return 0;
  return 1;
}

const CORE: SfxKey[] = ["ui_tap", "ui_toggle", "win_small", "win_medium", "win_big", "push", "lose", "count_tick"];
const LOOP_KEYS = new Set<SfxKey>(["slot_spin_loop", "slot_fg_loop"]);
const ALL_KEYS = Object.keys(SFX_ASSETS) as SfxKey[];
const byPrefix = (...prefixes: string[]): SfxKey[] =>
  ALL_KEYS.filter((k) => prefixes.some((p) => k.startsWith(p)) && !LOOP_KEYS.has(k));
const GROUPS: Record<PreloadGroup, SfxKey[]> = {
  videopoker: byPrefix("vp_"),
  blackjack: byPrefix("card_", "chip_", "shuffle"),
  roulette: byPrefix("chip_", "roulette_", "ball_"),
  keno: byPrefix("keno_", "chip_place"),
  slot: byPrefix("slot_"),
};
const GROUP_LOOPS: Partial<Record<PreloadGroup, SfxKey[]>> = { slot: ["slot_spin_loop", "slot_fg_loop"] };

interface Entry {
  sounds: Audio.Sound[];
  next: number;
}
interface ActiveVoice {
  key: SfxKey;
  priority: number;
  startedAt: number;
  seq: number;
}
interface LoopState {
  sound: Audio.Sound | null;
  want: boolean;
  playing: boolean;
  volume: number;
  gen: number;
}

const loaded = new Map<SfxKey, Entry>();
const loading = new Map<SfxKey, Promise<Entry | null>>();
const active = new Map<Audio.Sound, ActiveVoice>();
let seq = 0;

const loopSounds = new Map<SfxKey, Promise<Audio.Sound | null>>();
const loops = new Map<SfxKey, LoopState>();
let winDucked = false;

const voices = new Map<string, Promise<Audio.Sound | null>>();
let currentVoice: Audio.Sound | null = null;
let voiceDucked = false;
let initPromise: Promise<void> | null = null;

const now = (): number => Date.now();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const soundOn = (): boolean => useSettingsStore.getState().soundOn;
const sfxGain = (): number => (voiceDucked ? VOICE_DUCK : 1);
const loopGain = (st: LoopState): number => st.volume * (winDucked ? WIN_DUCK : 1) * (voiceDucked ? VOICE_DUCK : 1);
const finished = (s: AVPlaybackStatus): boolean => s.isLoaded && s.didJustFinish;

// ---------- one-shot loading ----------

function load(key: SfxKey): Promise<Entry | null> {
  const have = loaded.get(key);
  if (have) return Promise.resolve(have);
  const pending = loading.get(key);
  if (pending) return pending;
  const asset = SFX_ASSETS[key];
  const p = (async (): Promise<Entry | null> => {
    if (asset === undefined) return null;
    try {
      const count = POOLED.test(key) ? POOL_SIZE : 1;
      const sounds = await Promise.all(
        Array.from({ length: count }, () =>
          Audio.Sound.createAsync(asset, { shouldPlay: false, volume: volumeOf(key) }).then((r) => r.sound),
        ),
      );
      for (const s of sounds) s.setOnPlaybackStatusUpdate((st) => finished(st) && release(s));
      const entry: Entry = { sounds, next: 0 };
      loaded.set(key, entry);
      return entry;
    } catch {
      return null; // Missing/unsupported asset — game works silently.
    } finally {
      loading.delete(key);
    }
  })();
  loading.set(key, p);
  return p;
}

const loadAll = (keys: SfxKey[]): Promise<void> => Promise.all(keys.map(load)).then(() => undefined);

/** Load a game's sounds on mount so the first hand/spin has no load latency. */
export function preloadGroup(group: PreloadGroup): Promise<void> {
  const loopKeys = GROUP_LOOPS[group] ?? [];
  return Promise.all([loadAll(GROUPS[group] ?? []), ...loopKeys.map(loadLoop)]).then(() => undefined);
}

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
    await loadAll(CORE);
  })();
  return initPromise;
}

// ---------- voice cap ----------

function release(sound: Audio.Sound): void {
  active.delete(sound);
}

/** Free a slot for a request of `priority`; returns false when every voice outranks it. */
function claimSlot(priority: number): boolean {
  const t = now();
  for (const [s, v] of active) if (t - v.startedAt > STALE_VOICE_MS) active.delete(s);
  if (active.size < MAX_VOICES) return true;
  let victim: [Audio.Sound, ActiveVoice] | null = null;
  for (const e of active) {
    const [, v] = e;
    if (!victim || v.priority < victim[1].priority || (v.priority === victim[1].priority && v.seq < victim[1].seq)) {
      victim = e;
    }
  }
  if (!victim || victim[1].priority > priority) return false;
  active.delete(victim[0]);
  victim[0].stopAsync().catch(() => null);
  return true;
}

function pickInstance(entry: Entry): Audio.Sound {
  const idle = entry.sounds.find((s) => !active.has(s));
  if (idle) return idle;
  const s = entry.sounds[entry.next];
  entry.next = (entry.next + 1) % entry.sounds.length;
  return s;
}

function start(key: SfxKey, entry: Entry): void {
  if (!soundOn()) return;
  const sound = pickInstance(entry);
  active.delete(sound); // retriggering a busy pool member restarts it
  if (!claimSlot(priorityOf(key))) return;
  active.set(sound, { key, priority: priorityOf(key), startedAt: now(), seq: ++seq });
  sound.replayAsync({ volume: volumeOf(key) * sfxGain() }).catch(() => release(sound));
}

export async function playSound(key: SoundKey): Promise<void> {
  if (!soundOn()) return;
  const resolved: SfxKey = key in LEGACY ? LEGACY[key as LegacySoundKey] : (key as SfxKey);
  const entry = loaded.get(resolved);
  // Fire-and-forget: callers never wait on audio latency.
  if (entry) return start(resolved, entry);
  const requested = now();
  void load(resolved).then((e) => {
    if (e && now() - requested <= LATE_PLAY_MS) start(resolved, e);
  });
}

export async function stopSound(key: SfxKey): Promise<void> {
  const entry = loaded.get(key);
  if (!entry) return;
  await Promise.all(
    entry.sounds.map((s) => {
      release(s);
      return s.stopAsync().catch(() => null);
    }),
  );
}

/** Classic cabinet BET ONE beep — pitch rises with the coin count (1–5). */
export function playBetBeep(coins: number): Promise<void> {
  const n = Math.min(5, Math.max(1, Math.round(coins)));
  return playSound(`vp_bet${n}` as SfxKey);
}

// ---------- loops ----------

function loadLoop(key: SfxKey): Promise<Audio.Sound | null> {
  const have = loopSounds.get(key);
  if (have) return have;
  const asset = SFX_ASSETS[key];
  const p = asset === undefined
    ? Promise.resolve(null)
    : Audio.Sound.createAsync(asset, { shouldPlay: false, isLooping: true, volume: 0 })
        .then((r) => r.sound)
        .catch(() => {
          loopSounds.delete(key);
          return null;
        });
  loopSounds.set(key, p);
  return p;
}

function loopState(key: SfxKey): LoopState {
  let st = loops.get(key);
  if (!st) {
    st = { sound: null, want: false, playing: false, volume: 0.7, gen: 0 };
    loops.set(key, st);
  }
  return st;
}

/** Start a seamless loop (e.g. reel spin, free-games music) with an 80 ms fade-in. */
export async function playLoop(key: SfxKey, volume = 0.7): Promise<void> {
  if (!soundOn()) return;
  const st = loopState(key);
  st.volume = volume;
  if (st.want && st.playing) return;
  st.want = true;
  const gen = ++st.gen;
  const live = (): boolean => st.want && st.gen === gen && soundOn();
  const sound = await loadLoop(key);
  if (!sound) return;
  st.sound = sound;
  if (!live()) return; // stopped while loading — never start late
  try {
    await sound.setVolumeAsync(0);
    await sound.setPositionAsync(0);
    if (!live()) return;
    await sound.playAsync();
    if (!live()) {
      if (!st.want) await sound.stopAsync();
      return;
    }
    st.playing = true;
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      if (!live()) return;
      await sound.setVolumeAsync((loopGain(st) * i) / steps);
      if (i < steps) await sleep(LOOP_FADE_IN_MS / steps);
    }
  } catch {
    // Optional audio.
  }
}

/** Stop a loop with an 8-step fade to avoid clicks. Safe to call while the loop is still loading. */
export async function stopLoop(key: SfxKey, fadeMs = 80): Promise<void> {
  const st = loops.get(key);
  if (!st || !st.want) return;
  st.want = false;
  const gen = ++st.gen;
  const sound = st.sound;
  if (!sound) return; // still loading: playLoop sees want=false and never starts
  try {
    if (st.playing && fadeMs > 0) {
      const from = loopGain(st);
      for (let i = LOOP_FADE_STEPS - 1; i >= 0; i--) {
        if (st.gen !== gen) return; // restarted mid-fade
        await sound.setVolumeAsync((from * i) / LOOP_FADE_STEPS);
        await sleep(fadeMs / LOOP_FADE_STEPS);
      }
    }
    if (st.gen !== gen) return;
    st.playing = false;
    await sound.stopAsync();
  } catch {
    // ignore
  }
}

export function stopAllLoops(fadeMs = 0): Promise<void> {
  return Promise.all([...loops.keys()].map((k) => stopLoop(k, fadeMs))).then(() => undefined);
}

function applyLoopVolumes(): void {
  for (const st of loops.values()) {
    if (st.playing && st.want && st.sound) st.sound.setVolumeAsync(loopGain(st)).catch(() => null);
  }
}

/** Lower running loops under a win cue (0.4×), restore afterwards. */
export function duckLoops(on: boolean): void {
  winDucked = on;
  applyLoopVolumes();
}

// ---------- dealer voice ----------

function setVoiceDuck(on: boolean): void {
  if (voiceDucked === on) return;
  voiceDucked = on;
  applyLoopVolumes();
}

function loadVoice(id: string, asset: number | undefined): Promise<Audio.Sound | null> {
  if (asset === undefined) return Promise.resolve(null);
  const have = voices.get(id);
  if (have) return have;
  const p = Audio.Sound.createAsync(asset, { shouldPlay: false, volume: 1 })
    .then(({ sound }) => {
      sound.setOnPlaybackStatusUpdate((st) => {
        if (finished(st) && currentVoice === sound) {
          currentVoice = null;
          setVoiceDuck(false);
        }
      });
      return sound;
    })
    .catch(() => {
      voices.delete(id);
      return null;
    });
  voices.set(id, p);
  return p;
}

async function playVoiceAsset(id: string, asset: number | undefined): Promise<void> {
  const s = useSettingsStore.getState();
  if (!s.soundOn || !s.voiceOn || asset === undefined) return;
  try {
    const sound = await loadVoice(id, asset);
    if (!sound) return;
    if (currentVoice && currentVoice !== sound) await currentVoice.stopAsync().catch(() => null);
    currentVoice = sound;
    setVoiceDuck(true);
    await sound.replayAsync();
  } catch {
    currentVoice = null;
    setVoiceDuck(false); // Voice is optional.
  }
}

export function playVoice(key: VoiceKey): Promise<void> {
  return playVoiceAsset(key, VOICE_ASSETS[key]);
}

export function playRouletteNumber(n: number): Promise<void> {
  return playVoiceAsset(`n${n}`, ROULETTE_NUMBER_ASSETS[n]);
}

/** Load the number call ahead of the reveal so it lands on the ball drop. */
export function preloadRouletteNumber(n: number): Promise<void> {
  return loadVoice(`n${n}`, ROULETTE_NUMBER_ASSETS[n]).then(() => undefined);
}

// ---------- global ----------

function silenceAll(): void {
  void stopAllLoops(0);
  for (const s of active.keys()) s.stopAsync().catch(() => null);
  active.clear();
  currentVoice?.stopAsync().catch(() => null);
  currentVoice = null;
  setVoiceDuck(false);
}

useSettingsStore.subscribe((s, prev) => {
  if (prev.soundOn && !s.soundOn) silenceAll();
});

export async function unloadSounds(): Promise<void> {
  await stopAllLoops(0);
  const oneShots = [...loaded.values()].flatMap((e) => e.sounds);
  const loopList = await Promise.all(loopSounds.values());
  const voiceList = await Promise.all(voices.values());
  await Promise.all(
    [...oneShots, ...loopList, ...voiceList].map((s) => s?.unloadAsync().catch(() => null)),
  );
  loaded.clear();
  loading.clear();
  active.clear();
  loopSounds.clear();
  loops.clear();
  voices.clear();
  currentVoice = null;
  voiceDucked = false;
  winDucked = false;
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
