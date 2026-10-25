import React from "react";
import { StyleSheet, View } from "react-native";
import { palette, spacing } from "@/theme";
import { AppText, Sheet } from "@/components/ui";
import { BJ_MAX_BET, BJ_MIN_BET } from "./bjLogic";

interface RulesSheetProps {
  visible: boolean;
  onClose: () => void;
  numDecks: number;
  dealerHitsSoft17: boolean;
}

export function RulesSheet({ visible, onClose, numDecks, dealerHitsSoft17 }: RulesSheetProps) {
  const rules: [string, string][] = [
    ["Blackjack", "Pays 3 to 2"],
    ["Win", "Pays 1 to 1"],
    ["Insurance", "Pays 2 to 1, costs half your bet"],
    ["Dealer", dealerHitsSoft17 ? "Hits soft 17" : "Stands on all 17s"],
    ["Shoe", `${numDecks} decks, fresh shuffle every hand`],
    ["Double", "On any first two cards"],
    ["Split", "Equal-value pairs, up to 4 hands"],
    ["Split aces", "One card each"],
    ["Bet", `${BJ_MIN_BET} to ${BJ_MAX_BET} coins`],
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Blackjack rules" subtitle="Get closer to 21 than the dealer without going over.">
      <View style={styles.table}>
        {rules.map(([k, v], i) => (
          <View key={k} style={[styles.row, i > 0 && styles.divider]}>
            <AppText variant="bodySmall" style={styles.key}>
              {k}
            </AppText>
            <AppText variant="bodyStrong" style={styles.value}>
              {v}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="caption">
        Odd bets round blackjack winnings down to the nearest coin. A 21 after a split is not a blackjack.
      </AppText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  table: { borderRadius: 12, backgroundColor: palette.surface, paddingHorizontal: spacing.md },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.s12, gap: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: palette.hairline },
  key: { flex: 1 },
  value: { textAlign: "right", fontVariant: ["tabular-nums"] },
});
