import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { fonts, palette, spacing } from "@/theme";
import { AppText, ChipGraphic } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import { chipStack } from "./bjLogic";

interface BetCircleProps {
  amount: number;
  reduceMotion: boolean;
  label?: string;
}

const CHIP = 40;
const STEP = 4;

// Printed betting spot with the wager stacked as real chips.
export function BetCircle({ amount, reduceMotion, label = "Place your bet" }: BetCircleProps) {
  const chips = chipStack(amount);
  return (
    <View style={styles.row} testID="bj-bet-circle">
      <View style={styles.ring}>
        <View style={styles.innerRing}>
          {chips.length === 0 ? (
            <AppText style={styles.emptyLabel}>BET</AppText>
          ) : (
            <View style={{ width: CHIP, height: CHIP + STEP * (chips.length - 1) }}>
              {chips.map((v, i) => (
                <Animated.View
                  key={i}
                  entering={reduceMotion ? undefined : FadeInUp.duration(160)}
                  style={[styles.chip, { bottom: i * STEP, zIndex: i }]}
                >
                  <ChipGraphic value={v} size={CHIP} />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </View>
      <View style={styles.amountWrap}>
        <AppText style={styles.caption}>{amount > 0 ? "Bet" : label}</AppText>
        {amount > 0 && (
          <AppText style={styles.amount} testID="bj-bet-amount">
            {formatCoins(amount)}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.s12 },
  ring: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: palette.feltLine,
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(248,227,163,0.18)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  chip: { position: "absolute", left: 0 },
  emptyLabel: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 2, color: palette.feltLine },
  amountWrap: { minWidth: 72 },
  caption: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, color: palette.goldLight, opacity: 0.75, textTransform: "uppercase" },
  amount: { fontFamily: fonts.heavy, fontSize: 20, color: palette.text, fontVariant: ["tabular-nums"] },
});
