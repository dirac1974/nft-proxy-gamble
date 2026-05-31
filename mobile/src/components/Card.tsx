import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  interpolate,
} from "react-native-reanimated";
import Svg, { Path, Rect, G, Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { colors, radius, typography, shadows, motion } from "@/theme";
import { decodeCard } from "@/services/walletService";

interface CardProps {
  cardIndex: number;
  held: boolean;
  onToggleHold: () => void;
  disabled?: boolean;
  /** Position index 0-4. When provided, card deals in with a staggered spring. */
  dealIndex?: number;
  /** Test identifier for E2E flows (e.g. Maestro tapOn id: "card-0"). */
  testID?: string;
}

const DEAL_STAGGER_MS = 80;

const CARD_W = 60;
const CARD_H = 90;

// SVG face is drawn on a 100x150 viewBox and scaled to fit the card.
const VB_W = 100;
const VB_H = 150;

// Vector suit glyphs centred on (0,0) within roughly a 20x20 box.
const SUIT_PATHS: Record<"hearts" | "diamonds" | "clubs" | "spades", string> = {
  hearts:
    "M0,7 C0,2 -4,-1 -7,-1 C-11,-1 -13,2 -13,5 C-13,10 -7,14 0,19 C7,14 13,10 13,5 C13,2 11,-1 7,-1 C4,-1 0,2 0,7 Z",
  diamonds: "M0,-12 L11,3 L0,18 L-11,3 Z",
  spades:
    "M0,-13 C0,-6 13,-1 13,8 C13,13 9,16 5,16 C3,16 1.5,15 0.5,13.5 C1.5,17 2.5,19 5,21 L-5,21 C-2.5,19 -1.5,17 -0.5,13.5 C-1.5,15 -3,16 -5,16 C-9,16 -13,13 -13,8 C-13,-1 0,-6 0,-13 Z",
  clubs:
    "M0,-13 C4,-13 7,-10 7,-6 C7,-4.5 6.4,-3.2 5.4,-2.2 C8,-3.6 11.5,-2.6 13,0.4 C14.5,3.4 13.2,7 10,8.4 C7.6,9.4 5,8.8 3.2,7 C3.4,11 4.4,14 6,16 L-6,16 C-4.4,14 -3.4,11 -3.2,7 C-5,8.8 -7.6,9.4 -10,8.4 C-13.2,7 -14.5,3.4 -13,0.4 C-11.5,-2.6 -8,-3.6 -5.4,-2.2 C-6.4,-3.2 -7,-4.5 -7,-6 C-7,-10 -4,-13 0,-13 Z",
};

// Pip column layout (x,y) in viewBox units for ranks 2-10. Bottom-half pips
// are flagged so they render upside-down, like a real deck.
type Pip = { x: number; y: number; flip?: boolean };

const COL_L = 32;
const COL_C = 50;
const COL_R = 68;
const ROW_T = 38;
const ROW_M = 75;
const ROW_B = 112;
const ROW_T2 = 52;
const ROW_B2 = 98;

const PIP_LAYOUTS: Record<number, Pip[]> = {
  2: [{ x: COL_C, y: ROW_T }, { x: COL_C, y: ROW_B, flip: true }],
  3: [{ x: COL_C, y: ROW_T }, { x: COL_C, y: ROW_M }, { x: COL_C, y: ROW_B, flip: true }],
  4: [
    { x: COL_L, y: ROW_T }, { x: COL_R, y: ROW_T },
    { x: COL_L, y: ROW_B, flip: true }, { x: COL_R, y: ROW_B, flip: true },
  ],
  5: [
    { x: COL_L, y: ROW_T }, { x: COL_R, y: ROW_T }, { x: COL_C, y: ROW_M },
    { x: COL_L, y: ROW_B, flip: true }, { x: COL_R, y: ROW_B, flip: true },
  ],
  6: [
    { x: COL_L, y: ROW_T }, { x: COL_R, y: ROW_T },
    { x: COL_L, y: ROW_M }, { x: COL_R, y: ROW_M },
    { x: COL_L, y: ROW_B, flip: true }, { x: COL_R, y: ROW_B, flip: true },
  ],
  7: [
    { x: COL_L, y: ROW_T }, { x: COL_R, y: ROW_T }, { x: COL_C, y: (ROW_T + ROW_M) / 2 },
    { x: COL_L, y: ROW_M }, { x: COL_R, y: ROW_M },
    { x: COL_L, y: ROW_B, flip: true }, { x: COL_R, y: ROW_B, flip: true },
  ],
  8: [
    { x: COL_L, y: ROW_T }, { x: COL_R, y: ROW_T }, { x: COL_C, y: (ROW_T + ROW_M) / 2 },
    { x: COL_L, y: ROW_M }, { x: COL_R, y: ROW_M },
    { x: COL_C, y: (ROW_M + ROW_B) / 2, flip: true },
    { x: COL_L, y: ROW_B, flip: true }, { x: COL_R, y: ROW_B, flip: true },
  ],
  9: [
    { x: COL_L, y: ROW_T2 }, { x: COL_R, y: ROW_T2 },
    { x: COL_L, y: ROW_M - 9 }, { x: COL_R, y: ROW_M - 9 },
    { x: COL_C, y: ROW_M },
    { x: COL_L, y: ROW_M + 9, flip: true }, { x: COL_R, y: ROW_M + 9, flip: true },
    { x: COL_L, y: ROW_B2, flip: true }, { x: COL_R, y: ROW_B2, flip: true },
  ],
  10: [
    { x: COL_L, y: ROW_T2 }, { x: COL_R, y: ROW_T2 },
    { x: COL_C, y: (ROW_T2 + ROW_M) / 2 - 4 },
    { x: COL_L, y: ROW_M - 9 }, { x: COL_R, y: ROW_M - 9 },
    { x: COL_L, y: ROW_M + 9, flip: true }, { x: COL_R, y: ROW_M + 9, flip: true },
    { x: COL_C, y: (ROW_M + ROW_B2) / 2 + 4, flip: true },
    { x: COL_L, y: ROW_B2, flip: true }, { x: COL_R, y: ROW_B2, flip: true },
  ],
};

type SuitName = "clubs" | "diamonds" | "hearts" | "spades";

function CardFace({ rank, suitName, fill }: { rank: string; suitName: SuitName; fill: string }) {
  const numeric = Number(rank);
  const isNumber = numeric >= 2 && numeric <= 10;
  const isFace = rank === "J" || rank === "Q" || rank === "K";

  return (
    <Svg width={CARD_W} height={CARD_H} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {isNumber &&
        PIP_LAYOUTS[numeric]!.map((p, i) => (
          <G key={i} x={p.x} y={p.y} scale={0.62} rotation={p.flip ? 180 : 0}>
            <Path d={SUIT_PATHS[suitName]} fill={fill} />
          </G>
        ))}

      {rank === "A" && (
        <G x={COL_C} y={VB_H / 2} scale={1.5}>
          <Path d={SUIT_PATHS[suitName]} fill={fill} />
        </G>
      )}

      {isFace && (
        <Defs>
          <LinearGradient id="faceGold" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.goldGlow} />
            <Stop offset="1" stopColor={colors.goldDim} />
          </LinearGradient>
        </Defs>
      )}
      {isFace && (
        <>
          <Rect
            x={26}
            y={42}
            width={48}
            height={66}
            rx={8}
            fill="none"
            stroke="url(#faceGold)"
            strokeWidth={2.5}
          />
          <SvgText
            x={COL_C}
            y={88}
            fontSize={46}
            fontWeight="800"
            fill={fill}
            textAnchor="middle"
          >
            {rank}
          </SvgText>
          <G x={COL_C} y={56} scale={0.4}>
            <Path d={SUIT_PATHS[suitName]} fill="url(#faceGold)" />
          </G>
        </>
      )}
    </Svg>
  );
}

function CornerIndex({ rank, suitName, fill }: { rank: string; suitName: SuitName; fill: string }) {
  return (
    <View style={styles.cornerInner}>
      <Text style={[styles.cornerRank, { color: fill }]}>{rank}</Text>
      <Svg width={9} height={9} viewBox="-15 -15 30 30">
        <Path d={SUIT_PATHS[suitName]} fill={fill} />
      </Svg>
    </View>
  );
}

export function Card({ cardIndex, held, onToggleHold, disabled = false, dealIndex, testID }: CardProps) {
  const card = decodeCard(cardIndex);
  const suitColor = card.isRed ? colors.hearts : colors.spades;
  const suitName = card.suitName;

  const hold = useSharedValue(held ? 1 : 0);
  const dealY = useSharedValue(dealIndex !== undefined ? -44 : 0);
  const dealOpacity = useSharedValue(dealIndex !== undefined ? 0 : 1);

  // Hold-state transition: lift + subtle scale pop.
  useEffect(() => {
    hold.value = withSpring(held ? 1 : 0, motion.springSnappy);
  }, [held, hold]);

  // Deal stagger — fires once on mount when dealIndex is set.
  useEffect(() => {
    if (dealIndex === undefined) return;
    const delay = dealIndex * DEAL_STAGGER_MS;
    dealY.value = withDelay(delay, withSpring(0, { damping: 14, stiffness: 200 }));
    dealOpacity.value = withDelay(delay, withTiming(1, { duration: 120 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — fires once on mount

  const cardStyle = useAnimatedStyle(() => ({
    borderColor: hold.value > 0.5 ? colors.cardHeldBorder : colors.cardBorder,
    borderWidth: interpolate(hold.value, [0, 1], [1.5, 2.5]),
    transform: [
      { translateY: dealY.value + interpolate(hold.value, [0, 1], [0, -6]) },
      { scale: interpolate(hold.value, [0, 1], [1, 1.045]) },
    ],
    opacity: dealOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: hold.value,
    transform: [{ translateY: dealY.value - 6 }, { scale: interpolate(hold.value, [0, 1], [0.96, 1.045]) }],
  }));

  const a11yLabel = `${card.label}, ${held ? "held" : "not held"}. ${disabled ? "" : "Tap to " + (held ? "release" : "hold")}`;

  return (
    <Pressable
      onPress={disabled ? undefined : onToggleHold}
      style={styles.wrapper}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ selected: held, disabled }}
      testID={testID}
    >
      <View style={styles.cardSlot}>
        {/* Neon glow layer — fades in under the card when held. */}
        <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />

        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.cornerTL}>
            <CornerIndex rank={card.rank} suitName={suitName} fill={suitColor} />
          </View>

          <View style={styles.face} pointerEvents="none">
            <CardFace rank={card.rank} suitName={suitName} fill={suitColor} />
          </View>

          <View style={styles.cornerBR}>
            <CornerIndex rank={card.rank} suitName={suitName} fill={suitColor} />
          </View>
        </Animated.View>

        {held && (
          <View style={styles.heldRibbon} pointerEvents="none">
            <Text style={styles.heldText}>HELD</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  cardSlot: {
    width: CARD_W,
    height: CARD_H + 14,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  glow: {
    position: "absolute",
    top: 0,
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.md,
    backgroundColor: colors.cardHeldBorder,
    ...shadows.neonGreen,
    shadowRadius: 14,
    shadowOpacity: 0.9,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackground,
    overflow: "hidden",
    ...shadows.card,
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  cornerTL: {
    position: "absolute",
    top: 3,
    left: 4,
    zIndex: 2,
  },
  cornerBR: {
    position: "absolute",
    bottom: 3,
    right: 4,
    zIndex: 2,
    transform: [{ rotate: "180deg" }],
  },
  cornerInner: {
    alignItems: "center",
    width: 12,
  },
  cornerRank: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 13,
  },
  heldRibbon: {
    position: "absolute",
    bottom: 0,
    backgroundColor: colors.neonGreen,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    ...shadows.neonGreen,
    shadowRadius: 6,
  },
  heldText: {
    ...typography.caption,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.background,
    fontWeight: "800",
  },
});
