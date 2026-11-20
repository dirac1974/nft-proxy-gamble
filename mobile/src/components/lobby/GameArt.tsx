import { KenoTileArt } from "@/components/keno";
import { SlotTileArt } from "@/components/slot";
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import { ChipGraphic, PlayingCard } from "@/components/ui";
import { palette } from "@/theme";
import type { GameId } from "./games";

// Card indices: rank = i % 13 (0 = 2 … 12 = A), suit = floor(i / 13) (0 clubs, 1 diamonds, 2 hearts, 3 spades).
const ROYAL_SPADES = [47, 48, 49, 50, 51];
const ACE_SPADES = 51;
const KING_HEARTS = 37;

function PokerFan({ size }: { size: number }) {
  const cardW = size * 0.34;
  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      {ROYAL_SPADES.map((card, i) => {
        const offset = i - 2;
        return (
          <View
            key={card}
            style={[
              styles.abs,
              {
                left: size / 2 - cardW / 2 + offset * size * 0.12,
                top: size * 0.2 + Math.abs(offset) * size * 0.035,
                transform: [{ rotate: `${offset * 9}deg` }],
              },
            ]}
          >
            <PlayingCard cardIndex={card} width={cardW} showHeldTab={false} />
          </View>
        );
      })}
    </View>
  );
}

function BlackjackHand({ size }: { size: number }) {
  const cardW = size * 0.4;
  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      <View style={[styles.abs, { left: size * 0.12, top: size * 0.14, transform: [{ rotate: "-10deg" }] }]}>
        <PlayingCard cardIndex={ACE_SPADES} width={cardW} showHeldTab={false} />
      </View>
      <View style={[styles.abs, { left: size * 0.36, top: size * 0.1, transform: [{ rotate: "8deg" }] }]}>
        <PlayingCard cardIndex={KING_HEARTS} width={cardW} showHeldTab={false} />
      </View>
      <View style={[styles.abs, { right: size * 0.04, bottom: size * 0.06 }]}>
        <ChipGraphic value={100} size={size * 0.26} />
      </View>
      <View style={[styles.abs, { right: size * 0.2, bottom: size * 0.02 }]}>
        <ChipGraphic value={25} size={size * 0.24} />
      </View>
    </View>
  );
}

// European single-zero wheel order.
const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18,
  29, 7, 28, 12, 35, 3, 26,
];

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function segment(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  return `M${x0} ${y0} A${rOuter} ${rOuter} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${rInner} ${rInner} 0 0 0 ${x3} ${y3} Z`;
}

function RouletteWheel({ size }: { size: number }) {
  const step = 360 / WHEEL.length;
  const [ballX, ballY] = polar(50, 50, 37.5, step * 5.5);
  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      <Svg width={size * 0.9} height={size * 0.9} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="hub" cx="50%" cy="45%" r="50%">
            <Stop offset="0" stopColor={palette.goldLight} />
            <Stop offset="0.6" stopColor={palette.gold} />
            <Stop offset="1" stopColor={palette.goldDeep} />
          </RadialGradient>
          <RadialGradient id="bowl" cx="50%" cy="50%" r="50%">
            <Stop offset="0.6" stopColor="#3A2412" />
            <Stop offset="1" stopColor="#1C1009" />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={49} fill="url(#bowl)" stroke={palette.goldDeep} strokeWidth={1.5} />
        <G>
          {WHEEL.map((n, i) => (
            <Path
              key={n}
              d={segment(50, 50, 42, 31, i * step, (i + 1) * step)}
              fill={n === 0 ? palette.felt : i % 2 === 1 ? palette.ruby : "#14161C"}
              stroke={palette.goldDeep}
              strokeWidth={0.35}
            />
          ))}
        </G>
        <Circle cx={50} cy={50} r={31} fill="#2A1A0D" stroke={palette.goldDeep} strokeWidth={0.8} />
        {[0, 90, 180, 270].map((deg) => {
          const [x, y] = polar(50, 50, 19, deg + 45);
          return <Path key={deg} d={`M50 50 L${x} ${y}`} stroke={palette.gold} strokeWidth={2.2} strokeLinecap="round" />;
        })}
        <Circle cx={50} cy={50} r={8} fill="url(#hub)" />
        <Circle cx={ballX} cy={ballY} r={2.6} fill={palette.ivory} stroke="rgba(0,0,0,0.35)" strokeWidth={0.4} />
      </Svg>
    </View>
  );
}

export function GameArt({ game, size }: { game: GameId; size: number }) {
  if (game === "slot") return <SlotTileArt size={size} />;
  if (game === "keno") return <KenoTileArt size={size} variant="single" />;
  if (game === "keno-quad") return <KenoTileArt size={size} variant="quad" />;
  if (game === "video-poker") return <PokerFan size={size} />;
  if (game === "blackjack") return <BlackjackHand size={size} />;
  return <RouletteWheel size={size} />;
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
  abs: { position: "absolute" },
});
