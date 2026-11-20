import React, { memo } from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { fonts } from "@/theme";
import type { SlotSymbolId } from "./slotMath";
import { C, CIRCLE_D, GlowRings, goldStops, RoundelPlaque, Sheen, f, polar, scallopPath, sectorPath } from "./artKit";

// Original symbol set for Lion Lantern Night. viewBox 0 0 100 100, ≤5 gradients per
// symbol, no SVG filters. Each motif deliberately breaks the plaque outline so the flat
// black silhouettes differ at 40px: scalloped mane (LION), V wings (CRANE), tall oval +
// tassel (LANTERN), cup + wide pad (LOTUS), wedge (PEONY_FAN), square gate plaque
// (WILD), framed gong (SCAT), letterforms (royals).

// ── LION — lion-dance mask ────────────────────────────────────────────────────
const MANE_OUT = scallopPath(50, 52, 41.5, 16, 6.4, -Math.PI / 2);
const MANE_IN = scallopPath(50, 53, 31.5, 13, 4.6, -Math.PI / 2 + 0.2);
function Lion() {
  const id = "ln";
  return (
    <>
      <RoundelPlaque id={id} field={[C.rubyL, C.ruby, C.rubyD]} />
      <Defs>
        <RadialGradient id={`${id}m`} cx="50%" cy="38%" r="62%">
          <Stop offset="0" stopColor="#FFE9A0" />
          <Stop offset="0.6" stopColor="#F2A93B" />
          <Stop offset="1" stopColor="#B4561A" />
        </RadialGradient>
      </Defs>
      <Path d={MANE_OUT} fill={C.ivory} stroke={C.ink} strokeWidth={1.6} />
      <Path d={MANE_IN} fill="#E9842A" stroke={C.ink} strokeWidth={1.1} />
      <Ellipse cx={50} cy={54} rx={25.5} ry={23.5} fill={`url(#${id}m)`} stroke={C.ink} strokeWidth={1.5} />
      {/* horn + forehead mirror (lion-dance) */}
      <Path d="M45 30 Q50 16 55 30 Z" fill={C.jade} stroke={C.ink} strokeWidth={1.2} />
      <Circle cx={50} cy={34} r={5.4} fill={C.goldD} stroke={C.ink} strokeWidth={1.1} />
      <Circle cx={50} cy={34} r={4} fill="#DCE6F2" />
      <Path d="M47.4 32.4 L51.4 31.6" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" />
      {/* fur brows */}
      <Path d="M26 44 Q36 31 46 42" fill="none" stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
      <Path d="M54 42 Q64 31 74 44" fill="none" stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
      <Path d="M26 44 Q36 31 46 42" fill="none" stroke={C.ivory} strokeWidth={5.6} strokeLinecap="round" />
      <Path d="M54 42 Q64 31 74 44" fill="none" stroke={C.ivory} strokeWidth={5.6} strokeLinecap="round" />
      <Path d="M28 42 Q36 34 44 40" fill="none" stroke={C.jade} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="2 1.6" />
      <Path d="M56 40 Q64 34 72 42" fill="none" stroke={C.jade} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="2 1.6" />
      {/* eyes with jade lids */}
      <Ellipse cx={37.5} cy={50} rx={8.2} ry={6.8} fill="#fff" stroke={C.ink} strokeWidth={1.6} />
      <Ellipse cx={62.5} cy={50} rx={8.2} ry={6.8} fill="#fff" stroke={C.ink} strokeWidth={1.6} />
      <Circle cx={38.4} cy={51.2} r={4} fill={C.black} />
      <Circle cx={61.6} cy={51.2} r={4} fill={C.black} />
      <Circle cx={37.2} cy={50} r={1.2} fill="#fff" />
      <Circle cx={60.4} cy={50} r={1.2} fill="#fff" />
      <Path d="M29.3 49.4 Q37.5 41.6 45.7 49.4 Q37.5 46.4 29.3 49.4 Z" fill={C.jade} stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M54.3 49.4 Q62.5 41.6 70.7 49.4 Q62.5 46.4 54.3 49.4 Z" fill={C.jade} stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
      {/* cheek swirls */}
      <Path d="M23.5 60 q3 -7 9 -3 q3 3 -1.5 5.5" fill="none" stroke={C.rubyD} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M76.5 60 q-3 -7 -9 -3 q-3 3 1.5 5.5" fill="none" stroke={C.rubyD} strokeWidth={1.7} strokeLinecap="round" />
      {/* broad gold nose */}
      <Path d="M43 54 Q50 51 57 54 Q61 59 57 62.5 Q50 64.5 43 62.5 Q39 59 43 54 Z" fill="#FFCF4A" stroke={C.ink} strokeWidth={1.4} strokeLinejoin="round" />
      <Ellipse cx={46.4} cy={60.2} rx={1.8} ry={1.2} fill={C.rubyD} />
      <Ellipse cx={53.6} cy={60.2} rx={1.8} ry={1.2} fill={C.rubyD} />
      <Ellipse cx={48.6} cy={55.8} rx={3} ry={1.2} fill="#fff" opacity={0.6} />
      {/* open grin */}
      <Path d="M30.5 65.5 Q50 89 69.5 65.5 Q50 71.5 30.5 65.5 Z" fill="#4A0710" stroke={C.ink} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M34.5 67.4 Q50 72.6 65.5 67.4 L63.8 70.6 Q50 75 36.2 70.6 Z" fill="#fff" />
      <Ellipse cx={50} cy={78.2} rx={7} ry={3.2} fill={C.rubyL} />
      <Sheen id={id} d={CIRCLE_D(44)} opacity={0.35} />
    </>
  );
}

// ── CRANE — red-crowned crane in flight over a jade disc ─────────────────────
function Crane() {
  const id = "cr";
  const wingL = "M47 54 C37 42 22 30 3 18 C8 28 10 33 9 38 C15 38 18 42 17 46 C24 46 28 50 27 54 C34 54 39 58 44 62 Z";
  const wingR = "M53 54 C63 42 78 30 97 18 C92 28 90 33 91 38 C85 38 82 42 83 46 C76 46 72 50 73 54 C66 54 61 58 56 62 Z";
  return (
    <>
      <RoundelPlaque id={id} field={[C.jadeL, C.jade, C.jadeD]} />
      <Defs>
        <LinearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D6DCE4" />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={22} fill="none" stroke={C.jadeL} strokeWidth={1} opacity={0.5} />
      {/* legs trail behind */}
      <Line x1={57} y1={66} x2={80} y2={88} stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={54} y1={67} x2={74} y2={91} stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" />
      <Path d={wingL} fill={`url(#${id}w)`} stroke={C.ink} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d={wingR} fill={`url(#${id}w)`} stroke={C.ink} strokeWidth={1.5} strokeLinejoin="round" />
      {/* black flight feathers on the trailing edge */}
      <Path d="M3 18 C8 28 10 33 9 38 C15 38 18 42 17 46 C14 40 9 32 3 18 Z" fill={C.black} />
      <Path d="M97 18 C92 28 90 33 91 38 C85 38 82 42 83 46 C86 40 91 32 97 18 Z" fill={C.black} />
      <Path d="M58 63 Q72 66 76 76 Q66 73 56 68 Z" fill={C.black} stroke={C.ink} strokeWidth={1} />
      <Ellipse cx={51} cy={60} rx={11.5} ry={8.5} fill={`url(#${id}w)`} stroke={C.ink} strokeWidth={1.5} />
      {/* neck + head */}
      <Path d="M46 56 C40 46 41 36 47 29" fill="none" stroke={C.ink} strokeWidth={6.6} strokeLinecap="round" />
      <Path d="M46 56 C40 46 41 36 47 29" fill="none" stroke={C.black} strokeWidth={4.6} strokeLinecap="round" />
      <Path d="M46.6 55 C42.6 48 42.4 44 43 41" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={47.5} cy={28} r={4.6} fill={C.black} stroke={C.ink} strokeWidth={1} />
      <Circle cx={48} cy={25.2} r={2.4} fill={C.rubyL} />
      <Circle cx={49.4} cy={28.2} r={0.9} fill="#fff" />
      <Path d="M51 27.4 L64 30.6 L51 30.2 Z" fill={C.gold} stroke={C.ink} strokeWidth={0.8} strokeLinejoin="round" />
      <Sheen id={id} d={CIRCLE_D(44)} opacity={0.3} />
    </>
  );
}

// ── LANTERN — red silk lantern, glowing ──────────────────────────────────────
function Lantern() {
  const id = "lt";
  return (
    <>
      <RoundelPlaque id={id} field={[C.indigoL, C.indigo, C.indigoD]} />
      <Defs>
        <RadialGradient id={`${id}b`} cx="44%" cy="42%" r="60%">
          <Stop offset="0" stopColor="#FFF0A8" />
          <Stop offset="0.3" stopColor="#FF8A3D" />
          <Stop offset="0.7" stopColor="#D42A2A" />
          <Stop offset="1" stopColor="#6E0B14" />
        </RadialGradient>
      </Defs>
      <Line x1={50} y1={2} x2={50} y2={16} stroke={C.goldD} strokeWidth={1.8} />
      <Ellipse cx={50} cy={50} rx={29} ry={30} fill="none" stroke="#FFB347" strokeWidth={4} opacity={0.22} />
      <Ellipse cx={50} cy={50} rx={33} ry={34} fill="none" stroke="#FFB347" strokeWidth={4} opacity={0.1} />
      <Ellipse cx={50} cy={50} rx={26} ry={28} fill={`url(#${id}b)`} stroke={C.ink} strokeWidth={1.6} />
      <Ellipse cx={50} cy={50} rx={17} ry={28} fill="none" stroke={C.goldD} strokeWidth={1} opacity={0.85} />
      <Ellipse cx={50} cy={50} rx={7.5} ry={28} fill="none" stroke={C.goldD} strokeWidth={1} opacity={0.85} />
      <Path d="M24.6 44 Q50 40 75.4 44 M24.6 56 Q50 60 75.4 56" fill="none" stroke={C.goldL} strokeWidth={0.9} opacity={0.7} />
      <Circle cx={50} cy={50} r={7} fill={C.rubyD} stroke={C.goldL} strokeWidth={1.6} />
      <Path d="M50 45.5 L54.5 50 L50 54.5 L45.5 50 Z" fill={C.gold} />
      <Rect x={37} y={14} width={26} height={8} rx={2} fill={`url(#${id}g)`} stroke={C.ink} strokeWidth={1.3} />
      <Rect x={39} y={78} width={22} height={7} rx={2} fill={`url(#${id}g)`} stroke={C.ink} strokeWidth={1.3} />
      <Circle cx={50} cy={88} r={2.6} fill={C.gold} stroke={C.ink} strokeWidth={0.9} />
      <Path d="M46.5 90 L44 99 L56 99 L53.5 90 Z" fill={C.ruby} stroke={C.ink} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M47.5 92 L47 98 M50 92 L50 98 M52.5 92 L53 98" stroke={C.rubyD} strokeWidth={0.7} />
      <Ellipse cx={41} cy={36} rx={6} ry={3} fill="#fff" opacity={0.35} />
      <Sheen id={id} d={CIRCLE_D(44)} opacity={0.3} />
    </>
  );
}

// ── LOTUS — pink lotus on a jade pad ─────────────────────────────────────────
const PETAL = (len: number, w: number) => `M50 74 C${50 - w} ${74 - len * 0.28} ${50 - w * 0.55} ${74 - len * 0.8} 50 ${74 - len} C${50 + w * 0.55} ${74 - len * 0.8} ${50 + w} ${74 - len * 0.28} 50 74 Z`;
const BACK_PETAL = PETAL(42, 10);
const FRONT_PETAL = PETAL(33, 9.5);
function Lotus() {
  const id = "lo";
  return (
    <>
      <RoundelPlaque id={id} field={["#3E8C9A", "#174652", "#0A222A"]} />
      <Defs>
        <LinearGradient id={`${id}p`} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#B32C62" />
          <Stop offset="0.55" stopColor="#FF8FB5" />
          <Stop offset="1" stopColor="#FFF0F5" />
        </LinearGradient>
        <LinearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.jadeL} />
          <Stop offset="1" stopColor={C.jadeD} />
        </LinearGradient>
      </Defs>
      <Path d="M8 79 Q50 98 92 79 Q86 70 58 70 L50 77 L42 70 Q14 70 8 79 Z" fill={`url(#${id}d)`} stroke={C.ink} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M50 80 L22 76 M50 80 L78 76 M50 80 L34 88 M50 80 L66 88" stroke={C.jadeD} strokeWidth={0.9} />
      {[-62, -32, 32, 62].map((a) => (
        <Path key={a} d={BACK_PETAL} transform={`rotate(${a} 50 74)`} fill="#C24A7A" stroke={C.ink} strokeWidth={1.3} />
      ))}
      <Path d={BACK_PETAL} fill={`url(#${id}p)`} stroke={C.ink} strokeWidth={1.3} />
      {[-44, -16, 16, 44].map((a) => (
        <Path key={a} d={FRONT_PETAL} transform={`rotate(${a} 50 74)`} fill={`url(#${id}p)`} stroke={C.ink} strokeWidth={1.3} />
      ))}
      <Ellipse cx={50} cy={66} rx={7} ry={3.4} fill={C.gold} stroke={C.ink} strokeWidth={1.1} />
      <Path d="M45 65.5 h10" stroke={C.goldD} strokeWidth={0.8} strokeDasharray="1.2 1.4" />
    </>
  );
}

// ── PEONY_FAN — folding fan with an original peony painting ──────────────────
const FAN_LEAF = sectorPath(50, 84, 15, 51, 196, 344);
const FAN_RIBS = Array.from({ length: 15 }, (_, i) => 196 + (i * 148) / 14);
const BLOOM = scallopPath(52, 52, 10.5, 9, 5, 0.3);
const BLOOM_IN = scallopPath(52, 52, 6.2, 7, 3.3, 0);
const BUD = scallopPath(31, 61, 6, 7, 3, 0.5);
function PeonyFan() {
  const id = "pf";
  return (
    <>
      <RoundelPlaque id={id} field={["#A63446", "#5E1020", "#2C060D"]} />
      <Defs>
        <LinearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFBEF" />
          <Stop offset="1" stopColor="#EED6A4" />
        </LinearGradient>
      </Defs>
      <Path d={FAN_LEAF} fill={`url(#${id}p)`} stroke={C.ink} strokeWidth={1.6} strokeLinejoin="round" />
      {FAN_RIBS.map((a, i) => {
        const p0 = polar(50, 84, 15, a);
        const p1 = polar(50, 84, 51, a);
        return <Line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={C.goldD} strokeWidth={i % 2 ? 0.5 : 0.9} opacity={0.6} />;
      })}
      <Path d="M41 61 Q30 53 25 44 Q36 46 43 57 Z M63 61 Q76 59 81 50 Q70 48 61 57 Z" fill="#2E8B57" stroke={C.ink} strokeWidth={0.9} />
      <Path d={BLOOM} fill="#E04F82" stroke={C.ink} strokeWidth={1.1} />
      <Path d={BLOOM_IN} fill="#FF9EBF" stroke="#B32C62" strokeWidth={0.7} />
      <Circle cx={52} cy={52} r={1.9} fill={C.gold} />
      <Path d={BUD} fill="#F07FA6" stroke={C.ink} strokeWidth={0.9} />
      <Path d={sectorPath(50, 84, 50, 52.5, 196, 344)} fill={C.gold} stroke={C.ink} strokeWidth={0.6} />
      {[196, 344].map((a) => {
        const p1 = polar(50, 84, 52, a);
        return <Line key={a} x1={50} y1={84} x2={p1.x} y2={p1.y} stroke="#4A200C" strokeWidth={3.4} strokeLinecap="round" />;
      })}
      <Circle cx={50} cy={84} r={3.4} fill={C.gold} stroke={C.ink} strokeWidth={1} />
      <Path d="M50 87 L50 91" stroke={C.ruby} strokeWidth={1.6} />
      <Path d="M47.4 91 L46 99 L54 99 L52.6 91 Z" fill={C.ruby} stroke={C.ink} strokeWidth={0.9} strokeLinejoin="round" />
      <Sheen id={id} d={FAN_LEAF} opacity={0.4} />
    </>
  );
}

// ── WILD — festival paifang gate on a gold plaque + WILD wordmark ────────────
function Wild() {
  const id = "wd";
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0.4" y2="1">
          {goldStops()}
        </LinearGradient>
        <LinearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A1F5C" />
          <Stop offset="0.55" stopColor="#8E2A4A" />
          <Stop offset="1" stopColor="#F2A93B" />
        </LinearGradient>
        <LinearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          {goldStops(true)}
        </LinearGradient>
      </Defs>
      <Rect x={3} y={4.5} width={94} height={94} rx={11} fill="#000" opacity={0.35} />
      <Rect x={3} y={3} width={94} height={94} rx={11} fill={C.ink} />
      <Rect x={4.6} y={4.6} width={90.8} height={90.8} rx={9.6} fill={`url(#${id}g)`} />
      <Rect x={4.6} y={4.6} width={90.8} height={90.8} rx={9.6} fill="none" stroke={C.goldL} strokeWidth={0.75} />
      <Rect x={10} y={10} width={80} height={80} rx={6} fill={C.ink} />
      <Rect x={11.2} y={11.2} width={77.6} height={77.6} rx={5} fill={`url(#${id}k)`} />
      <Circle cx={50} cy={62} r={14} fill="#FFD27A" opacity={0.25} />
      {/* gate */}
      <Rect x={22} y={40} width={7} height={36} fill={C.ruby} stroke={C.ink} strokeWidth={1.2} />
      <Rect x={71} y={40} width={7} height={36} fill={C.ruby} stroke={C.ink} strokeWidth={1.2} />
      <Rect x={20.5} y={72} width={10} height={4} fill={C.ink} />
      <Rect x={69.5} y={72} width={10} height={4} fill={C.ink} />
      <Rect x={15} y={41} width={70} height={5} fill={C.rubyD} stroke={C.ink} strokeWidth={1.1} />
      <Rect x={18} y={51} width={64} height={3.4} fill={C.rubyD} stroke={C.ink} strokeWidth={1} />
      <Rect x={40} y={45} width={20} height={9} rx={1} fill={`url(#${id}g)`} stroke={C.ink} strokeWidth={1.1} />
      <Path d="M44 49.5 h12" stroke={C.ink} strokeWidth={1.1} strokeDasharray="2 1.6" />
      <Path d="M9 39 Q30 35 50 27 Q70 35 91 39 Q86 42.5 81 40 L19 40 Q14 42.5 9 39 Z" fill="#1F6F57" stroke={C.ink} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M14 38.4 Q32 34.8 50 28.4 Q68 34.8 86 38.4" fill="none" stroke={C.goldL} strokeWidth={0.9} />
      <Path d="M28 28 Q40 25 50 18 Q60 25 72 28 Q66 31 50 29 Q34 31 28 28 Z" fill="#1F6F57" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
      <Circle cx={50} cy={17} r={2.6} fill={C.goldL} stroke={C.ink} strokeWidth={0.8} />
      <Circle cx={36} cy={62} r={3.6} fill={C.rubyL} stroke={C.ink} strokeWidth={0.8} />
      <Circle cx={64} cy={62} r={3.6} fill={C.rubyL} stroke={C.ink} strokeWidth={0.8} />
      <Circle cx={36} cy={62} r={5.6} fill="none" stroke="#FFB347" strokeWidth={2} opacity={0.3} />
      <Circle cx={64} cy={62} r={5.6} fill="none" stroke="#FFB347" strokeWidth={2} opacity={0.3} />
      {/* ribbon + wordmark */}
      <Path d="M6 72 L13 69 L13 88 L6 85 L9 78.5 Z M94 72 L87 69 L87 88 L94 85 L91 78.5 Z" fill={C.rubyD} stroke={C.ink} strokeWidth={1} strokeLinejoin="round" />
      <Rect x={12} y={68} width={76} height={21} rx={3} fill={C.ruby} stroke={C.ink} strokeWidth={1.3} />
      <Rect x={13.6} y={69.6} width={72.8} height={17.8} rx={2} fill="none" stroke={C.gold} strokeWidth={1} />
      <SvgText x={50} y={85.4} textAnchor="middle" fontFamily={fonts.displayBlack} fontSize={18.5} letterSpacing={1.5} fill="none" stroke={C.ink} strokeWidth={4.2} strokeLinejoin="round">
        WILD
      </SvgText>
      <SvgText x={50} y={85.4} textAnchor="middle" fontFamily={fonts.displayBlack} fontSize={18.5} letterSpacing={1.5} fill={`url(#${id}t)`} stroke={C.goldD} strokeWidth={0.8}>
        WILD
      </SvgText>
      <Sheen id={id} d="M4.6 14 Q4.6 4.6 14 4.6 L86 4.6 Q95.4 4.6 95.4 14 L95.4 86 Q95.4 95.4 86 95.4 L14 95.4 Q4.6 95.4 4.6 86 Z" opacity={0.35} />
    </>
  );
}

// ── SCAT — moon gong in a lacquered frame ────────────────────────────────────
function MoonGong() {
  const id = "sc";
  return (
    <>
      <Defs>
        <RadialGradient id={`${id}m`} cx="50%" cy="45%" r="50%">
          <Stop offset="0" stopColor="#FFFBEA" />
          <Stop offset="0.75" stopColor="#F2E1B0" />
          <Stop offset="1" stopColor="#B9A26A" />
        </RadialGradient>
        <LinearGradient id={`${id}b`} x1="0.1" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#FFE9A6" />
          <Stop offset="0.45" stopColor="#DB9B2C" />
          <Stop offset="1" stopColor="#6B3D0E" />
        </LinearGradient>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          {goldStops()}
        </LinearGradient>
      </Defs>
      <GlowRings cx={50} cy={46} r={38} color="#FFF3C4" rings={3} step={2.4} />
      <Circle cx={50} cy={46} r={38} fill={`url(#${id}m)`} stroke={C.ink} strokeWidth={1.2} />
      <Circle cx={36} cy={34} r={5} fill="#E2CF98" opacity={0.6} />
      <Circle cx={64} cy={30} r={3} fill="#E2CF98" opacity={0.6} />
      {/* frame */}
      <Rect x={9} y={22} width={7} height={74} rx={1.5} fill="#5A2A12" stroke={C.ink} strokeWidth={1.3} />
      <Rect x={84} y={22} width={7} height={74} rx={1.5} fill="#5A2A12" stroke={C.ink} strokeWidth={1.3} />
      <Path d="M2 19 Q50 12 98 19 L97 27 Q50 20.5 3 27 Z" fill={C.ruby} stroke={C.ink} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M4 21 Q50 14.5 96 21" fill="none" stroke={C.rubyL} strokeWidth={0.8} />
      <Circle cx={4.5} cy={21} r={2.6} fill={`url(#${id}g)`} stroke={C.ink} strokeWidth={0.8} />
      <Circle cx={95.5} cy={21} r={2.6} fill={`url(#${id}g)`} stroke={C.ink} strokeWidth={0.8} />
      <Path d="M40 24 L44 35 M60 24 L56 35" stroke={C.rubyL} strokeWidth={1.8} strokeLinecap="round" />
      {/* gong */}
      <Circle cx={50} cy={60} r={27} fill={C.ink} />
      <Circle cx={50} cy={60} r={25.6} fill={`url(#${id}b)`} />
      <Circle cx={50} cy={60} r={20} fill="none" stroke="#6B3D0E" strokeWidth={1.3} />
      <Circle cx={50} cy={60} r={18.8} fill="none" stroke={C.goldL} strokeWidth={0.6} opacity={0.7} />
      <Circle cx={50} cy={60} r={13.5} fill="none" stroke="#6B3D0E" strokeWidth={0.9} opacity={0.7} />
      <Circle cx={50} cy={60} r={7.5} fill={`url(#${id}b)`} stroke={C.ink} strokeWidth={1.2} />
      <Circle cx={47.6} cy={57.4} r={2.4} fill="#fff" opacity={0.75} />
      <Path d="M30 50 A22 22 0 0 1 44 39" fill="none" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.6} />
      {/* ribbon */}
      <Rect x={20} y={84} width={60} height={13} rx={2} fill={C.rubyD} stroke={C.gold} strokeWidth={1.1} />
      <SvgText x={50} y={93.6} textAnchor="middle" fontFamily={fonts.displayBlack} fontSize={8.6} letterSpacing={1.2} fill={C.goldL}>
        SCATTER
      </SvgText>
      <Sheen id={id} d={CIRCLE_D(25.6, 50, 60)} opacity={0.45} />
    </>
  );
}

// ── Royals — bevelled glyphs on an indigo mat (no plaque) ───────────────────
type RoyalTone = "gold" | "jade" | "ruby";
const ROYAL: Record<RoyalTone, { stops: [string, string, string]; deep: string; light: string }> = {
  gold: { stops: [C.goldL, C.gold, C.goldD], deep: "#5A3A08", light: "#FFF6D6" },
  jade: { stops: ["#D2FAE8", "#3CC495", "#0F5C42"], deep: "#08301F", light: "#EFFFF8" },
  ruby: { stops: ["#FFC9CF", "#E0475A", "#7A1020"], deep: "#3A0810", light: "#FFE6E9" },
};
function Royal({ glyph, tone }: { glyph: string; tone: RoyalTone }) {
  const id = `r${glyph}`;
  const t = ROYAL[tone];
  const size = glyph.length > 1 ? 48 : 66;
  const spacing = glyph.length > 1 ? -2 : 0;
  const y = glyph.length > 1 ? 67 : 74;
  const x = glyph === "Q" ? 47 : glyph === "J" ? 52 : 50;
  const common = { x, y, textAnchor: "middle" as const, fontFamily: fonts.displayBlack, fontSize: size, letterSpacing: spacing };
  return (
    <>
      <Defs>
        <RadialGradient id={`${id}m`} cx="50%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#2E3478" />
          <Stop offset="0.6" stopColor="#151A40" />
          <Stop offset="1" stopColor={C.night} />
        </RadialGradient>
        <LinearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.stops[0]} />
          <Stop offset="0.5" stopColor={t.stops[1]} />
          <Stop offset="1" stopColor={t.stops[2]} />
        </LinearGradient>
      </Defs>
      <Rect x={9} y={9} width={82} height={82} rx={16} fill={`url(#${id}m)`} />
      <Rect x={9} y={9} width={82} height={82} rx={16} fill="none" stroke={C.gold} strokeOpacity={0.28} strokeWidth={1} />
      <Path d="M20 22 q6 -5 12 0 q6 -5 12 0" fill="none" stroke={C.gold} strokeOpacity={0.18} strokeWidth={1} />
      <Path d="M56 80 q6 -5 12 0 q6 -5 12 0" fill="none" stroke={C.gold} strokeOpacity={0.18} strokeWidth={1} />
      <SvgText {...common} x={x + 1.6} y={y + 2.6} fill="#000" opacity={0.5}>
        {glyph}
      </SvgText>
      <SvgText {...common} fill="none" stroke={C.ink} strokeWidth={7} strokeLinejoin="round">
        {glyph}
      </SvgText>
      <SvgText {...common} fill="none" stroke={t.deep} strokeWidth={4.4} strokeLinejoin="round">
        {glyph}
      </SvgText>
      <SvgText {...common} fill={`url(#${id}t)`} stroke={t.stops[2]} strokeWidth={1.2}>
        {glyph}
      </SvgText>
      <SvgText {...common} x={x - 0.6} y={y - 0.8} fill="none" stroke={t.light} strokeWidth={0.75} opacity={0.75}>
        {glyph}
      </SvgText>
    </>
  );
}

const ART: Record<SlotSymbolId, () => React.ReactElement> = {
  WILD: Wild,
  SCAT: MoonGong,
  LION: Lion,
  CRANE: Crane,
  LANTERN: Lantern,
  LOTUS: Lotus,
  PEONY_FAN: PeonyFan,
  A: () => <Royal glyph="A" tone="gold" />,
  K: () => <Royal glyph="K" tone="gold" />,
  Q: () => <Royal glyph="Q" tone="jade" />,
  J: () => <Royal glyph="J" tone="jade" />,
  "10": () => <Royal glyph="10" tone="ruby" />,
  "9": () => <Royal glyph="9" tone="ruby" />,
};

export const SymbolArt = memo(function SymbolArt({ symbol, size }: { symbol: SlotSymbolId; size: number }) {
  const Body = ART[symbol] ?? ART.A;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" testID={`sym-${symbol}`}>
      <G>
        <Body />
      </G>
    </Svg>
  );
});

