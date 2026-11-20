import React from "react";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, RadialGradient, Stop, Text as SvgText } from "react-native-svg";
import { palette } from "@/theme";
import { CARD_STYLES } from "./kenoModel";

interface KenoTileArtProps {
  size: number;
  variant?: "single" | "quad";
}

// Lobby tile art: a slice of the midnight board with drawn balls and (×4) the four card marks.
const COLS = 5;
const ROWS = 4;
const HIT = new Set([3, 8, 12, 17]);
const DRAWN = new Set([1, 6, 14, 19]);
const QUAD_MARKS: Record<number, number[]> = { 3: [0], 8: [1, 2], 12: [3], 17: [0, 3] };

export function KenoTileArt({ size, variant = "single" }: KenoTileArtProps) {
  const pad = 10;
  const cw = (100 - pad * 2) / COLS;
  const ch = 52 / ROWS;
  const top = 30;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="kbg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.surface} />
          <Stop offset="1" stopColor={palette.bg} />
        </LinearGradient>
        <RadialGradient id="kball" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor={palette.goldLight} />
          <Stop offset="0.6" stopColor={palette.gold} />
          <Stop offset="1" stopColor={palette.goldDeep} />
        </RadialGradient>
        <RadialGradient id="kivory" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D9D2C2" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} rx={14} fill="url(#kbg)" />
      {/* cabinet frame */}
      <Rect x={pad - 3} y={top - 3} width={100 - pad * 2 + 6} height={ROWS * ch + 6} rx={4} fill="#020414" stroke={palette.gold} strokeOpacity={0.55} strokeWidth={0.8} />
      <G>
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const r = Math.floor(i / COLS);
          const c = i % COLS;
          const x = pad + c * cw;
          const y = top + r * ch;
          const n = 31 + i;
          const hit = HIT.has(i);
          const drawn = DRAWN.has(i);
          const marks = variant === "quad" ? (QUAD_MARKS[i] ?? []) : [];
          const singleColor = variant === "single" ? CARD_STYLES[0]!.color : palette.gold;
          const hitFill = marks.length === 1 ? CARD_STYLES[marks[0]!]!.color : variant === "single" ? singleColor : "url(#kball)";
          return (
            <G key={i}>
              <Rect x={x} y={y} width={cw} height={ch} fill={palette.bgRaised} stroke={palette.gold} strokeOpacity={0.18} strokeWidth={0.4} />
              {hit ? <Circle cx={x + cw / 2} cy={y + ch / 2} r={Math.min(cw, ch) / 2 - 1} fill={hitFill} /> : null}
              {drawn ? <Circle cx={x + cw / 2} cy={y + ch / 2} r={Math.min(cw, ch) / 2 - 1.2} fill="none" stroke={palette.ivory} strokeWidth={0.9} /> : null}
              <SvgText
                x={x + cw / 2}
                y={y + ch / 2 + 2.6}
                fontSize={7}
                fontWeight="700"
                fill={hit ? palette.ink : palette.ivory}
                textAnchor="middle"
              >
                {n}
              </SvgText>
              {marks.map((m) => {
                const cs = CARD_STYLES[m]!;
                const px = cs.corner.endsWith("l") ? x + 2 : x + cw - 2;
                const py = cs.corner.startsWith("t") ? y + 2 : y + ch - 2;
                return <Circle key={m} cx={px} cy={py} r={1.3} fill={cs.color} stroke={palette.ink} strokeWidth={0.3} />;
              })}
            </G>
          );
        })}
      </G>
      {/* gold divider */}
      <Rect x={pad} y={top + 2 * ch - 0.6} width={100 - pad * 2} height={1.2} fill={palette.gold} />
      {/* falling balls */}
      <Circle cx={30} cy={15} r={7} fill="url(#kivory)" />
      <SvgText x={30} y={17.6} fontSize={7} fontWeight="800" fill={palette.ink} textAnchor="middle">
        17
      </SvgText>
      <Circle cx={50} cy={13} r={8} fill="url(#kball)" />
      <SvgText x={50} y={15.8} fontSize={7.5} fontWeight="800" fill={palette.goldInk} textAnchor="middle">
        42
      </SvgText>
      <Circle cx={70} cy={16} r={6.5} fill="url(#kivory)" />
      <SvgText x={70} y={18.4} fontSize={6.5} fontWeight="800" fill={palette.ink} textAnchor="middle">
        8
      </SvgText>
      {variant === "quad" ? (
        <G>
          {CARD_STYLES.map((cs, i) => (
            <G key={cs.letter}>
              <Rect x={14 + i * 19} y={88} width={15} height={7} rx={2} fill={cs.color} />
              <SvgText x={21.5 + i * 19} y={93.5} fontSize={5.5} fontWeight="800" fill={palette.ink} textAnchor="middle">
                {cs.letter}
              </SvgText>
            </G>
          ))}
        </G>
      ) : (
        <Path d="M38 91 h24" stroke={palette.gold} strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
      )}
    </Svg>
  );
}
