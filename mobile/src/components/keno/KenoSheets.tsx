import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, radius, spacing } from "@/theme";
import { AppText, Badge, Button, ChipRack, SegmentedControl, Sheet, Surface } from "@/components/ui";
import { formatCoins } from "@/config/brand";
import { isKenoVerified, type KenoVerificationResult } from "@/services/kenoFair";
import {
  BET_LEVELS,
  CARD_STYLES,
  MAX_WIN,
  PAYTABLE_X10,
  RESTRICTED_PLAY,
  RTP_BY_SPOTS,
  RTP_RANGE,
  cardResultCopy,
  formatMult,
  payRows,
  resultCopy,
  type KenoMode,
  type KenoSpeed,
} from "./kenoModel";
import { CardGlyph } from "./CardGlyph";

export interface KenoRound {
  id: string;
  at: number;
  mode: KenoMode;
  drawn: number[];
  cards: { cardIndex: number; spots: number[]; catches: number; payout: number }[];
  totalWagered: number;
  totalReturn: number;
  capped: boolean;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  verification: KenoVerificationResult;
}

// ---------------------------------------------------------------------------
// Rules (incl. speed setting, RTP, max win, fairness explainer, tips replay)
// ---------------------------------------------------------------------------

interface RulesSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: KenoMode;
  speed: KenoSpeed;
  onSpeed: (s: KenoSpeed) => void;
  reduceMotion: boolean;
  onReplayTips: () => void;
  onHistory: () => void;
}

export function RulesSheet({ visible, onClose, mode, speed, onSpeed, reduceMotion, onReplayTips, onHistory }: RulesSheetProps) {
  const speeds: { value: KenoSpeed; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "fast", label: "Fast" },
    ...(RESTRICTED_PLAY ? [] : [{ value: "instant" as const, label: "Instant" }]),
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="How to play" subtitle={mode === "quad" ? "Midnight Keno ×4" : "Midnight Keno"} testID="keno-rules-sheet">
      <View style={styles.bullets}>
        <Bullet text="Mark 1 to 10 numbers on the board. Each marked number is a spot." />
        <Bullet text="20 of the 80 numbers are drawn. A drawn number you marked is a catch." />
        <Bullet text="Pays depend on how many spots you marked and how many you catch." />
        {mode === "quad" ? (
          <Bullet text="Up to 4 cards share one draw. Every card with numbers plays at the same bet. Two cards can't have exactly the same numbers." />
        ) : null}
        <Bullet text="Your numbers stay marked, so you can play them again." />
      </View>

      <View style={styles.block}>
        <AppText variant="overline">Draw speed</AppText>
        <SegmentedControl options={speeds} value={speed} onChange={onSpeed} testIDPrefix="keno-speed" />
        {reduceMotion ? (
          <AppText variant="caption">Reduce motion is on, so draws are shown all at once.</AppText>
        ) : (
          <AppText variant="caption">Tap the board during a draw to skip to the result.</AppText>
        )}
      </View>

      <View style={styles.block}>
        <AppText variant="overline">Pays (× bet, includes your bet)</AppText>
        <View style={styles.table}>
          <View style={[styles.tr, styles.th]}>
            <AppText style={[styles.cellSpots, styles.thText]}>Spots</AppText>
            <AppText style={[styles.cellPays, styles.thText]}>Catch : pays</AppText>
            <AppText style={[styles.cellRtp, styles.thText]}>RTP</AppText>
          </View>
          {Object.keys(PAYTABLE_X10).map((k) => {
            const spots = Number(k);
            return (
              <View key={k} style={styles.tr}>
                <AppText style={styles.cellSpots}>{spots}</AppText>
                <AppText style={styles.cellPays}>
                  {payRows(spots)
                    .slice()
                    .reverse()
                    .map((r) => `${r.catches}: ${formatMult(r.x10)}`)
                    .join("  ")}
                </AppText>
                <AppText style={styles.cellRtp}>{RTP_BY_SPOTS[spots]!.toFixed(1)}%</AppText>
              </View>
            );
          })}
        </View>
        <AppText variant="caption">
          Return to player {RTP_RANGE} depending on spots. Bets {BET_LEVELS.join(" / ")} coins per card. Max win{" "}
          {formatCoins(MAX_WIN)} coins per game.
        </AppText>
      </View>

      <View style={styles.block}>
        <AppText variant="overline">Provably fair</AppText>
        <AppText variant="bodySmall">
          Before you play, the game locks in a secret seed and shows you its fingerprint. After the draw it reveals the
          seed and your phone re-draws the 20 numbers itself. If they match, the draw was fair.
        </AppText>
      </View>

      <View style={styles.actions}>
        <Button label="Show tips" variant="secondary" size="sm" icon="bulb-outline" onPress={onReplayTips} testID="keno-replay-tips" />
        <Button label="History" variant="secondary" size="sm" icon="time-outline" onPress={onHistory} testID="keno-open-history" />
      </View>
    </Sheet>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.dot} />
      <AppText variant="bodySmall" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bet
// ---------------------------------------------------------------------------

interface BetSheetProps {
  visible: boolean;
  onClose: () => void;
  bet: number;
  onBet: (v: number) => void;
  mode: KenoMode;
  playedCards: number;
  balance: number;
}

export function BetSheet({ visible, onClose, bet, onBet, mode, playedCards, balance }: BetSheetProps) {
  const n = Math.max(1, playedCards);
  const max = BET_LEVELS[BET_LEVELS.length - 1]!;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Bet per card"
      subtitle={mode === "quad" ? `${n} card${n > 1 ? "s" : ""} × ${bet} = ${n * bet} coins` : `${bet} coins per draw`}
      testID="keno-bet-sheet"
    >
      <ChipRack values={[...BET_LEVELS]} value={bet} onChange={onBet} maxAffordable={Math.floor(balance / n)} />
      <Button label={`Bet max · ${max}`} variant="secondary" onPress={() => onBet(max)} testID="keno-bet-max" />
      <Button label="Done" onPress={onClose} testID="keno-bet-done" />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Quad card menu: copy from…, quick pick all, clear all
// ---------------------------------------------------------------------------

interface CardMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  active: number;
  cards: readonly (readonly number[])[];
  onCopyFrom: (from: number) => void;
  onQuickPickAll: () => void;
  onClearAll: () => void;
}

export function CardMenuSheet({ visible, onClose, active, cards, onCopyFrom, onQuickPickAll, onClearAll }: CardMenuSheetProps) {
  const cs = CARD_STYLES[active]!;
  return (
    <Sheet visible={visible} onClose={onClose} title={`Card ${cs.letter}`} subtitle="Card options" testID="keno-card-menu">
      <AppText variant="overline">Copy numbers from…</AppText>
      <View style={styles.copyRow}>
        {CARD_STYLES.map((s, i) =>
          i === active ? null : (
            <Pressable
              key={s.letter}
              disabled={cards[i]!.length === 0}
              onPress={() => onCopyFrom(i)}
              style={[styles.copyBtn, { borderColor: s.color }, cards[i]!.length === 0 && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={`Copy from card ${s.letter}${cards[i]!.length === 0 ? ", empty" : ""}`}
              testID={`keno-copy-${s.letter}`}
            >
              <CardGlyph glyph={s.glyph} color={s.color} size={10} />
              <AppText style={styles.copyText}>
                {s.letter} · {cards[i]!.length || "—"}
              </AppText>
            </Pressable>
          ),
        )}
      </View>
      <AppText variant="caption">Cards can't be identical — change at least one number after copying.</AppText>
      <Button label="Quick pick all cards" variant="secondary" icon="shuffle" onPress={onQuickPickAll} testID="keno-qp-all" />
      <Button label="Clear all cards" variant="ghost" icon="trash-outline" onPress={onClearAll} testID="keno-clear-all" />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Fairness + history
// ---------------------------------------------------------------------------

interface FairnessSheetProps {
  visible: boolean;
  onClose: () => void;
  round: KenoRound | null;
  nextCommitHash: string | null;
}

export function FairnessSheet({ visible, onClose, round, nextCommitHash }: FairnessSheetProps) {
  const ok = isKenoVerified(round?.verification);
  return (
    <Sheet visible={visible} onClose={onClose} title="Fair draw check" subtitle="Every draw is checked on your device" testID="keno-fair-sheet">
      {round ? (
        <Surface border={ok ? "gold" : "hairline"} style={styles.verdict}>
          <Ionicons name={ok ? "shield-checkmark" : "warning"} size={28} color={ok ? palette.emerald : palette.danger} />
          <View style={styles.flex}>
            <AppText variant="heading3">{ok ? "This draw was fair" : "Verification failed"}</AppText>
            <AppText variant="bodySmall">
              {ok
                ? "The revealed seed matches the fingerprint shown before you played, and your phone re-drew the same 20 numbers in the same order."
                : "Your phone could not reproduce this draw from the revealed seed. Please don't trust this draw and contact support."}
            </AppText>
          </View>
        </Surface>
      ) : (
        <Surface style={styles.verdict}>
          <Ionicons name="lock-closed" size={26} color={palette.gold} />
          <View style={styles.flex}>
            <AppText variant="heading3">Next draw is locked in</AppText>
            <AppText variant="bodySmall">
              The game has already committed to the seed for your next draw, before you pick numbers. Play, then come back
              to see it verified.
            </AppText>
          </View>
        </Surface>
      )}
      {round ? <SeedDetails round={round} /> : null}
      {nextCommitHash ? <Mono label="Next draw fingerprint" value={nextCommitHash} /> : null}
    </Sheet>
  );
}

function Mono({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mono}>
      <AppText variant="caption">{label}</AppText>
      <AppText style={styles.monoText} selectable>
        {value}
      </AppText>
    </View>
  );
}

function SeedDetails({ round }: { round: KenoRound }) {
  return (
    <View style={styles.seeds}>
      <Mono label="Server seed (revealed)" value={round.serverSeed} />
      <Mono label="Server seed fingerprint" value={round.serverSeedHash} />
      <Mono label="Client seed · nonce" value={`${round.clientSeed} · ${round.nonce}`} />
      <Mono label="Draw order" value={round.drawn.join(", ")} />
    </View>
  );
}

interface HistorySheetProps {
  visible: boolean;
  onClose: () => void;
  rounds: KenoRound[];
}

export function HistorySheet({ visible, onClose, rounds }: HistorySheetProps) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="History" subtitle="Your last 20 draws" testID="keno-history-sheet">
      {rounds.length === 0 ? (
        <AppText variant="bodySmall">No draws yet this session.</AppText>
      ) : (
        rounds.map((r) => {
          const { kind, text } = resultCopy(r.totalReturn, r.totalWagered);
          const ok = isKenoVerified(r.verification);
          const expanded = open === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => setOpen(expanded ? null : r.id)}
              style={styles.histRow}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${new Date(r.at).toLocaleTimeString()}. ${text}. ${ok ? "Verified fair" : "Not verified"}`}
            >
              <View style={styles.histHead}>
                <AppText style={[styles.histMain, kind === "win" && { color: palette.gold }]} numberOfLines={1}>
                  {text}
                </AppText>
                <Badge label={ok ? "Fair" : "Check"} tone={ok ? "success" : "danger"} icon={ok ? "shield-checkmark" : "warning"} />
              </View>
              {r.cards.map((c) => (
                <AppText key={c.cardIndex} variant="caption">
                  {r.mode === "quad" ? `${CARD_STYLES[c.cardIndex]?.letter ?? "?"} · ` : ""}
                  {cardResultCopy(c.catches, c.spots.length, c.payout)} · {c.spots.join(" ")}
                </AppText>
              ))}
              {expanded ? <SeedDetails round={r} /> : null}
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bullets: { gap: spacing.xs },
  bullet: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.gold, marginTop: 8 },
  block: { gap: spacing.sm },
  table: { borderRadius: radius.sm, borderWidth: 1, borderColor: palette.hairline, overflow: "hidden" },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  th: { backgroundColor: palette.surface, borderTopWidth: 0 },
  thText: { fontFamily: fonts.bold, color: palette.textDim, fontSize: 11 },
  cellSpots: { width: 40, fontFamily: fonts.bold, fontSize: 12, color: palette.text },
  cellPays: { flex: 1, fontFamily: fonts.medium, fontSize: 11, color: palette.goldLight },
  cellRtp: { width: 48, textAlign: "right", fontFamily: fonts.medium, fontSize: 11, color: palette.textDim },
  actions: { flexDirection: "row", gap: spacing.sm },
  copyRow: { flexDirection: "row", gap: spacing.sm },
  copyBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: palette.surface,
  },
  copyText: { fontFamily: fonts.bold, fontSize: 13, color: palette.text },
  disabled: { opacity: 0.35 },
  verdict: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  seeds: { gap: spacing.sm },
  mono: { gap: 2 },
  monoText: { fontFamily: "monospace", fontSize: 11, color: palette.textDim },
  histRow: {
    gap: 3,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  histHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  histMain: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: palette.text },
});
