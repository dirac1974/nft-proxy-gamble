import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Defs, G, Line, Path, Pattern, Rect } from "react-native-svg";
import { fonts, motion, palette, shadows } from "@/theme";
import { decodeCard } from "@/services/walletService";
import { AppText } from "./AppText";

type SuitName = "clubs" | "diamonds" | "hearts" | "spades";

// Vector suits centred on (0,0) in a ~26×34 box.
export const SUIT_PATHS: Record<SuitName, string> = {
  hearts:
    "M0,7 C0,2 -4,-1 -7,-1 C-11,-1 -13,2 -13,5 C-13,10 -7,14 0,19 C7,14 13,10 13,5 C13,2 11,-1 7,-1 C4,-1 0,2 0,7 Z",
  diamonds: "M0,-12 L11,3 L0,18 L-11,3 Z",
  spades:
    "M0,-13 C0,-6 13,-1 13,8 C13,13 9,16 5,16 C3,16 1.5,15 0.5,13.5 C1.5,17 2.5,19 5,21 L-5,21 C-2.5,19 -1.5,17 -0.5,13.5 C-1.5,15 -3,16 -5,16 C-9,16 -13,13 -13,8 C-13,-1 0,-6 0,-13 Z",
  clubs:
    "M0,-13 C4,-13 7,-10 7,-6 C7,-4.5 6.4,-3.2 5.4,-2.2 C8,-3.6 11.5,-2.6 13,0.4 C14.5,3.4 13.2,7 10,8.4 C7.6,9.4 5,8.8 3.2,7 C3.4,11 4.4,14 6,16 L-6,16 C-4.4,14 -3.4,11 -3.2,7 C-5,8.8 -7.6,9.4 -10,8.4 C-13.2,7 -14.5,3.4 -13,0.4 C-11.5,-2.6 -8,-3.6 -5.4,-2.2 C-6.4,-3.2 -7,-4.5 -7,-6 C-7,-10 -4,-13 0,-13 Z",
};

type Pip = { x: number; y: number; flip?: boolean };
const L = 30, C = 50, R = 70, T = 36, M = 75, B = 114, T2 = 50, B2 = 100;

const PIPS: Record<number, Pip[]> = {
  2: [{ x: C, y: T }, { x: C, y: B, flip: true }],
  3: [{ x: C, y: T }, { x: C, y: M }, { x: C, y: B, flip: true }],
  4: [{ x: L, y: T }, { x: R, y: T }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }],
  5: [{ x: L, y: T }, { x: R, y: T }, { x: C, y: M }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }],
  6: [{ x: L, y: T }, { x: R, y: T }, { x: L, y: M }, { x: R, y: M }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }],
  7: [
    { x: L, y: T }, { x: R, y: T }, { x: C, y: (T + M) / 2 },
    { x: L, y: M }, { x: R, y: M }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true },
  ],
  8: [
    { x: L, y: T }, { x: R, y: T }, { x: C, y: (T + M) / 2 }, { x: L, y: M }, { x: R, y: M },
    { x: C, y: (M + B) / 2, flip: true }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true },
  ],
  9: [
    { x: L, y: T2 - 8 }, { x: R, y: T2 - 8 }, { x: L, y: M - 12 }, { x: R, y: M - 12 }, { x: C, y: M },
    { x: L, y: M + 12, flip: true }, { x: R, y: M + 12, flip: true },
    { x: L, y: B2 + 8, flip: true }, { x: R, y: B2 + 8, flip: true },
  ],
  10: [
    { x: L, y: T2 - 8 }, { x: R, y: T2 - 8 }, { x: C, y: T2 + 4 }, { x: L, y: M - 12 }, { x: R, y: M - 12 },
    { x: L, y: M + 12, flip: true }, { x: R, y: M + 12, flip: true }, { x: C, y: B2 - 4, flip: true },
    { x: L, y: B2 + 8, flip: true }, { x: R, y: B2 + 8, flip: true },
  ],
};

export const CARD_RATIO = 1.4;

function SuitGlyph({ suit, size, color }: { suit: SuitName; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="-15 -15 30 38">
      <Path d={SUIT_PATHS[suit]} fill={color} />
    </Svg>
  );
}

function CardFront({ cardIndex, width }: { cardIndex: number; width: number }) {
  const card = decodeCard(cardIndex);
  const suit = card.suitName as SuitName;
  const ink = card.isRed ? palette.ruby : palette.ink;
  const height = width * CARD_RATIO;
  const n = Number(card.rank);
  const isNumber = n >= 2 && n <= 10;
  const isFace = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  const rankLabel = card.rank === "T" ? "10" : card.rank;
  const cornerRank = width * 0.24;
  // Small cards (blackjack hands) get bigger indices and a single centre suit for legibility.
  const compact = width < 52;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.corner, { top: width * 0.05, left: width * 0.06 }]}>
        <AppText style={[styles.cornerRank, { color: ink, fontSize: compact ? width * 0.3 : cornerRank, lineHeight: (compact ? width * 0.3 : cornerRank) * 1.05 }]}>
          {rankLabel}
        </AppText>
        <SuitGlyph suit={suit} size={width * (compact ? 0.22 : 0.16)} color={ink} />
      </View>
      {!compact && (
        <View style={[styles.corner, styles.cornerFlip, { bottom: width * 0.05, right: width * 0.06 }]}>
          <AppText style={[styles.cornerRank, { color: ink, fontSize: cornerRank, lineHeight: cornerRank * 1.05 }]}>
            {rankLabel}
          </AppText>
          <SuitGlyph suit={suit} size={width * 0.16} color={ink} />
        </View>
      )}

      {compact ? (
        <View style={[styles.corner, { bottom: width * 0.08, right: width * 0.08 }]}>
          <SuitGlyph suit={suit} size={width * 0.46} color={ink} />
        </View>
      ) : isNumber ? (
        <Svg width={width} height={height} viewBox="0 0 100 140" style={StyleSheet.absoluteFill}>
          {PIPS[n]!.map((p, i) => (
            <G key={i} x={p.x} y={p.y} scale={0.62} rotation={p.flip ? 180 : 0}>
              <Path d={SUIT_PATHS[suit]} fill={ink} />
            </G>
          ))}
        </Svg>
      ) : isFace ? (
        <View style={styles.centerFill}>
          <View
            style={[
              styles.faceFrame,
              { width: width * 0.56, height: height * 0.56, borderRadius: width * 0.06 },
            ]}
          >
            <SuitGlyph suit={suit} size={width * 0.16} color={palette.goldDeep} />
            <AppText style={{ fontFamily: fonts.displayBlack, fontSize: width * 0.36, color: ink, lineHeight: width * 0.42 }}>
              {card.rank}
            </AppText>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <SuitGlyph suit={suit} size={width * 0.16} color={palette.goldDeep} />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.centerFill}>
          <SuitGlyph suit={suit} size={width * 0.5} color={ink} />
        </View>
      )}
    </View>
  );
}

function CardBack({ width }: { width: number }) {
  const height = width * CARD_RATIO;
  return (
    <View style={[StyleSheet.absoluteFill, { padding: width * 0.06, backgroundColor: palette.ivory }]}>
      <View style={[styles.backInner, { borderRadius: width * 0.06 }]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Defs>
            <Pattern id="lattice" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Line x1={0} y1={0} x2={0} y2={8} stroke={palette.goldDeep} strokeWidth={0.8} opacity={0.6} />
              <Line x1={0} y1={0} x2={8} y2={0} stroke={palette.goldDeep} strokeWidth={0.8} opacity={0.6} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill={palette.cardBack} />
          <Rect x={0} y={0} width={width} height={height} fill="url(#lattice)" />
          <Rect
            x={width * 0.08}
            y={width * 0.08}
            width={width * 0.76}
            height={height - width * 0.28}
            rx={width * 0.05}
            fill="none"
            stroke={palette.gold}
            strokeWidth={1}
            opacity={0.8}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.centerFill]}>
          <View style={[styles.monogram, { width: width * 0.38, height: width * 0.38, borderRadius: width * 0.19 }]}>
            <AppText style={{ fontFamily: fonts.displayBlack, color: palette.gold, fontSize: width * 0.2 }}>A</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

export interface PlayingCardProps {
  cardIndex?: number | null;
  faceDown?: boolean;
  held?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  width?: number;
  onPress?: () => void;
  disabled?: boolean;
  /** Stagger index for the deal-in animation (fires on mount). */
  dealIndex?: number;
  /** Delay before a face change flips over (ms). */
  flipDelay?: number;
  testID?: string;
  accessibilityLabel?: string;
  showHeldTab?: boolean;
}

export function PlayingCard({
  cardIndex,
  faceDown = false,
  held = false,
  dimmed = false,
  highlighted = false,
  width = 62,
  onPress,
  disabled = false,
  dealIndex,
  flipDelay = 0,
  testID,
  accessibilityLabel,
  showHeldTab = true,
}: PlayingCardProps) {
  const height = width * CARD_RATIO;
  const showBack = faceDown || cardIndex === null || cardIndex === undefined;
  const [shown, setShown] = useState<{ back: boolean; index: number | null | undefined }>({
    back: showBack,
    index: cardIndex,
  });

  const flipX = useSharedValue(1);
  const lift = useSharedValue(held ? 1 : 0);
  const enter = useSharedValue(dealIndex !== undefined ? 0 : 1);
  const dim = useSharedValue(dimmed ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (dealIndex === undefined) return;
    enter.value = withDelay(
      dealIndex * motion.dealStagger,
      withTiming(1, { duration: motion.dealTravel, easing: Easing.out(Easing.cubic) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flip when the face changes: squash to 0, swap, expand.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (shown.back === showBack && shown.index === cardIndex) return;
    const half = motion.flip / 2;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        flipX.value = withTiming(0, { duration: half, easing: Easing.in(Easing.quad) });
        timers.push(
          setTimeout(() => {
            setShown({ back: showBack, index: cardIndex });
            flipX.value = withTiming(1, { duration: half, easing: Easing.out(Easing.quad) });
          }, half),
        );
      }, flipDelay),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBack, cardIndex]);

  useEffect(() => {
    lift.value = withSpring(held ? 1 : 0, motion.springSnappy);
  }, [held, lift]);

  useEffect(() => {
    dim.value = withTiming(dimmed ? 1 : 0, { duration: motion.slow });
  }, [dimmed, dim]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value * interpolate(dim.value, [0, 1], [1, 0.45]),
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [-60, 0]) + interpolate(lift.value, [0, 1], [0, -8]) },
      { translateX: interpolate(enter.value, [0, 1], [40, 0]) },
      { scaleX: flipX.value },
      { scale: interpolate(lift.value, [0, 1], [1, 1.04]) },
    ],
  }));

  const tabStyle = useAnimatedStyle(() => ({
    opacity: lift.value,
    transform: [{ translateY: interpolate(lift.value, [0, 1], [6, 0]) }],
  }));

  const card = cardIndex !== null && cardIndex !== undefined ? decodeCard(cardIndex) : null;
  const label =
    accessibilityLabel ??
    (showBack || !card ? "Face-down card" : `${card.label}${held ? ", held" : ""}`);

  const body = (
    <Animated.View
      style={[
        styles.card,
        { width, height, borderRadius: width * 0.08 },
        shadows.card,
        held && styles.heldBorder,
        highlighted && styles.highlight,
        cardStyle,
      ]}
    >
      {shown.back || shown.index === null || shown.index === undefined ? (
        <CardBack width={width} />
      ) : (
        <CardFront cardIndex={shown.index} width={width} />
      )}
    </Animated.View>
  );

  const tab = showHeldTab ? (
    <Animated.View style={[styles.heldTab, tabStyle]} pointerEvents="none">
      <AppText style={styles.heldText}>HELD</AppText>
    </Animated.View>
  ) : null;

  if (!onPress) {
    return (
      <View style={styles.slot} testID={testID} accessible accessibilityLabel={label}>
        {held && tab}
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={styles.slot}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? undefined : held ? "Double tap to release" : "Double tap to hold"}
      accessibilityState={{ selected: held, disabled }}
    >
      {held && tab}
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: "center" },
  card: {
    backgroundColor: palette.ivory,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
    overflow: "hidden",
  },
  heldBorder: { borderWidth: 2, borderColor: palette.gold, ...shadows.goldGlow },
  highlight: { borderWidth: 2, borderColor: palette.gold },
  corner: { position: "absolute", alignItems: "center", zIndex: 2 },
  cornerFlip: { transform: [{ rotate: "180deg" }] },
  cornerRank: { fontFamily: fonts.heavy, includeFontPadding: false, letterSpacing: -0.5 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  faceFrame: {
    borderWidth: 1.5,
    borderColor: palette.gold,
    backgroundColor: "rgba(233,196,106,0.12)",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  backInner: { flex: 1, overflow: "hidden", backgroundColor: palette.cardBack },
  monogram: {
    borderWidth: 1.5,
    borderColor: palette.gold,
    backgroundColor: palette.cardBack,
    alignItems: "center",
    justifyContent: "center",
  },
  heldTab: {
    position: "absolute",
    top: -22,
    zIndex: 5,
    backgroundColor: palette.gold,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    ...shadows.goldGlow,
  },
  heldText: { fontFamily: fonts.heavy, fontSize: 10, letterSpacing: 1.5, color: palette.goldInk },
});
