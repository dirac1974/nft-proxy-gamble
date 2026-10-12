import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { fonts, gradients, palette } from "@/theme";
import { BetChip, type ChipState } from "./BetChip";
import {
  cellHitSpot,
  colOf,
  coverage,
  EDGE_X,
  EDGE_Y,
  pocketColor,
  rowOf,
  spots,
  zeroHitSpot,
  zoneOf,
  type BetSpot,
  type PlacedBet,
} from "./rouletteModel";

// Vertical European layout (portrait): 0 across the top, numbers 12 rows × 3
// columns, "2 to 1" column bets underneath, dozens + even-money strips on the left.

export interface BetOutcome {
  won: boolean;
  profit: number;
}

export interface BoardGeometry {
  width: number;
  height: number;
  pad: number;
  evenX: number;
  evenW: number;
  dozenX: number;
  dozenW: number;
  gridX: number;
  gridY: number;
  gridRight: number;
  colW: number;
  rowH: number;
  zeroH: number;
  colBetH: number;
}

const PAD = 6;
const RAIL_RIGHT = 12;

export function boardChromeHeight(rowH: number): number {
  return PAD * 2 + Math.round(rowH * 1.15) + Math.round(rowH * 0.95);
}

export function boardGeometry(width: number, rowH: number): BoardGeometry {
  const side = Math.round(Math.min(46, Math.max(34, width * 0.115)));
  const zeroH = Math.round(rowH * 1.15);
  const colBetH = Math.round(rowH * 0.95);
  const gridX = PAD + side * 2;
  const colW = (width - gridX - RAIL_RIGHT) / 3;
  const gridY = PAD + zeroH;
  return {
    width,
    height: gridY + rowH * 12 + colBetH + PAD,
    pad: PAD,
    evenX: PAD,
    evenW: side,
    dozenX: PAD + side,
    dozenW: side,
    gridX,
    gridY,
    gridRight: gridX + colW * 3,
    colW,
    rowH,
    zeroH,
    colBetH,
  };
}

const cellCenter = (n: number, g: BoardGeometry) => ({
  x: g.gridX + (colOf(n) - 0.5) * g.colW,
  y: g.gridY + (rowOf(n) - 0.5) * g.rowH,
});

const EVEN_ORDER = ["low", "even", "red", "black", "odd", "high"] as const;

export function spotAnchor(spot: BetSpot, g: BoardGeometry): { x: number; y: number } {
  switch (spot.type) {
    case "dozen":
      return { x: g.dozenX + g.dozenW / 2, y: g.gridY + (spot.value! - 0.5) * 4 * g.rowH };
    case "column":
      return { x: g.gridX + (spot.value! - 0.5) * g.colW, y: g.gridY + 12 * g.rowH + g.colBetH / 2 };
    case "red":
    case "black":
    case "odd":
    case "even":
    case "low":
    case "high": {
      const i = EVEN_ORDER.indexOf(spot.type);
      return { x: g.evenX + g.evenW / 2, y: g.gridY + (i + 0.5) * 2 * g.rowH };
    }
    default:
      break;
  }
  const nums = spot.numbers ?? [];
  if (nums.length === 1 && nums[0] === 0) return { x: g.gridX + 1.5 * g.colW, y: PAD + g.zeroH / 2 };
  const nonZero = nums.filter((n) => n !== 0);
  const centers = nonZero.map((n) => cellCenter(n, g));
  const avgX = centers.reduce((s, c) => s + c.x, 0) / centers.length;
  const avgY = centers.reduce((s, c) => s + c.y, 0) / centers.length;
  if (nums.includes(0)) {
    if (spot.type === "corner") return { x: g.gridRight, y: g.gridY };
    return { x: avgX, y: g.gridY };
  }
  if (spot.type === "street" || spot.type === "line") return { x: g.gridRight, y: avgY };
  return { x: avgX, y: avgY };
}

interface BettingLayoutProps {
  width: number;
  rowHeight: number;
  bets: readonly PlacedBet[];
  outcomes: Record<string, BetOutcome> | null;
  winningNumber: number | null;
  dollyNumber: number | null;
  disabled: boolean;
  reduceMotion: boolean;
  onPlace: (spot: BetSpot) => void;
}

const CELL_FILL = { red: palette.ruby, black: "#15171C", green: "#12844F" } as const;

export const BettingLayout = memo(function BettingLayout({
  width,
  rowHeight,
  bets,
  outcomes,
  winningNumber,
  dollyNumber,
  disabled,
  reduceMotion,
  onPlace,
}: BettingLayoutProps) {
  const g = useMemo(() => boardGeometry(width, rowHeight), [width, rowHeight]);
  const [preview, setPreview] = useState<ReadonlySet<number>>(EMPTY);

  const showPreview = useCallback((spot: BetSpot | null) => {
    setPreview(spot ? new Set(coverage(spot)) : EMPTY);
  }, []);

  const numberSpot = useCallback(
    (n: number, e?: GestureResponderEvent): BetSpot => {
      const ne = e?.nativeEvent;
      if (!ne || typeof ne.locationX !== "number") return spots.straight(n);
      if (n === 0) return zeroHitSpot(ne.locationX, ne.locationY, g.colW * 3, g.zeroH);
      return cellHitSpot(n, zoneOf(ne.locationX, g.colW, EDGE_X), zoneOf(ne.locationY, g.rowH, EDGE_Y));
    },
    [g],
  );

  const wonKeys = useMemo(() => {
    const s = new Set<string>();
    if (outcomes) for (const [k, o] of Object.entries(outcomes)) if (o.won) s.add(k);
    return s;
  }, [outcomes]);

  const chipSize = Math.round(Math.max(20, Math.min(30, Math.min(g.rowH, g.colW) * 0.84)));

  const outsideCell = (
    spot: BetSpot,
    rect: { x: number; y: number; w: number; h: number },
    label: React.ReactNode,
    testID: string,
    a11y: string,
  ) => (
    <Pressable
      key={spot.key}
      testID={testID}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${a11y} bet`}
      onPressIn={() => showPreview(spot)}
      onPressOut={() => showPreview(null)}
      onPress={() => onPlace(spot)}
      style={[
        styles.cell,
        { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
        wonKeys.has(spot.key) && styles.cellWon,
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {label}
      </View>
    </Pressable>
  );

  const vertical = (text: string, w: number, h: number, small = false) => (
    <View style={[styles.rotWrap, { width: h, height: w, left: (w - h) / 2, top: (h - w) / 2 }]}>
      <AppText style={[styles.outsideText, small && styles.outsideSmall]} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );

  const diamond = (fill: string, w: number, h: number) => {
    const d = Math.min(w, h) * 0.42;
    return (
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={[styles.diamond, { width: d, height: d, backgroundColor: fill }]} />
      </View>
    );
  };

  const evenLabels: Record<(typeof EVEN_ORDER)[number], string> = {
    low: "1–18",
    even: "EVEN",
    red: "RED",
    black: "BLACK",
    odd: "ODD",
    high: "19–36",
  };

  return (
    <View
      style={[styles.board, { width: g.width, height: g.height }]}
      accessibilityLabel="Roulette betting layout"
      testID="roulette-board"
    >
      <LinearGradient colors={gradients.felt} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      {/* corner plaque */}
      <View style={[styles.plaque, { left: PAD, top: PAD, width: g.gridX - PAD, height: g.zeroH }]}>
        <AppText style={styles.plaqueText}>SINGLE ZERO</AppText>
      </View>

      {/* zero */}
      <Pressable
        testID="bet-number-0"
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="0 green"
        onPressIn={(e) => showPreview(numberSpot(0, e))}
        onPressOut={() => showPreview(null)}
        onPress={(e) => onPlace(numberSpot(0, e))}
        style={[styles.cell, { left: g.gridX, top: PAD, width: g.colW * 3, height: g.zeroH }]}
      >
        <View pointerEvents="none" style={[styles.numInner, styles.zeroInner, preview.has(0) && styles.previewInner]}>
          <AppText style={styles.numText}>0</AppText>
        </View>
        {winningNumber === 0 ? <WinPulse reduceMotion={reduceMotion} /> : null}
        {dollyNumber === 0 ? <Dolly /> : null}
      </Pressable>

      {/* numbers */}
      {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => {
        const x = g.gridX + (colOf(n) - 1) * g.colW;
        const y = g.gridY + (rowOf(n) - 1) * g.rowH;
        const color = pocketColor(n);
        return (
          <Pressable
            key={n}
            testID={`bet-number-${n}`}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${n} ${color}`}
            onPressIn={(e) => showPreview(numberSpot(n, e))}
            onPressOut={() => showPreview(null)}
            onPress={(e) => onPlace(numberSpot(n, e))}
            style={[styles.cell, { left: x, top: y, width: g.colW, height: g.rowH }]}
          >
            <View
              pointerEvents="none"
              style={[styles.numInner, { backgroundColor: CELL_FILL[color] }, preview.has(n) && styles.previewInner]}
            >
              <AppText style={[styles.numText, { fontSize: Math.min(17, g.rowH * 0.52) }]}>{n}</AppText>
            </View>
            {winningNumber === n ? <WinPulse reduceMotion={reduceMotion} /> : null}
            {dollyNumber === n ? <Dolly /> : null}
          </Pressable>
        );
      })}

      {/* columns: 2 to 1 */}
      {([1, 2, 3] as const).map((v) =>
        outsideCell(
          spots.column(v),
          { x: g.gridX + (v - 1) * g.colW, y: g.gridY + 12 * g.rowH, w: g.colW, h: g.colBetH },
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <AppText style={styles.outsideText}>2 TO 1</AppText>
          </View>,
          `bet-column-${v}`,
          `Column ${v}, pays 2 to 1`,
        ),
      )}

      {/* dozens */}
      {([1, 2, 3] as const).map((v) =>
        outsideCell(
          spots.dozen(v),
          { x: g.dozenX, y: g.gridY + (v - 1) * 4 * g.rowH, w: g.dozenW, h: 4 * g.rowH },
          vertical(`${["1ST", "2ND", "3RD"][v - 1]} 12`, g.dozenW, 4 * g.rowH),
          `bet-dozen-${v}`,
          `${["First", "Second", "Third"][v - 1]} dozen`,
        ),
      )}

      {/* even-money */}
      {EVEN_ORDER.map((t, i) => {
        const rect = { x: g.evenX, y: g.gridY + i * 2 * g.rowH, w: g.evenW, h: 2 * g.rowH };
        const label =
          t === "red"
            ? diamond(palette.ruby, rect.w, rect.h)
            : t === "black"
              ? diamond("#15171C", rect.w, rect.h)
              : vertical(evenLabels[t], rect.w, rect.h, true);
        return outsideCell(spots.outside(t), rect, label, `bet-${t}`, evenLabels[t]);
      })}

      {/* chips */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {bets.map((b) => {
          const p = spotAnchor(b, g);
          const o = outcomes?.[b.key];
          const state: ChipState = o ? (o.won ? "won" : "lost") : "live";
          return (
            <BetChip
              key={b.key}
              testID={`chip-on-${b.key}`}
              amount={b.amount}
              x={p.x}
              y={p.y}
              size={chipSize}
              state={state}
              profit={o?.profit}
              reduceMotion={reduceMotion}
            />
          );
        })}
      </View>
    </View>
  );
});

const EMPTY: ReadonlySet<number> = new Set();

function WinPulse({ reduceMotion }: { reduceMotion: boolean }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduceMotion) {
      o.value = withRepeat(withSequence(withTiming(0.35, { duration: 420 }), withTiming(1, { duration: 420 })), 5, false);
    }
    return () => cancelAnimation(o);
  }, [o, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[styles.winPulse, style]} />;
}

function Dolly() {
  return (
    <View pointerEvents="none" style={styles.dolly} accessibilityLabel="Last winning number">
      <View style={styles.dollyTop} />
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(233,196,106,0.6)",
  },
  cell: {
    position: "absolute",
    borderWidth: 0.5,
    borderColor: palette.feltLine,
  },
  cellWon: { borderWidth: 2, borderColor: palette.goldLight, backgroundColor: "rgba(233,196,106,0.14)" },
  numInner: {
    position: "absolute",
    top: 2.5,
    bottom: 2.5,
    left: 3,
    right: 3,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  zeroInner: { backgroundColor: "#12844F", borderRadius: 999, left: "18%", right: "18%" },
  previewInner: { borderWidth: 2, borderColor: palette.goldLight, opacity: 0.85 },
  numText: { fontFamily: fonts.heavy, fontSize: 16, color: palette.ivory, fontVariant: ["tabular-nums"], includeFontPadding: false },
  center: { alignItems: "center", justifyContent: "center" },
  rotWrap: { position: "absolute", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-90deg" }] },
  outsideText: { fontFamily: fonts.display, fontSize: 12, color: palette.goldLight, letterSpacing: 1.2 },
  outsideSmall: { fontSize: 11, letterSpacing: 0.8 },
  diamond: { transform: [{ scaleY: 1.5 }, { rotate: "45deg" }], borderWidth: 1, borderColor: palette.goldLight },
  plaque: { position: "absolute", alignItems: "center", justifyContent: "center" },
  plaqueText: { fontFamily: fonts.display, fontSize: 9, color: palette.feltLine, letterSpacing: 1.5 },
  winPulse: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2.5,
    borderColor: palette.goldLight,
    borderRadius: 5,
    shadowColor: palette.gold,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  dolly: {
    position: "absolute",
    top: 3,
    right: 5,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: palette.goldDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.goldLight,
  },
  dollyTop: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.ivory },
});
