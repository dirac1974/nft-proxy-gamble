import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Rect } from "react-native-svg";
import { palette } from "@/theme";
import { AppText } from "./AppText";
import { haptic } from "./haptics";
import { playSound } from "@/services/soundService";

// Casino chip denominations → colour, like a real rack.
const CHIP_COLORS: { min: number; body: string; edge: string; text: string }[] = [
  { min: 500, body: "#5B2A86", edge: "#F5F1E8", text: "#F5F1E8" },
  { min: 100, body: "#1A1A1A", edge: "#E9C46A", text: "#F5F1E8" },
  { min: 25, body: "#1C7A4F", edge: "#F5F1E8", text: "#F5F1E8" },
  { min: 5, body: "#B3202F", edge: "#F5F1E8", text: "#F5F1E8" },
  { min: 0, body: "#E8E4DA", edge: "#2F5DA8", text: "#1A1A1A" },
];

export function chipColors(value: number) {
  return CHIP_COLORS.find((c) => value >= c.min) ?? CHIP_COLORS[CHIP_COLORS.length - 1]!;
}

export function ChipGraphic({ value, size = 44, label }: { value: number; size?: number; label?: string }) {
  const c = chipColors(value);
  const r = size / 2;
  const stripes = Array.from({ length: 8 }, (_, i) => i * 45);
  const text = label ?? (value >= 1000 ? `${value / 1000}K` : String(value));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 44 44">
        <Circle cx={22} cy={22} r={21} fill={c.body} />
        <G origin="22,22">
          {stripes.map((deg) => (
            <Rect
              key={deg}
              x={19.5}
              y={1}
              width={5}
              height={7}
              rx={1}
              fill={c.edge}
              rotation={deg}
              origin="22,22"
            />
          ))}
        </G>
        <Circle cx={22} cy={22} r={14} fill={c.body} stroke={c.edge} strokeWidth={1.2} strokeDasharray="2.5,2" />
        <Circle cx={22} cy={22} r={21} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.center}>
          <AppText style={[styles.value, { color: c.text, fontSize: size * (text.length > 3 ? 0.22 : 0.28) }]}>
            {text}
          </AppText>
        </View>
      </View>
    </View>
  );
}

interface ChipProps {
  value: number;
  selected?: boolean;
  disabled?: boolean;
  size?: number;
  onPress?: () => void;
  testID?: string;
}

export function Chip({ value, selected = false, disabled = false, size = 48, onPress, testID }: ChipProps) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => {
        haptic("select");
        void playSound("ui_toggle");
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${value} coin chip`}
      accessibilityState={{ selected, disabled }}
      style={[styles.wrap, selected && styles.selected, disabled && styles.disabled]}
    >
      <ChipGraphic value={value} size={size} />
    </Pressable>
  );
}

interface ChipRackProps {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  maxAffordable?: number;
}

export function ChipRack({ values, value, onChange, disabled, maxAffordable }: ChipRackProps) {
  return (
    <View style={styles.rack}>
      {values.map((v) => (
        <Chip
          key={v}
          value={v}
          selected={v === value}
          disabled={disabled || (maxAffordable !== undefined && v > maxAffordable)}
          onPress={() => onChange(v)}
          testID={`chip-${v}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 999, padding: 3, borderWidth: 2, borderColor: "transparent" },
  selected: {
    borderColor: palette.gold,
    transform: [{ translateY: -4 }],
    shadowColor: palette.gold,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  disabled: { opacity: 0.35 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  value: { fontFamily: "Inter_800ExtraBold", includeFontPadding: false },
  rack: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
});
