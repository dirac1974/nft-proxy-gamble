import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { palette, radius, shadows, spacing } from "@/theme";

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Gold accent border (kept as `neonBorder` for existing call sites). */
  neonBorder?: boolean;
}

export function GlassCard({ children, style, neonBorder = false }: GlassCardProps) {
  return <View style={[styles.card, neonBorder && styles.accent, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    padding: spacing.lg,
    ...shadows.e1,
  },
  accent: { borderColor: "rgba(233,196,106,0.55)", ...shadows.goldGlow },
});
