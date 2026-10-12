import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { fonts, motion, palette, spacing } from "@/theme";
import {
  AppText,
  Button,
  ChipRack,
  EmptyState,
  GameHeader,
  Screen,
  Toast,
  haptic,
  type ToastTone,
} from "@/components/ui";
import { WinOverlay, classifyWin, type WinTier } from "@/components/WinOverlay";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { balanceApi, rouletteApi, type RouletteSpinResult } from "@/services/api";
import { verifyRouletteSpin } from "@/services/provablyFair";
import { playRouletteNumber, playSound, playVoice, winSoundFor } from "@/services/soundService";
import { formatCoins } from "@/config/brand";
import { RouletteWheel, type RouletteWheelHandle } from "@/components/roulette/RouletteWheel";
import { BettingLayout, boardChromeHeight, type BetOutcome } from "@/components/roulette/BettingLayout";
import { POCKET_UI, ResultHistoryStrip } from "@/components/roulette/ResultHistoryStrip";
import { FairnessSheet, RulesSheet, StatsSheet, isVerified, type FairSpin } from "@/components/roulette/RouletteSheets";
import {
  CHIP_VALUES,
  LIMIT_COPY,
  MAX_BETS_PER_SPIN,
  PAYOUT_RATIOS,
  addChip,
  addChips,
  checkSlip,
  describeSpot,
  doubleBets,
  humanizeError,
  pocketColor,
  spots,
  toApiBet,
  totalOf,
  wheelNeighbours,
  type BetSpot,
  type PlacedBet,
  type SlipResult,
} from "@/components/roulette/rouletteModel";

type Phase = "betting" | "closing" | "spinning" | "reveal";
type Session = { sessionId: string; serverSeedHash: string; clientSeed: string };

interface Settled {
  bets: PlacedBet[];
  outcomes: Record<string, BetOutcome>;
  winningNumber: number;
  net: number;
  wagered: number;
  returned: number;
}

const COMPACT = 92;
const BANNER_MS = 300;
const HISTORY_KEEP = 100;
const COLOR_NAME = { red: "Red", black: "Black", green: "Green" } as const;
const DEFAULT_HINT = "Tap a number · tap a line to split · tap a corner for four";

export default function RouletteScreen() {
  const qc = useQueryClient();
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const openIAP = useUiStore((s) => s.openIAP);
  const openConnect = useUiStore((s) => s.openConnect);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const { data: balanceData } = useQuery({ queryKey: ["balance"], queryFn: balanceApi.get, enabled: isAuthenticated });
  const balance = balanceData ?? 0;

  const [phase, setPhase] = useState<Phase>("betting");
  const [chip, setChip] = useState<number>(5);
  const [bets, setBets] = useState<PlacedBet[]>([]);
  const [undoStack, setUndoStack] = useState<PlacedBet[][]>([]);
  const [lastBets, setLastBets] = useState<PlacedBet[]>([]);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [revealNumber, setRevealNumber] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [neighbours, setNeighbours] = useState(false);
  const [hint, setHint] = useState<string>(DEFAULT_HINT);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [overlay, setOverlay] = useState<{ tier: WinTier; title: string; amount: number } | null>(null);
  const [pendingDebit, setPendingDebit] = useState<{ before: number; wager: number } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionState, setSessionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [lastFair, setLastFair] = useState<FairSpin | null>(null);
  const [sheet, setSheet] = useState<"fair" | "rules" | "stats" | null>(null);
  const [layout, setLayout] = useState({ w: 0, h: 0, bandY: 0, boardH: 0 });

  const wheelRef = useRef<RouletteWheelHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  const sessionLoading = useRef(false);
  const greeted = useRef(false);
  const overlayOpen = useRef(false);
  const voicePending = useRef(false);

  const total = useMemo(() => totalOf(bets), [bets]);
  const spinT = reduceMotion ? 1200 : motion.rouletteSpin;

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(
      setTimeout(() => {
        if (mounted.current) fn();
      }, ms),
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
    };
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "warn") => setToast({ message, tone }), []);
  const hideToast = useCallback(() => setToast(null), []);

  // --- provably-fair session: committed BEFORE bets are placed --------------
  const ensureSession = useCallback(async () => {
    if (sessionLoading.current) return;
    sessionLoading.current = true;
    setSessionState("loading");
    try {
      const d = await rouletteApi.startSession();
      if (!mounted.current) return;
      setSession({ sessionId: d.sessionId, serverSeedHash: d.serverSeedHash, clientSeed: d.clientSeed });
      setSessionState("ready");
    } catch (e) {
      if (!mounted.current) return;
      setSessionState("error");
      showToast(humanizeError(e), "danger");
    } finally {
      sessionLoading.current = false;
    }
  }, [showToast]);

  useEffect(() => {
    if (isAuthenticated && !session && sessionState === "idle") void ensureSession();
  }, [isAuthenticated, session, sessionState, ensureSession]);

  // "Place your bets" once when the table opens.
  useEffect(() => {
    if (sessionState === "ready" && !greeted.current) {
      greeted.current = true;
      void playVoice("vo_place_bets");
    }
  }, [sessionState]);

  // --- wheel expand / collapse ---------------------------------------------
  const expand = useSharedValue(0);
  const wheelSize = Math.min(layout.w - spacing.md * 2, 300);
  const setExpanded = useCallback(
    (on: boolean) => {
      expand.value = withTiming(on ? 1 : 0, {
        duration: reduceMotion ? 0 : on ? 420 : 380,
        easing: Easing.inOut(Easing.cubic),
      });
    },
    [expand, reduceMotion],
  );

  const compactCx = COMPACT / 2;
  const compactCy = layout.bandY + COMPACT / 2;
  const expandedCx = layout.w / 2;
  const expandedCy = layout.bandY + wheelSize / 2 + spacing.lg;
  const hostStyle = useAnimatedStyle(() => {
    const p = expand.value;
    const s = wheelSize > 0 ? COMPACT / wheelSize : 1;
    return {
      transform: [
        { translateX: interpolate(p, [0, 1], [compactCx, expandedCx]) - wheelSize / 2 },
        { translateY: interpolate(p, [0, 1], [compactCy, expandedCy]) - wheelSize / 2 },
        { scale: interpolate(p, [0, 1], [s, 1]) },
      ],
    };
  });
  const scrimStyle = useAnimatedStyle(() => ({ opacity: expand.value * 0.78 }));

  // --- betting ---------------------------------------------------------------
  const canBet = phase === "betting" && isAuthenticated;
  const baseBets = settled && bets.length === 0 ? [] : bets;

  const commit = useCallback(
    (r: SlipResult, label?: string) => {
      if (!r.ok) {
        haptic("warning");
        showToast(LIMIT_COPY[r.reason]);
        return false;
      }
      setUndoStack((s) => [...s.slice(-49), baseBets]);
      setBets(r.bets);
      setSettled(null);
      if (label) setHint(label);
      return true;
    },
    [baseBets, showToast],
  );

  const onPlace = useCallback(
    (spot: BetSpot) => {
      if (!canBet) return;
      const neighbourMode = neighbours && spot.type === "straight";
      const list = neighbourMode ? wheelNeighbours(spot.numbers![0]!).map((n) => spots.straight(n)) : [spot];
      const r = neighbourMode ? addChips(baseBets, list, chip, balance) : addChip(baseBets, spot, chip, balance);
      const label = neighbourMode
        ? `Neighbours of ${spot.numbers![0]} · ${list.map((s) => s.numbers![0]).join(" ")} · 35:1 each`
        : `${describeSpot(spot)} · pays ${PAYOUT_RATIOS[spot.type]}:1`;
      if (commit(r, label)) {
        haptic("light");
        void playSound("chip_place");
      }
    },
    [canBet, neighbours, baseBets, chip, balance, commit],
  );

  const onUndo = useCallback(() => {
    if (!canBet || undoStack.length === 0) return;
    setBets(undoStack[undoStack.length - 1]!);
    setUndoStack((s) => s.slice(0, -1));
    setHint(DEFAULT_HINT);
    void playSound("chip_collect");
  }, [canBet, undoStack]);

  const onClear = useCallback(() => {
    if (!canBet) return;
    if (bets.length) setUndoStack((s) => [...s, bets]);
    setBets([]);
    setSettled(null);
    setHint(DEFAULT_HINT);
    void playSound("chip_collect");
  }, [canBet, bets]);

  const onRebet = useCallback(() => {
    if (!canBet || lastBets.length === 0) return;
    if (commit(checkSlip(lastBets, balance), `Rebet · ${formatCoins(totalOf(lastBets))} coins`)) void playSound("chip_place");
  }, [canBet, lastBets, balance, commit]);

  const onDouble = useCallback(() => {
    if (!canBet) return;
    const src = baseBets.length ? baseBets : lastBets;
    if (!src.length) return;
    const r = doubleBets(src, balance);
    if (commit(r, `Doubled · ${formatCoins(totalOf(src) * 2)} coins`)) void playSound("chip_place");
  }, [canBet, baseBets, lastBets, balance, commit]);

  // --- spin sequence -----------------------------------------------------------
  const settle = useCallback(
    (r: RouletteSpinResult, spun: PlacedBet[]) => {
      const outcomes: Record<string, BetOutcome> = {};
      spun.forEach((b, i) => {
        const res = r.results[i];
        if (res) outcomes[b.key] = { won: res.won, profit: res.payout - res.amount };
      });
      setExpanded(false);
      setRevealNumber(null);
      setPhase("betting");
      setSettled({
        bets: spun,
        outcomes,
        winningNumber: r.winningNumber,
        net: r.netProfit,
        wagered: r.totalWagered,
        returned: r.totalReturn,
      });
      setBets([]);
      setUndoStack([]);
      setLastBets(spun);
      setPendingDebit(null);
      qc.setQueryData(["balance"], r.newBalance);
      setHint(DEFAULT_HINT);

      if (Object.values(outcomes).some((o) => !o.won)) void playSound("chip_collect");
      later(480, () => {
        const tier = classifyWin(r.netProfit, r.totalWagered);
        if (tier === "medium" || tier === "big") {
          overlayOpen.current = true;
          setOverlay({ tier, title: `${r.winningNumber} ${COLOR_NAME[pocketColor(r.winningNumber)]}`, amount: r.netProfit });
        } else {
          void playSound(winSoundFor(r.netProfit, r.totalWagered));
          haptic(tier ? "success" : "light");
        }
      });
      later(1600, () => {
        if (overlayOpen.current) voicePending.current = true;
        else void playVoice("vo_place_bets");
      });
    },
    [later, qc, setExpanded],
  );

  const onSpin = useCallback(async () => {
    if (!canBet || bets.length === 0) return;
    if (!session) {
      void ensureSession();
      return;
    }
    const spun = bets;
    const wager = total;
    const sid = session.sessionId;
    const startedAt = Date.now();

    clearTimers();
    setPhase("closing");
    setSettled(null);
    setSession(null);
    setSessionState("idle");
    sessionLoading.current = true; // hold the next commit until this spin resolves
    setPendingDebit({ before: balance, wager });
    haptic("medium");
    void playVoice("vo_no_more_bets");
    setExpanded(true);

    later(BANNER_MS, () => {
      setPhase("spinning");
      wheelRef.current?.preSpin();
      void playSound("roulette_spin");
    });

    try {
      const r = await rouletteApi.spin(sid, spun.map(toApiBet));
      if (!mounted.current) return;
      const verification = verifyRouletteSpin(r.serverSeed, r.serverSeedHash, r.clientSeed, r.nonce, r.winningNumber);
      const minPre = reduceMotion ? BANNER_MS : BANNER_MS + 600;
      later(Math.max(0, startedAt + minPre - Date.now()), () => {
        setPhase("spinning");
        const dropAt = wheelRef.current?.land(r.winningNumber, spinT) ?? spinT * 0.72;
        later(Math.max(0, dropAt - 140), () => void playSound("ball_drop"));
        later(spinT, () => {
          setPhase("reveal");
          setRevealNumber(r.winningNumber);
          setHistory((h) => [r.winningNumber, ...h].slice(0, HISTORY_KEEP));
          setLastFair({
            winningNumber: r.winningNumber,
            serverSeed: r.serverSeed,
            serverSeedHash: r.serverSeedHash,
            clientSeed: r.clientSeed,
            nonce: r.nonce,
            verification,
          });
          haptic("medium");
          void playRouletteNumber(r.winningNumber);
          later(reduceMotion ? 900 : 1700, () => settle(r, spun));
        });
      });
    } catch (e) {
      if (!mounted.current) return;
      clearTimers();
      wheelRef.current?.abort();
      setExpanded(false);
      setPhase("betting");
      setPendingDebit(null);
      haptic("error");
      showToast(humanizeError(e), "danger");
      void qc.invalidateQueries({ queryKey: ["balance"] });
    } finally {
      sessionLoading.current = false;
      if (mounted.current) void ensureSession();
    }
  }, [
    canBet,
    bets,
    session,
    total,
    balance,
    reduceMotion,
    spinT,
    clearTimers,
    ensureSession,
    later,
    setExpanded,
    settle,
    showToast,
    qc,
  ]);

  const onOverlayDismiss = useCallback(() => {
    setOverlay(null);
    overlayOpen.current = false;
    if (voicePending.current) {
      voicePending.current = false;
      later(400, () => void playVoice("vo_place_bets"));
    }
  }, [later]);

  // --- layout ------------------------------------------------------------------
  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout((l) => (l.w === width && l.h === height ? l : { ...l, w: width, h: height }));
  }, []);
  const onBandLayout = useCallback((e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y;
    setLayout((l) => (l.bandY === y ? l : { ...l, bandY: y }));
  }, []);
  const onBoardLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setLayout((l) => (l.boardH === h ? l : { ...l, boardH: h }));
  }, []);
  const rowH = useMemo(() => {
    if (!layout.boardH) return 30;
    // board height = chrome(rowH) + 12·rowH, chrome ≈ 12 + 2.1·rowH
    const perRow = 12 + (boardChromeHeight(100) - boardChromeHeight(0)) / 100;
    return Math.max(26, Math.min(40, (layout.boardH - boardChromeHeight(0)) / perRow));
  }, [layout.boardH]);

  // --- derived display -----------------------------------------------------------
  const displayBalance = pendingDebit ? pendingDebit.before - pendingDebit.wager : balance;
  const boardBets = settled && bets.length === 0 ? settled.bets : bets;
  const lastNumber = history[0] ?? null;
  const spinning = phase !== "betting";
  const verified = isVerified(lastFair?.verification);

  if (!isAuthenticated) {
    return (
      <Screen variant="felt" edges={["top", "bottom"]} header={<GameHeader title="European Roulette" balance={0} />}>
        <View style={styles.centerFill}>
          <EmptyState
            icon="wallet-outline"
            title="Connect to play"
            body="Connect your wallet to take a seat at the roulette table."
            cta={{ label: "Connect", onPress: openConnect, testID: "roulette-connect" }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      variant="felt"
      edges={["top", "bottom"]}
      contentStyle={styles.content}
      header={
        <GameHeader
          title="European Roulette"
          subtitle="Single zero · RTP 97.3%"
          balance={displayBalance}
          onAddCoins={openIAP}
          onInfo={() => setSheet("rules")}
        />
      }
    >
      <View style={styles.root} onLayout={onRootLayout} testID="roulette-root">
        {/* ── top band: wheel slot · last result · history · fairness ── */}
        <View style={styles.band} onLayout={onBandLayout}>
          <View style={styles.wheelSlot} />
          <View style={styles.bandRight}>
            <View style={styles.resultRow}>
              <View
                style={[
                  styles.lastMedal,
                  { backgroundColor: lastNumber === null ? palette.surface : POCKET_UI[pocketColor(lastNumber)] },
                ]}
                accessibilityLabel={lastNumber === null ? "No spins yet" : `Last number ${lastNumber}`}
              >
                <AppText style={styles.lastMedalText}>{lastNumber === null ? "–" : lastNumber}</AppText>
              </View>
              <View style={styles.flex}>
                <ResultLine phase={phase} settled={settled} />
              </View>
            </View>
            <ResultHistoryStrip numbers={history} onPress={() => setSheet("stats")} />
            <Pressable
              onPress={() => setSheet("fair")}
              style={styles.fairRow}
              accessibilityRole="button"
              testID="roulette-fairness"
              hitSlop={8}
            >
              <Ionicons
                name={lastFair && !verified ? "warning" : "shield-checkmark"}
                size={13}
                color={lastFair && !verified ? palette.danger : palette.emerald}
              />
              <AppText variant="caption" style={[styles.fairText, lastFair && !verified && { color: palette.danger }]}>
                {lastFair ? (verified ? "Fair spin ✓" : "Verification failed") : "Seed committed ✓"}
              </AppText>
              <AppText variant="caption" style={styles.fairLink}>
                Check fairness ›
              </AppText>
            </Pressable>
          </View>
        </View>

        {/* ── betting layout ── */}
        <View style={styles.boardArea} onLayout={onBoardLayout}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} scrollEnabled={!spinning}>
            {layout.w > 0 ? (
              <BettingLayout
                width={layout.w}
                rowHeight={rowH}
                bets={boardBets}
                outcomes={settled && bets.length === 0 ? settled.outcomes : null}
                winningNumber={settled && bets.length === 0 ? settled.winningNumber : null}
                dollyNumber={spinning ? null : lastNumber}
                disabled={!canBet}
                reduceMotion={reduceMotion}
                onPlace={onPlace}
              />
            ) : null}
          </ScrollView>
        </View>

        {/* ── status line ── */}
        <View style={styles.status}>
          <AppText variant="caption" style={styles.hint} numberOfLines={1}>
            {hint}
          </AppText>
          <AppText variant="caption" style={styles.count} testID="roulette-bet-count">
            {bets.length}/{MAX_BETS_PER_SPIN} bets
          </AppText>
        </View>

        {/* ── controls ── */}
        <View style={styles.rackRow}>
          <View style={styles.rack}>
            <ChipRack values={[...CHIP_VALUES]} value={chip} onChange={setChip} disabled={spinning} maxAffordable={balance} />
          </View>
          <IconAction
            icon="git-network-outline"
            label="Nbrs"
            onPress={() => {
              setNeighbours((v) => !v);
              setHint(neighbours ? DEFAULT_HINT : "Neighbours on · tap a number for it + 2 either side");
            }}
            active={neighbours}
            disabled={spinning}
            testID="roulette-neighbours"
          />
        </View>
        <View style={styles.actionRow}>
          <IconAction icon="arrow-undo" label="Undo" onPress={onUndo} disabled={!canBet || undoStack.length === 0} testID="roulette-undo" />
          <IconAction icon="trash-outline" label="Clear" onPress={onClear} disabled={!canBet || bets.length === 0} testID="roulette-clear" />
          <IconAction icon="repeat" label="Rebet" onPress={onRebet} disabled={!canBet || lastBets.length === 0} testID="roulette-rebet" />
          <IconAction
            text="2×"
            label="Double"
            onPress={onDouble}
            disabled={!canBet || (baseBets.length === 0 && lastBets.length === 0)}
            testID="roulette-double"
          />
          <Button
            testID="roulette-spin"
            label={spinning ? "Spinning" : bets.length ? `Spin · ${formatCoins(total)}` : "Spin"}
            size="lg"
            haptic={false}
            onPress={() => void onSpin()}
            loading={phase === "betting" && sessionState === "loading" && bets.length > 0}
            disabled={!canBet || bets.length === 0}
            style={styles.spin}
            accessibilityLabel={bets.length ? `Spin, total wager ${total} coins` : "Spin, place a bet first"}
          />
        </View>

        {/* ── spin stage (scrim + travelling wheel + banner + medallion) ── */}
        <Animated.View pointerEvents="none" style={[styles.scrim, scrimStyle]} />
        {wheelSize > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.wheelHost, { width: wheelSize, height: wheelSize }, hostStyle]}>
            <RouletteWheel ref={wheelRef} size={wheelSize} idle={!reduceMotion} />
          </Animated.View>
        ) : null}
        {phase === "closing" || phase === "spinning" ? (
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(220)}
            pointerEvents="none"
            style={[styles.banner, { top: expandedCy + wheelSize / 2 + spacing.md }]}
          >
            <AppText style={styles.bannerText}>{phase === "closing" ? "No more bets" : "Good luck"}</AppText>
          </Animated.View>
        ) : null}
        {revealNumber !== null ? (
          <Animated.View
            entering={reduceMotion ? FadeIn.duration(120) : ZoomIn.springify().damping(12)}
            exiting={FadeOut.duration(200)}
            pointerEvents="none"
            style={[styles.medalWrap, { top: expandedCy - 64, left: expandedCx - 64 }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${revealNumber} ${pocketColor(revealNumber)}`}
            testID="roulette-medallion"
          >
            <View style={[styles.medal, { backgroundColor: POCKET_UI[pocketColor(revealNumber)] }]}>
              <AppText style={styles.medalNum}>{revealNumber}</AppText>
              <AppText style={styles.medalColor}>{pocketColor(revealNumber).toUpperCase()}</AppText>
            </View>
          </Animated.View>
        ) : null}

        <Toast message={toast?.message ?? null} tone={toast?.tone} onHide={hideToast} />
      </View>

      {overlay ? (
        <WinOverlay visible tier={overlay.tier} title={overlay.title} amount={overlay.amount} onDismiss={onOverlayDismiss} />
      ) : null}
      <FairnessSheet
        visible={sheet === "fair"}
        onClose={() => setSheet(null)}
        lastSpin={lastFair}
        nextCommitHash={session?.serverSeedHash ?? null}
      />
      <RulesSheet visible={sheet === "rules"} onClose={() => setSheet(null)} />
      <StatsSheet visible={sheet === "stats"} onClose={() => setSheet(null)} history={history} />
    </Screen>
  );
}

// Net-based result copy. Never celebrates when net <= 0.
function ResultLine({ phase, settled }: { phase: Phase; settled: Settled | null }) {
  if (phase === "closing") return <AppText style={styles.resultTitle}>No more bets</AppText>;
  if (phase === "spinning" || phase === "reveal") return <AppText style={styles.resultTitle}>Spinning…</AppText>;
  if (!settled) {
    return (
      <>
        <AppText style={styles.resultTitle}>Place your bets</AppText>
        <AppText variant="caption">Min 1 · Max 1,000 per spin</AppText>
      </>
    );
  }
  const { net, wagered, returned } = settled;
  if (net > 0) {
    return (
      <>
        <AppText style={[styles.resultTitle, { color: palette.emerald }]} testID="roulette-net">
          +{formatCoins(net)} coins
        </AppText>
        <AppText variant="caption">
          Returned {formatCoins(returned)} on {formatCoins(wagered)} bet
        </AppText>
      </>
    );
  }
  return (
    <>
      <AppText style={styles.resultTitle} testID="roulette-net">
        {net === 0 ? "Stakes returned" : returned > 0 ? `Returned ${formatCoins(returned)} of ${formatCoins(wagered)}` : "No win this spin"}
      </AppText>
      <AppText variant="caption">Net {net === 0 ? "0" : `−${formatCoins(-net)}`} coins</AppText>
    </>
  );
}

function IconAction({
  icon,
  text,
  label,
  onPress,
  disabled,
  active,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  text?: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptic("light");
        void playSound("ui_tap");
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      style={({ pressed }) => [styles.iconAction, disabled && styles.disabled, pressed && styles.pressed]}
      hitSlop={4}
    >
      <View style={[styles.iconCircle, active && styles.iconCircleActive]}>
        {icon ? (
          <Ionicons name={icon} size={18} color={active ? palette.goldInk : palette.goldLight} />
        ) : (
          <AppText style={styles.iconText}>{text}</AppText>
        )}
      </View>
      <AppText style={styles.iconLabel}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.s12, paddingBottom: spacing.sm },
  root: { flex: 1 },
  flex: { flex: 1 },
  centerFill: { flex: 1, justifyContent: "center" },
  band: { flexDirection: "row", gap: spacing.s12, height: COMPACT, marginBottom: spacing.sm },
  wheelSlot: { width: COMPACT, height: COMPACT },
  bandRight: { flex: 1, justifyContent: "space-between", paddingVertical: 1 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lastMedal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: palette.gold,
  },
  lastMedalText: { fontFamily: fonts.heavy, fontSize: 16, color: palette.ivory, fontVariant: ["tabular-nums"] },
  resultTitle: { fontFamily: fonts.display, fontSize: 15, color: palette.text, letterSpacing: 0.4 },
  fairRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  fairText: { color: palette.emerald },
  fairLink: { color: palette.gold, marginLeft: "auto" },
  boardArea: { flex: 1 },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  hint: { flex: 1, color: palette.goldLight, opacity: 0.85 },
  count: { color: palette.textDim, fontVariant: ["tabular-nums"] },
  rackRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  rack: { flex: 1, alignItems: "flex-start" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  spin: { flex: 1, marginLeft: 4 },
  iconAction: { alignItems: "center", width: 44, gap: 2 },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.45)",
  },
  iconCircleActive: { backgroundColor: palette.gold, borderColor: palette.goldLight },
  iconText: { fontFamily: fonts.heavy, fontSize: 15, color: palette.goldLight },
  iconLabel: { fontFamily: fonts.semibold, fontSize: 9.5, color: palette.textDim, letterSpacing: 0.3 },
  disabled: { opacity: 0.35 },
  pressed: { transform: [{ scale: 0.94 }] },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.bg },
  wheelHost: { position: "absolute", left: 0, top: 0 },
  banner: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.gold,
    backgroundColor: "rgba(7,9,15,0.85)",
  },
  bannerText: { fontFamily: fonts.display, fontSize: 18, color: palette.goldLight, letterSpacing: 2, textTransform: "uppercase" },
  medalWrap: { position: "absolute", width: 128, height: 128 },
  medal: {
    flex: 1,
    borderRadius: 64,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: palette.gold,
    shadowColor: palette.gold,
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  medalNum: { fontFamily: fonts.displayBlack, fontSize: 54, lineHeight: 62, color: palette.ivory, includeFontPadding: false },
  medalColor: { fontFamily: fonts.bold, fontSize: 11, color: palette.goldLight, letterSpacing: 2 },
});
