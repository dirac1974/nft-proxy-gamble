import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, radius, spacing } from "@/theme";
import { AppText, CoinIcon, Sheet } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import type { PokerVariant } from "@/services/api";
import {
  BET_LEVELS,
  MAX_BET,
  PAYTABLES,
  normalizeRank,
  rowPayout,
  variantInfo,
} from "@/components/videopoker/pokerData";
import { cab } from "@/components/videopoker/cabinet";

interface PaytableModalProps {
  visible: boolean;
  betAmount: number;
  onClose: () => void;
  variant?: PokerVariant;
  highlightRank?: string | null;
}

// Strategy tips verified for these exact paytables only. Variants without a
// verified list show none rather than risk wrong advice.
const STRATEGY_TIPS: Partial<Record<PokerVariant, string[]>> = {
  "jacks-or-better": [
    "Never break a straight or better, except to hold 4 to a Royal over a flush or straight.",
    "4 to a Royal beats a high pair.",
    "A high pair (Jacks or better) beats 3 to a Royal or 4 to a flush.",
    "3 to a Royal beats 4 to a flush and any low pair.",
    "4 to a flush beats a low pair (2s through 10s).",
    "A low pair beats 4 to an open-ended straight.",
    "Never hold a kicker with a pair.",
  ],
  "deuces-wild": ["Never discard a deuce."],
};

export function PaytableModal({ visible, betAmount, onClose, variant = "jacks-or-better", highlightRank }: PaytableModalProps) {
  const info = variantInfo(variant);
  const rows = PAYTABLES[variant];
  const win = highlightRank ? normalizeRank(highlightRank) : null;
  const royal = rows.find((r) => r.royalBonus);
  const tips = STRATEGY_TIPS[variant];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`${info.name} paytable`}
      subtitle={`${info.spec} · Bet ${betAmount} · ${info.rtp} return with optimal play at max bet`}
      testID="paytable-sheet"
    >
      <View style={styles.table}>
        <View style={[styles.row, styles.headRow]}>
          <AppText style={[styles.hand, styles.head]}>Hand</AppText>
          {BET_LEVELS.map((b) => (
            <View key={b} style={[styles.cell, b === betAmount && styles.cellActive]}>
              <AppText style={[styles.head, styles.num, b === betAmount && styles.headActive]}>{b}</AppText>
            </View>
          ))}
        </View>
        {rows.map((row, i) => {
          const isWin = row.code === win;
          return (
            <View
              key={row.code}
              style={[styles.row, i % 2 === 1 && styles.zebra, isWin && styles.rowWin]}
              accessible
              accessibilityLabel={`${row.label}: ${row.desc}. Pays ${formatCoins(rowPayout(row, betAmount))} at bet ${betAmount}`}
            >
              <View style={styles.hand}>
                <AppText style={[styles.handLabel, isWin && styles.winText]}>{row.label}</AppText>
                <AppText variant="caption" numberOfLines={1}>
                  {row.desc}
                </AppText>
              </View>
              {BET_LEVELS.map((b) => (
                <View key={b} style={[styles.cell, b === betAmount && styles.cellActive]}>
                  <AppText style={[styles.num, b === betAmount && styles.numActive, isWin && styles.winText]}>
                    {formatCoins(rowPayout(row, b))}
                  </AppText>
                </View>
              ))}
            </View>
          );
        })}
      </View>

      {royal && (
        <View style={styles.bonus}>
          <Ionicons name="star" size={16} color={palette.gold} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong" tone="gold">
              Max bet bonus
            </AppText>
            <AppText variant="bodySmall">
              {royal.label} pays {formatCoins(rowPayout(royal, MAX_BET))} at {MAX_BET} coins, versus{" "}
              {formatCoins(rowPayout(royal, MAX_BET - 1))} at {MAX_BET - 1}. Play {MAX_BET} coins for the full return.
            </AppText>
          </View>
        </View>
      )}

      {variant === "deuces-wild" && (
        <AppText variant="bodySmall">Every 2 is wild and counts as any card. The lowest paying hand is Three of a Kind.</AppText>
      )}

      {tips && (
        <View style={styles.tips} testID="strategy-tips">
          <AppText variant="overline">Strategy tips</AppText>
          {tips.map((t) => (
            <View key={t} style={styles.tipRow}>
              <View style={styles.dot} />
              <AppText variant="bodySmall" style={styles.flex}>
                {t}
              </AppText>
            </View>
          ))}
        </View>
      )}

      <View style={styles.creditNote} testID="credit-note">
        <CoinIcon size={14} />
        <AppText variant="bodySmall" style={styles.flex}>
          1 credit = 1 coin. Bets, wins and the CREDIT meter are all in coins.
        </AppText>
      </View>

      <AppText variant="caption">Payouts include your bet. Results are settled by the server.</AppText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  table: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: cab.rule,
    backgroundColor: cab.panel,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "stretch", minHeight: 40 },
  headRow: { minHeight: 28, borderBottomWidth: 1, borderBottomColor: cab.rule },
  zebra: { backgroundColor: "rgba(255,255,255,0.03)" },
  rowWin: { backgroundColor: "rgba(255,225,58,0.28)" },
  hand: { flex: 2.6, justifyContent: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  handLabel: { fontFamily: fonts.heavy, fontSize: 13, color: cab.yellow, textTransform: "uppercase", letterSpacing: 0.4 },
  head: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2, color: palette.textFaint, textTransform: "uppercase" },
  headActive: { color: palette.text },
  cell: { flex: 1, justifyContent: "center", alignItems: "flex-end", paddingRight: spacing.xs },
  cellActive: { backgroundColor: cab.red },
  num: { fontFamily: fonts.bold, fontSize: 12, color: cab.yellow, fontVariant: ["tabular-nums"] },
  numActive: { fontFamily: fonts.heavy, color: palette.text },
  winText: { color: cab.white },
  bonus: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: "rgba(233,196,106,0.08)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.3)",
  },
  tips: { gap: spacing.sm },
  creditNote: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tipRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.gold, marginTop: 8 },
});
