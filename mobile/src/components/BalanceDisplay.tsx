import React from "react";
import { StyleSheet, View } from "react-native";
import { useGameStore } from "@/stores/gameStore";
import { AppText } from "@/components/ui/AppText";
import { CoinIcon } from "@/components/ui/CoinIcon";
import { coinsToUsd, formatCoins } from "@/config/brand";
import { fonts, palette, radius, spacing } from "@/theme";

interface BalanceDisplayProps {
  compact?: boolean;
}

export function BalanceDisplay({ compact = false }: BalanceDisplayProps) {
  const balance = useGameStore((s) => s.coinBalance);

  if (compact) {
    return (
      <View style={styles.compact}>
        <CoinIcon size={16} />
        <AppText variant="money" style={styles.compactAmount}>
          {formatCoins(balance)}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="balance-display">
      <AppText variant="overline">Balance</AppText>
      <View style={styles.row}>
        <CoinIcon size={22} />
        <AppText style={styles.amount} testID="balance-amount">
          {formatCoins(balance)}
        </AppText>
        <AppText variant="bodySmall">coins</AppText>
      </View>
      <AppText variant="caption">Worth {coinsToUsd(balance)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amount: { fontFamily: fonts.heavy, fontSize: 32, lineHeight: 40, color: palette.text, fontVariant: ["tabular-nums"] },
  compact: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  compactAmount: { fontSize: 14 },
});
