import React, { useEffect } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import { colors, spacing, typography } from "@/theme";

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

  useEffect(() => {
    if (!visible) {
      scale.value = 0;
      opacity.value = 0;
      glow.value = 0;
      return;
    }

    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withSpring(1.1, { damping: 8, stiffness: 180 }),
      withDelay(1800, withTiming(0, { duration: 400 }))
    );
    glow.value = withSequence(
      withTiming(1, { duration: 300 }),
      withDelay(1600, withTiming(0, { duration: 400 }))
    );

    const timeout = setTimeout(() => {
      runOnJS(onDismiss)();
    }, 2500);
    return () => clearTimeout(timeout);
  }, [visible, scale, opacity, glow, onDismiss]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow.value * (tier === "big" ? 0.9 : 0.5),
    shadowRadius: glow.value * (tier === "big" ? 40 : 20),
  }));

  if (!visible) return null;

  const glowColor = tier === "big" ? colors.neonGreen : colors.win;
  const emoji = tier === "big" ? "🏆" : tier === "medium" ? "🎉" : "✨";

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <View style={styles.backdrop} onTouchEnd={onDismiss}>
        <Animated.View
          style={[styles.card, { shadowColor: glowColor, borderColor: glowColor }, containerStyle, glowStyle]}
          accessibilityRole="alert"
          accessibilityLabel={`${rank} wins ${payout} coins`}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={[styles.rank, { color: glowColor }]}>{rank}</Text>
          <Text style={styles.payout}>+{payout} coins</Text>
          {tier === "big" && (
            <Text style={styles.bigWinLabel}>BIG WIN!</Text>
          )}
        </Animated.View>
      </View>
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
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 24,
    borderWidth: 2,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
    shadowOffset: { width: 0, height: 0 },
    elevation: 24,
  },
  emoji: { fontSize: 56 },
  rank: {
    ...typography.heading1,
    textAlign: "center",
    letterSpacing: 2,
  },
  payout: {
    ...typography.heading2,
    color: colors.neonGreen,
    textAlign: "center",
  },
  bigWinLabel: {
    ...typography.caption,
    color: colors.neonGreen,
    letterSpacing: 6,
    marginTop: spacing.xs,
  },
});
