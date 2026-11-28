import React from "react";
import { StyleSheet, View } from "react-native";
import { fonts, palette, radius, spacing } from "@/theme";
import { AppText } from "@/components/ui";

interface HandValueBadgeProps {
  total: number;
  soft?: boolean;
  blackjack?: boolean;
  testID?: string;
}

// Running total chip that sits on the felt next to a hand.
export function HandValueBadge({ total, soft = false, blackjack = false, testID }: HandValueBadgeProps) {
  const bust = total > 21;
  const tone = blackjack ? styles.gold : bust ? styles.bust : styles.base;
  const label = blackjack ? "Blackjack" : bust ? `Bust ${total}` : soft && total < 21 ? `Soft ${total}` : String(total);
  return (
    <View
      style={[styles.badge, tone]}
      testID={testID}
      accessibilityLabel={blackjack ? "Blackjack" : bust ? `Bust with ${total}` : `${soft ? "Soft " : ""}${total}`}
    >
      <AppText style={[styles.text, blackjack && styles.goldText, bust && styles.bustText]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 36,
    height: 24,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  base: { backgroundColor: "rgba(0,0,0,0.55)", borderColor: "rgba(248,227,163,0.3)" },
  gold: { backgroundColor: palette.gold, borderColor: palette.goldLight },
  bust: { backgroundColor: "rgba(142,26,41,0.85)", borderColor: palette.rubyLight },
  text: {
    fontFamily: fonts.heavy,
    fontSize: 13,
    color: palette.text,
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"],
    textTransform: "uppercase",
  },
  goldText: { color: palette.goldInk },
  bustText: { color: palette.text },
});
