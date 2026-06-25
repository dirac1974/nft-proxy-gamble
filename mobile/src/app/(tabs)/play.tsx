import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, gradients, motion, radius, spacing, typography, shadows } from "@/theme";
import { Card } from "@/components/Card";
import { GlassCard } from "@/components/GlassCard";
import { ProvablyFairModal } from "@/components/ProvablyFairModal";
import { GradientBackground, NeonButton, haptic } from "@/components/ui";
import { WinOverlay, classifyWin, type WinTier } from "@/components/WinOverlay";
import { playSound } from "@/services/soundService";
import { useGameStore } from "@/stores/gameStore";
import { useWalletStore } from "@/stores/walletStore";
import { gameApi } from "@/services/api";

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
    onSuccess: (data) => {
      setDealt(data.dealtCards);
      void playSound("deal");
      haptic("light");
    },
  });

  const drawMutation = useMutation({
    mutationFn: () => gameApi.draw(session!.sessionId, dealt!.holds),
    onSuccess: (data) => {
      setResult(
        { drawnCards: data.drawnCards, rank: data.rank, payout: data.payout, serverSeed: data.serverSeed },
        data.newBalance
      );
      if (data.payout > 0) {
        triggerPayoutAnim();
        const tier = classifyWin(data.payout, betAmount);
        if (tier) {
          setWinOverlay({ rank: data.rank, payout: data.payout, tier });
          void playSound(tier === "big" ? "bigWin" : "win");
          haptic(tier === "big" ? "heavy" : "success");
        }
      } else {
        void playSound("lose");
      }
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

  const onSelectBet = (n: number) => {
    if (n === betAmount) return;
    haptic("select");
    setBetAmount(n);
  };

  const onToggleHoldCard = (i: number) => {
    if (phase !== "dealt") return;
    void playSound("hold");
    haptic("select");
    toggleHold(i);
  };

  const primaryLabel =
    phase === "idle" ? "NEW GAME"
    : phase === "session_started" ? "DEAL"
    : phase === "dealt" ? "DRAW"
    : phase === "drawn" ? "PLAY AGAIN"
    : "NEW GAME";

  const betDisabled = phase !== "idle" && phase !== "drawn";

  const displayCards = phase === "drawn" && result
    ? result.drawnCards
    : dealt?.dealtCards ?? null;

  if (!isAuthenticated) {
    return (
      <GradientBackground>
        <View style={styles.centred}>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={36} color={colors.purpleGlow} />
          </View>
          <Text style={styles.lockText}>Connect your wallet on the Lobby tab to play.</Text>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Bet selector */}
        <GlassCard style={styles.betCard}>
          <View style={styles.betHeader}>
            <MaterialCommunityIcons name="poker-chip" size={16} color={colors.gold} />
            <Text style={styles.betLabel}>BET PER HAND</Text>
          </View>
          <View style={styles.betRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <BetChip
                key={n}
                value={n}
                selected={betAmount === n}
                disabled={betDisabled}
                onPress={() => onSelectBet(n)}
              />
            ))}
          </View>
          <View style={styles.betCostRow}>
            <MaterialCommunityIcons name="circle-multiple" size={13} color={colors.gold} />
            <Text style={styles.betHint}>
              Cost: <Text style={styles.betHintStrong}>{betAmount}</Text> coin{betAmount > 1 ? "s" : ""}
            </Text>
          </View>
        </GlassCard>

        {/* Card table — felt */}
        <View style={styles.feltOuter}>
          <LinearGradient
            colors={gradients.screenWarm}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.felt}
          >
            <View style={styles.feltInner}>
              <View style={styles.cardRow}>
                {displayCards
                  ? displayCards.map((cardIndex, i) => (
                      <Card
                        key={i}
                        cardIndex={cardIndex}
                        held={dealt?.holds[i] ?? false}
                        onToggleHold={() => onToggleHoldCard(i)}
                        disabled={phase !== "dealt"}
                        dealIndex={i}
                        testID={`card-${i}`}
                      />
                    ))
                  : Array.from({ length: 5 }).map((_, i) => (
                      <LinearGradient
                        key={i}
                        colors={gradients.cardBack}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cardBack}
                      >
                        <View style={styles.cardBackInner}>
                          <MaterialCommunityIcons name="diamond-stone" size={20} color={colors.purpleGlow} />
                        </View>
                      </LinearGradient>
                    ))}
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Tap-to-hold hint */}
        {phase === "dealt" && (
          <View style={styles.holdHintRow}>
            <MaterialCommunityIcons name="gesture-tap" size={15} color={colors.neonGreen} />
            <Text style={styles.holdHint}>Tap cards to hold</Text>
          </View>
        )}

        {/* Result */}
        {phase === "drawn" && result && (
          <Animated.View style={[styles.resultContainer, payoutAnimStyle]}>
            <GlassCard neonBorder={result.payout > 0} style={result.payout > 0 ? styles.resultWin : undefined}>
              <Text style={[styles.resultRank, result.payout <= 0 && styles.resultRankMuted]}>
                {result.rank}
              </Text>
              {result.payout > 0 ? (
                <Text style={styles.resultPayout}>+{result.payout} coins 🎉</Text>
              ) : (
                <Text style={styles.resultLose}>No payout</Text>
              )}
              <View style={styles.seedRow}>
                <MaterialCommunityIcons name="key-variant" size={11} color={colors.textMuted} />
                <Text style={styles.resultSeed} numberOfLines={1} ellipsizeMode="middle">
                  {result.serverSeed}
                </Text>
              </View>
              <Pressable
                style={styles.verifyRow}
                onPress={() => setVerifyVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Verify this hand was dealt fairly"
              >
                <Ionicons name="shield-checkmark" size={13} color={colors.purpleGlow} />
                <Text style={styles.verifyLink}>Verify provably fair</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.purpleGlow} />
              </Pressable>
            </GlassCard>
          </Animated.View>
        )}

        {/* Primary action button */}
        <NeonButton
          label={primaryLabel}
          onPress={onPrimaryPress}
          variant={betAmount === 5 ? "gold" : "primary"}
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={isLoading || cashoutMutation.isPending}
          accessibilityLabel={primaryLabel}
        />

        {/* Cashout */}
        {phase === "drawn" && coinBalance >= 100 && (
          <NeonButton
            label={`Cash Out ${coinBalance} coins → NFT`}
            onPress={() => cashoutMutation.mutate()}
            variant="gold"
            size="md"
            fullWidth
            loading={cashoutMutation.isPending}
            disabled={cashoutMutation.isPending}
            haptics="success"
            icon={<MaterialCommunityIcons name="diamond-stone" size={18} color="#2a1500" />}
            accessibilityLabel={`Cash out ${coinBalance} coins to NFT voucher`}
          />
        )}

        {/* Paytable */}
        <GlassCard style={styles.paytable}>
          <View style={styles.paytableHeader}>
            <MaterialCommunityIcons name="cards-playing-outline" size={15} color={colors.purpleGlow} />
            <Text style={styles.paytableTitle}>PAYTABLE · BET {betAmount}</Text>
          </View>
          {PAYTABLE.map(({ rank, mult }) => {
            const isHit = result?.rank === rank;
            return (
              <View key={rank} style={[styles.paytableRow, isHit && styles.paytableRowHit]}>
                <Text style={[styles.paytableHand, isHit && styles.paytableHandHit]}>{rank}</Text>
                <Text style={[styles.paytablePayout, isHit && styles.paytableActive]}>
                  {mult * betAmount}
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

      {/* Celebratory win moment */}
      {winOverlay && (
        <WinOverlay
          visible={!!winOverlay}
          rank={winOverlay.rank}
          payout={winOverlay.payout}
          tier={winOverlay.tier}
          onDismiss={() => setWinOverlay(null)}
        />
      )}

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
    </GradientBackground>
  );
}

interface BetChipProps {
  value: number;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function BetChip({ value, selected, disabled, onPress }: BetChipProps) {
  const scale = useSharedValue(selected ? 1 : 1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (disabled) return;
    scale.value = withSequence(
      withTiming(1.18, { duration: motion.fast }),
      withSpring(1, motion.springBouncy)
    );
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Bet ${value} coin${value > 1 ? "s" : ""} per hand`}
      accessibilityState={{ selected, disabled }}
    >
      <Animated.View style={[styles.chipWrap, animStyle, disabled && styles.chipDisabled]}>
        {selected ? (
          <LinearGradient
            colors={gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.chip, styles.chipSelected]}
          >
            <Text style={styles.chipTextSelected}>{value}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{value}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
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

const CARD_W = 58;
const CARD_H = 84;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  centred: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg, padding: spacing.xl },
  lockBadge: {
    width: 76, height: 76, borderRadius: radius.full,
    justifyContent: "center", alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.borderStrong,
    ...shadows.purple,
  },
  lockText: { ...typography.body, textAlign: "center", color: colors.textSecondary },

  betCard: { gap: spacing.md },
  betHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  betLabel: { ...typography.overline },
  betRow: { flexDirection: "row", justifyContent: "space-between" },
  betCostRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  betHint: { ...typography.bodySmall },
  betHintStrong: { color: colors.gold, fontWeight: "800" },

  chipWrap: { borderRadius: radius.full },
  chipDisabled: { opacity: 0.4 },
  chip: {
    width: 48, height: 48, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: "center", alignItems: "center",
  },
  chipSelected: { borderColor: colors.goldGlow, ...shadows.gold },
  chipText: { ...typography.heading3, color: colors.textSecondary, fontWeight: "800" },
  chipTextSelected: { ...typography.heading3, color: "#2a1500", fontWeight: "900" },

  feltOuter: { borderRadius: radius.xl, ...shadows.card },
  felt: {
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.borderStrong,
    padding: spacing.sm,
  },
  feltInner: {
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderSubtle,
    backgroundColor: "rgba(0, 255, 159, 0.03)",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    ...shadows.neonGreen,
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between" },

  cardBack: {
    width: CARD_W, height: CARD_H, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.borderStrong,
    padding: 4,
    ...shadows.card,
    shadowOpacity: 0.3,
  },
  cardBackInner: {
    flex: 1, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    justifyContent: "center", alignItems: "center",
  },

  holdHintRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  holdHint: { ...typography.caption, letterSpacing: 1, color: colors.neonGreen },

  resultContainer: { gap: spacing.sm },
  resultWin: { ...shadows.gold },
  resultRank: { ...typography.heading2, color: colors.neonGreen, textAlign: "center" },
  resultRankMuted: { color: colors.textSecondary },
  resultPayout: { ...typography.heading3, color: colors.gold, textAlign: "center", marginTop: spacing.xs, textShadowColor: colors.goldGlow, textShadowRadius: 12 },
  resultLose: { ...typography.body, color: colors.textMuted, textAlign: "center", marginTop: spacing.xs },
  seedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: spacing.sm },
  resultSeed: { ...typography.mono, fontSize: 10, flexShrink: 1 },
  verifyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: spacing.sm },
  verifyLink: { ...typography.caption, color: colors.purpleGlow, fontWeight: "700" },

  paytable: { gap: 4 },
  paytableHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  paytableTitle: { ...typography.overline },
  paytableRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 4, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  paytableRowHit: {
    backgroundColor: `${colors.neonGreen}14`,
    borderWidth: 1, borderColor: colors.neonGreen,
  },
  paytableHand: { ...typography.bodySmall },
  paytableHandHit: { color: colors.neonGreen, fontWeight: "700" },
  paytablePayout: { ...typography.bodySmall, color: colors.textMuted, fontWeight: "600" },
  paytableActive: { color: colors.neonGreen, fontWeight: "800" },

  error: { ...typography.bodySmall, color: colors.lose, textAlign: "center" },
});
