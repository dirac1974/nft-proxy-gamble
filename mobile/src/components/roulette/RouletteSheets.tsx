import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Badge, Sheet, Surface } from "@/components/ui";
import { fonts, palette, spacing } from "@/theme";
import type { RouletteVerificationResult } from "@/services/provablyFair";
import { NumberPill, ResultHistoryStrip } from "./ResultHistoryStrip";
import { MAX_BETS_PER_SPIN, MAX_TOTAL_WAGER, pocketColor, sessionStats } from "./rouletteModel";

// ---------------------------------------------------------------------------
// Fairness
// ---------------------------------------------------------------------------

export interface FairSpin {
  winningNumber: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  verification: RouletteVerificationResult;
}

interface FairnessSheetProps {
  visible: boolean;
  onClose: () => void;
  lastSpin: FairSpin | null;
  nextCommitHash: string | null;
}

export function isVerified(v: RouletteVerificationResult | null | undefined): boolean {
  return !!v && v.seedHashMatches && v.numberMatches;
}

export function FairnessSheet({ visible, onClose, lastSpin, nextCommitHash }: FairnessSheetProps) {
  const [open, setOpen] = useState(false);
  const ok = isVerified(lastSpin?.verification);
  return (
    <Sheet visible={visible} onClose={onClose} title="Fair spin check" subtitle="Every result is checked on your device" testID="roulette-fair-sheet">
      {lastSpin ? (
        <Surface border={ok ? "gold" : "hairline"} style={styles.verdict}>
          <Ionicons
            name={ok ? "shield-checkmark" : "warning"}
            size={28}
            color={ok ? palette.emerald : palette.danger}
          />
          <View style={styles.flex}>
            <AppText variant="heading3">{ok ? "This spin was fair" : "Verification failed"}</AppText>
            <AppText variant="bodySmall">
              {ok
                ? `Before you bet, the table locked in a secret seed and showed you its fingerprint. After the spin it revealed the seed, and your phone re-calculated the result itself: ${lastSpin.winningNumber} ${pocketColor(lastSpin.winningNumber)}. It matches.`
                : "Your phone could not reproduce this result from the revealed seed. Please don't trust this spin and contact support."}
            </AppText>
          </View>
        </Surface>
      ) : (
        <Surface style={styles.verdict}>
          <Ionicons name="lock-closed" size={26} color={palette.gold} />
          <View style={styles.flex}>
            <AppText variant="heading3">Next spin is locked in</AppText>
            <AppText variant="bodySmall">
              The table has already committed to the seed for your next spin, before you place any bets. After you spin,
              come back here to see it verified.
            </AppText>
          </View>
        </Surface>
      )}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.disclosure}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID="roulette-fair-details"
      >
        <AppText variant="overline">Technical details</AppText>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={palette.textDim} />
      </Pressable>

      {open ? (
        <View style={styles.details}>
          {lastSpin ? (
            <>
              <Row k="Winning number" v={String(lastSpin.winningNumber)} />
              <Row k="Recomputed number" v={String(lastSpin.verification.expectedNumber)} />
              <Row k="Seed matches commitment" v={lastSpin.verification.seedHashMatches ? "Yes" : "No"} />
              <Row k="Server seed (revealed)" v={lastSpin.serverSeed} mono />
              <Row k="Server seed hash (committed)" v={lastSpin.serverSeedHash} mono />
              <Row k="Client seed" v={lastSpin.clientSeed} mono />
              <Row k="Nonce" v={String(lastSpin.nonce)} mono />
            </>
          ) : null}
          {nextCommitHash ? <Row k="Next spin commitment" v={nextCommitHash} mono /> : null}
          <AppText variant="caption">
            Result = HMAC-SHA256(serverSeed, "clientSeed:nonce") mod 37. Commitment = keccak256(serverSeed).
          </AppText>
        </View>
      ) : null}
    </Sheet>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption">{k}</AppText>
      <AppText variant={mono ? "mono" : "bodyStrong"} selectable>
        {v}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rules & payouts
// ---------------------------------------------------------------------------

const PAYTABLE: [string, string, string][] = [
  ["Straight", "Tap a number", "35:1"],
  ["Split", "Tap the line between 2 numbers", "17:1"],
  ["Street", "Tap the outer right edge of a row", "11:1"],
  ["Corner", "Tap where 4 numbers meet", "8:1"],
  ["Six line", "Tap the outer right edge between 2 rows", "5:1"],
  ["First four", "Tap the corner of 0 and 3", "8:1"],
  ["Dozen / Column", "1st–3rd 12 · 2 to 1", "2:1"],
  ["Red / Black · Odd / Even · 1–18 / 19–36", "Outside bets", "1:1"],
];

export function RulesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="European Roulette" subtitle="Single zero · 37 pockets" testID="roulette-rules-sheet">
      {PAYTABLE.map(([name, how, pays]) => (
        <View key={name} style={styles.payRow}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText variant="caption">{how}</AppText>
          </View>
          <AppText style={styles.pays}>{pays}</AppText>
        </View>
      ))}
      <View style={styles.payRow} testID="roulette-rules-neighbours">
        <View style={styles.flex}>
          <AppText variant="bodyStrong">Nbrs · Neighbours</AppText>
          <AppText variant="caption">
            Turn on Nbrs, then tap a number: it places 5 straight bets — that number plus the two pockets either side of
            it on the wheel. Each chip costs your selected chip value and pays 35:1.
          </AppText>
        </View>
        <AppText style={styles.pays}>5 × 35:1</AppText>
      </View>
      <AppText variant="bodySmall">
        Limits: up to {MAX_BETS_PER_SPIN} bets and {MAX_TOTAL_WAGER.toLocaleString("en-US")} coins per spin. Zero loses
        all outside bets. Return to player 97.3%.
      </AppText>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Session statistics
// ---------------------------------------------------------------------------

export function StatsSheet({
  visible,
  onClose,
  history,
}: {
  visible: boolean;
  onClose: () => void;
  history: readonly number[];
}) {
  const s = sessionStats(history);
  const pct = (n: number) => (s.spins ? `${Math.round((n / s.spins) * 100)}%` : "–");
  return (
    <Sheet visible={visible} onClose={onClose} title="This session" subtitle={`${s.spins} spin${s.spins === 1 ? "" : "s"}`} testID="roulette-stats-sheet">
      <ResultHistoryStrip numbers={history} max={12} pill={24} />
      <View style={styles.bars}>
        <SplitBar left={["Red", s.red, palette.ruby]} right={["Black", s.black, "#2A2D35"]} zero={s.green} pct={pct} />
        <SplitBar left={["Odd", s.odd, palette.surfaceHi]} right={["Even", s.even, palette.surfaceHi]} zero={s.green} pct={pct} />
        <SplitBar left={["1–18", s.low, palette.surfaceHi]} right={["19–36", s.high, palette.surfaceHi]} zero={s.green} pct={pct} />
      </View>
      {s.spins > 0 ? (
        <View style={styles.hotCold}>
          <View style={styles.flex}>
            <Badge label="Hot" tone="danger" icon="flame" />
            <View style={styles.pills}>
              {s.hot.map((n) => (
                <NumberPill key={n} n={n} />
              ))}
            </View>
          </View>
          <View style={styles.flex}>
            <Badge label="Cold" tone="info" icon="snow" />
            <View style={styles.pills}>
              {s.cold.map((n) => (
                <NumberPill key={n} n={n} />
              ))}
            </View>
          </View>
        </View>
      ) : null}
      <AppText variant="caption">
        Every spin is independent — past numbers never change the odds of the next one.
      </AppText>
    </Sheet>
  );
}

function SplitBar({
  left,
  right,
  zero,
  pct,
}: {
  left: [string, number, string];
  right: [string, number, string];
  zero: number;
  pct: (n: number) => string;
}) {
  const total = left[1] + right[1] + zero || 1;
  return (
    <View style={styles.splitWrap}>
      <View style={styles.splitLabels}>
        <AppText variant="caption">
          {left[0]} {pct(left[1])}
        </AppText>
        <AppText variant="caption">
          {pct(right[1])} {right[0]}
        </AppText>
      </View>
      <View style={styles.split}>
        <View style={{ flex: left[1] / total || 0.5, backgroundColor: left[2] }} />
        {zero > 0 ? <View style={{ flex: zero / total, backgroundColor: "#12844F" }} /> : null}
        <View style={{ flex: right[1] / total || 0.5, backgroundColor: right[2], borderLeftWidth: 1, borderColor: palette.hairline }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: spacing.xs },
  verdict: { flexDirection: "row", gap: spacing.s12, alignItems: "flex-start" },
  disclosure: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  details: { gap: spacing.sm },
  row: { gap: 2 },
  payRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  pays: { fontFamily: fonts.heavy, fontSize: 16, color: palette.gold, fontVariant: ["tabular-nums"] },
  bars: { gap: spacing.s12 },
  splitWrap: { gap: 4 },
  splitLabels: { flexDirection: "row", justifyContent: "space-between" },
  split: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: palette.surface },
  hotCold: { flexDirection: "row", gap: spacing.md },
  pills: { flexDirection: "row", gap: 4, marginTop: 4 },
});
