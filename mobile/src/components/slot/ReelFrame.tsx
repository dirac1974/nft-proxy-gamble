import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient as LG } from "expo-linear-gradient";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { REELS, ROWS } from "./slotMath";
import { C, goldStops } from "./artKit";

export interface FrameGeometry {
  W: number;
  H: number;
  B: number;
  D: number;
  cell: number;
  innerW: number;
  innerH: number;
  reelX: (i: number) => number;
}

/** Square cells; border + dividers sized off width; optionally capped by height. */
export function frameGeometry(width: number, maxHeight?: number): FrameGeometry {
  const B = Math.round(Math.min(15, Math.max(10, width * 0.036)));
  const D = 3;
  let cell = Math.floor((width - 2 * B - (REELS - 1) * D) / REELS);
  if (maxHeight && maxHeight > 0) cell = Math.min(cell, Math.floor((maxHeight - 2 * B) / ROWS));
  cell = Math.max(32, cell);
  const innerW = cell * REELS + D * (REELS - 1);
  const innerH = cell * ROWS;
  return { W: innerW + 2 * B, H: innerH + 2 * B, B, D, cell, innerW, innerH, reelX: (i) => i * (cell + D) };
}

type Mode = "base" | "free";

export const FrameArt = memo(function FrameArt({ g, mode }: { g: FrameGeometry; mode: Mode }) {
  const { W, H, B, D, cell, innerW, innerH } = g;
  const lac = mode === "free" ? ["#4FC79B", C.jade, C.jadeD] : [C.rubyL, C.ruby, C.lacquer];
  const glass = mode === "free" ? ["#123D35", "#0A2620", "#06140F"] : ["#1E2366", "#12153D", "#080A1E"];
  const corners = [
    [B / 2, B / 2],
    [W - B / 2, B / 2],
    [B / 2, H - B / 2],
    [W - B / 2, H - B / 2],
  ] as const;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="rf-g" x1="0" y1="0" x2="0" y2="1">
          {goldStops()}
        </LinearGradient>
        <LinearGradient id={`rf-l-${mode}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lac[0]} />
          <Stop offset="0.4" stopColor={lac[1]} />
          <Stop offset="1" stopColor={lac[2]} />
        </LinearGradient>
        <LinearGradient id={`rf-w-${mode}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={glass[2]} />
          <Stop offset="0.5" stopColor={glass[0]} />
          <Stop offset="1" stopColor={glass[2]} />
        </LinearGradient>
        <LinearGradient id="rf-d" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.goldD} />
          <Stop offset="0.5" stopColor={C.goldL} />
          <Stop offset="1" stopColor={C.goldD} />
        </LinearGradient>
      </Defs>
      {/* outer gold bevel */}
      <Rect x={0} y={0} width={W} height={H} rx={14} fill={C.ink} />
      <Rect x={1.5} y={1.5} width={W - 3} height={H - 3} rx={12.5} fill="url(#rf-g)" />
      <Rect x={1.5} y={1.5} width={W - 3} height={H - 3} rx={12.5} fill="none" stroke={C.goldL} strokeWidth={0.75} />
      {/* ruby (jade in free games) lacquer band */}
      <Rect x={4.5} y={4.5} width={W - 9} height={H - 9} rx={10} fill={C.ink} />
      <Rect x={5.5} y={5.5} width={W - 11} height={H - 11} rx={9} fill={`url(#rf-l-${mode})`} />
      <Path d={`M${18} 6.6 L${W - 18} 6.6`} stroke="#fff" strokeOpacity={0.35} strokeWidth={1} strokeLinecap="round" />
      {/* inner gold bevel around the glass: ink 3 → goldDeep 2 → goldLight 0.75 */}
      <Rect x={B - 2} y={B - 2} width={innerW + 4} height={innerH + 4} rx={4} fill="none" stroke={C.ink} strokeWidth={3} />
      <Rect x={B - 2} y={B - 2} width={innerW + 4} height={innerH + 4} rx={4} fill="none" stroke={C.goldD} strokeWidth={2} />
      <Rect x={B - 2} y={B - 2} width={innerW + 4} height={innerH + 4} rx={4} fill="none" stroke={C.goldL} strokeWidth={0.75} />
      <Rect x={B} y={B} width={innerW} height={innerH} fill={`url(#rf-w-${mode})`} />
      {/* dividers */}
      {Array.from({ length: REELS - 1 }, (_, i) => {
        const x = B + (i + 1) * cell + i * D;
        return <Rect key={i} x={x} y={B} width={D} height={innerH} fill="url(#rf-d)" />;
      })}
      {/* corner knots + top crest */}
      {corners.map(([x, y], i) => (
        <React.Fragment key={i}>
          <Circle cx={x} cy={y} r={B * 0.42} fill={C.ink} />
          <Circle cx={x} cy={y} r={B * 0.36} fill="url(#rf-g)" />
          <Circle cx={x} cy={y} r={B * 0.16} fill={lac[1]} stroke={C.ink} strokeWidth={0.6} />
        </React.Fragment>
      ))}
      <Path
        d={`M${W / 2 - 16} ${B / 2} L${W / 2} ${B / 2 - 6} L${W / 2 + 16} ${B / 2} L${W / 2} ${B / 2 + 6} Z`}
        fill="url(#rf-g)"
        stroke={C.ink}
        strokeWidth={1}
      />
      <Circle cx={W / 2} cy={B / 2} r={2.6} fill={lac[1]} stroke={C.ink} strokeWidth={0.6} />
    </Svg>
  );
});

interface ReelFrameProps {
  geometry: FrameGeometry;
  mode: Mode;
  children: React.ReactNode;
  /** Rendered above the reels + glass shading (win overlays, anticipation glow). */
  overlay?: React.ReactNode;
}

export function ReelFrame({ geometry, mode, children, overlay }: ReelFrameProps) {
  const { W, H, B, innerW, innerH } = geometry;
  return (
    <View style={{ width: W, height: H }}>
      <FrameArt g={geometry} mode={mode} />
      <View style={[styles.window, { left: B, top: B, width: innerW, height: innerH }]}>
        {children}
        {/* cylinder shading + glass highlight (static) */}
        <LG
          colors={["rgba(0,0,0,0.62)", "rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0.62)"]}
          locations={[0, 0.2, 0.8, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <LG
          colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {overlay}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { position: "absolute", overflow: "hidden" },
});
