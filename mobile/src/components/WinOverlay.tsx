import React, { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import { colors, gradients, radius, shadows, spacing, typography } from "@/theme";

export type WinTier = "big" | "medium" | "small";

interface WinOverlayProps {
  visible: boolean;
  rank: string;
  payout: number;
  tier: WinTier;
  onDismiss: () => void;
}

/** Auto-dismisses after 2.5 s. Manual tap also dismisses. */
export function WinOverlay({ visible, rank, payout, tier, onDismiss }: WinOverlayProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const glow = useSharedValue(0);
  const ringScale = useSharedValue(0.5);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      scale.value = 0;
      opacity.value = 0;
      glow.value = 0;
      ringScale.value = 0.5;
      ringOpacity.value = 0;
      return;
    }

    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withSpring(1.08, { damping: 8, stiffness: 180 }),
      withDelay(200, withSpring(1.0, { damping: 12, stiffness: 200 })),
      withDelay(1600, withTiming(0, { duration: 400 }))
    );
    glow.value = withSequence(
      withTiming(1, { duration: 300 }),
      withDelay(1600, withTiming(0, { duration: 400 }))
    );
    ringOpacity.value = withSequence(
      withTiming(0.6, { duration: 350 }),
      withDelay(1400, withTiming(0, { duration: 400 }))
    );
    ringScale.value = withSequence(
      withSpring(1.6, { damping: 6, stiffness: 120 }),
      withDelay(1400, withTiming(2.4, { duration: 400 }))
    );

    const timeout = setTimeout(() => {
      runOnJS(onDismiss)();
    }, 2500);
    return () => clearTimeout(timeout);
  }, [visible, scale, opacity, glow, ringScale, ringOpacity, onDismiss]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow.value * (tier === "big" ? 0.9 : 0.55),
    shadowRadius: glow.value * (tier === "big" ? 44 : 22),
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  if (!visible) return null;

  const isBig = tier === "big";
  const isMedium = tier === "medium";
  const glowColor = isBig ? colors.gold : colors.neonGreen;
  const cardGradient = isBig ? gradients.gold : isMedium ? gradients.purpleBright : gradients.green;
  const emoji = isBig ? "🏆" : isMedium ? "🎉" : "✨";

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="none">
        {/* Outer glow ring */}
        <Animated.View
          style={[
            styles.ring,
            { borderColor: glowColor },
            ringStyle,
          ]}
          pointerEvents="none"
        />

        <Animated.View
          style={[
            styles.cardOuter,
            { shadowColor: glowColor },
            containerStyle,
            glowStyle,
          ]}
          accessibilityRole="alert"
          accessibilityLabel={`${rank} wins ${payout} coins`}
          accessible
        >
          <LinearGradient
            colors={cardGradient as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBorder}
          >
            <View style={styles.cardInner}>
              {isBig && (
                <View style={styles.bigWinBanner}>
                  <Text style={styles.bigWinLabel}>BIG WIN!</Text>
                </View>
              )}

              <Text style={styles.emoji}>{emoji}</Text>

              <Text style={[styles.rank, { color: isBig ? colors.gold : colors.neonGreen }]}>
                {rank}
              </Text>

              <LinearGradient
                colors={isBig ? [colors.goldGlow, colors.gold] : [colors.neonGreen, colors.neonGreenDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.payoutChip}
              >
                <Text style={styles.payout}>+{payout} coins</Text>
              </LinearGradient>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/**
 * Classify payout into a tier for overlay intensity.
 * big: Royal Flush / Straight Flush (payout ≥ 50)
 * medium: 4-of-a-kind / Full House (payout ≥ 9)
 * small: everything else that pays out
 */
export function classifyWin(payout: number, betAmount: number): WinTier | null {
  if (payout <= 0) return null;
  const perCoin = payout / betAmount;
  if (perCoin >= 50) return "big";
  if (perCoin >= 9) return "medium";
  return "small";
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  ring: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
  },
  cardOuter: {
    shadowOffset: { width: 0, height: 0 },
    elevation: 28,
    borderRadius: radius.xl + 2,
  },
  gradientBorder: {
    borderRadius: radius.xl + 2,
    padding: 2,
  },
  cardInner: {
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 220,
  },
  bigWinBanner: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginBottom: spacing.xs,
  },
  bigWinLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2a1500",
    letterSpacing: 4,
  },
  emoji: {
    fontSize: 52,
  },
  rank: {
    ...typography.heading1,
    textAlign: "center",
    letterSpacing: 2,
  },
  payoutChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    ...shadows.gold,
  },
  payout: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.backgroundDeep,
    letterSpacing: 0.5,
  },
});
