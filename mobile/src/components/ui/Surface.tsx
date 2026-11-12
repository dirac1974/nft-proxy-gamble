import React from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { palette, radius, shadows, spacing } from "@/theme";

interface SurfaceProps extends ViewProps {
  elevation?: 0 | 1 | 2 | 3;
  border?: "none" | "hairline" | "gold";
  padded?: boolean;
  tone?: "surface" | "raised" | "sunken";
  style?: ViewStyle | ViewStyle[];
}

export function Surface({
  elevation = 1,
  border = "hairline",
  padded = true,
  tone = "surface",
  style,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <View
      {...rest}
      style={[
        styles.base,
        tone === "raised" && { backgroundColor: palette.surfaceHi },
        tone === "sunken" && { backgroundColor: palette.bgRaised },
        padded && styles.padded,
        border === "hairline" && styles.hairline,
        border === "gold" && styles.gold,
        elevation === 1 && shadows.e1,
        elevation === 2 && shadows.e2,
        elevation === 3 && shadows.e3,
        style as ViewStyle,
      ]}
    >
      <View style={[styles.topSheen, { borderRadius: radius.lg }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: palette.surface, borderRadius: radius.lg },
  padded: { padding: spacing.md },
  hairline: { borderWidth: 1, borderColor: palette.hairline },
  gold: { borderWidth: 1, borderColor: "rgba(233,196,106,0.55)" },
  topSheen: { ...StyleSheet.absoluteFillObject, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
});
