import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Sheet } from "@/components/ui";
import { coinsToUsd, formatCoins } from "@/config/brand";
import { palette, radius, spacing } from "@/theme";
import { formatDuration } from "./sessionStore";

interface RealityCheckSheetProps {
  visible: boolean;
  sessionMs: number;
  /** Coins won (+) or lost (−) this session, excluding purchases and cash-outs. Null when unknown. */
  net: number | null;
  onKeepPlaying: () => void;
  onTakeBreak: () => void;
}

export function formatNet(net: number): string {
  if (net === 0) return "Even";
  const sign = net > 0 ? "+" : "−";
  return `${sign}${formatCoins(Math.abs(net))} coins (${sign}${coinsToUsd(Math.abs(net))})`;
}

export function RealityCheckSheet({ visible, sessionMs, net, onKeepPlaying, onTakeBreak }: RealityCheckSheetProps) {
  return (
    <Sheet visible={visible} onClose={onKeepPlaying} title="Time check" testID="reality-check-sheet">
      <AppText variant="body" tone="dim">
        A quick look at this session. Take a break whenever you like — your coins will be here.
      </AppText>
      <View style={styles.stats}>
        <View style={styles.stat} testID="reality-check-time">
          <Ionicons name="time-outline" size={18} color={palette.gold} />
          <AppText variant="bodySmall" style={styles.statLabel}>
            Playing for
          </AppText>
          <AppText variant="bodyStrong">{formatDuration(sessionMs)}</AppText>
        </View>
        {net !== null && (
          <View style={[styles.stat, styles.statBorder]} testID="reality-check-net">
            <Ionicons name="stats-chart-outline" size={18} color={palette.gold} />
            <AppText variant="bodySmall" style={styles.statLabel}>
              Session result
            </AppText>
            <AppText variant="bodyStrong" style={{ color: net < 0 ? palette.danger : net > 0 ? palette.emerald : palette.text }}>
              {formatNet(net)}
            </AppText>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <Button label="Keep playing" variant="secondary" onPress={onKeepPlaying} fullWidth testID="reality-keep-playing" />
        <Button label="Take a break" onPress={onTakeBreak} fullWidth testID="reality-take-break" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stats: {
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
    paddingHorizontal: spacing.md,
  },
  stat: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.s12 },
  statBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  statLabel: { flex: 1 },
  actions: { gap: spacing.sm },
});
