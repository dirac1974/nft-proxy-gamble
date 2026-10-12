import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { fonts, motion, palette, radius } from "@/theme";
import { AppText, useRollingNumber } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import { CARD_STYLES, payRows, resultCopy, type KenoMode } from "./kenoModel";

export const STRIP_H = 48;

const compact = (n: number): string =>
  n >= 100_000 ? `${Math.round(n / 1000)}K` : n >= 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : formatCoins(n);

interface PaytableStripProps {
  mode: KenoMode;
  activeCard: number;
  spots: number;
  bet: number;
  liveCatches: number | null;
  onPress: () => void;
}

/** Catch → pays for the active card's spot count; the live catch row lights during the draw. */
export function PaytableStrip({ mode, activeCard, spots, bet, liveCatches, onPress }: PaytableStripProps) {
  const rows = payRows(spots).slice().reverse();
  const cs = CARD_STYLES[activeCard]!;
  return (
    <Pressable
      onPress={onPress}
      style={styles.strip}
      accessibilityRole="button"
      accessibilityLabel={
        spots === 0
          ? "Pays. Pick numbers to see pays. Opens rules"
          : `Pays for ${spots} spots: ${rows.map((r) => `catch ${r.catches} pays ${formatCoins((bet * r.x10) / 10)}`).join(", ")}. Opens rules`
      }
      testID="keno-paytable"
    >
      <View style={styles.label}>
        {mode === "quad" ? <AppText style={[styles.cardTag, { color: cs.color }]}>{cs.glyphChar} {cs.letter}</AppText> : null}
        <AppText style={styles.labelTop}>{spots ? `${spots} SPOT${spots > 1 ? "S" : ""}` : "PAYS"}</AppText>
        <AppText style={styles.labelBottom}>CATCH</AppText>
      </View>
      {spots === 0 ? (
        <AppText style={styles.empty} numberOfLines={2}>
          Mark 1–10 numbers · the more you catch, the more it pays
        </AppText>
      ) : (
        <View style={styles.rows}>
          {rows.map((r) => {
            const lit = liveCatches !== null && liveCatches === r.catches;
            return (
              <View key={r.catches} style={[styles.pay, lit && styles.payLit]} testID={`keno-pay-${r.catches}`}>
                <AppText style={[styles.catch, lit && styles.inkText]}>{r.catches}</AppText>
                <AppText style={[styles.amount, lit && styles.inkText]} numberOfLines={1} adjustsFontSizeToFit>
                  {r.x10 === 10 ? "PUSH" : compact((bet * r.x10) / 10)}
                </AppText>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

interface ResultBannerProps {
  totalReturn: number;
  wagered: number;
  detail: string;
  reduceMotion: boolean;
  capped: boolean;
  onPress: () => void;
}

/** Net-only banner that replaces the strip after a draw. LDW/push stay neutral: no colour, no count-up. */
export function ResultBanner({ totalReturn, wagered, detail, reduceMotion, capped, onPress }: ResultBannerProps) {
  const { kind, text } = resultCopy(totalReturn, wagered);
  const win = kind === "win";
  const [target, setTarget] = useState(win && !reduceMotion ? 0 : totalReturn);
  useEffect(() => setTarget(totalReturn), [totalReturn]);
  const rolled = useRollingNumber(target, motion.countSmall);
  const shown = win && rolled !== totalReturn ? `Won ${formatCoins(rolled)}` : text;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.strip, styles.banner, win ? styles.bannerWin : kind === "ldw" || kind === "push" ? styles.bannerNeutral : null]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${text}. ${detail}${capped ? ". Max win reached" : ""}`}
      testID="keno-result-banner"
    >
      <AppText style={[styles.bannerMain, win && styles.bannerMainWin]} numberOfLines={1} testID="keno-result-text">
        {shown}
      </AppText>
      <AppText style={styles.bannerSub} numberOfLines={1}>
        {capped ? "Max win reached · " : ""}
        {detail}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: STRIP_H,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: "#020414",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.35)",
    paddingHorizontal: 6,
    gap: 6,
  },
  label: { width: 50, alignItems: "flex-start" },
  cardTag: { fontFamily: fonts.heavy, fontSize: 10, lineHeight: 12 },
  labelTop: { fontFamily: fonts.heavy, fontSize: 10, lineHeight: 13, color: palette.gold, letterSpacing: 0.6 },
  labelBottom: { fontFamily: fonts.bold, fontSize: 9, lineHeight: 12, color: palette.textDim, letterSpacing: 1 },
  empty: { flex: 1, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 15, color: palette.textDim },
  rows: { flex: 1, flexDirection: "row", gap: 3 },
  pay: {
    flex: 1,
    height: 38,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(233,196,106,0.25)",
    paddingHorizontal: 2,
  },
  payLit: { backgroundColor: palette.gold, borderColor: palette.goldLight },
  catch: { fontFamily: fonts.heavy, fontSize: 13, lineHeight: 15, color: palette.ivory, fontVariant: ["tabular-nums"] },
  amount: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: palette.gold, fontVariant: ["tabular-nums"] },
  inkText: { color: palette.goldInk },
  banner: { flexDirection: "column", justifyContent: "center", gap: 0, paddingHorizontal: 10 },
  bannerWin: { borderColor: palette.gold, borderWidth: 1.5, backgroundColor: "rgba(233,196,106,0.10)" },
  bannerNeutral: { borderColor: palette.hairlineStrong, borderWidth: 1 },
  bannerMain: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 20, color: palette.text, fontVariant: ["tabular-nums"] },
  bannerMainWin: { color: palette.gold },
  bannerSub: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: palette.textDim },
});

