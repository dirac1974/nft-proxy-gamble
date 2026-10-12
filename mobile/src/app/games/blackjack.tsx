import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, radius, spacing } from "@/theme";
import { useWalletStore } from "@/stores/walletStore";
import {
  balanceApi,
  blackjackApi,
  type BlackjackActionName,
  type BlackjackRound,
} from "@/services/api";
import { verifyBlackjackDeal, type BlackjackVerificationResult } from "@/services/provablyFair";

const CHIPS = [5, 25, 100, 250];

type Session = { sessionId: string; serverSeedHash: string; clientSeed: string; numDecks: number };

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♣", "♦", "♥", "♠"];

function cardLabel(card: number): { rank: string; suit: string; red: boolean } {
  const rank = RANKS[card % 13];
  const suitIdx = Math.floor(card / 13) % 4;
  return { rank, suit: SUITS[suitIdx], red: suitIdx === 1 || suitIdx === 2 };
}

function Card({ card, hidden }: { card?: number; hidden?: boolean }) {
  if (hidden || card === undefined) {
    return (
      <View style={[styles.card, styles.cardBack]}>
        <Text style={styles.cardBackText}>★</Text>
      </View>
    );
  }
  const { rank, suit, red } = cardLabel(card);
  return (
    <View style={styles.card}>
      <Text style={[styles.cardText, red ? styles.cardRed : styles.cardBlack]}>{rank}</Text>
      <Text style={[styles.cardSuit, red ? styles.cardRed : styles.cardBlack]}>{suit}</Text>
    </View>
  );
}

const ACTION_LABEL: Record<BlackjackActionName, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
};

export default function BlackjackScreen() {
  const qc = useQueryClient();
  const { isAuthenticated } = useWalletStore();
  const { data: balance } = useQuery({ queryKey: ["balance"], queryFn: balanceApi.get, enabled: isAuthenticated });

  const [session, setSession] = useState<Session | null>(null);
  const [chip, setChip] = useState(25);
  const [round, setRound] = useState<BlackjackRound | null>(null);
  const [verification, setVerification] = useState<BlackjackVerificationResult | null>(null);

  const startMutation = useMutation({
    mutationFn: () => blackjackApi.startSession(),
    onSuccess: (d) =>
      setSession({ sessionId: d.sessionId, serverSeedHash: d.serverSeedHash, clientSeed: d.clientSeed, numDecks: d.numDecks }),
  });
  const startRound = startMutation.mutate;

  // Commit a fresh session before the bet exists (provably fair).
  useEffect(() => {
    if (isAuthenticated && !session && !startMutation.isPending) startRound();
  }, [isAuthenticated, session, startMutation.isPending, startRound]);

  // Verify the round on-device once it settles + the serverSeed is revealed.
  const onRound = useCallback(
    (r: BlackjackRound) => {
      setRound(r);
      qc.invalidateQueries({ queryKey: ["balance"] });
      if (r.phase === "settled" && r.serverSeed && r.numDecks && session) {
        setVerification(
          verifyBlackjackDeal(
            r.serverSeed,
            r.serverSeedHash,
            r.clientSeed,
            r.numDecks,
            r.hands[0]?.cards ?? [],
            r.dealer,
          ),
        );
      }
    },
    [qc, session],
  );

  const dealMutation = useMutation({
    mutationFn: () => blackjackApi.deal(session!.sessionId, chip),
    onSuccess: onRound,
  });
  const actionMutation = useMutation({
    mutationFn: (action: BlackjackActionName) => blackjackApi.action(session!.sessionId, action),
    onSuccess: onRound,
  });
  const insuranceMutation = useMutation({
    mutationFn: (take: boolean) => blackjackApi.insurance(session!.sessionId, take),
    onSuccess: onRound,
  });

  const newRound = useCallback(() => {
    setRound(null);
    setVerification(null);
    setSession(null); // triggers a fresh committed session
  }, []);

  if (!isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Connect your wallet to play blackjack.</Text>
      </View>
    );
  }

  const busy = dealMutation.isPending || actionMutation.isPending || insuranceMutation.isPending;
  const inRound = round !== null && round.phase !== "settled";
  const settled = round?.phase === "settled";

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <View style={styles.headerRow}>
        <Text style={styles.balance}>Balance: {balance ?? "—"} coins</Text>
        {session ? (
          <Text style={styles.commit} numberOfLines={1}>
            Seed: {session.serverSeedHash.slice(0, 12)}…
          </Text>
        ) : (
          <ActivityIndicator color={colors.neonGreen} />
        )}
      </View>

      {/* Dealer */}
      <Text style={styles.label}>Dealer {round ? `(${round.dealerHoleHidden ? "?" : round.dealerValue})` : ""}</Text>
      <View style={styles.cardRow}>
        {round ? (
          <>
            {round.dealer.map((c, i) => (
              <Card key={i} card={c} />
            ))}
            {round.dealerHoleHidden && <Card hidden />}
          </>
        ) : (
          <Text style={styles.muted}>—</Text>
        )}
      </View>

      {/* Player hands */}
      {round?.hands.map((h, i) => (
        <View key={i} style={[styles.handBlock, i === round.active && inRound && styles.handActive]}>
          <Text style={styles.label}>
            Hand {round.hands.length > 1 ? i + 1 : ""} ({h.value}
            {h.soft ? " soft" : ""}) · bet {h.bet}
            {h.busted ? " · BUST" : ""}
          </Text>
          <View style={styles.cardRow}>
            {h.cards.map((c, j) => (
              <Card key={j} card={c} />
            ))}
          </View>
          {settled && round.results?.[i] && (
            <Text style={round.results[i].ret >= round.results[i].bet ? styles.win : styles.lose}>
              {round.results[i].outcome.toUpperCase()}
            </Text>
          )}
        </View>
      ))}

      {/* Betting / actions */}
      {!round && (
        <View style={styles.panel}>
          <Text style={styles.label}>Chip</Text>
          <View style={styles.chipRow}>
            {CHIPS.map((c) => (
              <Pressable key={c} style={[styles.chip, chip === c && styles.chipActive]} onPress={() => setChip(c)}>
                <Text style={[styles.chipText, chip === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.primaryBtn, (!session || busy) && styles.btnDisabled]}
            disabled={!session || busy}
            onPress={() => dealMutation.mutate()}
          >
            <Text style={styles.primaryBtnText}>Deal ({chip})</Text>
          </Pressable>
        </View>
      )}

      {round?.phase === "insurance" && (
        <View style={styles.panel}>
          <Text style={styles.label}>Dealer shows an Ace — insurance?</Text>
          <View style={styles.actionRow}>
            <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} disabled={busy} onPress={() => insuranceMutation.mutate(true)}>
              <Text style={styles.actionBtnText}>Take insurance</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} disabled={busy} onPress={() => insuranceMutation.mutate(false)}>
              <Text style={styles.actionBtnText}>No</Text>
            </Pressable>
          </View>
        </View>
      )}

      {round?.phase === "player" && (
        <View style={styles.actionRow}>
          {round.legalActions.map((a) => (
            <Pressable
              key={a}
              style={[styles.actionBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => actionMutation.mutate(a)}
            >
              <Text style={styles.actionBtnText}>{ACTION_LABEL[a]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {settled && (
        <View style={styles.panel}>
          <Text style={round!.netProfit! >= 0 ? styles.win : styles.lose}>
            {round!.netProfit! >= 0 ? `+${round!.netProfit}` : `${round!.netProfit}`} coins
          </Text>
          {verification && (
            <Text style={verification.seedHashMatches && verification.cardsMatch ? styles.verifyOk : styles.verifyBad}>
              {verification.seedHashMatches && verification.cardsMatch
                ? "✓ Provably fair: verified on-device"
                : "✗ Verification FAILED — do not trust this result"}
            </Text>
          )}
          <Pressable style={styles.primaryBtn} onPress={newRound}>
            <Text style={styles.primaryBtnText}>New round</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  balance: { color: colors.neonGreen, fontSize: 16, fontWeight: "700" },
  commit: { color: colors.textMuted, fontSize: 12, maxWidth: "50%" },
  muted: { color: colors.textMuted },
  label: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, marginBottom: spacing.xs },
  cardRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  card: {
    width: 46,
    height: 64,
    backgroundColor: "#fff",
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBack: { backgroundColor: colors.surfaceElevated, borderColor: colors.neonGreenDim },
  cardBackText: { color: colors.neonGreenDim, fontSize: 20 },
  cardText: { fontSize: 18, fontWeight: "800" },
  cardSuit: { fontSize: 16 },
  cardRed: { color: "#d11" },
  cardBlack: { color: "#111" },
  handBlock: { padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm },
  handActive: { borderWidth: 1, borderColor: colors.neonGreen, backgroundColor: colors.surface },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md, alignItems: "center" },
  chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { borderColor: colors.neonGreen, backgroundColor: colors.surfaceElevated },
  chipText: { color: colors.textSecondary, fontWeight: "700" },
  chipTextActive: { color: colors.neonGreen },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md, justifyContent: "center" },
  actionBtn: { backgroundColor: colors.surfaceElevated, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.neonGreenDim },
  actionBtnText: { color: colors.neonGreen, fontWeight: "700" },
  primaryBtn: { backgroundColor: colors.neonGreen, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.md, marginTop: spacing.sm },
  primaryBtnText: { color: colors.background, fontWeight: "800" },
  btnDisabled: { opacity: 0.4 },
  win: { color: colors.win, fontWeight: "800", fontSize: 16 },
  lose: { color: colors.lose, fontWeight: "800", fontSize: 16 },
  verifyOk: { color: colors.win, marginTop: spacing.sm, fontSize: 12 },
  verifyBad: { color: colors.lose, marginTop: spacing.sm, fontSize: 12 },
});
