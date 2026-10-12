import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { fonts, spacing } from "@/theme";
import { AppText } from "@/components/ui";
import { coinsToUsd, formatCoins } from "@/config/brand";
import { cab, cabText } from "./cabinet";

interface MeterBarProps {
  win: number;
  bet: number;
  credit: number;
  showUsd: boolean;
  onToggleUnits: () => void;
}

// Classic LED meter row: WIN · BET · CREDIT. Presentational; rack-up lives in the screen.
export function MeterBar({ win, bet, credit, showUsd, onToggleUnits }: MeterBarProps) {
  const fmt = (n: number) => (showUsd ? coinsToUsd(n) : formatCoins(n));
  return (
    <View style={styles.bar}>
      <Meter label="Win" value={win > 0 ? fmt(win) : ""} align="left" testID="meter-win" />
      <Meter label="Bet" value={String(bet)} align="center" testID="meter-bet" />
      <Pressable
        onPress={onToggleUnits}
        style={styles.meterRight}
        accessibilityRole="button"
        accessibilityLabel={`Credit ${fmt(credit)}. Tap to show ${showUsd ? "credits" : "dollars"}`}
        testID="meter-credit-toggle"
        hitSlop={6}
      >
        <Meter label="Credit" value={fmt(credit)} align="right" testID="meter-credit" />
      </Pressable>
    </View>
  );
}

function Meter({ label, value, align, testID }: { label: string; value: string; align: "left" | "center" | "right"; testID: string }) {
  const alignItems = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  return (
    <View style={[styles.meter, { alignItems }]} accessible accessibilityLabel={`${label} ${value || "0"}`}>
      <AppText style={styles.label}>{label}</AppText>
      <AppText style={styles.value} numberOfLines={1} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 44,
    paddingHorizontal: spacing.s12,
    backgroundColor: cab.meterBg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,176,0,0.25)",
  },
  meter: { flex: 1, justifyContent: "center" },
  meterRight: { flex: 1.3 },
  label: { fontFamily: fonts.heavy, fontSize: 10, lineHeight: 12, letterSpacing: 1.5, color: cab.dimWhite, textTransform: "uppercase" },
  value: {
    ...cabText.led,
    fontSize: 20,
    lineHeight: 24,
    minHeight: 24,
    textShadowColor: cab.amberGlow,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
});
