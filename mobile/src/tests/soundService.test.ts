import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  initSounds,
  playLoop,
  playSound,
  playVoice,
  preloadGroup,
  preloadRouletteNumber,
  priorityOf,
  stopLoop,
  unloadSounds,
  type SfxKey,
} from "@/services/soundService";
import { SFX_ASSETS, ROULETTE_NUMBER_ASSETS } from "@/assets/sounds/manifest";
import { haptic, resetHapticThrottle } from "@/components/ui/haptics";

// Jest's asset transform gives every require() the same stub — give each asset a distinct id.
jest.mock("@/assets/sounds/manifest", () => {
  const real = jest.requireActual("@/assets/sounds/manifest");
  let id = 1;
  const remap = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(o).map((k) => [k, o[k] === undefined ? undefined : id++]));
  return {
    SFX_ASSETS: remap(real.SFX_ASSETS),
    VOICE_ASSETS: remap(real.VOICE_ASSETS),
    ROULETTE_NUMBER_ASSETS: (real.ROULETTE_NUMBER_ASSETS as unknown[]).map((a) => (a === undefined ? undefined : id++)),
  };
});

interface MockSound {
  asset: number;
  initialStatus: { isLooping?: boolean };
  replayAsync: jest.Mock;
  playAsync: jest.Mock;
  stopAsync: jest.Mock;
  setVolumeAsync: jest.Mock;
  setPositionAsync: jest.Mock;
  __finish: () => void;
}

const createAsync = Audio.Sound.createAsync as unknown as jest.Mock;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
async function sounds(): Promise<MockSound[]> {
  const results = createAsync.mock.results.map((r) => r.value as Promise<{ sound: MockSound }>);
  return (await Promise.all(results)).map((x) => x.sound);
}
async function instancesFor(key: SfxKey): Promise<MockSound[]> {
  return (await sounds()).filter((s) => s.asset === SFX_ASSETS[key] && !s.initialStatus?.isLooping);
}

beforeEach(async () => {
  await unloadSounds();
  createAsync.mockClear();
  useSettingsStore.setState({ soundOn: true, voiceOn: true, hapticsOn: true });
});

describe("lazy loading", () => {
  it("initSounds loads only the core set", async () => {
    await initSounds();
    const assets = new Set((await sounds()).map((s) => s.asset));
    expect(assets.has(SFX_ASSETS.ui_tap)).toBe(true);
    expect(assets.has(SFX_ASSETS.win_big)).toBe(true);
    expect(assets.has(SFX_ASSETS.vp_deal)).toBe(false);
    expect(assets.has(SFX_ASSETS.slot_gong)).toBe(false);
    expect(createAsync.mock.calls.length).toBeLessThan(15);
  });

  it("preloadGroup loads that game's sounds, pooling only rapid-fire keys", async () => {
    await preloadGroup("keno");
    expect(await instancesFor("keno_hit_1")).toHaveLength(1);
    expect(await instancesFor("keno_ball_2")).toHaveLength(1);
    expect(await instancesFor("chip_place")).toHaveLength(3);
    expect(await instancesFor("vp_deal")).toHaveLength(0);
    const before = createAsync.mock.calls.length;
    await preloadGroup("keno");
    expect(createAsync.mock.calls.length).toBe(before);
  });

  it("preloadGroup('slot') preloads loop instances once", async () => {
    await preloadGroup("slot");
    const loopsLoaded = (await sounds()).filter((s) => s.initialStatus?.isLooping);
    expect(loopsLoaded).toHaveLength(2);
    expect(await instancesFor("slot_stop_3")).toHaveLength(3);
  });

  it("auto-loads and plays an unloaded key on first playSound", async () => {
    await playSound("vp_win");
    await flush();
    const [s] = await instancesFor("vp_win");
    expect(s.replayAsync).toHaveBeenCalledTimes(1);
  });

  it("preloadRouletteNumber loads the number voice without playing it", async () => {
    await preloadRouletteNumber(17);
    const s = (await sounds()).find((x) => x.asset === ROULETTE_NUMBER_ASSETS[17]);
    expect(s).toBeDefined();
    expect(s?.replayAsync).not.toHaveBeenCalled();
  });
});

describe("voice cap", () => {
  it("ranks wins above foley above ticks/UI", () => {
    expect(priorityOf("win_big")).toBe(2);
    expect(priorityOf("slot_stop_1")).toBe(2);
    expect(priorityOf("vp_win")).toBe(2);
    expect(priorityOf("card_deal")).toBe(1);
    expect(priorityOf("chip_place")).toBe(1);
    expect(priorityOf("count_tick")).toBe(0);
    expect(priorityOf("ui_tap")).toBe(0);
  });

  it("steals the oldest lowest-priority voice for a higher-priority request", async () => {
    await initSounds();
    await preloadGroup("videopoker");
    await preloadGroup("blackjack");
    // 6 voices: 3 count_tick (low) + 3 vp_credit_tick (low), oldest first.
    for (let i = 0; i < 3; i++) await playSound("count_tick");
    for (let i = 0; i < 3; i++) await playSound("vp_credit_tick");
    const ticks = await instancesFor("count_tick");
    await playSound("win_big");
    const [win] = await instancesFor("win_big");
    expect(win.replayAsync).toHaveBeenCalledTimes(1);
    expect(ticks[0].stopAsync).toHaveBeenCalledTimes(1);
    expect(ticks[1].stopAsync).not.toHaveBeenCalled();
  });

  it("drops a lower-priority request when every voice outranks it", async () => {
    await initSounds();
    await preloadGroup("slot");
    for (let i = 1; i <= 5; i++) await playSound(`slot_stop_${i}` as SfxKey);
    await playSound("win_big");
    await playSound("ui_tap");
    const [tap] = await instancesFor("ui_tap");
    expect(tap.replayAsync).not.toHaveBeenCalled();
  });

  it("releases a voice on didJustFinish", async () => {
    await initSounds();
    await preloadGroup("slot");
    for (let i = 1; i <= 5; i++) await playSound(`slot_stop_${i}` as SfxKey);
    await playSound("win_big");
    const [win] = await instancesFor("win_big");
    win.__finish();
    await playSound("ui_tap");
    const [tap] = await instancesFor("ui_tap");
    expect(tap.replayAsync).toHaveBeenCalledTimes(1);
  });

  it("ducks SFX ~6 dB while a dealer line plays", async () => {
    await initSounds();
    await playVoice("vo_good_luck");
    await playSound("win_small");
    const [win] = await instancesFor("win_small");
    expect(win.replayAsync).toHaveBeenCalledWith({ volume: 0.4 });
  });
});

describe("loops", () => {
  it("never starts a loop that was stopped while still loading", async () => {
    const p = playLoop("slot_spin_loop", 0.5);
    await stopLoop("slot_spin_loop");
    await p;
    const [loop] = (await sounds()).filter((s) => s.initialStatus?.isLooping);
    expect(loop.playAsync).not.toHaveBeenCalled();
  });

  it("reuses the preloaded loop instance on restart", async () => {
    await playLoop("slot_spin_loop", 0.5);
    await stopLoop("slot_spin_loop", 0);
    await playLoop("slot_spin_loop", 0.5);
    const loopsLoaded = (await sounds()).filter((s) => s.initialStatus?.isLooping);
    expect(loopsLoaded).toHaveLength(1);
    expect(loopsLoaded[0].setPositionAsync).toHaveBeenCalledWith(0);
    expect(loopsLoaded[0].playAsync).toHaveBeenCalledTimes(2);
    expect(loopsLoaded[0].stopAsync).toHaveBeenCalledTimes(1);
  });

  it("stops running loops when sound is switched off", async () => {
    await playLoop("slot_fg_loop", 0.5);
    useSettingsStore.setState({ soundOn: false });
    await flush();
    const [loop] = (await sounds()).filter((s) => s.initialStatus?.isLooping);
    expect(loop.stopAsync).toHaveBeenCalled();
  });
});

describe("haptic throttle", () => {
  it("drops light impacts closer than 60 ms", () => {
    const impact = Haptics.impactAsync as jest.Mock;
    impact.mockClear();
    resetHapticThrottle();
    const spy = jest.spyOn(Date, "now").mockReturnValue(1000);
    haptic("light");
    haptic("light");
    spy.mockReturnValue(1070);
    haptic("light");
    haptic("heavy");
    spy.mockRestore();
    expect(impact).toHaveBeenCalledTimes(3);
  });
});
