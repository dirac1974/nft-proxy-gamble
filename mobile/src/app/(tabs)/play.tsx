import React, { useCallback, useState } from "react";
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
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, radius, spacing, typography, shadows } from "@/theme";
import { Card } from "@/components/Card";
import { GlassCard } from "@/components/GlassCard";
import { ProvablyFairModal } from "@/components/ProvablyFairModal";
import { useGameStore } from "@/stores/gameStore";
import { useWalletStore } from "@/stores/walletStore";
import { gameApi } from "@/services/api";

const RANKS = ["Royal Flush", "Straight Flush", "Four of a Kind", "Full House",
  "Flush", "Straight", "Three of a Kind", "Two Pair", "Jacks or Better", "Lose"];

export default function VideoPokerScreen() {
  const qc = useQueryClient();
  const { isAuthenticated } = useWalletStore();
  const [verifyVisible, setVerifyVisible] = useState(false);
  const {
    phase, session, dealt, result, betAmount,
    setBetAmount, setSession, setDealt, toggleHold, setResult, reset,
    coinBalance,
  } = useGameStore();

  const payoutScale = useSharedValue(1);
  const payoutAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: payoutScale.value }] }));

  const triggerPayoutAnim = useCallback(() => {
    payoutScale.value = withSequence(
      withTiming(1.3, { duration: 200 }),
      withSpring(1, { damping: 6 })
    );
  }, [payoutScale]);

  // Mutations
  const startMutation = useMutation({
    mutationFn: () => gameApi.startSession(betAmount),
    onSuccess: (data) => setSession({ ...data, betAmount }),
  });

  const dealMutation = useMutation({
    mutationFn: () => gameApi.deal(session!.sessionId),
    onSuccess: (data) => setDealt(data.dealtCards),
  });

  const drawMutation = useMutation({
    mutationFn: () => gameApi.draw(session!.sessionId, dealt!.holds),
    onSuccess: (data) => {
      setResult(
        { drawnCards: data.drawnCards, rank: data.rank, payout: data.payout, serverSeed: data.serverSeed },
        data.newBalance
      );
      if (data.payout > 0) triggerPayoutAnim();
      qc.invalidateQueries({ queryKey: ["balance"] });
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

  // Button logic
  const onPrimaryPress = () => {
    if (phase === "idle" || phase === "drawn" || phase === "cashed_out") {
      startMutation.mutate();
    } else if (phase === "session_started") {
      dealMutation.mutate();
    } else if (phase === "dealt") {
      drawMutation.mutate();
    }
  };

  const primaryLabel =
    phase === "idle" ? "NEW GAME"
    : phase === "session_started" ? "DEAL"
    : phase === "dealt" ? "DRAW"
    : phase === "drawn" ? "PLAY AGAIN"
    : "NEW GAME";

  const displayCards = phase === "drawn" && result
    ? result.drawnCards
    : dealt?.dealtCards ?? null;

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
      {/* Bet selector */}
      <GlassCard style={styles.betCard}>
        <Text style={styles.betLabel}>BET PER HAND</Text>
        <View style={styles.betRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              style={[styles.betChip, betAmount === n && styles.betChipActive]}
              onPress={() => setBetAmount(n)}
              disabled={phase !== "idle" && phase !== "drawn"}
              accessibilityRole="button"
              accessibilityLabel={`Bet ${n} coin${n > 1 ? "s" : ""} per hand`}
              accessibilityState={{ selected: betAmount === n }}
            >
              <Text style={[styles.betChipText, betAmount === n && styles.betChipTextActive]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.betHint}>Cost: {betAmount} coin{betAmount > 1 ? "s" : ""}</Text>
      </GlassCard>

      {/* Card display */}
      <View style={styles.cardRow}>
        {displayCards
          ? displayCards.map((cardIndex, i) => (
              <Card
                key={i}
                cardIndex={cardIndex}
                held={dealt?.holds[i] ?? false}
                onToggleHold={() => phase === "dealt" && toggleHold(i)}
                disabled={phase !== "dealt"}
                testID={`card-${i}`}
              />
            ))
          : Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.cardPlaceholder}>
                <Text style={styles.cardPlaceholderText}>?</Text>
              </View>
            ))}
      </View>

      {/* Tap-to-hold hint */}
      {phase === "dealt" && (
        <Text style={styles.holdHint}>Tap cards to hold</Text>
      )}

      {/* Result */}
      {phase === "drawn" && result && (
        <Animated.View style={[styles.resultContainer, payoutAnimStyle]}>
          <GlassCard neonBorder={result.payout > 0}>
            <Text style={styles.resultRank}>{result.rank}</Text>
            {result.payout > 0 ? (
              <Text style={styles.resultPayout}>+{result.payout} coins 🎉</Text>
            ) : (
              <Text style={styles.resultLose}>No payout</Text>
            )}
            <Text style={styles.resultSeed} numberOfLines={1} ellipsizeMode="middle">
              Seed: {result.serverSeed}
            </Text>
            <Pressable
              onPress={() => setVerifyVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Verify this hand was dealt fairly"
            >
              <Text style={styles.verifyLink}>Verify provably fair ›</Text>
            </Pressable>
          </GlassCard>
        </Animated.View>
      )}

      {/* Primary action button */}
      <Pressable
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
        {isLoading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
        )}
      </Pressable>

      {/* Cashout */}
      {phase === "drawn" && coinBalance >= 100 && (
        <Pressable
          style={[styles.cashoutButton, cashoutMutation.isPending && styles.primaryButtonPressed]}
          onPress={() => cashoutMutation.mutate()}
          disabled={cashoutMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Cash out ${coinBalance} coins to NFT voucher`}
          accessibilityState={{ busy: cashoutMutation.isPending }}
        >
          {cashoutMutation.isPending
            ? <ActivityIndicator color={colors.neonGreen} />
            : <Text style={styles.cashoutText}>Cash Out {coinBalance} coins → NFT</Text>
          }
        </Pressable>
      )}

      {/* Paytable */}
      <GlassCard style={styles.paytable}>
        <Text style={styles.paytableTitle}>PAYTABLE (BET {betAmount})</Text>
        {PAYTABLE.map(({ rank, mult }) => {
          const payout = rank === "Royal Flush" && betAmount === 5 ? 800 : mult;
          return (
            <View key={rank} style={styles.paytableRow}>
              <Text style={styles.paytableHand}>{rank}</Text>
              <Text style={[
                styles.paytablePayout,
                result?.rank === rank && styles.paytableActive,
              ]}>
                {payout * betAmount}
              </Text>
            </View>
          );
        })}
      </GlassCard>

      {/* Error display */}
      {(startMutation.error || dealMutation.error || drawMutation.error) && (
        <Text style={styles.error}>
          {((startMutation.error ?? dealMutation.error ?? drawMutation.error) as Error).message}
        </Text>
      )}
    </ScrollView>

    {/* Provably fair verification modal */}
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

const PAYTABLE = [
  { rank: "Royal Flush",      mult: 250 },
  { rank: "Straight Flush",   mult: 50 },
  { rank: "Four of a Kind",   mult: 25 },
  { rank: "Full House",       mult: 9 },
  { rank: "Flush",            mult: 6 },
  { rank: "Straight",         mult: 4 },
  { rank: "Three of a Kind",  mult: 3 },
  { rank: "Two Pair",         mult: 2 },
  { rank: "Jacks or Better",  mult: 1 },
];

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  centred: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl },
  lockIcon: { fontSize: 48 },
  lockText: { ...typography.body, textAlign: "center", color: colors.textSecondary },

  betCard: { gap: spacing.sm },
  betLabel: { ...typography.caption, letterSpacing: 2 },
  betRow: { flexDirection: "row", gap: spacing.sm },
  betChip: {
    width: 44, height: 44, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },
  betChipActive: { borderColor: colors.neonGreen, backgroundColor: `${colors.neonGreen}22` },
  betChipText: { ...typography.body, color: colors.textMuted, fontWeight: "700" },
  betChipTextActive: { color: colors.neonGreen },
  betHint: { ...typography.caption },

  cardRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.xs },

  cardPlaceholder: {
    width: 58, height: 84, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.border, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
  },
  cardPlaceholderText: { fontSize: 24, color: colors.textMuted },

  holdHint: { ...typography.caption, textAlign: "center", letterSpacing: 1 },

  resultContainer: { gap: spacing.sm },
  resultRank: { ...typography.heading2, color: colors.neonGreen, textAlign: "center" },
  resultPayout: { ...typography.heading3, color: colors.win, textAlign: "center" },
  resultLose: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  resultSeed: { ...typography.mono, fontSize: 10, marginTop: spacing.xs },
  verifyLink: { ...typography.caption, color: colors.purple, textDecorationLine: "underline", marginTop: spacing.xs },

  primaryButton: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.lg,
    alignItems: "center",
    ...shadows.purple,
  },
  primaryButtonMax: { backgroundColor: colors.neonGreenDim },
  primaryButtonPressed: { opacity: 0.7 },
  primaryButtonText: { ...typography.heading3, color: colors.textPrimary },

  cashoutButton: {
    borderWidth: 2, borderColor: colors.neonGreen,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  cashoutText: { ...typography.body, color: colors.neonGreen, fontWeight: "700" },

  paytable: { gap: 6 },
  paytableTitle: { ...typography.caption, letterSpacing: 2, marginBottom: spacing.xs },
  paytableRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  paytableHand: { ...typography.bodySmall },
  paytablePayout: { ...typography.bodySmall, color: colors.textMuted },
  paytableActive: { color: colors.neonGreen, fontWeight: "700" },

  error: { ...typography.bodySmall, color: colors.lose, textAlign: "center" },
});
