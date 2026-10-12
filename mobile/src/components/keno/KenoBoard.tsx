import React, { memo, useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { fonts, palette } from "@/theme";
import { AppText } from "@/components/ui";
import { BOARD_COLS, BOARD_ROWS, CARD_STYLES, cellA11yLabel, type KenoMode } from "./kenoModel";
import { CardGlyph } from "./CardGlyph";

export const DIVIDER_H = 4;
export const BOARD_PAD = 3;
const HAIRLINE = "rgba(233,196,106,0.16)";
const HIT_INK = palette.ink;

interface CellProps {
  n: number;
  w: number;
  h: number;
  mode: KenoMode;
  markMask: number; // bit i = marked on card i
  activeCard: number;
  drawn: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  onToggle: (n: number) => void;
}

const maskToCards = (mask: number): number[] => [0, 1, 2, 3].filter((i) => mask & (1 << i));

const Cell = memo(function Cell({ n, w, h, mode, markMask, activeCard, drawn, disabled, reduceMotion, onToggle }: CellProps) {
  const markedBy = useMemo(() => maskToCards(markMask), [markMask]);
  const marked = markedBy.length > 0;
  const hit = drawn && marked;
  const activeMarked = mode === "single" ? marked : (markMask & (1 << activeCard)) !== 0;
  const single = mode === "single";
  const hitColor = markedBy.length === 1 ? CARD_STYLES[markedBy[0]!]!.color : palette.gold;
  const activeColor = CARD_STYLES[single ? 0 : activeCard]!.color;
  const ball = Math.min(w, h) - 6;

  const scale = useSharedValue(1);
  useEffect(() => {
    if (hit && !reduceMotion) scale.value = withSequence(withTiming(1.15, { duration: 90 }), withTiming(1, { duration: 90 }));
  }, [hit, reduceMotion, scale]);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => onToggle(n)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={cellA11yLabel(n, markedBy, drawn, mode)}
      accessibilityState={{ selected: activeMarked, disabled }}
      testID={`keno-cell-${n}`}
      style={({ pressed }) => [
        styles.cell,
        { width: w, height: h },
        n % BOARD_COLS === 0 && styles.lastCol,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Animated.View style={[styles.center, pulse]}>
        {hit ? (
          <View style={[styles.ball, { width: ball, height: ball, borderRadius: ball / 2, backgroundColor: hitColor }]} />
        ) : drawn ? (
          <View style={[styles.ball, styles.drawnRing, { width: ball, height: ball, borderRadius: ball / 2 }]} />
        ) : activeMarked ? (
          <View
            style={[
              styles.markFill,
              { width: w - 6, height: h - 6, borderColor: activeColor, backgroundColor: `${activeColor}40` },
            ]}
          />
        ) : null}
        <AppText style={[styles.num, hit && { color: HIT_INK }, drawn && !hit && styles.numDrawn]} allowFontScaling={false}>
          {n}
        </AppText>
      </Animated.View>
      {single && hit ? (
        <View style={[styles.pip, styles.tl]} pointerEvents="none">
          <CardGlyph glyph={CARD_STYLES[0]!.glyph} color={HIT_INK} size={6} />
        </View>
      ) : null}
      {!single
        ? markedBy.map((i) => {
            const cs = CARD_STYLES[i]!;
            return (
              <View key={i} style={[styles.pip, styles[cs.corner]]} pointerEvents="none">
                <CardGlyph glyph={cs.glyph} color={hit && markedBy.length === 1 ? HIT_INK : cs.color} size={7} outline={hit ? HIT_INK : undefined} />
              </View>
            );
          })
        : null}
    </Pressable>
  );
});

interface KenoBoardProps {
  mode: KenoMode;
  cards: readonly (readonly number[])[];
  activeCard: number;
  drawn: readonly number[];
  cellW: number;
  cellH: number;
  disabled: boolean;
  drawing: boolean;
  reduceMotion: boolean;
  onToggle: (n: number) => void;
  onSkip: () => void;
}

export function KenoBoard({ mode, cards, activeCard, drawn, cellW, cellH, disabled, drawing, reduceMotion, onToggle, onSkip }: KenoBoardProps) {
  const masks = useMemo(() => {
    const m = new Array<number>(81).fill(0);
    cards.forEach((spots, i) => spots.forEach((s) => (m[s] = m[s]! | (1 << i))));
    return m;
  }, [cards]);
  const drawnSet = useMemo(() => new Set(drawn), [drawn]);

  const rows = Array.from({ length: BOARD_ROWS }, (_, r) => r);
  return (
    <View style={styles.bezel} testID="keno-board">
      <View style={styles.frame}>
        {rows.map((r) => (
          <React.Fragment key={r}>
            {r === BOARD_ROWS / 2 ? (
              <LinearGradient
                colors={[palette.goldDeep, palette.goldLight, palette.goldDeep]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.divider}
              />
            ) : null}
            <View style={styles.row}>
              {Array.from({ length: BOARD_COLS }, (_, c) => {
                const n = r * BOARD_COLS + c + 1;
                return (
                  <Cell
                    key={n}
                    n={n}
                    w={cellW}
                    h={cellH}
                    mode={mode}
                    markMask={masks[n]!}
                    activeCard={activeCard}
                    drawn={drawnSet.has(n)}
                    disabled={disabled}
                    reduceMotion={reduceMotion}
                    onToggle={onToggle}
                  />
                );
              })}
            </View>
          </React.Fragment>
        ))}
      </View>
      {drawing ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip to result"
          testID="keno-skip"
        />
      ) : null}
    </View>
  );
}

/** Total board height for a given cell height (for fitting the screen). */
export const boardHeight = (cellH: number): number => cellH * BOARD_ROWS + DIVIDER_H + BOARD_PAD * 2 + 4;

const styles = StyleSheet.create({
  bezel: {
    alignSelf: "center",
    padding: BOARD_PAD,
    borderRadius: 10,
    backgroundColor: "#020414",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.45)",
  },
  frame: { backgroundColor: palette.bgRaised, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: HAIRLINE },
  row: { flexDirection: "row" },
  divider: { height: DIVIDER_H },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
  },
  lastCol: { borderRightWidth: 0 },
  pressed: { backgroundColor: palette.surfaceHi },
  center: { alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
  ball: { position: "absolute" },
  drawnRing: { borderWidth: 1.5, borderColor: palette.ivory, backgroundColor: "rgba(251,248,241,0.08)" },
  markFill: { position: "absolute", borderWidth: 2, borderRadius: 6 },
  num: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 18, color: palette.ivory, fontVariant: ["tabular-nums"] },
  numDrawn: { color: palette.ivory },
  pip: { position: "absolute" },
  tl: { top: 2, left: 2 },
  tr: { top: 2, right: 2 },
  bl: { bottom: 2, left: 2 },
  br: { bottom: 2, right: 2 },
});
