import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fonts, palette, radius, shadows, spacing } from "@/theme";
import { AppText } from "@/components/ui";
import type { KenoMode } from "./kenoModel";

const key = (mode: KenoMode) => `keno.coach.v1.${mode}`;

export const COACH_STEPS: Record<KenoMode, { title: string; body: string; anchor: "board" | "strip" | "controls" }[]> = {
  single: [
    { title: "Mark your numbers", body: "Tap 1 to 10 numbers on the board. Tap again to unmark, or use Quick Pick.", anchor: "board" },
    { title: "See what it pays", body: "This strip shows what each catch pays for the number of spots you marked.", anchor: "strip" },
    { title: "Bet and play", body: "Choose your bet, then press PLAY. 20 balls are drawn — tap the board to skip ahead.", anchor: "controls" },
  ],
  quad: [
    { title: "Four cards, one draw", body: "Switch cards with the A–D tabs. Each card has its own colour, shape and corner mark.", anchor: "controls" },
    { title: "Mark each card", body: "Tap numbers for the active card. Shared numbers show every card's corner mark.", anchor: "board" },
    { title: "Same bet on each card", body: "Every card with numbers plays at your bet. Empty cards are skipped. Cards can't be identical.", anchor: "strip" },
  ],
};

export function useCoachMarks(mode: KenoMode, enabled: boolean) {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    AsyncStorage.getItem(key(mode))
      .then((v) => {
        if (live && v !== "done") setStep(0);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [mode, enabled]);

  const finish = useCallback(() => {
    setStep(null);
    AsyncStorage.setItem(key(mode), "done").catch(() => null);
  }, [mode]);
  const next = useCallback(() => {
    setStep((s) => {
      if (s === null) return null;
      if (s + 1 >= COACH_STEPS[mode].length) {
        AsyncStorage.setItem(key(mode), "done").catch(() => null);
        return null;
      }
      return s + 1;
    });
  }, [mode]);
  const replay = useCallback(() => setStep(0), []);
  return { step, next, finish, replay };
}

interface CoachMarkProps {
  mode: KenoMode;
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

/** Non-blocking coach card; positions itself away from the region it describes. */
export function CoachMark({ mode, step, onNext, onSkip }: CoachMarkProps) {
  const steps = COACH_STEPS[mode];
  const s = steps[step];
  if (!s) return null;
  const last = step === steps.length - 1;
  return (
    <View style={[styles.host, s.anchor === "board" ? styles.bottom : styles.mid]} pointerEvents="box-none">
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(150)}
        style={styles.card}
        accessibilityViewIsModal={false}
        testID="keno-coach"
      >
        <View style={styles.head}>
          <AppText style={styles.step}>
            {step + 1} / {steps.length}
          </AppText>
          <AppText style={styles.title} accessibilityRole="header">
            {s.title}
          </AppText>
        </View>
        <AppText variant="bodySmall" style={styles.body}>
          {s.body}
        </AppText>
        <View style={styles.actions}>
          <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" testID="keno-coach-skip">
            <AppText style={styles.skip}>Skip</AppText>
          </Pressable>
          <Pressable onPress={onNext} style={styles.next} accessibilityRole="button" testID="keno-coach-next">
            <AppText style={styles.nextText}>{last ? "Got it" : "Next"}</AppText>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing.s12, right: spacing.s12, zIndex: 40 },
  bottom: { bottom: 64 },
  mid: { top: "38%" },
  card: {
    backgroundColor: palette.surfaceHi,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.gold,
    padding: spacing.s12,
    gap: spacing.xs,
    ...shadows.e3,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  step: { fontFamily: fonts.bold, fontSize: 11, color: palette.gold },
  title: { fontFamily: fonts.bold, fontSize: 15, color: palette.text },
  body: { color: palette.textDim },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  skip: { fontFamily: fonts.semibold, fontSize: 13, color: palette.textDim },
  next: { backgroundColor: palette.gold, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  nextText: { fontFamily: fonts.heavy, fontSize: 13, color: palette.goldInk },
});
