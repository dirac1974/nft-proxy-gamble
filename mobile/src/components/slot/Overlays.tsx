import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { fonts, palette, spacing } from "@/theme";
import { AppText, CoinIcon } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import { SymbolArt } from "./SymbolArt";
import { LanternToken, ScrollPaper, TierPlaqueArt } from "./Ornaments";
import {
  OPTION_NAMES,
  REELS,
  ROWS,
  bigWinTier,
  optionLabel,
  posKey,
  type BigTier,
  type FeatureOption,
  type FeatureOptionId,
  type Grid,
} from "./slotMath";

// ── win layer over the reel window: dim / pulse / LDW outline ───────────────
export type WinMode = "none" | "celebrate" | "ldw";

interface WinLayerProps {
  cell: number;
  gap: number;
  grid: Grid | null;
  highlight: Set<string> | null;
  mode: WinMode;
  multiplier?: number | null;
  reduceMotion: boolean;
}

export function WinLayer({ cell, gap, grid, highlight, mode, multiplier, reduceMotion }: WinLayerProps) {
  // ONE shared pulse drives every winning cell (1 animated node regardless of count).
  const pulse = useSharedValue(0);
  const active = mode === "celebrate" && !!highlight && highlight.size > 0;
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = 0;
    if (active && !reduceMotion) {
      pulse.value = withRepeat(withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
  }, [active, reduceMotion, pulse, highlight]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.07 * pulse.value }] }));

  if (mode === "none" || !highlight || !grid) return null;
  const cells: React.ReactNode[] = [];
  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      const key = posKey(reel, row);
      const left = reel * (cell + gap);
      const top = row * cell;
      const box = { left, top, width: cell, height: cell };
      const sym = grid[row]?.[reel];
      if (!highlight.has(key)) {
        cells.push(<View key={key} style={[styles.abs, box, styles.dimCell]} pointerEvents="none" />);
      } else if (mode === "ldw") {
        cells.push(<View key={key} style={[styles.abs, box, styles.ldwCell]} pointerEvents="none" />);
      } else if (sym) {
        cells.push(
          <Animated.View key={key} style={[styles.abs, box, styles.winCell, pulseStyle]} pointerEvents="none">
            <SymbolArt symbol={sym} size={Math.round(cell * 0.92)} />
            <View style={styles.winFrame} />
            {multiplier && multiplier > 1 && sym === "WILD" ? (
              <View style={styles.medallion} accessibilityLabel={`Multiplier ${multiplier}`}>
                <AppText style={styles.medallionText}>×{multiplier}</AppText>
              </View>
            ) : null}
          </Animated.View>,
        );
      }
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={`slot-winlayer-${mode}`}>
      {cells}
    </View>
  );
}

// ── anticipation column glow ─────────────────────────────────────────────────
export function AnticipationGlow({ left, cell, height, on, reduceMotion }: { left: number; cell: number; height: number; on: boolean; reduceMotion: boolean }) {
  const o = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(o);
    if (on) {
      o.value = reduceMotion
        ? withTiming(0.8, { duration: 120 })
        : withSequence(withTiming(1, { duration: 160 }), withRepeat(withTiming(0.55, { duration: 280 }), -1, true));
    } else {
      o.value = withTiming(0, { duration: 150 });
    }
  }, [on, reduceMotion, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[styles.abs, { left, top: 0, width: cell, height }, style]} pointerEvents="none">
      <LinearGradient
        colors={["rgba(248,227,163,0.55)", "rgba(233,196,106,0.08)", "rgba(248,227,163,0.55)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowEdge} />
    </Animated.View>
  );
}

// ── coin fountain: 30 coin Views in 6 animated groups (6 nodes) ─────────────
const GROUPS = 6;
const PER_GROUP = 5;
function CoinGroup({ index, width, height }: { index: number; width: number; height: number }) {
  const t = useSharedValue(0);
  const seed = useMemo(() => {
    const r = (n: number) => (Math.sin(index * 78.233 + n * 12.9898) * 43758.5453) % 1;
    const a = Math.abs;
    return {
      dx: (a(r(1)) - 0.5) * width * 0.9,
      peak: height * (0.35 + a(r(2)) * 0.3),
      delay: index * 140,
      dur: 1300 + a(r(3)) * 500,
      coins: Array.from({ length: PER_GROUP }, (_, k) => ({
        x: (a(r(10 + k)) - 0.5) * 70,
        y: (a(r(20 + k)) - 0.5) * 50,
        s: 16 + a(r(30 + k)) * 14,
      })),
    };
  }, [index, width, height]);
  useEffect(() => {
    t.value = withDelay(seed.delay, withRepeat(withTiming(1, { duration: seed.dur, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [seed, t]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    const y = -seed.peak * 4 * p * (1 - p) + p * p * height * 0.35;
    return { opacity: p < 0.9 ? 1 : (1 - p) * 10, transform: [{ translateX: seed.dx * p }, { translateY: y }] };
  });
  return (
    <Animated.View style={[styles.coinGroup, { left: width / 2, top: height * 0.62 }, style]} pointerEvents="none">
      {seed.coins.map((c, k) => (
        <View key={k} style={[styles.abs, { left: c.x, top: c.y }]}>
          <CoinIcon size={c.s} />
        </View>
      ))}
    </Animated.View>
  );
}

export function CoinFountain({ width, height }: { width: number; height: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: GROUPS }, (_, i) => (
        <CoinGroup key={i} index={i} width={width} height={height} />
      ))}
    </View>
  );
}

// ── BIG / MEGA / EPIC plaque with escalating tier during count-up ───────────
const TIER_LABEL: Record<BigTier, string> = { big: "BIG WIN", mega: "MEGA WIN", epic: "EPIC WIN" };

interface BigWinProps {
  shown: number;
  target: number;
  wager: number;
  width: number;
  height: number;
  reduceMotion: boolean;
  onTap: () => void;
}

export function BigWinPlaque({ shown, target, wager, width, height, reduceMotion, onTap }: BigWinProps) {
  // Escalates BIG → MEGA → EPIC as the count passes each threshold.
  const tier = bigWinTier(shown - wager, wager) ?? "big";
  const counting = shown < target;
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, styles.bigRoot]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel={`${TIER_LABEL[tier]}. ${formatCoins(target)} coins. ${counting ? "Tap to skip" : "Tap to continue"}`}
        testID="slot-bigwin"
      >
        <View style={styles.bigScrim} />
        {!reduceMotion ? <CoinFountain width={width} height={height} /> : null}
        <View style={styles.bigCenter} pointerEvents="none">
          <Animated.View key={tier} entering={reduceMotion ? FadeIn.duration(100) : ZoomIn.springify().damping(11)}>
            <TierPlaqueArt width={Math.min(320, width - 32)} label={TIER_LABEL[tier]} tone={tier} />
          </Animated.View>
          <View style={styles.bigAmountRow}>
            <CoinIcon size={30} />
            <AppText style={styles.bigAmount} testID="slot-bigwin-amount">
              {formatCoins(shown)}
            </AppText>
          </View>
          <AppText style={styles.bigHint}>{counting ? "Tap to skip" : "Tap to continue"}</AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── FREE GAMES intro scroll ──────────────────────────────────────────────────
export function FreeGamesIntro({ scatters, width, reduceMotion, onDone }: { scatters: number; width: number; reduceMotion: boolean; onDone: () => void }) {
  const unroll = useSharedValue(reduceMotion ? 1 : 0.06);
  useEffect(() => {
    if (!reduceMotion) unroll.value = withDelay(120, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(onDone, reduceMotion ? 900 : 2200);
    return () => clearTimeout(t);
  }, [onDone, reduceMotion, unroll]);
  const paper = useAnimatedStyle(() => ({ transform: [{ scaleX: unroll.value }] }));
  const w = Math.min(340, width - 24);
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.center]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel={`Free games. ${scatters} moon gongs. Tap to choose`} testID="slot-fg-intro">
        <View style={styles.bigScrim} />
      </Pressable>
      <Animated.View style={[{ width: w, height: w * 0.42 }, paper]} pointerEvents="none">
        <ScrollPaper width={w} height={w * 0.42} />
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <AppText style={styles.scrollTitle}>FREE GAMES</AppText>
          <AppText style={styles.scrollSub}>{scatters} Moon Gongs · choose your lantern</AppText>
        </View>
        <View style={[styles.roller, { left: -6 }]} />
        <View style={[styles.roller, { right: -6 }]} />
      </Animated.View>
    </Animated.View>
  );
}

// ── option picker: 4 distinct lantern tokens ─────────────────────────────────
interface PickerProps {
  options: FeatureOption[];
  busy: FeatureOptionId | null;
  onPick: (id: FeatureOptionId) => void;
}

export function FeaturePicker({ options, busy, onPick }: PickerProps) {
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.pickerRoot]} testID="slot-picker">
      <View style={styles.pickerScrim} />
      <AppText style={styles.pickerTitle} accessibilityRole="header">
        CHOOSE YOUR LANTERN
      </AppText>
      <AppText style={styles.pickerSub}>Multipliers apply to wins that include a Wild gate</AppText>
      <View style={styles.pickerGrid}>
        {options.map((o) => {
          const isBusy = busy === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => onPick(o.id)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={`${optionLabel(o)}. Return to player ${o.rtp.toFixed(1)} percent. ${o.volatility} volatility`}
              testID={`slot-option-${o.id}`}
              style={({ pressed }) => [styles.optCard, pressed && styles.optPressed, busy !== null && !isBusy && styles.optDim]}
            >
              <LinearGradient colors={["#1D2152", "#0C0E26"]} style={StyleSheet.absoluteFill} />
              <LanternToken kind={o.id} size={64} />
              <AppText style={styles.optName}>{OPTION_NAMES[o.id]}</AppText>
              <AppText style={styles.optMain}>
                {o.spins} games · {o.multipliers.length === 1 ? `×${o.multipliers[0]}` : `×${o.multipliers[0]}–${o.multipliers[o.multipliers.length - 1]}`}
              </AppText>
              <AppText style={styles.optMeta}>
                RTP {o.rtp.toFixed(1)}% · {o.volatility}
              </AppText>
              {isBusy ? <ActivityIndicator style={styles.optBusy} color={palette.gold} /> : null}
            </Pressable>
          );
        })}
      </View>
      <AppText style={styles.pickerFoot}>All lanterns return about the same over time — fewer games, bigger swings.</AppText>
    </Animated.View>
  );
}

// ── +N GAMES retrigger ───────────────────────────────────────────────────────
export function RetriggerBanner({ added, reduceMotion }: { added: number; reduceMotion: boolean }) {
  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(100) : ZoomIn.springify().damping(10)}
      exiting={FadeOut.duration(200)}
      style={[StyleSheet.absoluteFill, styles.center]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Plus ${added} free games`}
    >
      <View style={styles.retrig}>
        <AppText style={styles.retrigText}>+{added} GAMES</AppText>
      </View>
    </Animated.View>
  );
}

// ── feature outro ────────────────────────────────────────────────────────────
export function FreeGamesOutro({ total, net, played, capped, onDone }: { total: number; net: number; played: number; capped: boolean; onDone: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.center]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Continue" testID="slot-fg-outro">
        <View style={styles.bigScrim} />
      </Pressable>
      <View style={styles.outroCard} pointerEvents="none" accessibilityLiveRegion="polite">
        <AppText style={styles.outroKicker}>FREE GAMES COMPLETE</AppText>
        <AppText style={styles.outroTotal}>Feature total {formatCoins(total)}</AppText>
        <AppText style={[styles.outroNet, net > 0 && { color: palette.emerald }]}>
          Net {net > 0 ? `+${formatCoins(net)}` : net < 0 ? `−${formatCoins(-net)}` : "0"} · {played} games
        </AppText>
        {capped ? <AppText style={styles.outroCap}>Max win of 500,000 coins reached</AppText> : null}
        <AppText style={styles.bigHint}>Tap to continue</AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  center: { alignItems: "center", justifyContent: "center" },
  dimCell: { backgroundColor: "rgba(4,5,16,0.65)" },
  ldwCell: { borderWidth: 1, borderColor: "rgba(248,227,163,0.55)", borderRadius: 4 },
  winCell: { alignItems: "center", justifyContent: "center" },
  winFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.goldLight,
    shadowColor: palette.gold,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  medallion: {
    position: "absolute",
    right: 2,
    top: 2,
    minWidth: 26,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.ruby,
    borderWidth: 1.5,
    borderColor: palette.goldLight,
  },
  medallionText: { fontFamily: fonts.heavy, fontSize: 12, color: palette.goldLight },
  glowEdge: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: palette.goldLight, borderRadius: 4 },
  coinGroup: { position: "absolute", width: 1, height: 1 },
  bigRoot: { zIndex: 40 },
  bigScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,5,14,0.78)" },
  bigCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  bigAmountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bigAmount: {
    fontFamily: fonts.displayBlack,
    fontSize: 42,
    color: palette.goldLight,
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  bigHint: { fontFamily: fonts.semibold, fontSize: 12, color: palette.textDim, marginTop: spacing.xs },
  scrollTitle: { fontFamily: fonts.displayBlack, fontSize: 34, color: palette.rubyDeep, letterSpacing: 3 },
  scrollSub: { fontFamily: fonts.semibold, fontSize: 13, color: "#5A3A08", marginTop: 2 },
  roller: {
    position: "absolute",
    top: -6,
    bottom: -6,
    width: 14,
    borderRadius: 7,
    backgroundColor: "#6B2E12",
    borderWidth: 1.5,
    borderColor: palette.gold,
  },
  pickerRoot: { zIndex: 30, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  pickerScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,5,14,0.9)" },
  pickerTitle: { fontFamily: fonts.displayBlack, fontSize: 22, color: palette.goldLight, letterSpacing: 2, textAlign: "center" },
  pickerSub: { fontFamily: fonts.medium, fontSize: 12, color: palette.textDim, marginTop: 4, marginBottom: spacing.md, textAlign: "center" },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, maxWidth: 360 },
  optCard: {
    width: 160,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(233,196,106,0.6)",
  },
  optPressed: { transform: [{ scale: 0.96 }] },
  optDim: { opacity: 0.4 },
  optName: { fontFamily: fonts.displayBlack, fontSize: 16, color: palette.goldLight, letterSpacing: 1, marginTop: 2 },
  optMain: { fontFamily: fonts.bold, fontSize: 13, color: palette.text },
  optMeta: { fontFamily: fonts.medium, fontSize: 11, color: palette.textDim, marginTop: 1 },
  optBusy: { position: "absolute", top: 8, right: 8 },
  pickerFoot: { fontFamily: fonts.regular, fontSize: 11.5, color: palette.textFaint, marginTop: spacing.md, textAlign: "center", maxWidth: 320 },
  retrig: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: palette.rubyDeep,
    borderWidth: 2,
    borderColor: palette.goldLight,
  },
  retrigText: { fontFamily: fonts.displayBlack, fontSize: 30, color: palette.goldLight, letterSpacing: 2 },
  outroCard: {
    minWidth: 280,
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: 18,
    backgroundColor: "#0C2A22",
    borderWidth: 2,
    borderColor: palette.gold,
    gap: 4,
  },
  outroKicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, color: palette.gold },
  outroTotal: { fontFamily: fonts.displayBlack, fontSize: 24, color: palette.goldLight },
  outroNet: { fontFamily: fonts.semibold, fontSize: 15, color: palette.text },
  outroCap: { fontFamily: fonts.medium, fontSize: 12, color: palette.warn },
});
