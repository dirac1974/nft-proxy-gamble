import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { spacing } from "@/theme";
import { AppText } from "@/components/ui";
import type { PokerVariant } from "@/services/api";
import { BET_LEVELS, PAYTABLES, normalizeRank, rowPayout, variantInfo } from "./pokerData";
import { cab, cabText, cabTiming } from "./cabinet";

interface PaytableGridProps {
  variant: PokerVariant;
  bet: number;
  winningRank?: string | null;
  /** Blink the winning row (200ms on/off ×3) then hold it lit. */
  blink?: boolean;
  onPress?: () => void;
  testID?: string;
  /** Row height; the screen grows it to fill tall phones like a cabinet's top glass. */
  rowHeight?: number;
}

export const PAYTABLE_MIN_ROW = 15;
export const PAYTABLE_MAX_ROW = 26;

// Cabinet paytable pinned at the top: yellow on blue, active bet column in red.
export function PaytableGrid({
  variant,
  bet,
  winningRank,
  blink = false,
  onPress,
  testID = "paytable-button",
  rowHeight = PAYTABLE_MIN_ROW,
}: PaytableGridProps) {
  const rowH = Math.max(PAYTABLE_MIN_ROW, Math.min(PAYTABLE_MAX_ROW, Math.round(rowHeight)));
  const fontSize = Math.min(14, Math.max(10.5, rowH * 0.6));
  const sized = { fontSize, lineHeight: rowH };
  const rows = PAYTABLES[variant];
  const win = winningRank ? normalizeRank(winningRank) : null;
  const [lit, setLit] = useState(true);

  useEffect(() => {
    setLit(true);
    if (!win || !blink) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setLit((v) => !v);
      if (n >= cabTiming.blinkCycles * 2) {
        clearInterval(id);
        setLit(true);
      }
    }, cabTiming.blink);
    return () => clearInterval(id);
  }, [win, blink]);

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${variantInfo(variant).name} pays, betting ${bet}. Open full paytable`}
      style={styles.frame}
    >
      {rows.map((row, ri) => {
        const isWin = row.code === win && lit;
        return (
          <View
            key={row.code}
            style={[styles.row, { height: rowH }, ri > 0 && styles.rowRule, isWin && styles.rowWin]}
            testID={row.code === win ? "paytable-win-row" : undefined}
          >
            <AppText
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[styles.hand, sized, isWin && styles.inkText]}
            >
              {row.label.toUpperCase()}
            </AppText>
            {BET_LEVELS.map((b) => {
              const active = b === bet;
              return (
                <View key={b} style={[styles.cell, { height: rowH }, active && styles.cellActive, isWin && styles.cellWin]}>
                  <AppText numberOfLines={1} style={[styles.pay, sized, isWin && styles.inkText]}>
                    {rowPayout(row, b)}
                  </AppText>
                </View>
              );
            })}
          </View>
        );
      })}
    </Pressable>
  );
}


const styles = StyleSheet.create({
  frame: {
    backgroundColor: cab.panel,
    borderWidth: 1,
    borderColor: cab.rule,
    borderRadius: 4,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cab.ruleFaint },
  rowWin: { backgroundColor: cab.yellow },
  hand: {
    ...cabText.pay,
    flex: 2.7,
    letterSpacing: 0.2,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
  },
  cell: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing.xs,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: cab.ruleFaint,
  },
  cellActive: { backgroundColor: cab.red },
  cellWin: { backgroundColor: cab.yellow },
  pay: { ...cabText.pay },
  inkText: { color: cab.yellowInk },
});
