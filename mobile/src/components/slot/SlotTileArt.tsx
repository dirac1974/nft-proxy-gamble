import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { SymbolArt } from "./SymbolArt";
import { HangingLantern, TitleWordmark } from "./Ornaments";
import { C } from "./artKit";

// Night-festival backdrop: indigo dusk, moon, distant pavilion roofline, stars.
/** `sceneTop`: y where the game scene starts (below the header). The moon + glow are
 *  placed and clipped inside the scene so they never wash over header controls. */
export const SlotBackdrop = memo(function SlotBackdrop({ width, height, sceneTop = 0 }: { width: number; height: number; sceneTop?: number }) {
  const glowR = Math.min(width, height) * 0.16;
  const moonY = sceneTop > 0 ? sceneTop + glowR * 0.45 : height * 0.07;
  const stars = [
    [0.08, 0.06], [0.22, 0.14], [0.36, 0.04], [0.55, 0.1], [0.68, 0.03], [0.9, 0.12], [0.14, 0.3], [0.82, 0.26], [0.45, 0.22],
  ];
  const roof = `M0 ${height * 0.78} L${width * 0.12} ${height * 0.78} Q${width * 0.2} ${height * 0.72} ${width * 0.28} ${height * 0.7} Q${width * 0.36} ${height * 0.72} ${width * 0.44} ${height * 0.78} L${width * 0.56} ${height * 0.78} Q${width * 0.66} ${height * 0.7} ${width * 0.76} ${height * 0.67} Q${width * 0.86} ${height * 0.7} ${width * 0.94} ${height * 0.77} L${width} ${height * 0.77} L${width} ${height} L0 ${height} Z`;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="bd-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#070818" />
          <Stop offset="0.45" stopColor="#151A46" />
          <Stop offset="0.8" stopColor="#2A1838" />
          <Stop offset="1" stopColor="#07090F" />
        </LinearGradient>
        <RadialGradient id="bd-moon" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF6D8" stopOpacity="0.9" />
          <Stop offset="0.5" stopColor="#F2E1B0" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#F2E1B0" stopOpacity="0" />
        </RadialGradient>
        <ClipPath id="bd-scene">
          <Rect x={0} y={sceneTop} width={width} height={Math.max(0, height - sceneTop)} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#bd-sky)" />
      <G clipPath="url(#bd-scene)">
        <Circle cx={width * 0.84} cy={moonY} r={glowR} fill="url(#bd-moon)" />
        <Circle cx={width * 0.84} cy={moonY} r={Math.min(width, height) * 0.045} fill="#FFF6D8" opacity={0.85} />
      </G>
      {stars.map(([x, y], i) => (
        <Circle key={i} cx={x! * width} cy={y! * height} r={i % 3 === 0 ? 1.4 : 0.9} fill="#fff" opacity={0.55} />
      ))}
      <Path d={roof} fill="#090A1C" opacity={0.85} />
    </Svg>
  );
});

/** Lobby tile art: dusk sky, lanterns, wild gate + lion medallion, mini wordmark. */
export const SlotTileArt = memo(function SlotTileArt({ size }: { size: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, borderRadius: s * 0.12, overflow: "hidden" }} accessibilityLabel="Lion Lantern Night" accessible>
      <Svg width={s} height={s} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ta-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0A0C26" />
            <Stop offset="0.6" stopColor="#23205A" />
            <Stop offset="1" stopColor="#5E0F1B" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#ta-sky)" />
        <Circle cx={78} cy={18} r={11} fill="#FFF6D8" opacity={0.85} />
        <Circle cx={78} cy={18} r={15} fill="none" stroke="#FFF6D8" strokeWidth={3} opacity={0.15} />
        <Path d="M0 84 Q25 76 50 80 Q75 74 100 82 L100 100 L0 100 Z" fill={C.night} opacity={0.8} />
      </Svg>
      <View style={[styles.abs, { left: s * 0.02, top: -s * 0.02 }]}>
        <HangingLantern size={s * 0.34} />
      </View>
      <View style={[styles.abs, { right: s * 0.03, top: s * 0.04 }]}>
        <HangingLantern size={s * 0.26} hue="gold" />
      </View>
      {/* WILD gate + lion side by side above the wordmark — neither occludes the other. */}
      <View style={[styles.abs, { left: s * 0.05, top: s * 0.25 }]}>
        <SymbolArt symbol="WILD" size={s * 0.42} />
      </View>
      <View style={[styles.abs, { left: s * 0.51, top: s * 0.24 }]}>
        <SymbolArt symbol="LION" size={s * 0.44} />
      </View>
      <View style={[styles.abs, { left: 0, right: 0, bottom: s * 0.01, alignItems: "center" }]}>
        <TitleWordmark width={s * 0.98} height={s * 0.98 * (104 / 360)} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: "absolute" },
});
