import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette } from "@/theme";
import { AppText } from "./AppText";

export type FairnessState = "pending" | "sealed" | "verified" | "failed";

const COPY: Record<FairnessState, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pending: { label: "Preparing fair round…", icon: "time-outline", color: palette.textFaint },
  sealed: { label: "Round sealed", icon: "lock-closed", color: palette.emerald },
  verified: { label: "Fairness verified", icon: "shield-checkmark", color: palette.emerald },
  failed: { label: "Couldn't verify", icon: "alert-circle", color: palette.danger },
};

interface FairnessBadgeProps {
  state: FairnessState;
  onPress?: () => void;
  /** Light text for dark felt / cabinet backgrounds (default) or ink for light. */
  tone?: "light" | "ink";
  testID?: string;
}

// One wording for provably-fair status across every game.
export function FairnessBadge({ state, onPress, tone = "light", testID = "check-fairness" }: FairnessBadgeProps) {
  const c = COPY[state];
  return (
    <View style={styles.row}>
      <Ionicons name={c.icon} size={15} color={c.color} />
      <AppText style={[styles.label, { color: c.color }]}>{c.label}</AppText>
      {onPress && state !== "pending" ? (
        <Pressable
          onPress={onPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Check fairness"
          testID={testID}
        >
          <AppText style={[styles.link, tone === "ink" && { color: palette.goldDeep }]}>Check fairness ›</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 },
  label: { fontFamily: fonts.semibold, fontSize: 13 },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: palette.gold, marginLeft: 6 },
});
