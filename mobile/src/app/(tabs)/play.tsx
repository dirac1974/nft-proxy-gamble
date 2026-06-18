import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, radius, spacing, typography, shadows } from "@/theme";
import { Card } from "@/components/Card";
import { MeterBar } from "@/components/MeterBar";
import { WinOverlay, classifyWin, type WinTier } from "@/components/WinOverlay";
import { ProvablyFairModal } from "@/components/ProvablyFairModal";
import { useGameStore } from "@/stores/gameStore";
import { useWalletStore } from "@/stores/walletStore";
import { gameApi } from "@/services/api";
import { playSound } from "@/services/soundService";

// Classic single-line 9/6 Jacks-or-Better paytable. `base` = per-coin multiplier
// (× bet for columns 1–5); the Royal Flush jumps to 4000 only at the 5-coin column.
interface HandMeta {
  key: string;
  label: string;
  base: number;
}
const HAND_META: HandMeta[] = [
  { key: "ROYAL_FLUSH", label: "Royal Flush", base: 250 },
  { key: "STRAIGHT_FLUSH", label: "Straight Flush", base: 50 },
  { key: "FOUR_OF_A_KIND", label: "Four of a Kind", base: 25 },
  { key: "FULL_HOUSE", label: "Full House", base: 9 },
  { key: "FLUSH", label: "Flush", base: 6 },
  { key: "STRAIGHT", label: "Straight", base: 4 },
  { key: "THREE_OF_A_KIND", label: "Three of a Kind", base: 3 },
  { key: "TWO_PAIR", label: "Two Pair", base: 2 },
  { key: "JACKS_OR_BETTER", label: "Jacks or Better", base: 1 },
];
const BET_COLUMNS = [1, 2, 3, 4, 5];

function payoutCell(meta: HandMeta, col: number): number {
  if (meta.key === "ROYAL_FLUSH" && col === 5) return 4000;
  return meta.base * col;
}

// "Premium" = Four of a Kind or better (≥ 25× per coin): big celebration.
const PREMIUM_PER_COIN = 25;
const ROLLUP_TICK_MS = 80;
const ROLLUP_MAX_TICKS = 18; // 18 × 80 ms = 1440 ms ≤ 1500 ms budget

interface WinOverlayState {
  rank: string;
  payout: number;
  tier: WinTier;
}

export default function VideoPokerScreen() {
  const qc = useQueryClient();
  const { isAuthenticated } = useWalletStore();
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [winOverlay, setWinOverlay] = useState<WinOverlayState | null>(null);
  const [revealId, setRevealId] = useState(0);
  const [displayCredits, setDisplayCredits] = useState(0);
  const [displayWin, setDisplayWin] = useState(0);
  const rollupRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollingRef = useRef(false);

  const {
    phase, session, dealt, result, betAmount,
    setBetAmount, setSession, setDealt, toggleHold, setResult, reset,
    coinBalance,
  } = useGameStore();

  // Winning-row flash (400 ms on/off × 3) for the matched paytable row.
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,255,159,${0.28 * flash.value})`,
  }));
  const triggerRowFlash = useCallback(() => {
    flash.value = 0;
    flash.value = withRepeat(
      withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 200 })),
      3,
      false,
    );
  }, [flash]);

  // Keep the CREDITS meter in sync with the store except while a win rolls up.
  useEffect(() => {
    if (!rollingRef.current) setDisplayCredits(coinBalance);
  }, [coinBalance]);

  useEffect(() => () => {
    if (rollupRef.current) clearInterval(rollupRef.current);
  }, []);

  // Roll CREDITS up from (toBalance - win) to the post-win balance, ticking a
  // coin sound each step. `toBalance` is passed explicitly because the store's
  // coinBalance closure is stale inside the draw mutation's onSuccess.
  const runRollup = useCallback((win: number, toBalance: number) => {
    if (rollupRef.current) clearInterval(rollupRef.current);
    const base = toBalance - win;
    const steps = Math.max(1, Math.min(ROLLUP_MAX_TICKS, win));
    rollingRef.current = true;
    let i = 0;
    setDisplayWin(0);
    setDisplayCredits(base);
    rollupRef.current = setInterval(() => {
      i += 1;
      const frac = i / steps;
      setDisplayCredits(Math.round(base + win * frac));
      setDisplayWin(Math.round(win * frac));
      void playSound("coinDrop");
      if (i >= steps) {
        if (rollupRef.current) clearInterval(rollupRef.current);
        rollupRef.current = null;
        rollingRef.current = false;
        setDisplayCredits(toBalance);
        setDisplayWin(win);
      }
    }, ROLLUP_TICK_MS);
  }, []);

  // Mutations
  const startMutation = useMutation({
    mutationFn: () => gameApi.startSession(betAmount),
    onSuccess: (data) => setSession({ ...data, betAmount }),
  });

  const dealMutation = useMutation({
    mutationFn: () => gameApi.deal(session!.sessionId),
    onSuccess: (data) => {
      setDealt(data.dealtCards);
      setDisplayWin(0);
      setRevealId((n) => n + 1);
      void playSound("deal");
    },
  });

  const drawMutation = useMutation({
    mutationFn: () => gameApi.draw(session!.sessionId, dealt!.holds),
    onSuccess: (data) => {
      setResult(
        { drawnCards: data.drawnCards, rank: data.rank, payout: data.payout, serverSeed: data.serverSeed },
        data.newBalance,
      );
      setRevealId((n) => n + 1);
      qc.invalidateQueries({ queryKey: ["balance"] });

      if (data.payout > 0) {
        triggerRowFlash();
        runRollup(data.payout, data.newBalance);
        const perCoin = data.payout / betAmount;
        const tier = classifyWin(data.payout, betAmount) ?? "small";
        if (perCoin >= PREMIUM_PER_COIN) {
          setWinOverlay({ rank: data.rank, payout: data.payout, tier });
          void playSound("bigWin");
        } else {
          void playSound("win");
        }
      } else {
        void playSound("lose");
      }
    },
  });

  const cashoutMutation = useMutation({
    mutationFn: () => gameApi.cashout(session!.sessionId, coinBalance),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nfts"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      reset();
    },
  });

  const isLoading =
    startMutation.isPending || dealMutation.isPending || drawMutation.isPending;

  const onPrimaryPress = () => {
    if (phase === "idle" || phase === "drawn" || phase === "cashed_out") {
      startMutation.mutate();
    } else if (phase === "session_started") {
      dealMutation.mutate();
    } else if (phase === "dealt") {
      drawMutation.mutate();
    }
  };

  const onToggleHoldCard = useCallback((i: number) => {
    if (phase !== "dealt") return;
    toggleHold(i);
    void playSound("hold");
  }, [phase, toggleHold]);

  const primaryLabel =
    phase === "idle" ? "NEW GAME"
    : phase === "session_started" ? "DEAL"
    : phase === "dealt" ? "DRAW"
    : phase === "drawn" ? "PLAY AGAIN"
    : "NEW GAME";

  const canChangeBet = phase === "idle" || phase === "drawn" || phase === "cashed_out";
  const betLocked = !canChangeBet;

  const displayCards =
    phase === "drawn" && result ? result.drawnCards
    : phase === "dealt" && dealt ? dealt.dealtCards
    : null;

  if (!isAuthenticated) {
    return (
      <View style={styles.centred}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockText}>Connect your wallet on the Lobby tab to play.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Always-on paytable: 9 hands × 5 bet columns */}
        <View style={styles.paytable}>
          <View style={styles.payHeaderRow}>
            <Text style={[styles.payHand, styles.payHeaderText]}>HAND</Text>
            {BET_COLUMNS.map((col) => (
              <Text
                key={col}
                testID={`paycol-${col}`}
                style={[
                  styles.payCell,
                  styles.payHeaderText,
                  betAmount === col && styles.payColActive,
                ]}
              >
                {col}
              </Text>
            ))}
          </View>
          {HAND_META.map((meta) => {
            const isWinRow =
              phase === "drawn" && result?.rank === meta.key && (result?.payout ?? 0) > 0;
            const RowComp = isWinRow ? Animated.View : View;
            return (
              <RowComp
                key={meta.key}
                testID={`payrow-${meta.key}`}
                style={[styles.payRow, isWinRow && flashStyle]}
              >
                <Text style={[styles.payHand, isWinRow && styles.payHandWin]}>{meta.label}</Text>
                {BET_COLUMNS.map((col) => (
                  <Text
                    key={col}
                    style={[
                      styles.payCell,
                      betAmount === col && styles.payColActive,
                      isWinRow && styles.payCellWin,
                    ]}
                  >
                    {payoutCell(meta, col)}
                  </Text>
                ))}
              </RowComp>
            );
          })}
        </View>

        {/* Cabinet meter bar */}
        <MeterBar credits={displayCredits} bet={betAmount} win={displayWin} />

        {/* Cards */}
        <View style={styles.cardRow}>
          {displayCards
            ? displayCards.map((cardIndex, i) => {
                const isHeld = dealt?.holds[i] ?? false;
                const animate = phase === "dealt" || (phase === "drawn" && !isHeld);
                return (
                  <Card
                    key={`${revealId}-${i}`}
                    testID={`card-${i}`}
                    cardIndex={cardIndex}
                    held={isHeld}
                    onToggleHold={() => onToggleHoldCard(i)}
                    disabled={phase !== "dealt"}
                    dealIndex={animate ? i : undefined}
                  />
                );
              })
            : Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.cardBack} testID={`card-back-${i}`}>
                  <View style={styles.cardBackInner} />
                </View>
              ))}
        </View>

        {phase === "dealt" && <Text style={styles.holdHint}>Tap cards to HOLD</Text>}

        {/* Result line */}
        {phase === "drawn" && result && (
          <View style={styles.resultRow}>
            <Text
              testID="result-rank"
              style={[styles.resultRank, result.payout > 0 ? styles.resultWin : styles.resultLose]}
            >
              {result.payout > 0 ? HAND_META.find((m) => m.key === result.rank)?.label ?? result.rank : "No Win"}
            </Text>
            <Pressable onPress={() => setVerifyVisible(true)} accessibilityRole="button" accessibilityLabel="Verify this hand was dealt fairly">
              <Text style={styles.verifyLink}>Verify ›</Text>
            </Pressable>
          </View>
        )}

        {/* Bet controls + primary action */}
        <View style={styles.controls}>
          <View style={styles.betRow}>
            {BET_COLUMNS.map((n) => (
              <Pressable
                key={n}
                testID={`bet-${n}`}
                style={[styles.betChip, betAmount === n && styles.betChipActive]}
                onPress={() => setBetAmount(n)}
                disabled={betLocked}
                accessibilityRole="button"
                accessibilityLabel={`Bet ${n} coin${n > 1 ? "s" : ""}`}
                accessibilityState={{ selected: betAmount === n, disabled: betLocked }}
              >
                <Text style={[styles.betChipText, betAmount === n && styles.betChipTextActive]}>{n}</Text>
              </Pressable>
            ))}
            <Pressable
              testID="bet-max"
              style={[styles.betMax, betAmount === 5 && styles.betMaxActive]}
              onPress={() => setBetAmount(5)}
              disabled={betLocked}
              accessibilityRole="button"
              accessibilityLabel="Bet max, 5 coins"
            >
              <Text style={[styles.betMaxText, betAmount === 5 && styles.betMaxTextActive]}>BET MAX</Text>
            </Pressable>
          </View>

          <Pressable
            testID="primary-button"
            style={({ pressed }) => [
              styles.primaryButton,
              betAmount === 5 && styles.primaryButtonMax,
              (pressed || isLoading) && styles.primaryButtonPressed,
            ]}
            onPress={onPrimaryPress}
            disabled={isLoading || cashoutMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityState={{ busy: isLoading }}
          >
            {isLoading
              ? <ActivityIndicator color={colors.background} />
              : <Text style={styles.primaryButtonText}>{primaryLabel}</Text>}
          </Pressable>

          {phase === "drawn" && coinBalance >= 100 && (
            <Pressable
              testID="cashout-button"
              style={[styles.cashoutButton, cashoutMutation.isPending && styles.primaryButtonPressed]}
              onPress={() => cashoutMutation.mutate()}
              disabled={cashoutMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Cash out ${coinBalance} coins to NFT voucher`}
              accessibilityState={{ busy: cashoutMutation.isPending }}
            >
              {cashoutMutation.isPending
                ? <ActivityIndicator color={colors.neonGreen} />
                : <Text style={styles.cashoutText}>CASH OUT {coinBalance} → NFT</Text>}
            </Pressable>
          )}
        </View>

        {(startMutation.error || dealMutation.error || drawMutation.error) && (
          <Text style={styles.error}>
            {((startMutation.error ?? dealMutation.error ?? drawMutation.error) as Error).message}
          </Text>
        )}
      </ScrollView>

      {winOverlay && (
        <WinOverlay
          visible={!!winOverlay}
          rank={HAND_META.find((m) => m.key === winOverlay.rank)?.label ?? winOverlay.rank}
          payout={winOverlay.payout}
          tier={winOverlay.tier}
          onDismiss={() => setWinOverlay(null)}
        />
      )}

      {session && dealt && result && (
        <ProvablyFairModal
          visible={verifyVisible}
          onClose={() => setVerifyVisible(false)}
          session={session}
          dealt={dealt}
          result={result}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

  centred: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  lockIcon: { fontSize: 48 },
  lockText: { ...typography.body, textAlign: "center", color: colors.textSecondary },

  // Paytable
  paytable: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  payHeaderRow: { flexDirection: "row", alignItems: "center", paddingBottom: 4, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  payHeaderText: { color: colors.textMuted, fontWeight: "700", fontSize: 11 },
  payRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3, borderRadius: 4 },
  payHand: { flex: 1, ...typography.bodySmall, color: colors.warning, fontWeight: "700", fontSize: 12 },
  payHandWin: { color: colors.neonGreen },
  payCell: { width: 40, textAlign: "right", ...typography.mono, fontSize: 11, color: colors.warning },
  payCellWin: { color: colors.neonGreen, fontWeight: "700" },
  payColActive: { color: colors.textPrimary, backgroundColor: `${colors.warning}22` },

  // Cards
  cardRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.xs, minHeight: 100, alignItems: "center" },
  cardBack: {
    width: 58, height: 84, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    justifyContent: "center", alignItems: "center", padding: 4,
  },
  cardBackInner: {
    flex: 1, alignSelf: "stretch", borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.purple,
    backgroundColor: `${colors.purple}44`,
  },
  holdHint: { ...typography.caption, textAlign: "center", letterSpacing: 2, color: colors.neonGreen },

  // Result
  resultRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.md },
  resultRank: { ...typography.heading3, textAlign: "center" },
  resultWin: { color: colors.neonGreen },
  resultLose: { color: colors.textMuted },
  verifyLink: { ...typography.caption, color: colors.purple, textDecorationLine: "underline" },

  // Controls
  controls: { gap: spacing.sm },
  betRow: { flexDirection: "row", gap: spacing.xs, alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  betChip: {
    width: 40, height: 40, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },
  betChipActive: { borderColor: colors.warning, backgroundColor: `${colors.warning}22` },
  betChipText: { ...typography.body, color: colors.textMuted, fontWeight: "700" },
  betChipTextActive: { color: colors.warning },
  betMax: {
    paddingHorizontal: spacing.md, height: 40, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.border, justifyContent: "center", alignItems: "center",
  },
  betMaxActive: { borderColor: colors.warning, backgroundColor: `${colors.warning}22` },
  betMaxText: { ...typography.caption, color: colors.textMuted, fontWeight: "800", letterSpacing: 1 },
  betMaxTextActive: { color: colors.warning },

  primaryButton: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.lg,
    alignItems: "center",
    ...shadows.purple,
  },
  primaryButtonMax: { backgroundColor: colors.neonGreenDim },
  primaryButtonPressed: { opacity: 0.7 },
  primaryButtonText: { ...typography.heading3, color: colors.textPrimary, letterSpacing: 2 },

  cashoutButton: {
    borderWidth: 2, borderColor: colors.neonGreen,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  cashoutText: { ...typography.body, color: colors.neonGreen, fontWeight: "700" },

  error: { ...typography.bodySmall, color: colors.lose, textAlign: "center" },
});
