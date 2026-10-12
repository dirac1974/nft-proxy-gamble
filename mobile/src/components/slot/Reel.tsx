import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { InteractionManager, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SymbolArt } from "./SymbolArt";
import { OVERSHOOT_MS, OVERSHOOT_PX, ROWS, SPIN_SPEED, landingTarget, mod, type SlotSymbolId } from "./slotMath";

// One reel = ONE translating column. The strip is rendered once (+3 wrap cells) and
// only transform/opacity are animated: 2 animated nodes per reel (column translateY,
// window scaleY/opacity streak) → 10 for the whole set.

export interface ReelHandle {
  /** Wind-up then free-spin downward at SPIN_SPEED. */
  start: () => void;
  /** Land exactly on `stop` (top-row strip index) in `ms` from now (incl. overshoot settle). */
  land: (stop: number, ms: number) => void;
  /** Jump to `stop` with no motion. */
  snap: (stop: number) => void;
}

interface ReelProps {
  strip: readonly SlotSymbolId[];
  cell: number;
  /** Cell height (defaults to `cell`); taller cells fill spare vertical space. */
  cellH?: number;
  initialStop: number;
  reduceMotion: boolean;
}

const WINDUP_MS = 120;
const WINDUP = 0.11; // strip units (~8px at 73pt cells)

/** ms from land() until the strip hits its stop (end of travel, before the overshoot settle). */
export function impactMs(ms: number, reduceMotion = false): number {
  return reduceMotion ? Math.max(0, ms) : Math.max(120, ms - OVERSHOOT_MS);
}

export function landingPlan(current: number, stop: number, length: number, ms: number, cell: number) {
  const travelMs = impactMs(ms);
  const natural = (SPIN_SPEED * travelMs) / 1000;
  const over = OVERSHOOT_PX / cell;
  const target = landingTarget(current, stop, length, Math.max(2, natural * 0.9));
  const distance = current - (target - over);
  // Bezier whose initial slope matches the current spin speed and ends at rest.
  const s0 = Math.min(1, (natural / distance) * 1.0);
  return { target, over, travelMs, distance, easing: [0.3, 0.3 * s0, 0.62, 1] as const };
}

const Cell = memo(function Cell({ symbol, cell, cellH, index }: { symbol: SlotSymbolId; cell: number; cellH: number; index: number }) {
  return (
    <View style={[styles.cell, { top: index * cellH, width: cell, height: cellH }]}>
      <SymbolArt symbol={symbol} size={Math.round(Math.min(cell, cellH) * 0.92)} />
    </View>
  );
});

/** Strip indices visible at `stop` (plus their wrap duplicates) — mounted first. */
function visibleIndices(stop: number, L: number): Set<number> {
  const out = new Set<number>();
  const s = mod(Math.round(stop), L);
  for (let k = 0; k < ROWS; k++) {
    const i = s + k;
    out.add(i);
    if (i >= L) out.add(i - L);
    if (i < ROWS) out.add(i + L);
  }
  return out;
}

export const Reel = memo(
  forwardRef<ReelHandle, ReelProps>(function Reel({ strip, cell, cellH: cellHProp, initialStop, reduceMotion }, ref) {
    const L = strip.length;
    const cellH = cellHProp ?? cell;
    // Mount cost: only the visible window renders first; the rest of the strip
    // (~35 SVG symbols per reel) mounts after interactions or on the first spin.
    const [full, setFull] = useState(false);
    useEffect(() => {
      const task = InteractionManager.runAfterInteractions(() => setFull(true));
      return () => task.cancel();
    }, []);
    const [firstStop] = useState(initialStop);
    const p = useSharedValue(initialStop);
    const streak = useSharedValue(0);
    const fade = useSharedValue(1);

    const cells = useMemo(() => [...strip, ...strip.slice(0, ROWS)], [strip]);
    const initial = useMemo(() => visibleIndices(firstStop, L), [firstStop, L]);

    useImperativeHandle(
      ref,
      () => ({
        start: () => {
          setFull(true);
          cancelAnimation(p);
          if (reduceMotion) {
            fade.value = withTiming(0.35, { duration: 120 });
            return;
          }
          const from = mod(p.value, L);
          p.value = from;
          p.value = withSequence(
            withTiming(from + WINDUP, { duration: WINDUP_MS, easing: Easing.out(Easing.quad) }),
            withRepeat(
              withTiming(from + WINDUP - L, { duration: (L / SPIN_SPEED) * 1000, easing: Easing.linear }),
              -1,
              false,
            ),
          );
          streak.value = withSequence(withTiming(0, { duration: WINDUP_MS }), withTiming(1, { duration: 160 }));
        },
        land: (stop: number, ms: number) => {
          if (reduceMotion) {
            cancelAnimation(p);
            p.value = stop;
            fade.value = withTiming(1, { duration: Math.min(180, Math.max(60, ms)) });
            return;
          }
          const cur = p.value;
          cancelAnimation(p);
          const plan = landingPlan(cur, stop, L, ms, cellH);
          p.value = cur;
          p.value = withSequence(
            withTiming(plan.target - plan.over, {
              duration: plan.travelMs,
              easing: Easing.bezier(plan.easing[0], plan.easing[1], plan.easing[2], plan.easing[3]),
            }),
            withTiming(plan.target, { duration: OVERSHOOT_MS, easing: Easing.out(Easing.quad) }),
          );
          streak.value = withTiming(0, { duration: Math.max(80, plan.travelMs * 0.6), easing: Easing.in(Easing.quad) });
        },
        snap: (stop: number) => {
          cancelAnimation(p);
          p.value = stop;
          streak.value = 0;
          fade.value = 1;
          setFull(true);
        },
      }),
      [L, cellH, fade, p, reduceMotion, streak],
    );

    const columnStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: -(((p.value % L) + L) % L) * cellH }],
    }));
    // Motion streak instead of real blur: stretch + slight fade while at speed.
    const windowStyle = useAnimatedStyle(() => ({
      opacity: fade.value * (1 - 0.16 * streak.value),
      transform: [{ scaleY: 1 + 0.15 * streak.value }],
    }));

    return (
      <Animated.View style={[{ width: cell, height: cellH * ROWS }, styles.window, windowStyle]}>
        <Animated.View style={[{ width: cell, height: cells.length * cellH }, columnStyle]}>
          {cells.map((s, i) => (full || initial.has(i) ? <Cell key={i} index={i} symbol={s} cell={cell} cellH={cellH} /> : null))}
        </Animated.View>
      </Animated.View>
    );
  }),
);

const styles = StyleSheet.create({
  window: { overflow: "hidden" },
  cell: { position: "absolute", left: 0, alignItems: "center", justifyContent: "center" },
});
