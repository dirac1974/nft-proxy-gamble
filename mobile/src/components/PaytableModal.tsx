import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "@/theme";

interface PaytableModalProps {
  visible: boolean;
  betAmount: number;
  onClose: () => void;
}

const PAYTABLE = [
  { rank: "Royal Flush",     base: 250, desc: "A K Q J 10 of same suit" },
  { rank: "Straight Flush",  base: 50,  desc: "5 sequential, same suit" },
  { rank: "Four of a Kind",  base: 25,  desc: "4 cards same rank" },
  { rank: "Full House",      base: 9,   desc: "3 of a kind + a pair" },
  { rank: "Flush",           base: 6,   desc: "5 cards same suit" },
  { rank: "Straight",        base: 4,   desc: "5 sequential cards" },
  { rank: "Three of a Kind", base: 3,   desc: "3 cards same rank" },
  { rank: "Two Pair",        base: 2,   desc: "Two different pairs" },
  { rank: "Jacks or Better", base: 1,   desc: "Pair of Jacks or higher" },
];

export function PaytableModal({ visible, betAmount, onClose }: PaytableModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close paytable"
      />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>PAYTABLE</Text>
          <Text style={styles.subtitle}>9/6 Jacks or Better · Bet {betAmount}</Text>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close paytable modal"
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Column headers */}
          <View style={styles.tableRow}>
            <Text style={[styles.cellHand, styles.headerCell]}>HAND</Text>
            {[1, 2, 3, 4, 5].map((b) => (
              <Text
                key={b}
                style={[styles.cellPayout, styles.headerCell, b === betAmount && styles.activeBetCol]}
              >
                {b}
              </Text>
            ))}
          </View>

          <View style={styles.divider} />

          {PAYTABLE.map(({ rank, base, desc }) => (
            <View key={rank}>
              <View style={styles.tableRow}>
                <Text style={styles.cellHand}>{rank}</Text>
                {[1, 2, 3, 4, 5].map((b) => {
                  // Royal Flush at max bet pays 4000 instead of 1250
                  const payout =
                    rank === "Royal Flush" && b === 5 ? 4000 : base * b;
                  const isActive = b === betAmount;
                  return (
                    <Text
                      key={b}
                      style={[
                        styles.cellPayout,
                        isActive && styles.activePayout,
                      ]}
                    >
                      {payout}
                    </Text>
                  );
                })}
              </View>
              <Text style={styles.handDesc}>{desc}</Text>
            </View>
          ))}

          {/* Max bet bonus note */}
          <View style={styles.bonusNote}>
            <Text style={styles.bonusTitle}>★ Max Bet Bonus</Text>
            <Text style={styles.bonusBody}>
              Royal Flush pays 4,000 coins at 5-coin bet (vs 1,250 otherwise).
              Always play max bet for the best RTP of 99.54%.
            </Text>
          </View>

          {/* Strategy tips */}
          <View style={styles.tipSection}>
            <Text style={styles.tipTitle}>BASIC STRATEGY</Text>
            {STRATEGY_TIPS.map((tip, i) => (
              <Text key={i} style={styles.tipRow}>• {tip}</Text>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const STRATEGY_TIPS = [
  "Always hold a winning hand — never break a made hand.",
  "Hold four to a Royal Flush over any made hand.",
  "Hold four to a Straight Flush over anything except a made hand.",
  "Never hold a kicker with a pair.",
  "Hold low pair over four to a Flush.",
  "Discard everything for a Royal Flush draw (3 to Royal beats a pair).",
];

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: "85%",
  },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...typography.heading2, color: colors.neonGreen },
  subtitle: { ...typography.bodySmall, marginTop: 2 },
  closeButton: {
    position: "absolute",
    right: spacing.lg,
    top: spacing.lg,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: { ...typography.body, color: colors.textSecondary },

  scroll: { flexGrow: 0 },
  scrollContent: { padding: spacing.lg, gap: spacing.sm },

  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  cellHand: {
    flex: 3,
    ...typography.bodySmall,
  },
  cellPayout: {
    flex: 1,
    ...typography.bodySmall,
    textAlign: "center",
    color: colors.textMuted,
  },
  headerCell: {
    ...typography.caption,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textMuted,
  },
  activeBetCol: { color: colors.neonGreen },
  activePayout: { color: colors.neonGreen, fontWeight: "700" },
  handDesc: {
    ...typography.caption,
    color: colors.textMuted,
    paddingBottom: spacing.xs,
    marginLeft: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },

  bonusNote: {
    backgroundColor: `${colors.neonGreen}11`,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.neonGreen}33`,
    gap: 4,
    marginTop: spacing.sm,
  },
  bonusTitle: { ...typography.bodySmall, color: colors.neonGreen, fontWeight: "700" },
  bonusBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },

  tipSection: { gap: spacing.xs, marginTop: spacing.sm },
  tipTitle: { ...typography.caption, letterSpacing: 2, color: colors.textMuted, marginBottom: 4 },
  tipRow: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
});
