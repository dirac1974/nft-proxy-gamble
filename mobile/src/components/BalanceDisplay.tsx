import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, radius, typography } from "@/theme";
import { useGameStore } from "@/stores/gameStore";

interface BalanceDisplayProps {
  compact?: boolean;
}

export function BalanceDisplay({ compact = false }: BalanceDisplayProps) {
  const balance = useGameStore((s) => s.coinBalance);

  if (compact) {
    return (
      <View style={styles.compact}>
        <Text style={styles.coinIcon}>🪙</Text>
        <Text style={styles.compactAmount}>{balance.toLocaleString()}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="balance-display">
      <Text style={styles.label}>BALANCE</Text>
      <View style={styles.row}>
        <Text style={styles.coinIcon}>🪙</Text>
        <Text style={styles.amount} testID="balance-amount">{balance.toLocaleString()}</Text>
        <Text style={styles.unit}>coins</Text>
      </View>
      <Text style={styles.usdHint}>≈ ${(balance / 100).toFixed(2)} USDC</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  label: {
    ...typography.caption,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  coinIcon: {
    fontSize: 18,
  },
  amount: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.neonGreen,
  },
  unit: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  usdHint: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  // compact variant
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compactAmount: {
    ...typography.neon,
    fontSize: 14,
  },
});
