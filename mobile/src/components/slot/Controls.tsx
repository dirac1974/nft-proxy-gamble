import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { fonts, motion, palette } from "@/theme";
import { AppText, haptic } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import { playSound } from "@/services/soundService";
import { SpinButtonFace } from "./Ornaments";
import { totalBet } from "./slotMath";

// ── WIN banner merged with BET / WIN readout ─────────────────────────────────
export type BannerTone = "idle" | "win" | "neutral" | "feature";

interface WinBannerProps {
  bet: number;
  win: number | null;
  winLabel?: string;
  message: string;
  sub?: string | null;
  tone: BannerTone;
  onPress?: () => void;
}

export function WinBanner({ bet, win, winLabel = "WIN", message, sub, tone, onPress }: WinBannerProps) {
  const winTone = tone === "win" || tone === "feature";
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.banner}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${message}${sub ? `. ${sub}` : ""}. Bet ${bet} coins${win !== null ? `. ${winLabel} ${win} coins` : ""}`}
      testID="slot-banner"
    >
      <LinearGradient colors={["#2A0A12", "#14060A"]} style={StyleSheet.absoluteFill} />
      <View style={styles.bannerRule} />
      <View style={[styles.bannerRule, styles.bannerRuleBottom]} />
      <View style={styles.meter}>
        <AppText style={styles.meterLabel}>BET</AppText>
        <AppText style={styles.meterValue} testID="slot-bet-total">
          {formatCoins(bet)}
        </AppText>
      </View>
      <View style={[styles.center, tone === "neutral" && styles.centerNeutral]}>
        <AppText
          style={[styles.message, winTone && styles.messageWin, tone === "neutral" && styles.messageNeutral]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          testID="slot-banner-message"
        >
          {message}
        </AppText>
        {sub ? (
          <AppText style={styles.sub} numberOfLines={1} testID="slot-banner-sub">
            {sub}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.meter, styles.meterRight]}>
        <AppText style={styles.meterLabel}>{winLabel}</AppText>
        <AppText style={[styles.meterValue, winTone && win ? styles.meterWin : null]} testID="slot-win-meter">
          {win === null ? "—" : formatCoins(win)}
        </AppText>
      </View>
    </Pressable>
  );
}

// ── BET stepper ──────────────────────────────────────────────────────────────
interface BetStepperProps {
  levels: readonly number[];
  level: number;
  onChange: (level: number) => void;
  disabled?: boolean;
}

export function BetStepper({ levels, level, onChange, disabled }: BetStepperProps) {
  const idx = Math.max(0, levels.indexOf(level));
  const canDown = !disabled && idx > 0;
  const canUp = !disabled && idx < levels.length - 1;
  const step = (d: 1 | -1) => {
    const next = levels[idx + d];
    if (next === undefined) return;
    haptic("select");
    void playSound("ui_tap");
    onChange(next);
  };
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={`Bet ${totalBet(level)} coins`}>
      <StepBtn icon="remove" onPress={() => step(-1)} disabled={!canDown} label="Decrease bet" testID="slot-bet-minus" />
      <View style={styles.stepValue}>
        <AppText style={styles.stepLabel}>TOTAL BET</AppText>
        <AppText style={styles.stepAmount} testID="slot-bet-value">
          {formatCoins(totalBet(level))}
        </AppText>
      </View>
      <StepBtn icon="add" onPress={() => step(1)} disabled={!canUp} label="Increase bet" testID="slot-bet-plus" />
    </View>
  );
}

function StepBtn({ icon, onPress, disabled, label, testID }: { icon: "add" | "remove"; onPress: () => void; disabled: boolean; label: string; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [styles.stepBtn, disabled && styles.dim, pressed && styles.pressed]}
    >
      <LinearGradient colors={[palette.goldLight, palette.gold, palette.goldDeep]} style={styles.stepBtnFace}>
        <Ionicons name={icon} size={18} color={palette.goldInk} />
      </LinearGradient>
    </Pressable>
  );
}

// ── round SPIN button ────────────────────────────────────────────────────────
interface SpinButtonProps {
  size: number;
  label: string;
  sublabel?: string | null;
  disabled?: boolean;
  mode?: "base" | "free";
  onPress: () => void;
  accessibilityLabel: string;
}

export function SpinButton({ size, label, sublabel, disabled, mode = "base", onPress, accessibilityLabel }: SpinButtonProps) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, anim, disabled && styles.dimSoft]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          scale.value = withSpring(0.93, motion.springSnappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.springSnappy);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        testID="slot-spin"
        style={styles.spinPress}
      >
        <SpinButtonFace size={size} mode={mode} />
        <View style={styles.spinLabelWrap} pointerEvents="none">
          <AppText style={[styles.spinLabel, { fontSize: size * 0.2 }]}>{label}</AppText>
          {sublabel ? <AppText style={styles.spinSub}>{sublabel}</AppText> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── small round icon toggle (TURBO / info) ───────────────────────────────────
export function RoundToggle({
  icon,
  label,
  active,
  onPress,
  disabled,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic("select");
        void playSound("ui_toggle");
        onPress();
      }}
      disabled={disabled}
      accessibilityRole={active === undefined ? "button" : "switch"}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, checked: active }}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [styles.toggle, disabled && styles.dim, pressed && styles.pressed]}
    >
      <View style={[styles.toggleFace, active && styles.toggleOn]}>
        <Ionicons name={icon} size={17} color={active ? palette.goldInk : palette.goldLight} />
      </View>
      <AppText style={[styles.toggleLabel, active && { color: palette.goldLight }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.55)",
  },
  bannerRule: { position: "absolute", left: 6, right: 6, top: 3, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(248,227,163,0.5)" },
  bannerRuleBottom: { top: undefined, bottom: 3 },
  meter: { width: 74, paddingHorizontal: 10, justifyContent: "center" },
  meterRight: { alignItems: "flex-end" },
  meterLabel: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.6, color: palette.gold, opacity: 0.85 },
  meterValue: { fontFamily: fonts.heavy, fontSize: 15, color: palette.text, fontVariant: ["tabular-nums"] },
  meterWin: { color: palette.goldLight },
  center: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  centerNeutral: { borderColor: "rgba(168,176,194,0.45)" },
  message: { fontFamily: fonts.display, fontSize: 15, color: palette.text, letterSpacing: 0.8 },
  messageWin: { color: palette.goldLight, fontFamily: fonts.displayBlack, fontSize: 17 },
  messageNeutral: { color: palette.textDim, fontFamily: fonts.semibold, fontSize: 14, letterSpacing: 0.2 },
  sub: { fontFamily: fonts.semibold, fontSize: 10.5, color: palette.textDim, marginTop: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 38, height: 38, borderRadius: 19, padding: 1.5, backgroundColor: palette.goldInk },
  stepBtnFace: { flex: 1, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stepValue: {
    minWidth: 72,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.45)",
  },
  stepLabel: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 1.4, color: palette.gold },
  stepAmount: { fontFamily: fonts.heavy, fontSize: 17, color: palette.ivory, fontVariant: ["tabular-nums"] },
  spinPress: { flex: 1 },
  spinLabelWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  spinLabel: {
    fontFamily: fonts.displayBlack,
    color: palette.goldLight,
    letterSpacing: 1.5,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 2,
  },
  spinSub: { fontFamily: fonts.bold, fontSize: 9, color: palette.goldLight, opacity: 0.85, letterSpacing: 0.6 },
  toggle: { alignItems: "center", gap: 2, width: 52 },
  toggleFace: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.5)",
  },
  toggleOn: { backgroundColor: palette.gold, borderColor: palette.goldLight },
  toggleLabel: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8, color: palette.textDim },
  dim: { opacity: 0.35 },
  dimSoft: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.94 }] },
});
