import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { gradients, palette, radius, shadows, typography, motion } from "@/theme";
import { AppText } from "./AppText";
import { haptic, type HapticKind } from "./haptics";
import { playSound, type SfxKey } from "@/services/soundService";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "felt";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  haptic?: HapticKind | false;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
  sublabel?: string;
  /** Click sound; pass false for game actions that play their own semantic sound. */
  sound?: SfxKey | false;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 60 };
const FONT: Record<ButtonSize, number> = { sm: 12, md: 14, lg: 17 };

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  haptic: hapticKind = "light",
  fullWidth = false,
  style,
  testID,
  accessibilityLabel,
  sublabel,
  sound = "ui_tap",
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;

  const filled = variant === "primary" || variant === "danger" || variant === "felt";
  // Filled variants swap to a dedicated disabled look (not just faded) so it reads as intentional on felt/cabinet/navy.
  const filledDisabled = filled && disabled && !loading;
  const textColor = filledDisabled
    ? palette.textFaint
    : variant === "primary"
      ? palette.goldInk
      : variant === "ghost"
        ? palette.gold
        : palette.text;

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={FONT[size] + 4} color={textColor} />}
          <View style={styles.labels}>
            <AppText style={[typography.button, { fontSize: FONT[size], color: textColor }]} numberOfLines={1}>
              {label}
            </AppText>
            {sublabel ? (
              <AppText style={[styles.sublabel, { color: textColor }]} numberOfLines={1}>
                {sublabel}
              </AppText>
            ) : null}
          </View>
        </>
      )}
    </View>
  );

  const shape: ViewStyle = { height: HEIGHTS[size], borderRadius: size === "lg" ? radius.lg : radius.md };

  return (
    <Animated.View
      style={[
        fullWidth && styles.full,
        animStyle,
        inactive && !filledDisabled && (loading ? styles.busy : styles.subtleDisabled),
        style,
      ]}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPressIn={() => {
          scale.value = withSpring(0.96, motion.springSnappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.springSnappy);
        }}
        onPress={() => {
          if (hapticKind) haptic(hapticKind);
          if (sound) void playSound(sound);
          onPress?.();
        }}
        hitSlop={size === "sm" ? 6 : 0}
      >
        {filledDisabled ? (
          <View style={[styles.base, shape, styles.filledDisabled]}>
            {content}
          </View>
        ) : filled ? (
          <LinearGradient
            colors={variant === "primary" ? gradients.gold : variant === "danger" ? gradients.ruby : gradients.felt}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.base, shape, variant === "primary" && !inactive && shadows.goldGlow]}
          >
            <View style={[styles.highlight, { borderRadius: shape.borderRadius }]} pointerEvents="none" />
            {content}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.base,
              shape,
              variant === "secondary" && styles.secondary,
              variant === "ghost" && styles.ghost,
            ]}
          >
            {content}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: "stretch" },
  base: { alignItems: "center", justifyContent: "center", paddingHorizontal: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  labels: { alignItems: "center" },
  sublabel: { fontSize: 10, opacity: 0.75, marginTop: 1, fontFamily: typography.caption.fontFamily },
  highlight: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  secondary: { backgroundColor: palette.surfaceHi, borderWidth: 1, borderColor: "rgba(233,196,106,0.45)" },
  ghost: { backgroundColor: "transparent" },
  filledDisabled: {
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.25)",
  },
  subtleDisabled: { opacity: 0.45 },
  busy: { opacity: 0.85 },
});
