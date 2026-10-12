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
}

// Cabinet paytable pinned at the top: yellow on blue, active bet column in red.
export function PaytableGrid({ variant, bet, winningRank, blink = false, onPress, testID = "paytable-button" }: PaytableGridProps) {
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
            style={[styles.row, ri > 0 && styles.rowRule, isWin && styles.rowWin]}
            testID={row.code === win ? "paytable-win-row" : undefined}
          >
            <AppText numberOfLines={1} style={[styles.hand, isWin && styles.inkText]}>
              {row.label.toUpperCase()}
            </AppText>
            {BET_LEVELS.map((b) => {
              const active = b === bet;
              return (
                <View key={b} style={[styles.cell, active && styles.cellActive, isWin && styles.cellWin]}>
                  <AppText numberOfLines={1} style={[styles.pay, isWin && styles.inkText]}>
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

const ROW_H = 15;

const styles = StyleSheet.create({
  frame: {
    backgroundColor: cab.panel,
    borderWidth: 1,
    borderColor: cab.rule,
    borderRadius: 4,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", height: ROW_H },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cab.ruleFaint },
  rowWin: { backgroundColor: cab.yellow },
  hand: {
    ...cabText.pay,
    flex: 2,
    fontSize: 10.5,
    lineHeight: ROW_H,
    letterSpacing: 0.3,
    paddingLeft: spacing.sm,
  },
  cell: {
    flex: 1,
    height: ROW_H,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing.xs,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: cab.ruleFaint,
  },
  cellActive: { backgroundColor: cab.red },
  cellWin: { backgroundColor: cab.yellow },
  pay: { ...cabText.pay, fontSize: 10.5, lineHeight: ROW_H },
  inkText: { color: cab.yellowInk },
});
