import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fonts } from "@/theme";
import { AppText, haptic, type HapticKind } from "@/components/ui";
import { cab } from "./cabinet";

type Tone = "yellow" | "red" | "blue";

// inkIdle: unlit but selectable (inactive tab, un-held card) — must stay legible (≥4.5:1 on the dark face).
// inkDark: disabled.
type Face = { lit: readonly [string, string]; dark: readonly [string, string]; ink: string; inkIdle: string; inkDark: string };
const FACES: Record<Tone, Face> = {
  yellow: { lit: ["#FFF27A", "#E8B800"], dark: ["#6B5A12", "#3D3208"], ink: cab.yellowInk, inkIdle: "rgba(255,225,58,0.9)", inkDark: "rgba(255,225,58,0.45)" },
  red: { lit: ["#FF5A66", "#B00C22"], dark: ["#5C1018", "#33080E"], ink: cab.white, inkIdle: "rgba(255,255,255,0.88)", inkDark: "rgba(255,255,255,0.4)" },
  blue: { lit: ["#4F7BFF", "#1736B8"], dark: ["#1E2F78", "#111C52"], ink: cab.white, inkIdle: "rgba(255,255,255,0.88)", inkDark: "rgba(255,255,255,0.4)" },
};

interface CabinetButtonProps {
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  height?: number;
  fontSize?: number;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
  haptic?: HapticKind | false;
}

// Lit, bevelled cabinet push-button (original styling).
export function CabinetButton({
  label,
  onPress,
  tone = "blue",
  disabled = false,
  loading = false,
  active = true,
  height = 52,
  fontSize = 12,
  style,
  testID,
  accessibilityLabel,
  haptic: hapticKind = "light",
}: CabinetButtonProps) {
  const face = FACES[tone];
  const lit = active && !disabled;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (hapticKind) haptic(hapticKind);
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label.replace(/\n/g, " ")}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [styles.bezel, { height }, style, pressed && styles.pressed]}
    >
      <LinearGradient colors={lit ? face.lit : face.dark} style={styles.face} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
        <View style={styles.sheen} pointerEvents="none" />
        {loading ? (
          <ActivityIndicator color={face.ink} size="small" />
        ) : (
          <AppText
            numberOfLines={2}
            style={[styles.label, { fontSize, lineHeight: fontSize + 2, color: lit ? face.ink : disabled ? face.inkDark : face.inkIdle }]}
          >
            {label}
          </AppText>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bezel: {
    borderRadius: 8,
    padding: 2,
    backgroundColor: cab.bezel,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  pressed: { transform: [{ translateY: 1 }, { scale: 0.98 }] },
  face: {
    flex: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    overflow: "hidden",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.35)",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "45%",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  label: { fontFamily: fonts.heavy, letterSpacing: 0.8, textAlign: "center", textTransform: "uppercase" },
});
