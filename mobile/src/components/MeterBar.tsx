import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, radius, typography } from "@/theme";

export function MeterBar({ credits, bet, win }: { credits: number; bet: number; win: number }): React.JSX.Element {
  return (
    <View style={styles.bar}>
      <MeterCell label="CREDITS" value={credits.toLocaleString()} testID="meter-credits" />
      <View style={styles.divider} />
      <MeterCell label="BET" value={String(bet)} testID="meter-bet" />
      <View style={styles.divider} />
      <MeterCell label="WIN" value={win.toLocaleString()} testID="meter-win" />
    </View>
  );
}

function MeterCell({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={styles.value}
        testID={testID}
        accessibilityLabel={`${label} ${value}`}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    // inset shadow effect via background contrast
  },
  cell: {
    flex: 1,
    alignItems: "flex-end",
    paddingHorizontal: spacing.sm,
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  value: {
    fontFamily: "monospace",
    fontSize: 22,
    fontWeight: "700",
    color: colors.warning,
    textShadowColor: colors.warning,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});
