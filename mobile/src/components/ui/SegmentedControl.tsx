import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { fonts, palette, radius } from "@/theme";
import { AppText } from "./AppText";
import { haptic } from "./haptics";
import { playSound } from "@/services/soundService";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  testIDPrefix?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  testIDPrefix = "segment",
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.track, disabled && styles.disabled]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testIDPrefix}-${o.value}`}
            disabled={disabled}
            onPress={() => {
              if (active) return;
              haptic("select");
              void playSound("ui_toggle");
              onChange(o.value);
            }}
            style={[styles.seg, active && styles.active]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
          >
            <AppText
              numberOfLines={1}
              style={[styles.label, { color: active ? palette.goldInk : palette.textDim }]}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.hairline,
    padding: 3,
  },
  seg: { flex: 1, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  active: { backgroundColor: palette.gold },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.3 },
  disabled: { opacity: 0.5 },
});
