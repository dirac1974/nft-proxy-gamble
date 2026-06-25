import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, radius, shadows, spacing } from "@/theme";

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
        neonBorder ? styles.neonBorder : styles.defaultBorder,
        neonBorder && styles.neonGlow,
        style,
      ]}
    >
      {/* Glass fill — sits behind children via absoluteFillObject */}
      <LinearGradient
        colors={gradients.glass}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* 1px hairline top highlight */}
      <LinearGradient
        colors={gradients.glassHighlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.6 }}
        style={styles.highlight}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  defaultBorder: {
    borderColor: colors.borderSubtle,
  },
  neonBorder: {
    borderColor: colors.neonGreen,
    borderWidth: 1.5,
  },
  neonGlow: {
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  highlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});
