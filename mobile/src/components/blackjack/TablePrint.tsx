import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View, type NativeSyntheticEvent, type TextLayoutEventData } from "react-native";
import Svg, { Defs, Path, Text as SvgText, TextPath } from "react-native-svg";
import { fonts, palette } from "@/theme";
import { tableRuleLine } from "./bjLogic";

interface TablePrintProps {
  width: number;
  dealerHitsSoft17: boolean;
  /** Vertical room available; the whole print scales down uniformly (never crops). */
  maxHeight?: number;
}

export const PRINT_HEIGHT = 150;
// Cinzel Bold caps average ~0.8em advance; used until the real width is measured.
const EST_EM = 0.82;
const FIT = 0.9;

type Pt = { x: number; y: number };

function quadLength(a: Pt, c: Pt, b: Pt): number {
  let len = 0;
  let prev = a;
  for (let i = 1; i <= 48; i++) {
    const t = i / 48;
    const u = 1 - t;
    const p = { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

interface Line {
  id: string;
  text: string;
  d: string;
  arc: number;
  fontSize: number;
  spacing: number;
  opacity: number;
}

export interface FittedLine {
  fontSize: number;
  spacing: number;
  length: number;
  startOffset: number;
}

// Fit a string onto an arc: shrink font + tracking until it fits FIT of the arc,
// then centre with a px startOffset (textAnchor="start"). Android ignores
// percentage startOffset + textAnchor="middle" on TextPath, which clipped the payout.
export function fitOnArc(chars: number, arc: number, fontSize: number, spacing: number, measured?: number): FittedLine {
  const natural = measured ?? chars * (fontSize * EST_EM + spacing);
  const scale = Math.min(1, (arc * FIT) / Math.max(1, natural));
  const length = natural * scale;
  return { fontSize: fontSize * scale, spacing: spacing * scale, length, startOffset: Math.max(0, (arc - length) / 2) };
}

// Faint gold lettering printed on the felt, like a real layout. Payout text is regulatory: always shown in full.
export function TablePrint({ width, dealerHitsSoft17, maxHeight }: TablePrintProps) {
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const h = PRINT_HEIGHT;
  const cx = width / 2;
  const span = width * 0.46;

  const lines: Line[] = useMemo(() => {
    const mk = (id: string, text: string, k: number, y: number, dip: number, fontSize: number, spacing: number, opacity: number): Line => {
      const a = { x: cx - span * k, y };
      const c = { x: cx, y: y + dip };
      const b = { x: cx + span * k, y };
      return { id, text, d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`, arc: quadLength(a, c, b), fontSize, spacing, opacity };
    };
    return [
      mk("bjPayArc", "BLACKJACK PAYS 3 TO 2", 1, 24, 74, 15, 2.2, 0.55),
      mk("bjRuleArc", tableRuleLine(dealerHitsSoft17), 0.82, 62, 62, 11, 1.8, 0.42),
      mk("bjInsArc", "INSURANCE PAYS 2 TO 1", 0.66, 92, 50, 10.5, 1.8, 0.42),
    ];
  }, [cx, span, dealerHitsSoft17]);

  const onMeasure = useCallback(
    (id: string) => (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const w = e.nativeEvent.lines.reduce((m, l) => Math.max(m, l.width), 0);
      if (w > 0) setMeasured((prev) => (prev[id] === w ? prev : { ...prev, [id]: w }));
    },
    [],
  );

  const guide = lines[2]!;
  const shownH = maxHeight !== undefined ? Math.max(0, Math.min(h, maxHeight)) : h;
  const a11y = lines.map((l) => l.text.toLowerCase()).join(". ");

  return (
    <View style={[styles.wrap, { width, height: shownH }]} pointerEvents="none" accessible accessibilityLabel={a11y} testID="bj-table-print">
      {lines.map((l) => (
        <Text
          key={`m-${l.id}`}
          style={[styles.measure, { fontFamily: fonts.display, fontSize: l.fontSize, letterSpacing: l.spacing }]}
          onTextLayout={onMeasure(l.id)}
          numberOfLines={1}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {l.text}
        </Text>
      ))}
      <Svg width={width} height={shownH} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="xMidYMid meet">
        <Defs>
          {lines.map((l) => (
            <Path key={l.id} id={l.id} d={l.d} />
          ))}
        </Defs>
        {lines.map((l) => {
          const f = fitOnArc(l.text.length, l.arc, l.fontSize, l.spacing, measured[l.id]);
          return (
            <SvgText key={`t-${l.id}`} fill={palette.goldLight} fillOpacity={l.opacity} fontFamily={fonts.display} fontSize={f.fontSize} letterSpacing={f.spacing}>
              <TextPath
                href={`#${l.id}`}
                startOffset={f.startOffset}
                textAnchor="start"
                textLength={f.length}
                lengthAdjust="spacingAndGlyphs"
                testID={`${l.id}-text`}
              >
                {l.text}
              </TextPath>
            </SvgText>
          );
        })}
        <Path d={guide.d} stroke={palette.feltLine} strokeOpacity={0.35} strokeWidth={1} fill="none" transform="translate(0 9)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center" },
  measure: { position: "absolute", opacity: 0, left: 0, top: 0, width: 2000 },
});
