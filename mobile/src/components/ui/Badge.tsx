import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, radius } from "@/theme";
import { AppText } from "./AppText";

export type BadgeTone = "neutral" | "gold" | "success" | "danger" | "warn" | "info";

const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: "rgba(255,255,255,0.06)", fg: palette.textDim, border: palette.hairline },
  gold: { bg: "rgba(233,196,106,0.14)", fg: palette.gold, border: "rgba(233,196,106,0.4)" },
  success: { bg: "rgba(43,212,143,0.12)", fg: palette.emerald, border: "rgba(43,212,143,0.35)" },
  danger: { bg: "rgba(229,72,77,0.12)", fg: palette.danger, border: "rgba(229,72,77,0.35)" },
  warn: { bg: "rgba(245,165,36,0.12)", fg: palette.warn, border: "rgba(245,165,36,0.35)" },
  info: { bg: "rgba(120,160,255,0.12)", fg: "#9DB8FF", border: "rgba(120,160,255,0.3)" },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}

export function Badge({ label, tone = "neutral", icon, testID }: BadgeProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]} testID={testID}>
      {icon && <Ionicons name={icon} size={11} color={t.fg} />}
      <AppText style={[styles.label, { color: t.fg }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase" },
});
