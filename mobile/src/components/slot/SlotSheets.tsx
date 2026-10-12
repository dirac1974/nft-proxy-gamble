import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, spacing } from "@/theme";
import { AppText, Sheet, Surface } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import type { SlotPaytable } from "@/services/slotApi";
import { isSlotVerified, type SlotVerification } from "@/services/slotFair";
import { SymbolArt } from "./SymbolArt";
import { LanternToken } from "./Ornaments";
import { OPTION_NAMES, SYMBOL_NAMES, multiplierOdds, totalBet, type SlotSymbolId } from "./slotMath";

const PAY_ORDER: SlotSymbolId[] = ["LION", "CRANE", "LANTERN", "LOTUS", "PEONY_FAN", "A", "K", "Q", "J", "10", "9"];

interface RulesProps {
  visible: boolean;
  onClose: () => void;
  paytable: SlotPaytable;
  betLevel: number;
  turbo: boolean;
  onTurbo: ((on: boolean) => void) | null;
}

export function rtpRange(pt: SlotPaytable): string {
  if (pt.rtp) return `${pt.rtp.min.toFixed(1)}–${pt.rtp.max.toFixed(1)}%`;
  const r = pt.options.map((o) => o.rtp);
  if (!r.length) return "—";
  const lo = Math.min(...r);
  const hi = Math.max(...r);
  return lo.toFixed(1) === hi.toFixed(1) ? `${lo.toFixed(1)}%` : `${lo.toFixed(1)}–${hi.toFixed(1)}%`;
}

export function SlotRulesSheet({ visible, onClose, paytable, betLevel, turbo, onTurbo }: RulesProps) {
  const bet = totalBet(betLevel);
  return (
    <Sheet visible={visible} onClose={onClose} title="Lion Lantern Night" subtitle={`243 ways · RTP ${rtpRange(paytable)} · Max win ${formatCoins(paytable.maxWin)} coins`} testID="slot-rules">
      <AppText variant="overline">Pays at your bet ({formatCoins(bet)})</AppText>
      <AppText variant="bodySmall">
        Wins pay left to right on adjacent reels, starting from reel 1. Matching symbols on several rows multiply the ways. Coins
        shown are per way.
      </AppText>
      <View style={styles.table}>
        {PAY_ORDER.map((s) => {
          const p = paytable.pays[s];
          if (!p) return null;
          return (
            <View key={s} style={styles.payRow} accessibilityLabel={`${SYMBOL_NAMES[s]}: 5 pays ${p[2] * betLevel}, 4 pays ${p[1] * betLevel}, 3 pays ${p[0] * betLevel}`}>
              <SymbolArt symbol={s} size={40} />
              <AppText style={styles.payName}>{SYMBOL_NAMES[s]}</AppText>
              {[2, 1, 0].map((k) => (
                <View key={k} style={styles.payCell}>
                  <AppText style={styles.payK}>{k + 3}×</AppText>
                  <AppText style={[styles.payV, p[k] === 0 && styles.payZero]}>{p[k] ? formatCoins(p[k]! * betLevel) : "—"}</AppText>
                </View>
              ))}
            </View>
          );
        })}
      </View>

      <Surface style={styles.special}>
        <SymbolArt symbol="WILD" size={52} />
        <View style={styles.flex}>
          <AppText variant="heading3">Wild gate</AppText>
          <AppText variant="bodySmall">Lands on reels 2, 3 and 4 only. Stands in for every symbol except the Moon Gong.</AppText>
        </View>
      </Surface>
      <Surface style={styles.special}>
        <SymbolArt symbol="SCAT" size={52} />
        <View style={styles.flex}>
          <AppText variant="heading3">Moon Gong scatter</AppText>
          <AppText variant="bodySmall">
            Pays anywhere: {Object.entries(paytable.scatterPays)
              .map(([n, x]) => `${n} pay ${x}× bet`)
              .join(", ")}
            . Three or more start Free Games.
          </AppText>
        </View>
      </Surface>

      <AppText variant="overline">Free games — choose your lantern</AppText>
      {paytable.options.map((o) => (
        <View key={o.id} style={styles.optRow}>
          <LanternToken kind={o.id} size={40} />
          <View style={styles.flex}>
            <AppText style={styles.optName}>
              {OPTION_NAMES[o.id]} · {o.spins} games
            </AppText>
            <AppText variant="caption">Multiplier each game: {multiplierOdds(o)}</AppText>
            <AppText variant="caption">
              Game RTP with this option {o.rtp.toFixed(2)}% · {o.volatility} volatility
            </AppText>
          </View>
        </View>
      ))}
      <AppText variant="bodySmall">
        Each free game draws one multiplier with the odds shown; it applies to the ways that use a Wild (scatter pays are not
        multiplied). Three or more Moon Gongs during free
        games add the same number of games again (up to 3 retriggers or 100 games in total).
      </AppText>

      <AppText variant="overline">Limits</AppText>
      <AppText variant="bodySmall">
        Bets {formatCoins(totalBet(paytable.betLevels[0] ?? 1))}–{formatCoins(totalBet(paytable.betLevels[paytable.betLevels.length - 1] ?? 1))} coins.
        Max win {formatCoins(paytable.maxWin)} coins per game, including free games. Malfunction voids all pays and plays.
      </AppText>

      {onTurbo ? (
        <View style={styles.setting}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Turbo spin</AppText>
            <AppText variant="caption">Faster reel stops. Results are the same.</AppText>
          </View>
          <Switch value={turbo} onValueChange={onTurbo} trackColor={{ true: palette.gold, false: palette.surfaceHi }} testID="slot-turbo-switch" />
        </View>
      ) : null}

      <AppText variant="overline">Fair play</AppText>
      <AppText variant="bodySmall">
        Before you spin, the game commits to a secret seed and shows you its fingerprint. After the round it reveals the seed and your
        phone recomputes every reel stop itself.
      </AppText>
    </Sheet>
  );
}

// ── fairness ─────────────────────────────────────────────────────────────────
export interface SlotFairRound {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  spins: number;
  verification: SlotVerification;
}

export function SlotFairSheet({ visible, onClose, last, nextCommitHash, pending }: { visible: boolean; onClose: () => void; last: SlotFairRound | null; nextCommitHash: string | null; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const ok = isSlotVerified(last?.verification);
  return (
    <Sheet visible={visible} onClose={onClose} title="Fair spin check" subtitle="Every reel stop is re-checked on your device" testID="slot-fair-sheet">
      {pending ? (
        <Surface style={styles.verdict}>
          <Ionicons name="hourglass-outline" size={26} color={palette.gold} />
          <View style={styles.flex}>
            <AppText variant="heading3">Free games in progress</AppText>
            <AppText variant="bodySmall">The seed is revealed when the free games finish, then every spin is checked.</AppText>
          </View>
        </Surface>
      ) : last ? (
        <Surface border={ok ? "gold" : "hairline"} style={styles.verdict}>
          <Ionicons name={ok ? "shield-checkmark" : "warning"} size={28} color={ok ? palette.emerald : palette.danger} />
          <View style={styles.flex}>
            <AppText variant="heading3">{ok ? "This round was fair" : "Verification failed"}</AppText>
            <AppText variant="bodySmall">
              {ok
                ? `The revealed seed matches the fingerprint shown before you spun, and your phone reproduced all ${last.spins} reel result${last.spins === 1 ? "" : "s"}.`
                : "Your phone could not reproduce this round from the revealed seed. Please don't trust it and contact support."}
            </AppText>
          </View>
        </Surface>
      ) : (
        <Surface style={styles.verdict}>
          <Ionicons name="lock-closed" size={26} color={palette.gold} />
          <View style={styles.flex}>
            <AppText variant="heading3">Next spin is locked in</AppText>
            <AppText variant="bodySmall">The game has already committed to the seed for your next spin. Spin, then come back here.</AppText>
          </View>
        </Surface>
      )}
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.disclosure} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <AppText variant="overline">Technical details</AppText>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={palette.textDim} />
      </Pressable>
      {open ? (
        <View style={styles.details}>
          {last ? (
            <>
              <Row k="Seed matches commitment" v={last.verification.seedHashMatches ? "Yes" : "No"} />
              <Row k="Reel stops reproduced" v={last.verification.stopsMatch && last.verification.gridMatch ? "Yes" : `No (spins ${last.verification.mismatchNonces.join(", ")})`} />
              <Row k="Server seed (revealed)" v={last.serverSeed} mono />
              <Row k="Server seed hash (committed)" v={last.serverSeedHash} mono />
              <Row k="Client seed" v={last.clientSeed} mono />
            </>
          ) : null}
          {nextCommitHash ? <Row k="Next spin commitment" v={nextCommitHash} mono /> : null}
          <AppText variant="caption">
            Reel r stop = HMAC-SHA256(serverSeed, "clientSeed:spin:reel:r:round"), first 32-bit chunk below the unbiased limit, mod strip
            length. Commitment = keccak256(serverSeed).
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
      <AppText variant={mono ? "mono" : "bodySmall"} selectable>
        {v}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  table: { gap: 4 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  payName: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: palette.text },
  payCell: { width: 52, alignItems: "flex-end" },
  payK: { fontFamily: fonts.medium, fontSize: 9.5, color: palette.textFaint },
  payV: { fontFamily: fonts.bold, fontSize: 13, color: palette.goldLight, fontVariant: ["tabular-nums"] },
  payZero: { color: palette.textFaint },
  special: { flexDirection: "row", alignItems: "center", gap: spacing.s12, padding: spacing.s12 },
  optRow: { flexDirection: "row", alignItems: "center", gap: spacing.s12 },
  optName: { fontFamily: fonts.bold, fontSize: 14, color: palette.text },
  setting: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  verdict: { flexDirection: "row", gap: spacing.s12, padding: spacing.md, alignItems: "flex-start" },
  disclosure: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  details: { gap: spacing.sm },
  row: { gap: 2 },
});
