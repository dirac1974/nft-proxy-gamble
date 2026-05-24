import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "@/theme";

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  neonBorder?: boolean;
}

export function GlassCard({ children, style, neonBorder = false }: GlassCardProps) {
  return (
    <View
      style={[
        styles.card,
        neonBorder && styles.neonBorder,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  neonBorder: {
    borderColor: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
});
