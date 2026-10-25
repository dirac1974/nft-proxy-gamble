import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText, BalancePill, Button } from "@/components/ui";
import { BRAND } from "@/config/brand";
import { fonts, palette, spacing } from "@/theme";

interface LobbyTopBarProps {
  isAuthenticated: boolean;
  balance: number;
  onAddCoins: () => void;
  onConnect: () => void;
}

export function LobbyTopBar({ isAuthenticated, balance, onAddCoins, onConnect }: LobbyTopBarProps) {
  return (
    <View style={styles.bar}>
      <View accessible accessibilityRole="header" accessibilityLabel={BRAND.name}>
        <AppText style={styles.wordmark}>{BRAND.wordmark}</AppText>
        <AppText style={styles.sub}>{BRAND.sub}</AppText>
      </View>
      {isAuthenticated ? (
        <BalancePill amount={balance} onAdd={onAddCoins} />
      ) : (
        <Button label="Connect" size="sm" variant="secondary" icon="wallet-outline" onPress={onConnect} testID="topbar-connect" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
    backgroundColor: palette.bg,
  },
  wordmark: { fontFamily: fonts.displayBlack, fontSize: 24, lineHeight: 28, letterSpacing: 4, color: palette.gold },
  sub: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 5.5, color: palette.textDim, marginTop: -2, marginLeft: 2 },
});
