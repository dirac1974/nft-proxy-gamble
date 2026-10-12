import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText, Button, CoinIcon, useRollingNumber } from "@/components/ui";
import { coinsToUsd, formatCoins } from "@/config/brand";
import { fonts, gradients, palette, radius, shadows, spacing } from "@/theme";

interface BalanceHeroProps {
  balance: number;
  onCashOut: () => void;
  onBuy: () => void;
}

export function BalanceHero({ balance, onCashOut, onBuy }: BalanceHeroProps) {
  const shown = useRollingNumber(balance);
  return (
    <LinearGradient colors={gradients.surface} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.card}>
      <LinearGradient
        colors={["rgba(233,196,106,0.14)", "rgba(233,196,106,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <AppText variant="overline">Your balance</AppText>
      <View style={styles.amountRow} testID="balance-display">
        <CoinIcon size={30} />
        <AppText style={styles.amount} testID="wallet-balance-amount" accessibilityLabel={`${formatCoins(balance)} coins`}>
          {formatCoins(shown)}
        </AppText>
        <AppText variant="body" tone="dim" style={styles.unit}>
          coins
        </AppText>
      </View>
      <AppText variant="bodySmall">Worth {coinsToUsd(balance)}</AppText>
      <View style={styles.actions}>
        <Button label="Cash out" icon="arrow-up-circle" onPress={onCashOut} style={styles.flex} testID="cashout-button" />
        <Button label="Buy coins" variant="secondary" icon="add" onPress={onBuy} style={styles.flex} testID="wallet-buy-coins" />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.3)",
    padding: spacing.lg,
    gap: spacing.xs,
    alignItems: "center",
    overflow: "hidden",
    ...shadows.e2,
  },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  amount: { fontFamily: fonts.heavy, fontSize: 40, lineHeight: 48, color: palette.text, fontVariant: ["tabular-nums"] },
  unit: { alignSelf: "flex-end", marginBottom: 8 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" },
  flex: { flex: 1 },
});
