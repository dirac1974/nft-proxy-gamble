import React, { memo } from "react";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { fonts } from "@/theme";
import type { FeatureOptionId } from "./slotMath";
import { C, goldStops, f, polar } from "./artKit";

// Title wordmark, lanterns, lantern tokens, spin button face, tier plaques.
// All original art; no SVG filters (stacked strokes + gradients only).

// ── cartouche with ruyi-cloud ends (title + tier plaques) ───────────────────
export function cartouchePath(w: number, h: number, inset = 0): string {
  const i = inset;
  const e = h * 0.42; // end depth
  const t = i;
  const b = h - i;
  const m = h / 2;
  return [
    `M${f(e + i)} ${f(t)}`,
    `L${f(w - e - i)} ${f(t)}`,
    `C${f(w - e * 0.5 - i)} ${f(t)} ${f(w - e * 0.35 - i)} ${f(m - h * 0.26)} ${f(w - e * 0.1 - i * 0.6)} ${f(m - h * 0.2)}`,
    `C${f(w - i * 0.4)} ${f(m - h * 0.14)} ${f(w - i * 0.4)} ${f(m + h * 0.14)} ${f(w - e * 0.1 - i * 0.6)} ${f(m + h * 0.2)}`,
    `C${f(w - e * 0.35 - i)} ${f(m + h * 0.26)} ${f(w - e * 0.5 - i)} ${f(b)} ${f(w - e - i)} ${f(b)}`,
    `L${f(e + i)} ${f(b)}`,
    `C${f(e * 0.5 + i)} ${f(b)} ${f(e * 0.35 + i)} ${f(m + h * 0.26)} ${f(e * 0.1 + i * 0.6)} ${f(m + h * 0.2)}`,
    `C${f(i * 0.4)} ${f(m + h * 0.14)} ${f(i * 0.4)} ${f(m - h * 0.14)} ${f(e * 0.1 + i * 0.6)} ${f(m - h * 0.2)}`,
    `C${f(e * 0.35 + i)} ${f(m - h * 0.26)} ${f(e * 0.5 + i)} ${f(t)} ${f(e + i)} ${f(t)}`,
    "Z",
  ].join(" ");
}

const brush = (x: number, y: number, len: number, dir: 1 | -1, lift: number): string => {
  const x1 = x + len * dir;
  return `M${f(x)} ${f(y)} C${f(x + len * 0.3 * dir)} ${f(y - lift)} ${f(x + len * 0.7 * dir)} ${f(y - lift * 1.2)} ${f(x1)} ${f(y - lift * 0.4)} C${f(x + len * 0.68 * dir)} ${f(y - lift * 0.5)} ${f(x + len * 0.32 * dir)} ${f(y + lift * 0.1)} ${f(x)} ${f(y + 1.6)} Z`;
};

export function SealMark({ x, y, s, rot = -6 }: { x: number; y: number; s: number; rot?: number }) {
  // Original seal: square chop with a stylised lantern-and-paw mark (no characters).
  return (
    <G transform={`rotate(${rot} ${f(x + s / 2)} ${f(y + s / 2)})`}>
      <Rect x={x} y={y} width={s} height={s} rx={s * 0.12} fill={C.ruby} stroke={C.rubyD} strokeWidth={s * 0.05} />
      <Rect x={x + s * 0.1} y={y + s * 0.1} width={s * 0.8} height={s * 0.8} rx={s * 0.08} fill="none" stroke="#FFE6E0" strokeWidth={s * 0.06} />
      <Ellipse cx={x + s * 0.5} cy={y + s * 0.44} rx={s * 0.2} ry={s * 0.18} fill="none" stroke="#FFE6E0" strokeWidth={s * 0.07} />
      <Line x1={x + s * 0.5} y1={y + s * 0.62} x2={x + s * 0.5} y2={y + s * 0.78} stroke="#FFE6E0" strokeWidth={s * 0.07} />
      <Line x1={x + s * 0.3} y1={y + s * 0.78} x2={x + s * 0.7} y2={y + s * 0.78} stroke="#FFE6E0" strokeWidth={s * 0.07} />
      <Circle cx={x + s * 0.26} cy={y + s * 0.24} r={s * 0.05} fill="#FFE6E0" />
    </G>
  );
}

const TW = 360;
const TH = 104;
export const TitleWordmark = memo(function TitleWordmark({ width, height, mode = "base" }: { width: number; height: number; mode?: "base" | "free" }) {
  const outer = cartouchePath(TW - 20, TH - 14, 0);
  const inner = cartouchePath(TW - 20, TH - 14, 7);
  const lacquer = mode === "free" ? ["#3FB98E", C.jade, C.jadeD] : [C.rubyL, C.ruby, C.lacquer];
  const text = { x: TW / 2, textAnchor: "middle" as const, fontFamily: fonts.displayBlack };
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${TW} ${TH}`} accessibilityLabel="Lion Lantern Night" accessibilityRole="header">
      <Defs>
        <LinearGradient id="tw-g" x1="0" y1="0" x2="0.2" y2="1">
          {goldStops()}
        </LinearGradient>
        <LinearGradient id={`tw-l-${mode}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lacquer[0]} />
          <Stop offset="0.45" stopColor={lacquer[1]} />
          <Stop offset="1" stopColor={lacquer[2]} />
        </LinearGradient>
        <LinearGradient id="tw-t" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF8DC" />
          <Stop offset="0.38" stopColor={C.goldL} />
          <Stop offset="0.62" stopColor={C.gold} />
          <Stop offset="1" stopColor={C.goldD} />
        </LinearGradient>
        <RadialGradient id="tw-s" cx="50%" cy="30%" r="70%">
          <Stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </RadialGradient>
      </Defs>
      <G transform="translate(10 8)">
        <Path d={outer} transform="translate(0 3)" fill="#000" opacity={0.4} />
        <Path d={outer} fill={C.ink} />
        <Path d={cartouchePath(TW - 20, TH - 14, 1.6)} fill="url(#tw-g)" />
        <Path d={cartouchePath(TW - 20, TH - 14, 1.6)} fill="none" stroke={C.goldL} strokeWidth={0.75} />
        <Path d={cartouchePath(TW - 20, TH - 14, 5.6)} fill={C.ink} />
        <Path d={inner} fill={`url(#tw-l-${mode})`} />
        <Path d={inner} fill="url(#tw-s)" />
        <Path d={cartouchePath(TW - 20, TH - 14, 10)} fill="none" stroke={C.gold} strokeWidth={0.9} opacity={0.8} />
        <Path d={`M${(TW - 20) * 0.12} 9 L${(TW - 20) * 0.88} 9`} stroke="#fff" strokeOpacity={0.45} strokeWidth={1.2} strokeLinecap="round" />
      </G>
      {/* brush flourishes */}
      <Path d={brush(122, 80, 64, -1, 7)} fill="url(#tw-g)" stroke={C.ink} strokeWidth={0.8} />
      <Path d={brush(238, 80, 64, 1, 7)} fill="url(#tw-g)" stroke={C.ink} strokeWidth={0.8} />
      <Circle cx={52} cy={76} r={2.2} fill={C.goldL} />
      <Circle cx={308} cy={76} r={2.2} fill={C.goldL} />
      {/* wordmark: drop shadow → ink → deep → gold face → rim light */}
      <SvgText {...text} x={TW / 2 + 1.6} y={57.5} fontSize={30} letterSpacing={2.4} fill="#000" opacity={0.55}>
        LION LANTERN
      </SvgText>
      <SvgText {...text} y={55} fontSize={30} letterSpacing={2.4} fill="none" stroke={C.ink} strokeWidth={6} strokeLinejoin="round">
        LION LANTERN
      </SvgText>
      <SvgText {...text} y={55} fontSize={30} letterSpacing={2.4} fill="none" stroke={C.goldD} strokeWidth={3.2} strokeLinejoin="round">
        LION LANTERN
      </SvgText>
      <SvgText {...text} y={55} fontSize={30} letterSpacing={2.4} fill="url(#tw-t)" stroke="#7A5418" strokeWidth={0.6}>
        LION LANTERN
      </SvgText>
      <SvgText {...text} y={82} fontSize={18} letterSpacing={9} fill="none" stroke={C.ink} strokeWidth={4.4} strokeLinejoin="round">
        NIGHT
      </SvgText>
      <SvgText {...text} y={82} fontSize={18} letterSpacing={9} fill={C.ivory} stroke={C.goldD} strokeWidth={0.6}>
        NIGHT
      </SvgText>
      <SealMark x={300} y={58} s={24} />
    </Svg>
  );
});

// ── hanging lantern (ambient sway in the title band) ────────────────────────
export const HangingLantern = memo(function HangingLantern({ size, hue = "ruby" }: { size: number; hue?: "ruby" | "gold" }) {
  const body = hue === "ruby" ? ["#FFE6A0", "#FF7A3D", "#C81E2C", "#5E0A12"] : ["#FFFBE0", "#FFD45A", "#D08A1A", "#6B3D0E"];
  return (
    <Svg width={size * 0.6} height={size} viewBox="0 0 60 100" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <RadialGradient id={`hl-${hue}`} cx="45%" cy="45%" r="58%">
          <Stop offset="0" stopColor={body[0]} />
          <Stop offset="0.35" stopColor={body[1]} />
          <Stop offset="0.75" stopColor={body[2]} />
          <Stop offset="1" stopColor={body[3]} />
        </RadialGradient>
      </Defs>
      <Line x1={30} y1={0} x2={30} y2={22} stroke={C.goldD} strokeWidth={1.4} />
      <Ellipse cx={30} cy={52} rx={25} ry={27} fill="none" stroke="#FFB347" strokeWidth={4} opacity={0.18} />
      <Rect x={20} y={20} width={20} height={6} rx={1.5} fill={C.gold} stroke={C.ink} strokeWidth={1} />
      <Ellipse cx={30} cy={51} rx={20} ry={24} fill={`url(#hl-${hue})`} stroke={C.ink} strokeWidth={1.3} />
      <Ellipse cx={30} cy={51} rx={12} ry={24} fill="none" stroke={C.goldD} strokeWidth={0.9} opacity={0.8} />
      <Ellipse cx={30} cy={51} rx={4.5} ry={24} fill="none" stroke={C.goldD} strokeWidth={0.9} opacity={0.8} />
      <Rect x={22} y={74} width={16} height={5} rx={1.5} fill={C.gold} stroke={C.ink} strokeWidth={1} />
      <Path d="M27 80 L25 97 L35 97 L33 80 Z" fill={C.ruby} stroke={C.ink} strokeWidth={0.8} />
      <Ellipse cx={23} cy={40} rx={4} ry={2.4} fill="#fff" opacity={0.4} />
    </Svg>
  );
});

// ── feature option lantern tokens: 4 distinct silhouettes ───────────────────
const TOKEN: Record<FeatureOptionId, { c: [string, string, string, string] }> = {
  jade: { c: ["#E6FFF4", "#5FD3A8", "#1F7F5E", "#0B3A2A"] },
  ruby: { c: ["#FFE0D0", "#FF6A5A", "#C2283B", "#4A0710"] },
  gold: { c: ["#FFFBE0", "#FFD45A", "#C98A1A", "#5A3A08"] },
  imperial: { c: ["#EDE6FF", "#9C7BFF", "#4B2E9E", "#1A0E44"] },
};
export const LanternToken = memo(function LanternToken({ kind, size }: { kind: FeatureOptionId; size: number }) {
  const [c0, c1, c2, c3] = TOKEN[kind].c;
  const gid = `tk-${kind}`;
  const bodyFill = `url(#${gid})`;
  let body: React.ReactNode;
  if (kind === "jade") {
    // round globe lantern
    body = (
      <>
        <Circle cx={50} cy={54} r={30} fill={bodyFill} stroke={C.ink} strokeWidth={1.8} />
        {[-20, -8, 8, 20].map((dx) => (
          <Ellipse key={dx} cx={50} cy={54} rx={Math.abs(dx)} ry={30} fill="none" stroke={C.goldL} strokeWidth={0.9} opacity={0.6} />
        ))}
        <Rect x={38} y={20} width={24} height={7} rx={2} fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.2} />
        <Rect x={40} y={82} width={20} height={6} rx={2} fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.2} />
      </>
    );
  } else if (kind === "ruby") {
    // tall cylinder lantern
    body = (
      <>
        <Rect x={30} y={22} width={40} height={64} rx={14} fill={bodyFill} stroke={C.ink} strokeWidth={1.8} />
        {[34, 44, 54, 64, 74].map((y) => (
          <Line key={y} x1={31} y1={y} x2={69} y2={y} stroke={C.goldL} strokeWidth={0.9} opacity={0.55} />
        ))}
        <Rect x={26} y={18} width={48} height={7} rx={2} fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.2} />
        <Rect x={26} y={83} width={48} height={7} rx={2} fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.2} />
      </>
    );
  } else if (kind === "gold") {
    // hexagonal palace lantern with corner tassels
    const hex = Array.from({ length: 6 }, (_, i) => polar(50, 54, 30, i * 60 + 30));
    const d = hex.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ") + "Z";
    body = (
      <>
        <Path d={d} fill={bodyFill} stroke={C.ink} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d={Array.from({ length: 6 }, (_, i) => polar(50, 54, 20, i * 60 + 30)).map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ") + "Z"} fill="none" stroke={C.ink} strokeWidth={1} opacity={0.6} />
        <Line x1={50} y1={24} x2={50} y2={84} stroke={C.ink} strokeWidth={0.9} opacity={0.5} />
        {[hex[0]!, hex[2]!, hex[3]!, hex[5]!].map((p, i) => (
          <Path key={i} d={`M${f(p.x)} ${f(p.y)} l-2 10 l4 0 z`} fill={C.ruby} stroke={C.ink} strokeWidth={0.7} />
        ))}
        <Path d="M36 22 L64 22 L58 16 L42 16 Z" fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
      </>
    );
  } else {
    // imperial: tiered pagoda lantern
    body = (
      <>
        <Rect x={32} y={36} width={36} height={44} rx={4} fill={bodyFill} stroke={C.ink} strokeWidth={1.8} />
        <Path d="M38 44 h24 v28 h-24 z" fill="none" stroke={C.goldL} strokeWidth={0.9} opacity={0.7} />
        <Path d="M20 38 Q34 34 50 24 Q66 34 80 38 Q74 41 68 38 L32 38 Q26 41 20 38 Z" fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.3} strokeLinejoin="round" />
        <Path d="M30 24 Q42 21 50 13 Q58 21 70 24 Q64 26 50 25 Q36 26 30 24 Z" fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
        <Path d="M26 80 L74 80 L68 87 L32 87 Z" fill="url(#tk-g)" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
        <Circle cx={50} cy={11} r={2.6} fill={C.goldL} stroke={C.ink} strokeWidth={0.7} />
      </>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <RadialGradient id={gid} cx="45%" cy="42%" r="60%">
          <Stop offset="0" stopColor={c0} />
          <Stop offset="0.35" stopColor={c1} />
          <Stop offset="0.75" stopColor={c2} />
          <Stop offset="1" stopColor={c3} />
        </RadialGradient>
        <LinearGradient id="tk-g" x1="0" y1="0" x2="0" y2="1">
          {goldStops()}
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={54} r={42} fill="none" stroke={c1} strokeWidth={5} opacity={0.14} />
      <Circle cx={50} cy={54} r={36} fill="none" stroke={c1} strokeWidth={5} opacity={0.22} />
      <Line x1={50} y1={2} x2={50} y2={20} stroke={C.goldD} strokeWidth={1.6} />
      {body}
      <Path d="M47 88 L45 98 L55 98 L53 88 Z" fill={kind === "ruby" ? C.gold : C.ruby} stroke={C.ink} strokeWidth={0.8} />
      <Ellipse cx={40} cy={42} rx={6} ry={3} fill="#fff" opacity={0.35} />
    </Svg>
  );
});

// ── round SPIN button face (gold bevel, ruby core) ───────────────────────────
export const SpinButtonFace = memo(function SpinButtonFace({ size, mode = "base" }: { size: number; mode?: "base" | "free" }) {
  const core = mode === "free" ? ["#9FF0CF", C.jade, C.jadeD] : ["#FF8A8A", C.ruby, "#4A0710"];
  const studs = Array.from({ length: 12 }, (_, i) => polar(50, 50, 42.6, i * 30));
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="sb-g" x1="0" y1="0" x2="0.3" y2="1">
          {goldStops()}
        </LinearGradient>
        <RadialGradient id={`sb-c-${mode}`} cx="45%" cy="35%" r="65%">
          <Stop offset="0" stopColor={core[0]} />
          <Stop offset="0.5" stopColor={core[1]} />
          <Stop offset="1" stopColor={core[2]} />
        </RadialGradient>
        <LinearGradient id="sb-h" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={52} r={48} fill="#000" opacity={0.4} />
      <Circle cx={50} cy={50} r={48} fill={C.ink} />
      <Circle cx={50} cy={50} r={46.4} fill="url(#sb-g)" />
      <Circle cx={50} cy={50} r={46.4} fill="none" stroke={C.goldL} strokeWidth={0.75} />
      {studs.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={1.3} fill={C.goldL} stroke={C.ink} strokeWidth={0.4} />
      ))}
      <Circle cx={50} cy={50} r={38.6} fill={C.ink} />
      <Circle cx={50} cy={50} r={37.6} fill={C.goldD} />
      <Circle cx={50} cy={50} r={36.4} fill={`url(#sb-c-${mode})`} />
      <Circle cx={50} cy={50} r={30} fill="none" stroke={C.gold} strokeWidth={0.9} opacity={0.55} />
      <Ellipse cx={50} cy={30} rx={24} ry={12} fill="url(#sb-h)" />
    </Svg>
  );
});

// ── BIG / MEGA / EPIC tier plaque ────────────────────────────────────────────
export const TierPlaqueArt = memo(function TierPlaqueArt({ width, label, tone }: { width: number; label: string; tone: "big" | "mega" | "epic" }) {
  const W = 320;
  const H = 120;
  const lac = tone === "epic" ? ["#9C7BFF", "#4B2E9E", "#1A0E44"] : tone === "mega" ? ["#5FD3A8", C.jade, C.jadeD] : [C.rubyL, C.ruby, C.lacquer];
  const text = { x: W / 2, y: 80, textAnchor: "middle" as const, fontFamily: fonts.displayBlack, fontSize: 46, letterSpacing: 3 };
  return (
    <Svg width={width} height={(width * H) / W} viewBox={`0 0 ${W} ${H}`} accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="tp-g" x1="0" y1="0" x2="0.2" y2="1">
          {goldStops()}
        </LinearGradient>
        <LinearGradient id={`tp-l-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lac[0]} />
          <Stop offset="0.5" stopColor={lac[1]} />
          <Stop offset="1" stopColor={lac[2]} />
        </LinearGradient>
        <LinearGradient id="tp-t" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFBEA" />
          <Stop offset="0.45" stopColor={C.goldL} />
          <Stop offset="0.7" stopColor={C.gold} />
          <Stop offset="1" stopColor={C.goldD} />
        </LinearGradient>
      </Defs>
      <G transform="translate(6 10)">
        <Path d={cartouchePath(W - 12, H - 20)} fill={C.ink} />
        <Path d={cartouchePath(W - 12, H - 20, 1.8)} fill="url(#tp-g)" />
        <Path d={cartouchePath(W - 12, H - 20, 6.5)} fill={C.ink} />
        <Path d={cartouchePath(W - 12, H - 20, 7.6)} fill={`url(#tp-l-${tone})`} />
        <Path d={cartouchePath(W - 12, H - 20, 12)} fill="none" stroke={C.gold} strokeWidth={1} opacity={0.8} />
      </G>
      <SvgText {...text} fill="none" stroke={C.ink} strokeWidth={8} strokeLinejoin="round">
        {label}
      </SvgText>
      <SvgText {...text} fill="none" stroke={C.goldD} strokeWidth={4.4} strokeLinejoin="round">
        {label}
      </SvgText>
      <SvgText {...text} fill="url(#tp-t)" stroke="#7A5418" strokeWidth={0.8}>
        {label}
      </SvgText>
    </Svg>
  );
});

// ── scroll for the FREE GAMES intro ──────────────────────────────────────────
export const ScrollPaper = memo(function ScrollPaper({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 300 120" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="sp-p" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF8E6" />
          <Stop offset="0.5" stopColor="#F3DFB2" />
          <Stop offset="1" stopColor="#D9BC82" />
        </LinearGradient>
      </Defs>
      <Rect x={14} y={8} width={272} height={104} fill="url(#sp-p)" stroke={C.ink} strokeWidth={1.5} />
      <Rect x={22} y={15} width={256} height={90} fill="none" stroke={C.ruby} strokeWidth={1.4} />
      <Rect x={26} y={19} width={248} height={82} fill="none" stroke={C.ruby} strokeWidth={0.6} />
    </Svg>
  );
});
