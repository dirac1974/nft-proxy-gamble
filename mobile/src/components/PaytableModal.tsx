import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, gradients, radius, spacing, typography } from "@/theme";

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
      <LinearGradient
        colors={["rgba(40, 8, 78, 0.98)", "rgba(11, 0, 20, 0.99)"]}
        style={styles.sheet}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialCommunityIcons name="cards-playing-outline" size={20} color={colors.gold} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>PAYTABLE</Text>
            <Text style={styles.subtitle}>9/6 Jacks or Better · Bet {betAmount}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close paytable modal"
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
            <View key={rank} style={styles.rowGroup}>
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
            <View style={styles.bonusTitleRow}>
              <MaterialCommunityIcons name="star-circle" size={14} color={colors.gold} />
              <Text style={styles.bonusTitle}>Max Bet Bonus</Text>
            </View>
            <Text style={styles.bonusBody}>
              Royal Flush pays 4,000 coins at 5-coin bet (vs 1,250 otherwise).
              Always play max bet for the best RTP of 99.54%.
            </Text>
          </View>

          {/* Strategy tips */}
          <View style={styles.tipSection}>
            <View style={styles.tipTitleRow}>
              <Ionicons name="bulb-outline" size={12} color={colors.textMuted} />
              <Text style={styles.tipTitle}>BASIC STRATEGY</Text>
            </View>
            {STRATEGY_TIPS.map((tip, i) => (
              <View key={i} style={styles.tipRowWrap}>
                <View style={styles.tipBullet} />
                <Text style={styles.tipRow}>{tip}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
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
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    maxHeight: "85%",
    overflow: "hidden",
  },

  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: `${colors.gold}15`,
    borderWidth: 1,
    borderColor: `${colors.gold}30`,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerText: { flex: 1, gap: 2 },
  title: {
    ...typography.heading3,
    color: colors.gold,
    letterSpacing: 1.5,
  },
  subtitle: { ...typography.bodySmall, marginTop: 2 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
  },

  scroll: { flexGrow: 0 },
  scrollContent: { padding: spacing.lg, gap: spacing.xs },

  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
  },
  rowGroup: { gap: 1 },
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
    ...typography.overline,
    color: colors.textMuted,
  },
  activeBetCol: { color: colors.neonGreen, fontWeight: "800" },
  activePayout: { color: colors.neonGreen, fontWeight: "800" },
  handDesc: {
    ...typography.caption,
    color: colors.textMuted,
    paddingBottom: spacing.xs,
    marginLeft: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },

  bonusNote: {
    backgroundColor: `${colors.gold}0e`,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.gold}28`,
    gap: 6,
    marginTop: spacing.sm,
  },
  bonusTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  bonusTitle: { ...typography.bodySmall, color: colors.gold, fontWeight: "700" },
  bonusBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },

  tipSection: { gap: spacing.xs, marginTop: spacing.sm },
  tipTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 4,
  },
  tipTitle: { ...typography.overline, color: colors.textMuted },
  tipRowWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  tipBullet: {
    width: 4,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.purpleGlow,
    marginTop: 7,
  },
  tipRow: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, flex: 1 },
});
