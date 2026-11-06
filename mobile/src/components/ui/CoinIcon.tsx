import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { palette } from "@/theme";

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="coinFace" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.goldLight} />
          <Stop offset="0.55" stopColor={palette.gold} />
          <Stop offset="1" stopColor={palette.goldDeep} />
        </LinearGradient>
      </Defs>
      <Circle cx={12} cy={12} r={11} fill="url(#coinFace)" />
      <Circle cx={12} cy={12} r={8.2} fill="none" stroke={palette.goldDeep} strokeWidth={1.1} opacity={0.8} />
      {/* Diamond mark */}
      <Path d="M12 6.6 L16 11.2 L12 17.4 L8 11.2 Z" fill={palette.goldDeep} opacity={0.85} />
      <Path d="M12 6.6 L16 11.2 L12 11.2 Z" fill={palette.goldLight} opacity={0.7} />
    </Svg>
  );
}
