import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, gradients, radius, shadows, spacing, typography } from "@/theme";
import { useGameStore } from "@/stores/gameStore";

interface BalanceDisplayProps {
  compact?: boolean;
}

export function BalanceDisplay({ compact = false }: BalanceDisplayProps) {
  const balance = useGameStore((s) => s.coinBalance);

  if (compact) {
    return (
      <View style={styles.compact}>
        <MaterialCommunityIcons name="circle-multiple" size={16} color={colors.gold} />
        <Text style={styles.compactAmount}>{balance.toLocaleString()}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper} testID="balance-display">
      <LinearGradient
        colors={["rgba(63,0,120,0.55)", "rgba(31,5,64,0.40)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Top highlight */}
        <LinearGradient
          colors={gradients.glassHighlight}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topHighlight}
        />

        <Text style={styles.overline}>BALANCE</Text>

        <View style={styles.amountRow}>
          <LinearGradient
            colors={[colors.goldGlow, colors.gold]}
            style={styles.iconChip}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons name="circle-multiple" size={18} color="#2a1500" />
          </LinearGradient>
          <Text style={styles.amount} testID="balance-amount">
            {balance.toLocaleString()}
          </Text>
          <Text style={styles.unit}>coins</Text>
        </View>

        <Text style={styles.usdHint}>≈ ${(balance / 100).toFixed(2)} USDC</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.30)",
    overflow: "hidden",
    ...shadows.purple,
  },
  gradient: {
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  topHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  overline: {
    ...typography.overline,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    letterSpacing: 3,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
    ...shadows.gold,
  },
  amount: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 0.5,
    textShadowColor: colors.goldGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  unit: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: 3,
  },
  usdHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // compact variant
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(31,5,64,0.60)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 210, 74, 0.25)",
  },
  compactAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.gold,
    letterSpacing: 0.3,
  },
});
