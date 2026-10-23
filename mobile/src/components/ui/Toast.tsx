import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius, shadows, spacing } from "@/theme";
import { AppText } from "./AppText";

export type ToastTone = "info" | "success" | "danger" | "warn";

const ICONS: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  info: "information-circle",
  success: "checkmark-circle",
  danger: "alert-circle",
  warn: "warning",
};
const COLORS: Record<ToastTone, string> = {
  info: palette.gold,
  success: palette.emerald,
  danger: palette.danger,
  warn: palette.warn,
};

interface ToastProps {
  message: string | null;
  tone?: ToastTone;
  onHide: () => void;
  durationMs?: number;
  testID?: string;
}

// Inline toast; render inside a relatively positioned container (top of screen).
export function Toast({ message, tone = "info", onHide, durationMs = 2600, testID = "toast" }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onHide]);

  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.toast, { borderColor: COLORS[tone] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Ionicons name={ICONS[tone]} size={18} color={COLORS[tone]} />
      <AppText variant="bodyStrong" style={styles.text}>
        {message}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surfaceHi,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.s12,
    ...shadows.e2,
  },
  text: { flex: 1, fontSize: 14 },
});
