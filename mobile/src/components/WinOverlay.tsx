import React, { useEffect, useMemo } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { fonts, motion, palette, shadows, spacing } from "@/theme";
import { AppText, CoinIcon, haptic, useRollingNumber } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import { playSound } from "@/services/soundService";

export type WinTier = "big" | "medium" | "small";

/**
 * Tier by NET win relative to stake. Returns null when nothing was won
 * (push or loss) so callers never celebrate a loss disguised as a win.
 */
export function classifyWin(net: number, bet: number): WinTier | null {
  if (net <= 0 || bet <= 0) return null;
  const mult = net / bet;
  if (mult >= 25) return "big";
  if (mult >= 5) return "medium";
  return "small";
}

interface WinOverlayProps {
  visible: boolean;
  tier: WinTier;
  /** Headline, e.g. hand name ("Full House") or "Blackjack". */
  title: string;
  /** Net coins won (payout − stake). */
  amount: number;
  onDismiss: () => void;
  /** Skip the overlay's own win sound when the game plays its own jingle. */
  silent?: boolean;
}

const DURATION: Record<WinTier, number> = { small: 1600, medium: 2600, big: 4200 };
const COUNT: Record<WinTier, number> = { small: motion.countSmall, medium: motion.countMedium, big: motion.countBig };
const { width: SW, height: SH } = Dimensions.get("window");

function FallingCoin({ index }: { index: number }) {
  const seed = useMemo(() => {
    const r = (n: number) => ((Math.sin(index * 9301 + n * 49297) + 1) / 2) % 1;
    return { x: r(1) * SW, delay: r(2) * 1400, dur: 1400 + r(3) * 900, size: 16 + r(4) * 18, spin: r(5) > 0.5 ? 1 : -1 };
  }, [index]);
  const y = useSharedValue(-60);
  const rot = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(seed.delay, withTiming(SH + 60, { duration: seed.dur, easing: Easing.in(Easing.quad) }));
    rot.value = withDelay(seed.delay, withRepeat(withTiming(seed.spin, { duration: 500 }), -1, true));
  }, [seed, y, rot]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scaleX: 0.35 + Math.abs(rot.value) * 0.65 }],
  }));
  return (
    <Animated.View style={[styles.coin, { left: seed.x }, style]} pointerEvents="none">
      <CoinIcon size={seed.size} />
    </Animated.View>
  );
}

export function WinOverlay({ visible, tier, title, amount, onDismiss, silent = false }: WinOverlayProps) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const shine = useSharedValue(0);
  const shown = useRollingNumber(visible ? amount : 0, COUNT[tier]);

  useEffect(() => {
    if (!visible) {
      scale.value = 0.6;
      opacity.value = 0;
      return;
    }
    opacity.value = withTiming(1, { duration: 180 });
    scale.value = withSpring(1, { damping: 11, stiffness: 160 });
    shine.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1);
    haptic(tier === "big" ? "heavy" : "success");
    if (!silent) void playSound(tier === "big" ? "win_big" : tier === "medium" ? "win_medium" : "win_small");
    const t = setTimeout(onDismiss, DURATION[tier]);
    return () => clearTimeout(t);
  }, [visible, tier, onDismiss, silent, scale, opacity, shine]);

  const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + shine.value * 0.4 }));

  if (!visible) return null;

  const big = tier === "big";
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={[styles.backdrop, big && styles.backdropBig]} onPress={onDismiss} accessibilityLabel="Dismiss">
        {big && Array.from({ length: 28 }, (_, i) => <FallingCoin key={i} index={i} />)}
        <Animated.View
          style={[styles.card, big && styles.cardBig, cardStyle]}
          accessibilityRole="alert"
          accessibilityLabel={`${title}. You win ${formatCoins(amount)} coins`}
          accessible
        >
          <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
          {big && (
            <AppText style={styles.bigWin} testID="big-win-label">
              BIG WIN
            </AppText>
          )}
          <AppText style={[styles.title, big && styles.titleBig]} align="center">
            {title}
          </AppText>
          <View style={styles.amountRow}>
            <CoinIcon size={big ? 30 : 24} />
            <AppText style={[styles.amount, big && styles.amountBig]}>+{formatCoins(shown)}</AppText>
          </View>
          <AppText variant="caption" align="center">
            Tap to continue
          </AppText>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(4,6,10,0.6)", alignItems: "center", justifyContent: "center" },
  backdropBig: { backgroundColor: "rgba(4,6,10,0.82)" },
  coin: { position: "absolute", top: 0 },
  card: {
    minWidth: 260,
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 24,
    backgroundColor: palette.bgRaised,
    borderWidth: 1.5,
    borderColor: palette.gold,
    ...shadows.goldGlow,
  },
  cardBig: { paddingVertical: spacing.xl, minWidth: 300 },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 6,
    borderColor: "rgba(233,196,106,0.25)",
  },
  bigWin: {
    fontFamily: fonts.displayBlack,
    fontSize: 44,
    lineHeight: 52,
    color: palette.gold,
    letterSpacing: 3,
    textShadowColor: "rgba(233,196,106,0.6)",
    textShadowRadius: 18,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: palette.text, letterSpacing: 1 },
  titleBig: { fontSize: 26 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amount: { fontFamily: fonts.heavy, fontSize: 30, color: palette.emerald, fontVariant: ["tabular-nums"] },
  amountBig: { fontSize: 38 },
});
