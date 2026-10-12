import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInLeft, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { fonts, palette } from "@/theme";
import { pocketColor, type PocketColor } from "./rouletteModel";

export const POCKET_UI: Record<PocketColor, string> = {
  red: palette.ruby,
  black: "#15171C",
  green: "#12844F",
};

interface ResultHistoryStripProps {
  numbers: readonly number[];
  max?: number;
  pill?: number;
  onPress?: () => void;
}

export const ResultHistoryStrip = memo(function ResultHistoryStrip({
  numbers,
  max = 10,
  pill = 20,
  onPress,
}: ResultHistoryStripProps) {
  const shown = numbers.slice(0, max);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={
        shown.length ? `Last numbers: ${shown.join(", ")}. Open statistics` : "No spins yet. Open statistics"
      }
      testID="roulette-history"
      hitSlop={6}
    >
      {shown.length === 0 ? (
        <AppText variant="caption" style={styles.empty}>
          Recent numbers appear here
        </AppText>
      ) : (
        shown.map((n, i) => (
          <Animated.View
            key={`${numbers.length - i}`}
            entering={i === 0 ? FadeInLeft.duration(260) : undefined}
            layout={LinearTransition.duration(200)}
            style={[
              styles.pill,
              { width: pill, height: pill, borderRadius: pill / 2, backgroundColor: POCKET_UI[pocketColor(n)] },
              i === 0 && styles.latest,
              { opacity: 1 - Math.min(0.45, i * 0.05) },
            ]}
          >
            <AppText style={[styles.num, { fontSize: pill * 0.48 }]}>{n}</AppText>
          </Animated.View>
        ))
      )}
      {onPress ? <Ionicons name="stats-chart" size={13} color={palette.gold} style={styles.icon} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 22 },
  empty: { flex: 1, color: palette.textFaint },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  latest: { borderWidth: 1.5, borderColor: palette.gold },
  num: { fontFamily: fonts.heavy, color: palette.ivory, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  icon: { marginLeft: 2 },
});

export function NumberPill({ n, size = 26 }: { n: number; size?: number }) {
  return (
    <View
      style={[styles.pill, { width: size, height: size, borderRadius: size / 2, backgroundColor: POCKET_UI[pocketColor(n)] }]}
    >
      <AppText style={[styles.num, { fontSize: size * 0.46 }]}>{n}</AppText>
    </View>
  );
}
