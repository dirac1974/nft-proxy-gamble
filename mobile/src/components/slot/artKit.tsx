import React from "react";
import { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { palette } from "@/theme";

// Shared art-direction primitives for Lion Lantern Night. No SVG filters anywhere:
// bevels = stacked strokes (ink → goldDeep → goldLight), inner shadow = clipped
// radial, rim light = thin white arc, sheen = low-opacity diagonal band, glow =
// concentric low-opacity strokes.

export const C = {
  ink: palette.goldInk, // #2A1A00
  goldL: palette.goldLight,
  gold: palette.gold,
  goldD: palette.goldDeep,
  rubyL: palette.rubyLight,
  ruby: palette.ruby,
  rubyD: palette.rubyDeep,
  lacquer: "#5E0F1B",
  jadeL: "#8FE3C0",
  jade: "#2E9E7A",
  jadeD: "#145440",
  indigoL: "#3B3F8F",
  indigo: "#1B1F4A",
  indigoD: "#0B0D24",
  ivory: "#FFF4DC",
  night: "#0A0C20",
  black: "#141414",
} as const;

export function f(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Closed scalloped ring (mane, clouds, peony ruffles). Bumps bulge outward. */
export function scallopPath(cx: number, cy: number, r: number, n: number, bulge: number, rot = 0): string {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += i === 0 ? `M${f(x)} ${f(y)}` : `A${f(bulge)} ${f(bulge)} 0 0 1 ${f(x)} ${f(y)}`;
  }
  return `${d}Z`;
}

/** Annular sector (fan leaf). Angles in degrees, SVG orientation (0 = +x, clockwise). */
export function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => {
    const t = (a * Math.PI) / 180;
    return `${f(cx + r * Math.cos(t))} ${f(cy + r * Math.sin(t))}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
}

export function goldStops(flip = false): React.ReactElement[] {
  const stops: [string, string][] = flip
    ? [["0", C.goldD], ["0.35", C.gold], ["0.6", C.goldL], ["1", C.goldD]]
    : [["0", C.goldL], ["0.42", C.gold], ["0.78", C.goldD], ["1", C.gold]];
  return stops.map(([o, c]) => <Stop key={o} offset={o} stopColor={c} />);
}

/** Stacked-stroke gold bevel on any path (ink 3 → goldDeep 2 → goldLight 0.75, scaled ×k). */
export function BevelStroke({ d, k = 1.6, fill = "none" }: { d: string; k?: number; fill?: string }) {
  return (
    <>
      <Path d={d} fill={fill} stroke={C.ink} strokeWidth={3 * k} strokeLinejoin="round" />
      <Path d={d} fill="none" stroke={C.goldD} strokeWidth={2 * k} strokeLinejoin="round" />
      <Path d={d} fill="none" stroke={C.goldL} strokeWidth={0.75 * k} strokeLinejoin="round" />
    </>
  );
}

export type Field = readonly [string, string, string];

/**
 * Premium roundel plaque: gold bevel rim, ruby lacquer ring with gold studs,
 * per-symbol inner field, faked inner shadow and top-left rim light.
 * Uses 3 gradients (`${id}g`, `${id}f`, `${id}s`).
 */
export function RoundelPlaque({ id, field }: { id: string; field: Field }) {
  const studs = Array.from({ length: 8 }, (_, i) => polar(50, 50, 37.6, i * 45 + 22.5));
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0.35" y2="1">
          {goldStops()}
        </LinearGradient>
        <RadialGradient id={`${id}f`} cx="50%" cy="36%" r="64%">
          <Stop offset="0" stopColor={field[0]} />
          <Stop offset="0.55" stopColor={field[1]} />
          <Stop offset="1" stopColor={field[2]} />
        </RadialGradient>
        <RadialGradient id={`${id}s`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={51.5} r={47} fill="#000" opacity={0.35} />
      <Circle cx={50} cy={50} r={47} fill={C.ink} />
      <Circle cx={50} cy={50} r={45.4} fill={`url(#${id}g)`} />
      <Circle cx={50} cy={50} r={45.4} fill="none" stroke={C.goldL} strokeWidth={0.75} opacity={0.75} />
      <Circle cx={50} cy={50} r={41} fill={C.ink} />
      <Circle cx={50} cy={50} r={40} fill={C.lacquer} />
      <Circle cx={50} cy={50} r={39} fill="none" stroke={C.ruby} strokeWidth={2.4} />
      <Circle cx={50} cy={50} r={39.8} fill="none" stroke={C.rubyL} strokeWidth={0.6} opacity={0.7} />
      {studs.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={1.25} fill={C.goldL} stroke={C.ink} strokeWidth={0.4} />
      ))}
      <Circle cx={50} cy={50} r={35.6} fill={C.ink} />
      <Circle cx={50} cy={50} r={35} fill={C.goldD} />
      <Circle cx={50} cy={50} r={34} fill={`url(#${id}f)`} />
      <Circle cx={50} cy={50} r={34} fill={`url(#${id}s)`} />
      <Path d="M10.5 36 A41 41 0 0 1 36 9.5" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.3} strokeLinecap="round" />
    </>
  );
}

/** Diagonal sheen band (1 gradient `${id}h`). Draw last, inside the plaque shape. */
export function Sheen({ id, d, opacity = 0.5 }: { id: string; d: string; opacity?: number }) {
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0.3" stopColor="#fff" stopOpacity="0" />
          <Stop offset="0.46" stopColor="#fff" stopOpacity="0.55" />
          <Stop offset="0.54" stopColor="#fff" stopOpacity="0.1" />
          <Stop offset="0.62" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={d} fill={`url(#${id}h)`} opacity={opacity} />
    </>
  );
}

/** Concentric-stroke glow (no filters). */
export function GlowRings({ cx, cy, r, color, rings = 3, step = 2.6 }: { cx: number; cy: number; r: number; color: string; rings?: number; step?: number }) {
  return (
    <>
      {Array.from({ length: rings }, (_, i) => (
        <Circle key={i} cx={cx} cy={cy} r={r + step * (i + 0.5)} fill="none" stroke={color} strokeWidth={step} opacity={0.3 / (i + 1)} />
      ))}
    </>
  );
}

export const CIRCLE_D = (r: number, cx = 50, cy = 50): string =>
  `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
