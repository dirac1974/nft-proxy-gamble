import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "@/theme";

interface GradientBackgroundProps {
  children: React.ReactNode;
  /** "screen" (default cool) or "warm" tonal variant. */
  variant?: "screen" | "warm";
  /** Render soft ambient glow orbs behind content for depth. Default true. */
  glow?: boolean;
  style?: ViewStyle;
}

/**
 * Full-bleed ambient backdrop. Layers a vertical gradient plus two blurred
 * radial-ish glow orbs (purple top-left, neon-green bottom-right) so every
 * screen sits on subtle depth instead of a flat fill.
 */
export function GradientBackground({
  children,
  variant = "screen",
  glow = true,
  style,
}: GradientBackgroundProps) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={variant === "warm" ? gradients.screenWarm : gradients.screen}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {glow && (
        <>
          <View style={[styles.orb, styles.orbPurple]} pointerEvents="none" />
          <View style={[styles.orb, styles.orbGreen]} pointerEvents="none" />
        </>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: "hidden" },
  content: { flex: 1 },
  orb: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    opacity: 0.22,
  },
  orbPurple: {
    top: -140,
    left: -120,
    backgroundColor: colors.purpleGlow,
    shadowColor: colors.purpleGlow,
    shadowOpacity: 0.9,
    shadowRadius: 120,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  orbGreen: {
    bottom: -160,
    right: -130,
    backgroundColor: colors.neonGreen,
    opacity: 0.1,
    shadowColor: colors.neonGreen,
    shadowOpacity: 0.7,
    shadowRadius: 140,
    shadowOffset: { width: 0, height: 0 },
  },
});
