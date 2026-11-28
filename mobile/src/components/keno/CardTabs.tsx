import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { fonts, palette, radius } from "@/theme";
import { AppText, haptic } from "@/components/ui";
import { CARD_STYLES } from "./kenoModel";
import { CardGlyph } from "./CardGlyph";

export const TABS_H = 36;

export interface TabInfo {
  spots: number;
  catches: number | null; // live/settled catch count (null when idle)
  payout: number | null; // settled payout (null until settled)
}

interface CardTabsProps {
  tabs: TabInfo[];
  active: number;
  disabled: boolean;
  onSelect: (i: number) => void;
  onLongPress: (i: number) => void;
}

export function tabLabel(i: number, t: TabInfo): string {
  const L = CARD_STYLES[i]!.letter;
  if (t.spots === 0) return `${L} · —`;
  if (t.catches === null) return `${L} · ${t.spots}`;
  if (t.payout !== null && t.payout > 0) return `${L} ${t.catches}/${t.spots} · ${t.payout}`;
  return `${L} ${t.catches}/${t.spots}`;
}

export function CardTabs({ tabs, active, disabled, onSelect, onLongPress }: CardTabsProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {tabs.map((t, i) => {
        const cs = CARD_STYLES[i]!;
        const on = i === active;
        const label = tabLabel(i, t);
        return (
          <Pressable
            key={cs.letter}
            onPress={() => {
              if (on) return;
              haptic("select");
              onSelect(i);
            }}
            onLongPress={() => {
              haptic("medium");
              onLongPress(i);
            }}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={`Card ${cs.letter}, ${cs.name}. ${t.spots === 0 ? "No numbers, not played" : `${t.spots} spots${t.catches !== null ? `, ${t.catches} caught` : ""}${t.payout ? `, pays ${t.payout}` : ""}`}`}
            accessibilityHint="Long press for card options"
            testID={`keno-tab-${cs.letter}`}
            style={[
              styles.tab,
              on && { borderColor: cs.color, backgroundColor: `${cs.color}26` },
              t.spots === 0 && !on && styles.empty,
            ]}
          >
            <CardGlyph glyph={cs.glyph} color={cs.color} size={9} />
            <AppText style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4, height: TABS_H },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: palette.hairlineStrong,
    backgroundColor: "#020414",
    paddingHorizontal: 4,
  },
  empty: { opacity: 0.6 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: palette.textDim, fontVariant: ["tabular-nums"] },
  labelOn: { color: palette.ivory },
});
