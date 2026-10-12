import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Path, Text as SvgText, TextPath } from "react-native-svg";
import { fonts, palette } from "@/theme";
import { tableRuleLine } from "./bjLogic";

interface TablePrintProps {
  width: number;
  dealerHitsSoft17: boolean;
}

// Faint gold lettering printed on the felt, like a real layout.
export function TablePrint({ width, dealerHitsSoft17 }: TablePrintProps) {
  const h = 132;
  const cx = width / 2;
  const span = width * 0.46;
  // Two concentric "smile" arcs: outer carries the payout, inner the insurance band.
  const outer = `M ${cx - span} 20 Q ${cx} 92 ${cx + span} 20`;
  const inner = `M ${cx - span * 0.78} 58 Q ${cx} 118 ${cx + span * 0.78} 58`;
  return (
    <View style={[styles.wrap, { width, height: h }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={h}>
        <Defs>
          <Path id="bjOuterArc" d={outer} />
          <Path id="bjInnerArc" d={inner} />
        </Defs>
        <SvgText fill={palette.goldLight} fillOpacity={0.5} fontFamily={fonts.display} fontSize={15} letterSpacing={2.2}>
          <TextPath href="#bjOuterArc" startOffset="50%" textAnchor="middle">
            BLACKJACK PAYS 3 TO 2
          </TextPath>
        </SvgText>
        <SvgText fill={palette.goldLight} fillOpacity={0.36} fontFamily={fonts.display} fontSize={10} letterSpacing={1.8}>
          <TextPath href="#bjInnerArc" startOffset="50%" textAnchor="middle">
            {`${tableRuleLine(dealerHitsSoft17)}  ·  INSURANCE PAYS 2 TO 1`}
          </TextPath>
        </SvgText>
        <Path d={inner} stroke={palette.feltLine} strokeOpacity={0.35} strokeWidth={1} fill="none" transform="translate(0 8)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center" },
});
