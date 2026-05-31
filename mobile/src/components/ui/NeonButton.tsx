import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, gradients, motion, radius, shadows, spacing } from "@/theme";
import { haptic, type HapticKind } from "./haptics";

type Variant = "primary" | "gold" | "success" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface NeonButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  haptics?: HapticKind | null;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  /** Optional leading glyph (vector icon node). */
  icon?: React.ReactNode;
  testID?: string;
}

const GRADIENT: Record<Exclude<Variant, "ghost">, readonly [string, string, ...string[]]> = {
  primary: gradients.purpleBright,
  gold: gradients.gold,
  success: gradients.green,
  danger: gradients.danger,
};

const GLOW: Record<Variant, ViewStyle> = {
  primary: shadows.purple,
  gold: shadows.gold,
  success: shadows.neonGreen,
  danger: { ...shadows.purple, shadowColor: colors.lose },
  ghost: {},
};

const TEXT_COLOR: Record<Variant, string> = {
  primary: colors.textPrimary,
  gold: "#2a1500",
  success: colors.backgroundDeep,
  danger: colors.textPrimary,
  ghost: colors.neonGreen,
};

const PAD: Record<Size, { v: number; h: number; font: number }> = {
  sm: { v: spacing.sm, h: spacing.md, font: 13 },
  md: { v: spacing.md, h: spacing.lg, font: 15 },
  lg: { v: spacing.lg, h: spacing.xl, font: 18 },
};

/**
 * Premium CTA: gradient fill (or neon outline for `ghost`), animated press
 * scale, colored glow, loading + disabled states, and tactile haptics.
 */
export function NeonButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  haptics = "medium",
  fullWidth = false,
  style,
  accessibilityLabel,
  icon,
  testID,
}: NeonButtonProps) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const pad = PAD[size];
  const isInert = disabled || loading;

  const onPressIn = useCallback(() => {
    scale.value = withSpring(0.96, motion.springSnappy);
    glow.value = withTiming(1, { duration: motion.fast });
  }, [scale, glow]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, motion.springSnappy);
    glow.value = withTiming(0, { duration: motion.base });
  }, [scale, glow]);

  const handlePress = useCallback(() => {
    if (isInert) return;
    if (haptics) haptic(haptics);
    onPress();
  }, [isInert, haptics, onPress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: 0.35 + glow.value * 0.4,
  }));

  const body = (
    <View style={styles.inner}>
      {loading ? (
        <ActivityIndicator color={TEXT_COLOR[variant]} />
      ) : (
        <>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            style={[
              styles.label,
              { color: TEXT_COLOR[variant], fontSize: pad.font },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <Animated.View
      style={[
        GLOW[variant],
        animStyle,
        fullWidth && styles.fullWidth,
        isInert && styles.disabled,
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={isInert ? undefined : onPressIn}
        onPressOut={isInert ? undefined : onPressOut}
        disabled={isInert}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isInert, busy: loading }}
        testID={testID}
        style={styles.press}
      >
        {variant === "ghost" ? (
          <View
            style={[
              styles.ghost,
              { paddingVertical: pad.v, paddingHorizontal: pad.h },
            ]}
          >
            {body}
          </View>
        ) : (
          <LinearGradient
            colors={GRADIENT[variant]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.gradient,
              { paddingVertical: pad.v, paddingHorizontal: pad.h },
            ]}
          >
            {body}
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  press: { borderRadius: radius.pill, overflow: "hidden" },
  fullWidth: { alignSelf: "stretch" },
  disabled: { opacity: 0.45 },
  gradient: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  ghost: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.neonGreen,
    backgroundColor: `${colors.neonGreen}10`,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  icon: { marginRight: 2 },
  label: { fontWeight: "800", letterSpacing: 0.5 },
});
