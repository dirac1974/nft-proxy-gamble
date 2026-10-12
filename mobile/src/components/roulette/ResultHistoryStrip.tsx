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

// Labelled strip: "HISTORY" · colour pills (latest ringed) · Stats button. Every pill carries its number,
// so colour is never the only cue.
export const ResultHistoryStrip = memo(function ResultHistoryStrip({
  numbers,
  max = 6,
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
        shown.length ? `History: ${shown.join(", ")}. Open statistics` : "History: no spins yet. Open statistics"
      }
      testID="roulette-history"
      hitSlop={6}
    >
      <AppText style={styles.label}>History</AppText>
      <View style={styles.pills}>
        {shown.length === 0 ? (
          <AppText variant="caption" style={styles.empty} numberOfLines={1}>
            No spins yet
          </AppText>
        ) : (
          shown.map((n, i) => (
            <Animated.View
              key={`${numbers.length - i}`}
              entering={i === 0 ? FadeInLeft.duration(260) : undefined}
              layout={LinearTransition.duration(200)}
              style={[
                styles.pill,
                { minWidth: pill + 4, height: pill, borderRadius: pill / 2, backgroundColor: POCKET_UI[pocketColor(n)] },
                i === 0 && styles.latest,
              ]}
            >
              <AppText style={[styles.num, { fontSize: pill * 0.5 }]}>{n}</AppText>
            </Animated.View>
          ))
        )}
      </View>
      {onPress ? (
        <View style={styles.stats}>
          <Ionicons name="stats-chart" size={11} color={palette.gold} />
          <AppText style={styles.statsText}>Stats</AppText>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 24 },
  label: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 1.2, color: palette.goldLight, opacity: 0.75, textTransform: "uppercase" },
  pills: { flex: 1, flexDirection: "row", alignItems: "center", gap: 3, overflow: "hidden" },
  empty: { color: palette.textFaint },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  latest: { borderWidth: 1.5, borderColor: palette.gold },
  num: { fontFamily: fonts.heavy, color: palette.ivory, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.45)",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  statsText: { fontFamily: fonts.bold, fontSize: 10, color: palette.gold },
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
