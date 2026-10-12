import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { fonts, palette, spacing } from "@/theme";
import { AppText, EmptyState, FairnessBadge, GameHeader, Screen, Toast, haptic, type FairnessState, type ToastTone } from "@/components/ui";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { balanceApi } from "@/services/api";
import { FALLBACK_PAYTABLE, slotApi, type SlotSession, type SlotSpin, type SlotSpinResult } from "@/services/slotApi";
import { isSlotVerified, verifySlotRound, type MultiplierSet } from "@/services/slotFair";
import { duckLoops, playLoop, playSound, playVoice, stopLoop, stopSound, type SfxKey } from "@/services/soundService";
import { MIN_CYCLE_MS, RESTRICTED_PLAY } from "@/config/compliance";
import { formatCoins } from "@/config/brand";
import { SlotBackdrop } from "@/components/slot/SlotTileArt";
import { HangingLantern, LanternToken, TitleWordmark } from "@/components/slot/Ornaments";
import { ReelFrame, frameGeometry } from "@/components/slot/ReelFrame";
import { Reel, impactMs, type ReelHandle } from "@/components/slot/Reel";
import { BetStepper, RoundToggle, SpinButton, WinBanner, type BannerTone } from "@/components/slot/Controls";
import {
  AnticipationGlow,
  BigWinPlaque,
  FeaturePicker,
  FreeGamesIntro,
  FreeGamesOutro,
  RetriggerBanner,
  WinLayer,
  type WinMode,
} from "@/components/slot/Overlays";
import { SlotFairSheet, SlotRulesSheet, rtpRange, type SlotFairRound } from "@/components/slot/SlotSheets";
import {
  CYCLE_MS,
  OPTION_NAMES,
  REELS,
  STRIPS,
  anticipationFromReel,
  bigWinTier,
  classifyOutcome,
  countUpMs,
  gridFromStops,
  outcomeCopy,
  SYMBOL_NAMES,
  scattersOnReel,
  spinSummary,
  stopSchedule,
  totalBet,
  winCycle,
  winSoundKey,
  winningCells,
  type FeatureOption,
  type FeatureOptionId,
  type Grid,
} from "@/components/slot/slotMath";

// "trigger" = base result shown, feature intro queued (not skippable, no new spin).
type Phase = "idle" | "spinning" | "presenting" | "trigger" | "intro" | "picking" | "feature" | "outro";

const INITIAL_STOPS = [2, 0, 1, 12, 16];

interface Banner {
  message: string;
  sub: string | null;
  tone: BannerTone;
}
const IDLE_BANNER: Banner = { message: "243 WAYS · GOOD LUCK", sub: null, tone: "idle" };

interface FeatureRun {
  option: FeatureOption;
  spins: SlotSpin[];
  index: number;
  total: number;
  win: number;
  current: number;
  multiplier: number | null;
}

function humanize(e: unknown): string {
  const m = e instanceof Error ? e.message : "Something went wrong";
  if (/insufficient/i.test(m)) return "Not enough coins for this bet.";
  if (/network|fetch/i.test(m)) return "Connection lost. Your balance is safe — try again.";
  return m;
}

// Count-up with tap-to-jump and pooled ticks.
function useCountUp() {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const to = useRef(0);
  const halt = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    if (tick.current !== null) clearInterval(tick.current);
    raf.current = null;
    tick.current = null;
  }, []);
  const run = useCallback(
    (from: number, target: number, ms: number, ticks: boolean) => {
      halt();
      to.current = target;
      if (ms <= 0 || from === target) {
        setValue(target);
        return;
      }
      const start = Date.now();
      setValue(from);
      if (ticks) tick.current = setInterval(() => void playSound("slot_count_tick"), 110);
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / ms);
        setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 2))));
        if (t < 1) raf.current = requestAnimationFrame(step);
        else halt();
      };
      raf.current = requestAnimationFrame(step);
    },
    [halt],
  );
  const jump = useCallback(() => {
    halt();
    setValue(to.current);
  }, [halt]);
  const set = useCallback(
    (v: number) => {
      halt();
      to.current = v;
      setValue(v);
    },
    [halt],
  );
  useEffect(() => halt, [halt]);
  return { value, run, jump, set };
}

export default function SlotScreen() {
  const qc = useQueryClient();
  const win = useWindowDimensions();
  // JS-side insets (same commit as first layout) instead of native SafeAreaView padding,
  // which lagged a frame and let the header sit under the status bar on mount.
  const rawInsets = useSafeAreaInsets();
  const insetTop = rawInsets.top || initialWindowMetrics?.insets.top || 0;
  const insetBottom = rawInsets.bottom || initialWindowMetrics?.insets.bottom || 0;
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const openIAP = useUiStore((s) => s.openIAP);
  const openConnect = useUiStore((s) => s.openConnect);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const { data: balanceData } = useQuery({ queryKey: ["balance"], queryFn: balanceApi.get, enabled: isAuthenticated });
  const balance = balanceData ?? 0;
  const { data: paytableData } = useQuery({
    queryKey: ["slotPaytable"],
    queryFn: slotApi.paytable,
    enabled: isAuthenticated,
    staleTime: 10 * 60_000,
  });
  const paytable = paytableData ?? FALLBACK_PAYTABLE;
  const levels = paytable.betLevels;

  const [level, setLevel] = useState<number>(levels[0] ?? 1);
  const [turbo, setTurbo] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [grid, setGrid] = useState<Grid>(() => gridFromStops(INITIAL_STOPS));
  const [banner, setBanner] = useState<Banner>(IDLE_BANNER);
  const [highlight, setHighlight] = useState<Set<string> | null>(null);
  const [winMode, setWinMode] = useState<WinMode>("none");
  const [antOn, setAntOn] = useState<boolean[]>(() => Array(REELS).fill(false));
  const [bigWin, setBigWin] = useState<{ target: number; wager: number } | null>(null);
  const [offer, setOffer] = useState<{ sessionId: string; scatters: number; options: FeatureOption[]; base: SlotSpinResult } | null>(null);
  const [busyOption, setBusyOption] = useState<FeatureOptionId | null>(null);
  const [run, setRun] = useState<FeatureRun | null>(null);
  const [retrig, setRetrig] = useState<number | null>(null);
  const [outro, setOutro] = useState<{ total: number; net: number; played: number; capped: boolean } | null>(null);
  const [pendingDebit, setPendingDebit] = useState<{ before: number; wager: number } | null>(null);
  const [session, setSession] = useState<SlotSession | null>(null);
  const [sessionState, setSessionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [lastFair, setLastFair] = useState<SlotFairRound | null>(null);
  const [sheet, setSheet] = useState<"rules" | "fair" | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sceneTop, setSceneTop] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  const count = useCountUp();
  const reels = useRef<(ReelHandle | null)[]>([]);
  const stopsRef = useRef<number[]>([...INITIAL_STOPS]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  const sessionLoading = useRef(false);
  const lastSpinAt = useRef(0);
  const afterBigWin = useRef<(() => void) | null>(null);
  const featureToken = useRef(0);
  const featureDone = useRef<(() => void) | null>(null);
  const holdTotal = useRef<(() => void) | null>(null);

  const wager = totalBet(level);
  const allowTurbo = !RESTRICTED_PLAY;
  const fast = turbo && allowTurbo;

  // ── timers ───────────────────────────────────────────────────────────────
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(
      setTimeout(() => {
        if (mounted.current) fn();
      }, Math.max(0, ms)),
    );
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      void stopLoop("slot_spin_loop", 0);
      void stopLoop("slot_fg_loop", 0);
      void stopLoop("slot_anticipation", 0);
      duckLoops(false);
    };
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "warn") => setToast({ message, tone }), []);
  const hideToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!levels.includes(level)) setLevel(levels[0] ?? 1);
  }, [levels, level]);

  // ── provably-fair session (committed before the spin) ───────────────────
  const ensureSession = useCallback(async () => {
    if (sessionLoading.current) return;
    sessionLoading.current = true;
    setSessionState("loading");
    try {
      const d = await slotApi.startSession();
      if (!mounted.current) return;
      setSession(d);
      setSessionState("ready");
      if (d.resolvedFeature) {
        showToast(`Your free games were completed: +${formatCoins(d.resolvedFeature.totalWin)}`, "info");
        void qc.invalidateQueries({ queryKey: ["balance"] });
      }
    } catch (e) {
      if (!mounted.current) return;
      setSessionState("error");
      showToast(humanize(e), "danger");
    } finally {
      sessionLoading.current = false;
    }
  }, [showToast, qc]);

  useEffect(() => {
    if (isAuthenticated && !session && sessionState === "idle") void ensureSession();
  }, [isAuthenticated, session, sessionState, ensureSession]);

  // ── layout ───────────────────────────────────────────────────────────────
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
  }, []);
  const CONTROLS_H = 96;
  const BANNER_H = 50;
  const FAIR_H = 28;
  const TITLE_MIN = size.h > 0 && size.h < 600 ? 40 : 56;
  const CHROME = BANNER_H + FAIR_H + CONTROLS_H + spacing.sm * 4;
  // Reels take the spare height first (cells stretch up to MAX_CELL_ASPECT), the
  // title plate the rest; any leftover is spread evenly so no band sits empty.
  const geo = useMemo(
    () => frameGeometry(Math.max(200, size.w), size.h ? size.h - TITLE_MIN - CHROME : undefined),
    [size.w, size.h, TITLE_MIN, CHROME],
  );
  const titleH = size.h ? Math.max(TITLE_MIN, Math.min(150, size.h - geo.H - CHROME)) : TITLE_MIN;
  const spinSize = size.h && size.h < 560 ? 80 : 88;

  // ── ambient lantern sway (paused while spinning) ─────────────────────────
  const sway = useSharedValue(0.5);
  const ambientPaused = phase === "spinning" || phase === "feature" || reduceMotion;
  useEffect(() => {
    cancelAnimation(sway);
    if (ambientPaused) sway.value = withTiming(0.5, { duration: 300 });
    else {
      sway.value = 0.5;
      sway.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
  }, [ambientPaused, sway]);
  const swayL = useAnimatedStyle(() => ({ transform: [{ rotate: `${(sway.value - 0.5) * 8}deg` }] }));
  const swayR = useAnimatedStyle(() => ({ transform: [{ rotate: `${(0.5 - sway.value) * 7}deg` }] }));

  // ── presentation helpers ─────────────────────────────────────────────────
  const resetPresentation = useCallback(() => {
    clearTimers();
    count.jump();
    setHighlight(null);
    setWinMode("none");
    setAntOn(Array(REELS).fill(false));
  }, [clearTimers, count]);

  const announce = useCallback((g: Grid, spin: SlotSpin, ret: number, w: number) => {
    AccessibilityInfo.announceForAccessibility?.(spinSummary(g, spin.wins, spin.scatter, ret, w));
  }, []);

  /** Animate reels to a spin's stops; reels must already be spinning. */
  const landSpin = useCallback(
    (spin: SlotSpin, startedAt: number, onDone: () => void) => {
      const elapsed = Date.now() - startedAt;
      // RESTRICTED_PLAY: no anticipation teaser (no slow-down, glow or roll).
      const ant = reduceMotion || RESTRICTED_PLAY ? null : spin.anticipation?.fromReel ?? anticipationFromReel(spin.grid);
      const sched = stopSchedule({ turbo: fast, reduceMotion, anticipationFrom: ant, elapsed });
      let scatters = 0;
      sched.forEach((t, i) => {
        const ms = t - elapsed;
        reels.current[i]?.land(spin.stops[i]!, ms);
        // Thud + haptic at impact (end of travel), not at the overshoot settle.
        later(impactMs(ms, reduceMotion), () => {
          const last = i === REELS - 1;
          const thud = reduceMotion ? last : fast ? last : true;
          if (thud) {
            void playSound(`slot_stop_${i + 1}` as SfxKey);
            haptic("light");
          }
          const sc = scattersOnReel(spin.grid, i);
          if (sc > 0) {
            const before = scatters;
            scatters += sc;
            if (scatters <= 2) void playSound("slot_scatter_chime");
            else if (before < 3) void playSound("slot_gong"); // stinger only on a real 3rd scatter
          }
          if (ant !== null && i === ant - 1) {
            setAntOn(Array.from({ length: REELS }, (_, r) => r >= ant));
            void playLoop("slot_anticipation", 0.7); // rolls until the last reel lands
          } else if (ant !== null && i >= ant) {
            setAntOn((a) => a.map((on, r) => (r === i ? false : on)));
          }
          if (last) {
            void stopLoop("slot_spin_loop");
            if (ant !== null) void stopLoop("slot_anticipation");
          }
        });
      });
      later(sched[REELS - 1]! - elapsed + 140, () => {
        stopsRef.current = [...spin.stops];
        setGrid(spin.grid);
        setAntOn(Array(REELS).fill(false));
        onDone();
      });
    },
    [fast, later, reduceMotion],
  );

  const startReels = useCallback(() => {
    reels.current.forEach((r) => r?.start());
  }, []);

  /** Win presentation for a base-game spin (LDW-safe). */
  const presentBase = useCallback(
    (spin: SlotSpin, ret: number, w: number) => {
      const outcome = classifyOutcome(ret, w);
      const copy = outcomeCopy(ret, w);
      const all = winningCells([...spin.wins, ...(spin.scatter.payout > 0 ? [spin.scatter] : [])]);
      if (outcome === "loss") {
        setBanner({ message: "No win", sub: null, tone: "idle" });
        count.set(0);
        return;
      }
      if (outcome !== "win") {
        // LDW / push: neutral copy, static outline, no count-up, no celebration.
        setWinMode("ldw");
        setHighlight(all);
        setBanner({ message: copy.title, sub: copy.detail, tone: "neutral" });
        count.set(ret);
        void playSound("slot_returned");
        return;
      }
      const net = ret - w;
      const tier = bigWinTier(net, w);
      // The amount lives in the WIN meter only; the headline carries the net.
      const head = copy.detail.toUpperCase();
      setWinMode("celebrate");
      setHighlight(all);
      setBanner({ message: head, sub: null, tone: "win" });
      const sound = winSoundKey(net, w);
      if (sound) void playSound(sound);
      haptic(tier ? "heavy" : "success");
      holdTotal.current = () => {
        setHighlight(all);
        setBanner({ message: head, sub: null, tone: "win" });
      };
      const cycle = () => {
        const entries = winCycle(spin.wins, spin.scatter.payout > 0 ? spin.scatter : null);
        if (entries.length > 1 && !reduceMotion) {
          entries.forEach((e, k) => {
            later(k * CYCLE_MS, () => {
              setHighlight(winningCells([e]));
              setBanner({ message: head, sub: e.label, tone: "win" });
            });
          });
          later(entries.length * CYCLE_MS, () => {
            setHighlight(all);
            setBanner({ message: head, sub: null, tone: "win" });
          });
        } else if (entries[0]) {
          setBanner({ message: head, sub: entries[0].label, tone: "win" });
        }
      };
      if (tier) {
        count.run(0, ret, reduceMotion ? 0 : countUpMs(net, w), !reduceMotion);
        afterBigWin.current = cycle;
        setBigWin({ target: ret, wager: w });
      } else {
        count.run(0, ret, reduceMotion ? 0 : countUpMs(net, w), false);
        later(reduceMotion ? 0 : countUpMs(net, w), cycle);
      }
    },
    [count, later, reduceMotion],
  );

  const recordFair = useCallback((serverSeed: string, serverSeedHash: string, clientSeed: string, spins: SlotSpin[], mults: MultiplierSet | null) => {
    const verification = verifySlotRound(serverSeed, serverSeedHash, clientSeed, spins, mults);
    setLastFair({ serverSeed, serverSeedHash, clientSeed, spins: spins.length, verification });
    if (!isSlotVerified(verification)) showToast("Fairness check failed for this round — see details.", "danger");
  }, [showToast]);

  // ── base spin ────────────────────────────────────────────────────────────
  const canSpin = isAuthenticated && (phase === "idle" || phase === "presenting") && !bigWin;

  const onSpin = useCallback(async () => {
    if (!canSpin) return;
    if (!session) {
      void ensureSession();
      return;
    }
    if (balance < wager) {
      haptic("warning");
      showToast("Not enough coins for this bet.");
      openIAP();
      return;
    }
    if (RESTRICTED_PLAY && Date.now() - lastSpinAt.current < MIN_CYCLE_MS) return;
    lastSpinAt.current = Date.now();

    const sid = session.sessionId;
    const startedAt = Date.now();
    resetPresentation();
    holdTotal.current = null;
    count.set(0);
    setPhase("spinning");
    setBanner({ message: "GOOD LUCK", sub: null, tone: "idle" });
    setSession(null);
    setSessionState("idle");
    sessionLoading.current = true; // hold the next commit until this round resolves
    setPendingDebit({ before: balance, wager });
    haptic("medium");
    startReels();
    void playLoop("slot_spin_loop", 0.55);

    let r: SlotSpinResult;
    try {
      r = await slotApi.spin(sid, level);
    } catch (e) {
      if (!mounted.current) return;
      clearTimers();
      reels.current.forEach((reel, i) => reel?.land(stopsRef.current[i]!, 300 + 120 * i));
      void stopLoop("slot_spin_loop");
      void stopLoop("slot_anticipation");
      setPhase("idle");
      setBanner(IDLE_BANNER);
      setPendingDebit(null);
      haptic("error");
      showToast(humanize(e), "danger");
      void qc.invalidateQueries({ queryKey: ["balance"] });
      sessionLoading.current = false;
      void ensureSession();
      return;
    }
    if (!mounted.current) return;
    const w = r.totalWagered || wager;
    landSpin(r.spin, startedAt, () => {
      setPendingDebit(null);
      qc.setQueryData(["balance"], r.newBalance);
      announce(r.spin.grid, r.spin, r.totalReturn, w);
      if (r.feature?.triggered) {
        // Seed stays sealed until /slots/feature resolves; no new session yet
        // (start-session would auto-resolve this pending feature).
        setPhase("trigger");
        presentBase(r.spin, r.totalReturn, w);
        const scat = winningCells([r.spin.scatter]);
        const toIntro = () => later(r.totalReturn > 0 ? 1300 : 300, () => {
          setHighlight(scat);
          setWinMode("celebrate");
          haptic("heavy");
          later(500, () => {
            // Gong stinger already fired at the 3rd-scatter impact. No duckLoops here: no
            // loop is running and the duck was never released (FG music stayed at 0.4x).
            void playSound("slot_fg_intro");
            void playVoice("vo_free_games");
            setOffer({
              sessionId: r.sessionId || sid,
              scatters: r.feature!.scatterCount,
              options: r.feature!.options.length ? r.feature!.options : paytable.options,
              base: r,
            });
            setPhase("intro");
          });
        });
        if (afterBigWin.current) {
          // Base big win on the triggering spin: intro follows the plaque.
          const cycle = afterBigWin.current;
          afterBigWin.current = () => {
            cycle();
            toIntro();
          };
        } else toIntro();
        return;
      }
      if (r.serverSeed) recordFair(r.serverSeed, r.serverSeedHash, r.clientSeed, [r.spin], null);
      sessionLoading.current = false;
      void ensureSession();
      setPhase("presenting");
      presentBase(r.spin, r.totalReturn, w);
    });
  }, [
    canSpin,
    session,
    balance,
    wager,
    level,
    ensureSession,
    showToast,
    openIAP,
    resetPresentation,
    count,
    startReels,
    clearTimers,
    qc,
    landSpin,
    announce,
    presentBase,
    later,
    paytable.options,
    recordFair,
  ]);

  // ── free games ───────────────────────────────────────────────────────────
  const finishFeature = useCallback(
    (summary: { total: number; net: number; played: number; capped: boolean }) => {
      void stopLoop("slot_fg_loop");
      duckLoops(false);
      setRun(null);
      setOutro(summary);
      setPhase("outro");
    },
    [],
  );

  const playFreeSpin = useCallback(
    (state: FeatureRun, token: number) => {
      if (token !== featureToken.current) return;
      const spin = state.spins[state.index];
      if (!spin) {
        featureDone.current?.();
        return;
      }
      setRun({ ...state, current: state.index + 1 });
      setHighlight(null);
      setWinMode("none");
      const startedAt = Date.now();
      startReels();
      void playLoop("slot_spin_loop", 0.4);
      const retrigger = spin.retrigger ?? spin.scatter.count >= 3;
      later(fast ? 120 : 260, () => {
        if (token !== featureToken.current) return;
        landSpin(spin, startedAt, () => {
          if (token !== featureToken.current) return;
          const pay = spin.wins.reduce((a, x) => a + x.payout, 0) + spin.scatter.payout;
          let next: FeatureRun = { ...state, multiplier: spin.multiplier };
          if (pay > 0) {
            const cells = winningCells([...spin.wins, ...(spin.scatter.payout > 0 ? [spin.scatter] : [])]);
            setHighlight(cells);
            setWinMode("celebrate");
            void playSound(pay >= totalBet(level) * 5 ? "slot_win_medium" : "slot_win_small");
            count.run(state.win, state.win + pay, reduceMotion ? 0 : 600, false);
            next = { ...next, win: state.win + pay };
          }
          let pause = pay > 0 ? (fast ? 700 : 1100) : fast ? 250 : 450;
          if (retrigger) {
            const added = Math.min(state.option.spins, state.spins.length - state.total);
            if (added > 0) {
              next = { ...next, total: state.total + added };
              haptic("heavy"); // gong stinger already fired at the 3rd-scatter impact
              setRetrig(added);
              later(1300, () => setRetrig(null));
              pause += 1300;
            }
          }
          next = { ...next, index: state.index + 1, current: state.index + 1 };
          setRun(next);
          announce(spin.grid, spin, pay, 0);
          later(pause, () => playFreeSpin(next, token));
        });
      });
    },
    [announce, count, fast, landSpin, later, level, reduceMotion, startReels],
  );

  const onPick = useCallback(
    async (id: FeatureOptionId) => {
      if (!offer || busyOption) return;
      haptic("medium");
      void stopSound("slot_fg_intro");
      void playSound("ui_tap");
      setBusyOption(id);
      try {
        const r = await slotApi.feature(offer.sessionId, id);
        if (!mounted.current) return;
        const option = offer.options.find((o) => o.id === id) ?? paytable.options.find((o) => o.id === id)!;
        const free = r.spins.filter((s) => s.nonce > 0);
        recordFair(r.serverSeed, r.serverSeedHash, r.clientSeed, [offer.base.spin, ...free], option);
        const w = offer.base.totalWagered || wager;
        const baseWin = offer.base.totalReturn;
        setBusyOption(null);
        setOffer(null);
        resetPresentation();
        count.set(0);
        const initial: FeatureRun = { option, spins: free, index: 0, current: 0, total: Math.min(option.spins, free.length), win: 0, multiplier: null };
        setRun(initial);
        setPhase("feature");
        setBanner({ message: `${OPTION_NAMES[id].toUpperCase()} FREE GAMES`, sub: null, tone: "feature" });
        void playLoop("slot_fg_loop", 0.5);
        const token = ++featureToken.current;
        const done = () => {
          featureDone.current = null;
          qc.setQueryData(["balance"], r.newBalance);
          sessionLoading.current = false;
          void ensureSession();
          const featureTotal = r.feature.totalWin;
          const roundNet = r.totalReturn - w;
          const summary = { total: featureTotal, net: roundNet, played: free.length, capped: r.feature.capped };
          count.set(featureTotal);
          if (bigWinTier(featureTotal + baseWin - w, w)) {
            void stopLoop("slot_fg_loop");
            void playSound("slot_win_big");
            count.run(0, featureTotal, reduceMotion ? 0 : countUpMs(featureTotal + baseWin - w, w), !reduceMotion);
            afterBigWin.current = () => finishFeature(summary);
            setBigWin({ target: featureTotal, wager: w });
          } else {
            finishFeature(summary);
          }
        };
        featureDone.current = done;
        later(500, () => playFreeSpin(initial, token));
      } catch (e) {
        if (!mounted.current) return;
        setBusyOption(null);
        haptic("error");
        showToast(humanize(e), "danger");
      }
    },
    [offer, busyOption, paytable.options, recordFair, wager, resetPresentation, count, later, playFreeSpin, qc, ensureSession, reduceMotion, finishFeature, showToast],
  );

  const onSkipFeature = useCallback(() => {
    if (!run) return;
    // Jump to the final state: cancel playback, snap reels to the last spin.
    const token = featureToken.current;
    featureToken.current = token + 1;
    clearTimers();
    void stopLoop("slot_spin_loop", 0);
    void stopLoop("slot_anticipation", 0);
    const last = run.spins[run.spins.length - 1];
    if (last) {
      last.stops.forEach((s, i) => reels.current[i]?.snap(s));
      stopsRef.current = [...last.stops];
      setGrid(last.grid);
    }
    setHighlight(null);
    setWinMode("none");
    setAntOn(Array(REELS).fill(false));
    const total = run.spins.reduce((a, s) => a + s.wins.reduce((b, x) => b + x.payout, 0) + s.scatter.payout, 0);
    setRun({ ...run, index: run.spins.length, current: run.spins.length, total: run.spins.length, win: total });
    count.set(total);
    featureDone.current?.();
  }, [run, clearTimers, count]);

  const onOutroDone = useCallback(() => {
    setOutro(null);
    setPhase("idle");
    setBanner(IDLE_BANNER);
    count.set(0);
  }, [count]);

  const onBigWinTap = useCallback(() => {
    if (count.value < (bigWin?.target ?? 0)) {
      if (!RESTRICTED_PLAY) count.jump(); // RESTRICTED_PLAY: no tap-skip of the count-up
      return;
    }
    setBigWin(null);
    const next = afterBigWin.current;
    afterBigWin.current = null;
    next?.();
  }, [bigWin, count]);

  // Tap on the reels during a presentation: skip the cycle / count-up.
  const onReelTap = useCallback(() => {
    if (phase === "presenting" && !RESTRICTED_PLAY) {
      clearTimers();
      count.jump();
      holdTotal.current?.();
    }
  }, [phase, clearTimers, count]);

  // ── derived ──────────────────────────────────────────────────────────────
  const freeMode = phase === "feature" || (phase === "outro" && !!outro);
  const displayBalance = pendingDebit ? pendingDebit.before - pendingDebit.wager : balance;
  const verified = isSlotVerified(lastFair?.verification);
  const fairState: FairnessState =
    offer || run ? "sealed" : lastFair ? (verified ? "verified" : "failed") : session ? "sealed" : "pending";
  const winShown = phase === "spinning" ? null : freeMode || winMode !== "none" || count.value > 0 ? count.value : null;
  const spinning = phase === "spinning";

  if (!isAuthenticated) {
    return (
      <Screen edges={["top", "bottom"]} header={<GameHeader title="Lion Lantern Night" balance={0} />}>
        <View style={styles.centerFill}>
          <EmptyState
            icon="wallet-outline"
            title="Connect to play"
            body="Connect your wallet to light the lanterns."
            cta={{ label: "Connect", onPress: openConnect, testID: "slot-connect" }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.flex}>
      <SlotBackdrop width={win.width} height={win.height} sceneTop={sceneTop} />
      <View style={[styles.fill, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
        <View
          onLayout={(e) => {
            const b = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
            setSceneTop((v) => (Math.abs(v - b) < 1 ? v : b));
          }}
        >
          <GameHeader
            title="Lion Lantern Night"
            subtitle={`243 ways · RTP ${rtpRange(paytable)}`}
            balance={displayBalance}
            onAddCoins={openIAP}
            onInfo={() => setSheet("rules")}
          />
        </View>
        <View style={styles.content}>
          <View style={styles.root} onLayout={onLayout} testID="slot-root">
            <View style={styles.stage}>
              {/* ── title band / free-games counter ── */}
              <View style={[styles.titleBand, { height: titleH }]}>
                <Animated.View style={[styles.lanternL, swayL]} pointerEvents="none">
                  <HangingLantern size={Math.min(titleH * 0.9, 76)} />
                </Animated.View>
                {run || (phase === "outro" && outro) ? (
                  <Animated.View entering={FadeIn.duration(220)} style={styles.fgPlate} accessibilityLiveRegion="polite" testID="slot-fg-counter">
                    {run ? <LanternToken kind={run.option.id} size={Math.min(46, titleH - 8)} /> : null}
                    <View>
                      <AppText style={styles.fgKicker}>FREE GAMES</AppText>
                      <AppText style={styles.fgCount}>
                        {run ? `${Math.max(1, Math.min(run.current, run.total))} / ${run.total}` : "COMPLETE"}
                      </AppText>
                    </View>
                    {run?.multiplier && run.multiplier > 1 ? (
                      <View style={styles.multBadge}>
                        <AppText style={styles.multText}>×{run.multiplier}</AppText>
                      </View>
                    ) : null}
                  </Animated.View>
                ) : (
                  <TitleWordmark
                    width={Math.max(120, Math.min(size.w - 72, (titleH - 4) * (360 / 104)))}
                    height={Math.max(34, Math.min(titleH - 4, (size.w - 72) * (104 / 360)))}
                  />
                )}
                <Animated.View style={[styles.lanternR, swayR]} pointerEvents="none">
                  <HangingLantern size={Math.min(titleH * 0.72, 60)} hue="gold" />
                </Animated.View>
              </View>

              {/* ── reels ── */}
              <Pressable onPress={onReelTap} accessible={false} style={styles.frameWrap}>
                {size.w > 0 ? (
                  <ReelFrame
                    geometry={geo}
                    mode={freeMode ? "free" : "base"}
                    overlay={
                      <>
                        {antOn.map((on, i) => (
                          <AnticipationGlow key={i} left={geo.reelX(i)} cell={geo.cell} height={geo.innerH} on={on} reduceMotion={reduceMotion} />
                        ))}
                        <WinLayer
                          cell={geo.cell}
                          cellH={geo.cellH}
                          gap={geo.D}
                          grid={grid}
                          highlight={highlight}
                          mode={spinning ? "none" : winMode}
                          multiplier={run?.multiplier ?? null}
                          reduceMotion={reduceMotion}
                        />
                      </>
                    }
                  >
                    {STRIPS.map((strip, i) => (
                      <View key={`${i}-${geo.cell}-${geo.cellH}`} style={[styles.reelSlot, { left: geo.reelX(i) }]}>
                        <Reel
                          ref={(h) => {
                            reels.current[i] = h;
                          }}
                          strip={strip}
                          cell={geo.cell}
                          cellH={geo.cellH}
                          initialStop={stopsRef.current[i]!}
                          reduceMotion={reduceMotion}
                        />
                      </View>
                    ))}
                  </ReelFrame>
                ) : null}
              </Pressable>
              <View
                style={styles.a11yGrid}
                accessible
                accessibilityLabel={grid.map((row, i) => `Row ${i + 1}: ${row.map((s) => SYMBOL_NAMES[s]).join(", ")}`).join(". ")}
                testID="slot-grid-a11y"
              />

              {/* ── banner + fairness ── */}
              <View>
                <WinBanner
                  bet={wager}
                  win={winShown}
                  winLabel={freeMode ? "FEATURE" : "WIN"}
                  message={banner.message}
                  sub={banner.sub}
                  tone={banner.tone}
                  onPress={phase === "presenting" && !RESTRICTED_PLAY ? onReelTap : undefined}
                />
                <View style={styles.fairRow}>
                  <FairnessBadge state={fairState} onPress={() => setSheet("fair")} testID="slot-fairness" />
                </View>
              </View>
            </View>

            {/* ── controls ── */}
            <View style={[styles.controls, { height: CONTROLS_H }]}>
              <View style={styles.side}>
                {phase === "feature" && !RESTRICTED_PLAY ? (
                  <RoundToggle icon="play-skip-forward" label="SKIP" onPress={onSkipFeature} testID="slot-skip" />
                ) : allowTurbo ? (
                  <RoundToggle icon="flash" label="TURBO" active={turbo} onPress={() => setTurbo((t) => !t)} testID="slot-turbo" />
                ) : null}
              </View>
              <BetStepper levels={levels} level={level} onChange={setLevel} disabled={!canSpin || spinning || freeMode} />
              <SpinButton
                size={spinSize}
                label={phase === "feature" ? "FREE" : "SPIN"}
                sublabel={phase === "feature" && run ? `${run.index}/${run.total}` : null}
                mode={freeMode ? "free" : "base"}
                disabled={!canSpin || (sessionState === "loading" && !session)}
                onPress={() => void onSpin()}
                accessibilityLabel={`Spin, bet ${wager} coins`}
              />
            </View>

            {/* ── overlays ── */}
            {retrig !== null ? <RetriggerBanner added={retrig} reduceMotion={reduceMotion} /> : null}
            {phase === "intro" && offer ? (
              <FreeGamesIntro scatters={offer.scatters} width={size.w} reduceMotion={reduceMotion} onDone={() => setPhase("picking")} />
            ) : null}
            {phase === "picking" && offer ? <FeaturePicker options={offer.options} busy={busyOption} onPick={(id) => void onPick(id)} /> : null}
            {phase === "outro" && outro ? (
              <FreeGamesOutro total={outro.total} net={outro.net} played={outro.played} capped={outro.capped} onDone={onOutroDone} />
            ) : null}
            {bigWin ? (
              <BigWinPlaque
                shown={count.value}
                target={bigWin.target}
                wager={bigWin.wager}
                width={size.w}
                height={size.h}
                reduceMotion={reduceMotion}
                onTap={onBigWinTap}
              />
            ) : null}
            <Toast message={toast?.message ?? null} tone={toast?.tone} onHide={hideToast} />
          </View>

          <SlotRulesSheet
            visible={sheet === "rules"}
            onClose={() => setSheet(null)}
            paytable={paytable}
            betLevel={level}
            turbo={turbo}
            onTurbo={allowTurbo ? setTurbo : null}
          />
          <SlotFairSheet
            visible={sheet === "fair"}
            onClose={() => setSheet(null)}
            last={lastFair}
            nextCommitHash={session?.serverSeedHash ?? null}
            pending={!!offer || !!run}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  root: { flex: 1 },
  stage: { flex: 1, justifyContent: "space-evenly" },
  centerFill: { flex: 1, justifyContent: "center" },
  titleBand: { alignItems: "center", justifyContent: "center" },
  lanternL: { position: "absolute", left: 0, top: -10, transformOrigin: "50% 0%" },
  lanternR: { position: "absolute", right: 2, top: -8, transformOrigin: "50% 0%" },
  fgPlate: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: "#0C2A22",
    borderWidth: 2,
    borderColor: palette.gold,
  },
  fgKicker: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 2, color: palette.gold },
  fgCount: { fontFamily: fonts.displayBlack, fontSize: 22, color: palette.goldLight, fontVariant: ["tabular-nums"] },
  multBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: palette.ruby,
    borderWidth: 1.5,
    borderColor: palette.goldLight,
  },
  multText: { fontFamily: fonts.heavy, fontSize: 15, color: palette.goldLight },
  frameWrap: { alignItems: "center" },
  reelSlot: { position: "absolute", top: 0 },
  a11yGrid: { position: "absolute", width: 1, height: 1, opacity: 0 },
  fairRow: { height: 28, justifyContent: "center", alignItems: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xs },
  side: { width: 52, alignItems: "center" },
});
