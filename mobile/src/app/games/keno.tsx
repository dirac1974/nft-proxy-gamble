import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fonts, palette, radius, spacing } from "@/theme";
import { AppText, Button, EmptyState, FairnessBadge, GameHeader, Screen, Toast, haptic, type FairnessState, type ToastTone } from "@/components/ui";
import { RESTRICTED_PLAY } from "@/config/compliance";
import { WinOverlay, classifyWin, type WinTier } from "@/components/WinOverlay";
import { useRgBlock } from "@/components/shell/RgBlockNotice";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { balanceApi } from "@/services/api";
import { kenoApi, type KenoPlayResult, type KenoSession } from "@/services/kenoApi";
import { isKenoVerified, verifyKenoDraw } from "@/services/kenoFair";
import { playSound, type SfxKey } from "@/services/soundService";
import { formatCoins } from "@/config/brand";
import { KenoBoard, BOARD_PAD, DIVIDER_H } from "@/components/keno/KenoBoard";
import { PaytableStrip, ResultBanner } from "@/components/keno/KenoStrip";
import { CardTabs, type TabInfo } from "@/components/keno/CardTabs";
import { CoachMark, useCoachMarks } from "@/components/keno/CoachMarks";
import { BetSheet, CardMenuSheet, FairnessSheet, HistorySheet, RulesSheet, type KenoRound } from "@/components/keno/KenoSheets";
import {
  BOARD_COLS,
  BOARD_ROWS,
  CARD_STYLES,
  DEFAULT_BET,
  DEFAULT_QP_COUNT,
  LIMIT_COPY,
  MAX_SPOTS,
  apiCards,
  cardCount,
  cardResultCopy,
  classifyReturn,
  countCatches,
  drawSchedule,
  effectiveSpeed,
  emptyCards,
  findIdentical,
  hitSoundIndex,
  humanizeKenoError,
  playBlock,
  playLabel,
  playedCardIndexes,
  quickPick,
  quickPickAll,
  roundSummary,
  toggleSpot,
  totalWager,
  type KenoMode,
  type KenoSpeed,
} from "@/components/keno/kenoModel";

type HitIdx = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
const sfx = (k: SfxKey) => void playSound(k);

type Phase = "idle" | "requesting" | "drawing" | "settled";
type Sheet = "rules" | "bet" | "menu" | "history" | "fair" | null;

const GAP = 6;
const SIDE = spacing.sm;
const HISTORY_KEEP = 20;
const SPEED_KEY = "keno.speed.v1";
const TITLES: Record<KenoMode, string> = { single: "Midnight Keno", quad: "Midnight Keno ×4" };

export default function KenoScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: KenoMode = params.mode === "quad" ? "quad" : "single";
  const quad = mode === "quad";

  const qc = useQueryClient();
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const openIAP = useUiStore((s) => s.openIAP);
  const openConnect = useUiStore((s) => s.openConnect);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const { data: balanceData } = useQuery({ queryKey: ["balance"], queryFn: balanceApi.get, enabled: isAuthenticated });
  const balance = balanceData ?? 0;

  const [cards, setCards] = useState<number[][]>(() => emptyCards(mode));
  const [active, setActive] = useState(0);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [qpCount, setQpCount] = useState(DEFAULT_QP_COUNT);
  const [speed, setSpeed] = useState<KenoSpeed>("normal");
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState<KenoRound | null>(null);
  const [revealCount, setRevealCount] = useState(0);
  const [history, setHistory] = useState<KenoRound[]>([]);
  const [session, setSession] = useState<KenoSession | null>(null);
  const [pendingDebit, setPendingDebit] = useState<{ before: number; wager: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [overlay, setOverlay] = useState<{ tier: WinTier; title: string; amount: number } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  const sessionPromise = useRef<Promise<KenoSession | null> | null>(null);
  const cardsRef = useRef(cards);
  const activeRef = useRef(active);
  const phaseRef = useRef(phase);
  const roundRef = useRef<{ round: KenoRound; result: KenoPlayResult } | null>(null);
  cardsRef.current = cards;
  activeRef.current = active;
  phaseRef.current = phase;

  const coach = useCoachMarks(mode, isAuthenticated);

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

  // Mode change via params (same screen instance) resets the ticket.
  useEffect(() => {
    if (cardsRef.current.length !== cardCount(mode)) {
      setCards(emptyCards(mode));
      setActive(0);
      setRound(null);
      setPhase("idle");
      setSession(null);
    }
  }, [mode]);

  useEffect(() => {
    AsyncStorage.getItem(SPEED_KEY)
      .then((v) => {
        if (mounted.current && (v === "normal" || v === "fast" || v === "instant")) setSpeed(v);
      })
      .catch(() => null);
  }, []);
  const onSpeed = useCallback((s: KenoSpeed) => {
    setSpeed(s);
    AsyncStorage.setItem(SPEED_KEY, s).catch(() => null);
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "warn") => setToast({ message, tone }), []);
  const { intercept: rgIntercept, notice: rgNotice } = useRgBlock();
  const hideToast = useCallback(() => setToast(null), []);

  // ---- provably-fair session: committed before numbers are picked; prefetched after each play ----
  const ensureSession = useCallback((): Promise<KenoSession | null> => {
    if (sessionPromise.current) return sessionPromise.current;
    const p = kenoApi
      .startSession(mode)
      .then((s) => {
        if (mounted.current) setSession(s);
        return s;
      })
      .catch((e: unknown) => {
        if (mounted.current && !rgIntercept(e)) showToast(humanizeKenoError(e), "danger");
        return null;
      })
      .finally(() => {
        sessionPromise.current = null;
      });
    sessionPromise.current = p;
    return p;
  }, [mode, showToast, rgIntercept]);

  useEffect(() => {
    if (isAuthenticated && !session) void ensureSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, mode]);

  const locked = phase === "requesting" || phase === "drawing";

  // Any ticket edit after a draw returns to the paytable view.
  const editTicket = useCallback((next: number[][]) => {
    setCards(next);
    if (phaseRef.current === "settled") {
      setPhase("idle");
      setRound(null);
    }
  }, []);

  // ---- marking ----
  const onToggle = useCallback(
    (n: number) => {
      if (phaseRef.current === "requesting" || phaseRef.current === "drawing") return;
      const idx = activeRef.current;
      const cur = cardsRef.current;
      const r = toggleSpot(cur[idx]!, n);
      if (!r.ok) {
        if (r.reason === "max") {
          haptic("warning");
          sfx("keno_max_spots");
          showToast(LIMIT_COPY.max);
        }
        return;
      }
      haptic("light");
      sfx(r.added ? "keno_mark" : "keno_unmark");
      editTicket(cur.map((c, i) => (i === idx ? r.spots : c)));
    },
    [editTicket, showToast],
  );

  const onQuickPick = useCallback(() => {
    if (locked) return;
    const others = cards.filter((_, i) => i !== active);
    haptic("medium");
    sfx("keno_quickpick");
    editTicket(cards.map((c, i) => (i === active ? quickPick(qpCount, others) : c)));
  }, [locked, cards, active, qpCount, editTicket]);

  const onQuickPickAll = useCallback(() => {
    if (locked) return;
    haptic("medium");
    sfx("keno_quickpick");
    editTicket(quickPickAll(cards, qpCount));
    setSheet(null);
  }, [locked, cards, qpCount, editTicket]);

  const onClear = useCallback(() => {
    if (locked || cards[active]!.length === 0) return;
    haptic("light");
    sfx("keno_clear");
    editTicket(cards.map((c, i) => (i === active ? [] : c)));
  }, [locked, cards, active, editTicket]);

  const onClearAll = useCallback(() => {
    if (locked) return;
    haptic("medium");
    sfx("keno_clear");
    editTicket(emptyCards(mode));
    setSheet(null);
  }, [locked, mode, editTicket]);

  const onCopyFrom = useCallback(
    (from: number) => {
      if (locked) return;
      const next = cards.map((c, i) => (i === active ? [...cards[from]!] : c));
      editTicket(next);
      setSheet(null);
      sfx("keno_quickpick");
      showToast(`Copied from card ${CARD_STYLES[from]!.letter} — change a number so the cards differ.`, "info");
    },
    [locked, cards, active, editTicket, showToast],
  );

  const onBet = useCallback((v: number) => {
    haptic("select");
    sfx("chip_place");
    setBet(v);
  }, []);

  const cycleQp = useCallback(() => {
    haptic("select");
    setQpCount((c) => (c >= MAX_SPOTS ? 1 : c + 1));
  }, []);

  // ---- draw presentation ----
  const settle = useCallback(() => {
    const cur = roundRef.current;
    if (!cur || phaseRef.current === "settled") return;
    clearTimers();
    const { round: rd, result: r } = cur;
    setRevealCount(rd.drawn.length);
    setPhase("settled");
    phaseRef.current = "settled";
    setPendingDebit(null);
    qc.setQueryData(["balance"], r.newBalance);
    setHistory((h) => [rd, ...h].slice(0, HISTORY_KEEP));
    AccessibilityInfo.announceForAccessibility(roundSummary(rd.mode, rd.cards, r.totalReturn, r.totalWagered));

    const kind = classifyReturn(r.totalReturn, r.totalWagered);
    if (kind !== "win") return; // LDW/push/loss: no celebration, no sound
    const net = r.totalReturn - r.totalWagered;
    const tier = classifyWin(net, r.totalWagered);
    if (tier === "medium" || tier === "big") {
      const best = rd.cards.reduce((a, b) => (b.payout > a.payout ? b : a), rd.cards[0]!);
      haptic("success");
      sfx(tier === "big" ? "win_big" : "win_medium");
      setOverlay({ tier, title: `Catch ${best.catches} of ${best.spots.length}`, amount: net });
    } else {
      haptic("success");
      sfx("win_small");
    }
  }, [clearTimers, qc]);

  const startDraw = useCallback(
    (rd: KenoRound, played: number[][]) => {
      const eff = effectiveSpeed(speed, reduceMotion);
      const { times, total } = drawSchedule(rd.drawn, played, eff);
      setRevealCount(0);
      setPhase("drawing");
      phaseRef.current = "drawing";
      if (eff === "instant") sfx("keno_ball_1");
      rd.drawn.forEach((_, i) => {
        later(times[i]!, () => {
          setRevealCount(i + 1);
          if (eff === "instant") return;
          const hit = hitSoundIndex(rd.drawn, i, played);
          if (hit !== null) {
            haptic("light");
            sfx(`keno_hit_${hit as HitIdx}`);
          } else if (eff === "normal") {
            sfx(`keno_ball_${((i % 3) + 1) as 1 | 2 | 3}`);
          }
        });
      });
      later(total + 250, settle);
    },
    [speed, reduceMotion, later, settle],
  );

  // Backgrounded mid-draw → jump straight to the settled state.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" && phaseRef.current === "drawing") settle();
    });
    return () => sub.remove();
  }, [settle]);

  // RESTRICTED_PLAY: the draw can't be skipped (min game cycle).
  const canSkip = !RESTRICTED_PLAY;
  const onSkip = useCallback(() => {
    if (canSkip && phaseRef.current === "drawing") settle();
  }, [canSkip, settle]);

  // ---- PLAY ----
  const wager = totalWager(cards, bet);
  const block = playBlock(mode, cards, bet);

  const onPlay = useCallback(async () => {
    if (locked) return;
    if (block === "empty") {
      showToast(LIMIT_COPY.empty);
      return;
    }
    if (block === "identical") {
      haptic("warning");
      showToast(LIMIT_COPY.identical);
      return;
    }
    if (block) return;
    if (balanceData !== undefined && balance < wager) {
      haptic("warning");
      showToast(`Not enough coins for a ${wager}-coin draw. Tap + to add coins.`);
      return;
    }
    setOverlay(null);
    setPhase("requesting");
    phaseRef.current = "requesting";
    setRound(null);
    clearTimers();
    haptic("medium");
    sfx("keno_play");

    const playedIdx = playedCardIndexes(cards);
    const played = playedIdx.map((i) => cards[i]!);
    try {
      const s = session ?? (await ensureSession());
      if (!s) throw new Error("network: no session");
      setSession(null);
      setPendingDebit({ before: balance, wager });
      const r = await kenoApi.play(s.sessionId, apiCards(cards, bet));
      if (!mounted.current) return;
      const verification = verifyKenoDraw(r.serverSeed, r.serverSeedHash, r.clientSeed, r.nonce, r.drawn);
      // results[].cardIndex indexes the submitted (played-only) cards → map back to the A–D slot.
      const rdCards = r.results.map((res, k) => {
        const slot = playedIdx[res.cardIndex] ?? playedIdx[k] ?? k;
        return { cardIndex: slot, spots: res.spots, catches: res.catches, payout: res.payout };
      });
      const rd: KenoRound = {
        id: `${s.sessionId}`,
        at: Date.now(),
        mode,
        drawn: r.drawn,
        cards: rdCards,
        totalWagered: r.totalWagered,
        totalReturn: r.totalReturn,
        capped: r.capped,
        serverSeed: r.serverSeed,
        serverSeedHash: r.serverSeedHash,
        clientSeed: r.clientSeed,
        nonce: r.nonce,
        verification,
      };
      roundRef.current = { round: rd, result: r };
      setRound(rd);
      startDraw(rd, played);
    } catch (e) {
      if (!mounted.current) return;
      setPhase("idle");
      phaseRef.current = "idle";
      setPendingDebit(null);
      haptic("error");
      if (!rgIntercept(e)) showToast(humanizeKenoError(e), "danger");
      void qc.invalidateQueries({ queryKey: ["balance"] });
    } finally {
      if (mounted.current) void ensureSession();
    }
  }, [locked, block, balanceData, balance, wager, cards, bet, session, mode, ensureSession, startDraw, clearTimers, showToast, rgIntercept, qc]);

  // ---- layout: fit the board in whatever height is left (375×667 without scrolling) ----
  const onArea = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea((a) => (a.w === width && a.h === height ? a : { w: width, h: height }));
  }, []);
  const chrome = BOARD_PAD * 2 + 4;
  const cellW = area.w ? Math.floor((area.w - chrome) / BOARD_COLS) : 34;
  // Cells grow to fill the available height (taller than wide on long phones).
  const cellH = area.h ? Math.max(28, Math.min(Math.round(cellW * 1.6), Math.floor((area.h - chrome - DIVIDER_H) / BOARD_ROWS))) : 40;

  // ---- derived view ----
  const showDraw = (phase === "drawing" || phase === "settled") && round;
  const drawnShown = useMemo(() => (showDraw ? round!.drawn.slice(0, revealCount) : []), [showDraw, round, revealCount]);
  const drawnSet = useMemo(() => new Set(drawnShown), [drawnShown]);
  const settled = phase === "settled" && round;

  const tabs: TabInfo[] = cards.map((c, i) => {
    const res = settled ? round!.cards.find((x) => x.cardIndex === i) : undefined;
    return {
      spots: c.length,
      catches: showDraw && c.length ? countCatches(c, drawnSet) : null,
      payout: settled ? (res?.payout ?? 0) : null,
    };
  });
  const liveCatches = showDraw && phase === "drawing" ? countCatches(cards[active]!, drawnSet) : null;

  // Quad: summarise every card ("A 2/5 · B 1/5 …") + best pay; per-card detail lives on the tabs.
  const bannerDetail = useMemo(() => {
    if (!settled) return "";
    if (quad) return quadSummary(round!.cards);
    const res = round!.cards[0];
    return res ? cardResultCopy(res.catches, res.spots.length, res.payout) : "";
  }, [settled, round, quad]);

  const displayBalance = pendingDebit ? pendingDebit.before - pendingDebit.wager : balance;
  const lastRound = history[0] ?? null;
  const verified = isKenoVerified(lastRound?.verification);
  const fairState: FairnessState = lastRound ? (verified ? "verified" : "failed") : session ? "sealed" : "pending";
  const identical = findIdentical(cards);

  const hideOverlay = useCallback(() => setOverlay(null), []);

  const rules = (
    <RulesSheet
      visible={sheet === "rules"}
      onClose={() => setSheet(null)}
      mode={mode}
      speed={speed}
      onSpeed={onSpeed}
      reduceMotion={reduceMotion}
      onReplayTips={() => {
        setSheet(null);
        coach.replay();
      }}
      onHistory={() => setSheet("history")}
    />
  );

  if (!isAuthenticated) {
    return (
      <Screen edges={["top", "bottom"]} header={<GameHeader title={TITLES[mode]} balance={0} onInfo={() => setSheet("rules")} />}>
        <View style={styles.centerFill}>
          <EmptyState
            icon="wallet-outline"
            title="Connect to play"
            body="Connect your wallet to play Midnight Keno. You can look at the pays first."
            cta={{ label: "Connect wallet", onPress: openConnect, testID: "keno-connect" }}
            testID="keno-locked"
          />
          <Button label="See pays" variant="ghost" icon="grid-outline" onPress={() => setSheet("rules")} testID="keno-see-pays" />
        </View>
        {rules}
      </Screen>
    );
  }

  const playText =
    phase === "requesting" || (phase === "drawing" && !canSkip) ? "Drawing…" : phase === "drawing" ? "Tap board to skip" : playLabel(mode, cards, bet);

  return (
    <Screen
      edges={["top", "bottom"]}
      contentStyle={styles.content}
      testID="keno-screen"
      header={
        <GameHeader
          title={TITLES[mode]}
          subtitle={quad ? "4 cards · one draw · 20 of 80" : "20 of 80 drawn"}
          balance={displayBalance}
          onAddCoins={openIAP}
          onInfo={() => setSheet("rules")}
        />
      }
    >
      <Toast message={toast?.message ?? null} tone={toast?.tone ?? "warn"} onHide={hideToast} />
      {rgNotice}

      {settled ? (
        <ResultBanner
          key={round!.id}
          totalReturn={round!.totalReturn}
          wagered={round!.totalWagered}
          detail={bannerDetail}
          capped={round!.capped}
          reduceMotion={reduceMotion}
          onPress={() => setSheet("history")}
        />
      ) : (
        <PaytableStrip
          mode={mode}
          activeCard={active}
          spots={cards[active]!.length}
          bet={bet}
          liveCatches={liveCatches}
          onPress={() => setSheet("rules")}
        />
      )}

      <View style={styles.boardArea} onLayout={onArea}>
        <KenoBoard
          mode={mode}
          cards={cards}
          activeCard={active}
          drawn={drawnShown}
          cellW={cellW}
          cellH={cellH}
          disabled={locked}
          drawing={phase === "drawing" && canSkip}
          reduceMotion={reduceMotion}
          onToggle={onToggle}
          onSkip={onSkip}
        />
      </View>

      {quad ? (
        <CardTabs
          tabs={tabs}
          active={active}
          disabled={locked}
          onSelect={setActive}
          onLongPress={(i) => {
            setActive(i);
            setSheet("menu");
          }}
        />
      ) : null}

      <View style={styles.controls}>
        <Pressable
          onPress={cycleQp}
          disabled={locked}
          style={[styles.qpCount, locked && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={`Quick pick spots ${qpCount}. Tap to change`}
          testID="keno-qp-count"
        >
          <AppText style={styles.qpCountLabel}>SPOTS</AppText>
          <AppText style={styles.qpCountText}>{qpCount}</AppText>
        </Pressable>
        <Ctl icon="shuffle" label="Quick Pick" onPress={onQuickPick} disabled={locked} testID="keno-qp" flex />
        <Ctl
          icon="backspace-outline"
          label="Clear"
          onPress={onClear}
          onLongPress={quad ? onClearAll : undefined}
          disabled={locked || cards[active]!.length === 0}
          testID="keno-clear"
        />
        {quad ? (
          <Ctl icon="ellipsis-horizontal" label="" a11y="Card options" onPress={() => setSheet("menu")} disabled={locked} testID="keno-menu" />
        ) : null}
        <Pressable
          onPress={() => setSheet("bet")}
          disabled={locked}
          style={[styles.betPill, locked && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={`Bet ${bet} coins per card. Change bet`}
          testID="keno-bet"
        >
          <AppText style={styles.betText}>Bet {bet}</AppText>
          <Ionicons name="chevron-down" size={14} color={palette.goldInk} />
        </Pressable>
      </View>

      <Button
        label={playText}
        onPress={phase === "drawing" ? onSkip : () => void onPlay()}
        disabled={phase === "drawing" ? !canSkip : locked || block !== null}
        loading={phase === "requesting"}
        variant={phase === "drawing" ? "secondary" : "primary"}
        haptic={false}
        sound={false}
        fullWidth
        testID="keno-play"
        accessibilityLabel={
          phase === "drawing"
            ? canSkip
              ? "Skip to result"
              : "Drawing"
            : block === "empty"
              ? "Pick numbers to play"
              : identical
                ? LIMIT_COPY.identical
                : `Play, total ${wager} coins`
        }
      />

      <View style={styles.footer}>
        <FairnessBadge state={fairState} onPress={() => setSheet("fair")} testID="keno-fairness" />
        <Pressable onPress={() => setSheet("history")} hitSlop={8} accessibilityRole="button" testID="keno-history">
          <AppText style={styles.link}>History ›</AppText>
        </Pressable>
      </View>

      {coach.step !== null ? <CoachMark mode={mode} step={coach.step} onNext={coach.next} onSkip={coach.finish} /> : null}

      {rules}
      <BetSheet
        visible={sheet === "bet"}
        onClose={() => setSheet(null)}
        bet={bet}
        onBet={onBet}
        mode={mode}
        playedCards={playedCardIndexes(cards).length}
        balance={balance}
      />
      {quad ? (
        <CardMenuSheet
          visible={sheet === "menu"}
          onClose={() => setSheet(null)}
          active={active}
          cards={cards}
          onCopyFrom={onCopyFrom}
          onQuickPickAll={onQuickPickAll}
          onClearAll={onClearAll}
        />
      ) : null}
      <HistorySheet visible={sheet === "history"} onClose={() => setSheet(null)} rounds={history} />
      <FairnessSheet
        visible={sheet === "fair"}
        onClose={() => setSheet(null)}
        round={lastRound}
        nextCommitHash={session?.serverSeedHash ?? null}
      />
      <WinOverlay
        visible={!!overlay}
        tier={overlay?.tier ?? "small"}
        title={overlay?.title ?? ""}
        amount={overlay?.amount ?? 0}
        onDismiss={hideOverlay}
        silent
      />
    </Screen>
  );
}

function quadSummary(cards: KenoRound["cards"]): string {
  const parts = [...cards]
    .sort((a, b) => a.cardIndex - b.cardIndex)
    .map((c) => `${CARD_STYLES[c.cardIndex]!.letter} ${c.catches}/${c.spots.length}`);
  const best = cards.reduce<KenoRound["cards"][number] | null>((a, b) => (b.payout > (a?.payout ?? 0) ? b : a), null);
  const tail = best ? `Best ${CARD_STYLES[best.cardIndex]!.letter} pays ${formatCoins(best.payout)}` : "No card paid";
  return `${parts.join(" · ")} — ${tail}`;
}

interface CtlProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  a11y?: string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  flex?: boolean;
  testID?: string;
}

function Ctl({ icon, label, a11y, onPress, onLongPress, disabled, flex, testID }: CtlProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityHint={onLongPress ? "Long press to clear all cards" : undefined}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.ctl, flex && styles.flex, !label && styles.ctlIcon, pressed && styles.ctlPressed, disabled && styles.dim]}
    >
      <Ionicons name={icon} size={16} color={palette.gold} />
      {label ? (
        <AppText style={styles.ctlText} numberOfLines={1}>
          {label}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SIDE, paddingBottom: spacing.xs, gap: GAP },
  centerFill: { flex: 1, justifyContent: "center", gap: spacing.sm },
  boardArea: { flex: 1, minHeight: 0, justifyContent: "center" },
  controls: { flexDirection: "row", alignItems: "center", gap: GAP, height: 44 },
  flex: { flex: 1 },
  qpCount: {
    minWidth: 50,
    height: 44,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: palette.gold,
    backgroundColor: "#020414",
    alignItems: "center",
    justifyContent: "center",
  },
  qpCountLabel: { fontFamily: fonts.bold, fontSize: 9, lineHeight: 11, color: palette.textDim, letterSpacing: 0.8 },
  qpCountText: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 19, color: palette.gold, fontVariant: ["tabular-nums"] },
  ctl: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.45)",
  },
  ctlIcon: { width: 44, paddingHorizontal: 0 },
  ctlPressed: { backgroundColor: palette.surface },
  ctlText: { fontFamily: fonts.bold, fontSize: 12, color: palette.text, letterSpacing: 0.3 },
  betPill: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: palette.gold,
  },
  betText: { fontFamily: fonts.heavy, fontSize: 13, color: palette.goldInk, fontVariant: ["tabular-nums"] },
  dim: { opacity: 0.4 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 28 },
  link: { fontFamily: fonts.bold, fontSize: 13, color: palette.gold, marginLeft: 4 },
});
