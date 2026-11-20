import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, palette, radius, shadows, spacing, typography } from "@/theme";
import { haptic } from "@/components/ui";
import type { BlackjackActionName } from "@/services/api";

interface ActionBarProps {
  legal: BlackjackActionName[];
  enabled: boolean;
  extraCost: number;
  balance: number;
  onAction: (a: BlackjackActionName) => void;
}

type Variant = "secondary" | "primary" | "felt";

const SLOTS: { action: BlackjackActionName; label: string; variant: Variant }[] = [
  { action: "hit", label: "Hit", variant: "secondary" },
  { action: "stand", label: "Stand", variant: "primary" },
  { action: "double", label: "Double", variant: "felt" },
  { action: "split", label: "Split", variant: "felt" },
];

interface ActionButtonProps {
  label: string;
  sublabel?: string;
  variant: Variant;
  disabled: boolean;
  heavy: boolean;
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
}

// 4-up slots are ~80dp wide: the shared Button's padding truncated "STA…"/"DOU…".
// Tight padding + shrink-to-fit keeps full words; no click sound (the deal/flip sounds are the feedback).
function ActionButton({ label, sublabel, variant, disabled, heavy, onPress, testID, accessibilityLabel }: ActionButtonProps) {
  const ink = disabled ? palette.textFaint : variant === "primary" ? palette.goldInk : palette.text;
  const body = (
    <>
      <Text
        style={[styles.label, { color: ink }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
      >
        {label.toUpperCase()}
      </Text>
      {sublabel ? (
        <Text style={[styles.sublabel, { color: ink }]} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </>
  );
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptic(heavy ? "medium" : "light");
        onPress();
      }}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      {disabled ? (
        <View style={[styles.face, styles.disabled]}>{body}</View>
      ) : variant === "secondary" ? (
        <View style={[styles.face, styles.secondary]}>{body}</View>
      ) : (
        <LinearGradient
          colors={variant === "primary" ? gradients.gold : gradients.felt}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.face, variant === "primary" && shadows.goldGlow]}
        >
          <View style={styles.highlight} pointerEvents="none" />
          {body}
        </LinearGradient>
      )}
    </Pressable>
  );
}

// Four fixed slots — buttons never move or disappear, illegal ones are disabled.
export function ActionBar({ legal, enabled, extraCost, balance, onAction }: ActionBarProps) {
  const affordable = balance >= extraCost;
  return (
    <View style={styles.row}>
      {SLOTS.map(({ action, label, variant }) => {
        const costs = action === "double" || action === "split";
        const ok = enabled && legal.includes(action) && (!costs || affordable);
        return (
          <View key={action} style={styles.slot}>
            <ActionButton
              label={label}
              variant={variant}
              disabled={!ok}
              heavy={costs}
              sublabel={costs ? `+${extraCost}` : undefined}
              onPress={() => onAction(action)}
              testID={`bj-${action}`}
              accessibilityLabel={costs ? `${label}, adds ${extraCost} coins` : label}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  slot: { flex: 1 },
  btn: { alignSelf: "stretch" },
  pressed: { transform: [{ scale: 0.96 }] },
  face: {
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  highlight: { ...StyleSheet.absoluteFillObject, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.45)", borderRadius: radius.md },
  secondary: { backgroundColor: palette.surfaceHi, borderWidth: 1, borderColor: "rgba(233,196,106,0.45)" },
  disabled: { backgroundColor: palette.surfaceHi, borderWidth: 1, borderColor: "rgba(233,196,106,0.25)" },
  label: { ...typography.button, fontSize: 13, letterSpacing: 0.8, textAlign: "center", alignSelf: "stretch" },
  sublabel: { fontSize: 11, opacity: 0.8, marginTop: 1, fontFamily: typography.caption.fontFamily, fontVariant: ["tabular-nums"] },
});
