import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, radius, spacing } from "@/theme";
import { useWalletStore } from "@/stores/walletStore";
import {
  balanceApi,
  rouletteApi,
  type RouletteBet,
  type RouletteSpinResult,
} from "@/services/api";
import { verifyRouletteSpin, type RouletteVerificationResult } from "@/services/provablyFair";

const CHIPS = [1, 5, 25, 100];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const MAX_TOTAL_WAGER = 1000; // mirror backend

type Session = { sessionId: string; serverSeedHash: string; clientSeed: string };

// A short human label for a placed bet.
function betLabel(b: RouletteBet): string {
  if (b.type === "straight") return `#${b.numbers?.[0]}`;
  if (b.type === "dozen") return `Dozen ${b.value}`;
  if (b.type === "column") return `Col ${b.value}`;
  return b.type[0].toUpperCase() + b.type.slice(1);
}

export default function RouletteScreen() {
  const qc = useQueryClient();
  const { isAuthenticated } = useWalletStore();

  const { data: balance } = useQuery({ queryKey: ["balance"], queryFn: balanceApi.get, enabled: isAuthenticated });

  const [session, setSession] = useState<Session | null>(null);
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [result, setResult] = useState<RouletteSpinResult | null>(null);
  const [verification, setVerification] = useState<RouletteVerificationResult | null>(null);

  const totalWager = useMemo(() => bets.reduce((s, b) => s + b.amount, 0), [bets]);

  const startMutation = useMutation({
    mutationFn: () => rouletteApi.startSession(),
    onSuccess: (d) => setSession({ sessionId: d.sessionId, serverSeedHash: d.serverSeedHash, clientSeed: d.clientSeed }),
  });
  const startRound = startMutation.mutate;

  // Start a fresh session (commit phase) before the player places any bets, so
  // the serverSeed is committed before the bets exist (provably fair).
  useEffect(() => {
    if (isAuthenticated && !session && !startMutation.isPending) startRound();
  }, [isAuthenticated, session, startMutation.isPending, startRound]);

  const spinMutation = useMutation({
    mutationFn: () => rouletteApi.spin(session!.sessionId, bets),
    onSuccess: (r) => {
      setResult(r);
      // Independently verify the outcome on-device and surface the result.
      setVerification(
        verifyRouletteSpin(r.serverSeed, r.serverSeedHash, r.clientSeed, r.nonce, r.winningNumber),
      );
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
  });

  const addBet = useCallback(
    (bet: Omit<RouletteBet, "amount">) => {
      if (result) return; // round already resolved
      if (totalWager + chip > MAX_TOTAL_WAGER) return;
      setBets((prev) => [...prev, { ...bet, amount: chip }]);
    },
    [chip, result, totalWager],
  );

  const nextRound = useCallback(() => {
    setBets([]);
    setResult(null);
    setVerification(null);
    setSession(null); // triggers the effect to start a fresh committed session
  }, []);

  const clearBets = useCallback(() => setBets([]), []);

  if (!isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Connect your wallet to play roulette.</Text>
      </View>
    );
  }

  const canSpin = !!session && bets.length > 0 && !result && !spinMutation.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <View style={styles.headerRow}>
        <Text style={styles.balance}>Balance: {balance ?? "—"} coins</Text>
        <Text style={styles.muted}>Wager: {totalWager}</Text>
      </View>

      {/* Result / winning number */}
      {result ? (
        <View style={[styles.resultCard, { borderColor: pocketBorder(result.color) }]}>
          <Text style={styles.winNum}>{result.winningNumber}</Text>
          <Text style={[styles.winColor, { color: pocketBorder(result.color) }]}>{result.color.toUpperCase()}</Text>
          <Text style={result.netProfit >= 0 ? styles.win : styles.lose}>
            {result.netProfit >= 0 ? `+${result.netProfit}` : `${result.netProfit}`} coins
          </Text>
          {verification && (
            <Text style={verification.seedHashMatches && verification.numberMatches ? styles.verifyOk : styles.verifyBad}>
              {verification.seedHashMatches && verification.numberMatches
                ? "✓ Provably fair: verified on-device"
                : "✗ Verification FAILED — do not trust this result"}
            </Text>
          )}
          <Pressable style={styles.primaryBtn} onPress={nextRound}>
            <Text style={styles.primaryBtnText}>New round</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.resultCard}>
          <Text style={styles.muted}>Place your bets, then spin.</Text>
          {session ? (
            <Text style={styles.commit} numberOfLines={1}>
              Committed seed: {session.serverSeedHash.slice(0, 18)}…
            </Text>
          ) : (
            <ActivityIndicator color={colors.neonGreen} />
          )}
        </View>
      )}

      {/* Chip selector */}
      <Text style={styles.sectionLabel}>Chip</Text>
      <View style={styles.row}>
        {CHIPS.map((c) => (
          <Pressable key={c} onPress={() => setChip(c)} style={[styles.chip, chip === c && styles.chipActive]}>
            <Text style={[styles.chipText, chip === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {/* Even-money + dozens/columns */}
      <Text style={styles.sectionLabel}>Outside bets</Text>
      <View style={styles.grid}>
        <BetButton label="Red" color={colors.lose} onPress={() => addBet({ type: "red" })} disabled={!!result} />
        <BetButton label="Black" onPress={() => addBet({ type: "black" })} disabled={!!result} />
        <BetButton label="Odd" onPress={() => addBet({ type: "odd" })} disabled={!!result} />
        <BetButton label="Even" onPress={() => addBet({ type: "even" })} disabled={!!result} />
        <BetButton label="1-18" onPress={() => addBet({ type: "low" })} disabled={!!result} />
        <BetButton label="19-36" onPress={() => addBet({ type: "high" })} disabled={!!result} />
        <BetButton label="1st 12" onPress={() => addBet({ type: "dozen", value: 1 })} disabled={!!result} />
        <BetButton label="2nd 12" onPress={() => addBet({ type: "dozen", value: 2 })} disabled={!!result} />
        <BetButton label="3rd 12" onPress={() => addBet({ type: "dozen", value: 3 })} disabled={!!result} />
        <BetButton label="Col 1" onPress={() => addBet({ type: "column", value: 1 })} disabled={!!result} />
        <BetButton label="Col 2" onPress={() => addBet({ type: "column", value: 2 })} disabled={!!result} />
        <BetButton label="Col 3" onPress={() => addBet({ type: "column", value: 3 })} disabled={!!result} />
      </View>

      {/* Straight numbers 0-36 */}
      <Text style={styles.sectionLabel}>Straight up (35:1)</Text>
      <View style={styles.numberGrid}>
        {Array.from({ length: 37 }, (_, n) => (
          <Pressable
            key={n}
            disabled={!!result}
            onPress={() => addBet({ type: "straight", numbers: [n] })}
            style={[styles.numCell, { backgroundColor: n === 0 ? colors.neonGreenDim : RED.has(n) ? "#5c1a1a" : "#1c1c1c" }]}
          >
            <Text style={styles.numText}>{n}</Text>
          </Pressable>
        ))}
      </View>

      {/* Placed bets */}
      {bets.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Placed bets ({bets.length})</Text>
          <View style={styles.grid}>
            {bets.map((b, i) => (
              <View key={i} style={styles.betChip}>
                <Text style={styles.betChipText}>{betLabel(b)} · {b.amount}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.row}>
        <Pressable style={[styles.secondaryBtn, (!bets.length || !!result) && styles.disabled]} disabled={!bets.length || !!result} onPress={clearBets}>
          <Text style={styles.secondaryBtnText}>Clear</Text>
        </Pressable>
        <Pressable style={[styles.primaryBtn, !canSpin && styles.disabled]} disabled={!canSpin} onPress={() => spinMutation.mutate()}>
          {spinMutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryBtnText}>Spin</Text>
          )}
        </Pressable>
      </View>

      {spinMutation.isError && (
        <Text style={styles.lose}>{(spinMutation.error as Error).message}</Text>
      )}
    </ScrollView>
  );
}

function BetButton({ label, onPress, color, disabled }: { label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.betBtn, color ? { borderColor: color } : null, disabled && styles.disabled]}>
      <Text style={styles.betBtnText}>{label}</Text>
    </Pressable>
  );
}

function pocketBorder(color: "red" | "black" | "green"): string {
  if (color === "red") return colors.lose;
  if (color === "green") return colors.neonGreen;
  return colors.textSecondary;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  balance: { color: colors.neonGreen, fontWeight: "700", fontSize: 16 },
  muted: { color: colors.textMuted },
  commit: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs, fontFamily: "monospace" },
  sectionLabel: { color: colors.textSecondary, fontWeight: "600", marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.neonGreen, backgroundColor: colors.surfaceElevated },
  chipText: { color: colors.textSecondary, fontWeight: "700" },
  chipTextActive: { color: colors.neonGreen },
  betBtn: { minWidth: 92, alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  betBtnText: { color: colors.textPrimary, fontWeight: "600" },
  numberGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  numCell: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  numText: { color: colors.textPrimary, fontWeight: "700" },
  betChip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  betChipText: { color: colors.textSecondary, fontSize: 12 },
  resultCard: { alignItems: "center", padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: spacing.md },
  winNum: { color: colors.textPrimary, fontSize: 48, fontWeight: "800" },
  winColor: { fontWeight: "700", marginBottom: spacing.xs },
  win: { color: colors.win, fontWeight: "700", fontSize: 18 },
  lose: { color: colors.lose, fontWeight: "700", fontSize: 18 },
  verifyOk: { color: colors.win, marginTop: spacing.sm, fontSize: 12 },
  verifyBad: { color: colors.lose, marginTop: spacing.sm, fontSize: 12, fontWeight: "700" },
  primaryBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.neonGreen, marginTop: spacing.md },
  primaryBtnText: { color: colors.background, fontWeight: "800" },
  secondaryBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  secondaryBtnText: { color: colors.textSecondary, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
