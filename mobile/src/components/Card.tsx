import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { colors, radius, typography } from "@/theme";
import { decodeCard } from "@/services/walletService";

interface CardProps {
  cardIndex: number;
  held: boolean;
  onToggleHold: () => void;
  disabled?: boolean;
}

export function Card({ cardIndex, held, onToggleHold, disabled = false }: CardProps) {
  const card = decodeCard(cardIndex);
  const suitColor = card.isRed ? colors.hearts : colors.spades;
  const flip = useSharedValue(0);

  React.useEffect(() => {
    flip.value = withTiming(held ? 1 : 0, { duration: 200 });
  }, [held, flip]);

  const animStyle = useAnimatedStyle(() => ({
    borderColor: interpolate(flip.value, [0, 1], [0, 1]) > 0.5
      ? colors.cardHeldBorder
      : colors.cardBorder,
    backgroundColor: held ? colors.cardHeld : colors.cardBackground,
  }));

  const a11yLabel = `${card.label}, ${held ? "held" : "not held"}. ${disabled ? "" : "Tap to " + (held ? "release" : "hold")}`;

  return (
    <Pressable
      onPress={disabled ? undefined : onToggleHold}
      style={styles.wrapper}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ selected: held, disabled }}
    >
      <Animated.View style={[styles.card, animStyle]}>
        {/* Top-left rank + suit */}
        <View style={styles.topLabel}>
          <Text style={[styles.rankText, { color: suitColor }]}>{card.rank}</Text>
          <Text style={[styles.suitText, { color: suitColor }]}>{card.suit}</Text>
        </View>

        {/* Centre suit */}
        <Text style={[styles.centreSuit, { color: suitColor }]}>{card.suit}</Text>

        {/* Bottom-right rank + suit (rotated) */}
        <View style={[styles.topLabel, styles.bottomLabel]}>
          <Text style={[styles.rankText, { color: suitColor }]}>{card.rank}</Text>
          <Text style={[styles.suitText, { color: suitColor }]}>{card.suit}</Text>
        </View>
      </Animated.View>

      {held && (
        <View style={styles.heldBadge}>
          <Text style={styles.heldText}>HELD</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 6,
  },
  card: {
    width: 58,
    height: 84,
    borderRadius: radius.md,
    borderWidth: 2,
    padding: 5,
    justifyContent: "space-between",
  },
  topLabel: {
    alignItems: "center",
  },
  bottomLabel: {
    transform: [{ rotate: "180deg" }],
  },
  rankText: {
    fontSize: 14,
    fontWeight: "700",
  },
  suitText: {
    fontSize: 11,
  },
  centreSuit: {
    fontSize: 26,
    textAlign: "center",
  },
  heldBadge: {
    backgroundColor: colors.neonGreen,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  heldText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: "700",
  },
});
