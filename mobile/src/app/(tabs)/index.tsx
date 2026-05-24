import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useWalletConnectModal } from "@walletconnect/modal-react-native";
import { colors, radius, spacing, typography, shadows } from "@/theme";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { GlassCard } from "@/components/GlassCard";
import { useWalletStore } from "@/stores/walletStore";
import { useGameStore } from "@/stores/gameStore";
import { balanceApi } from "@/services/api";
import { signAndAuthenticate, setWalletClient } from "@/services/walletService";
import type { Address } from "viem";

export default function LobbyScreen() {
  const { address, isConnected, provider, open } = useWalletConnectModal();
  const { isAuthenticated, disconnect } = useWalletStore();
  const setBalance = useGameStore((s) => s.setBalance);
  const [authError, setAuthError] = useState<string | null>(null);

  const { data: balanceData } = useQuery({
    queryKey: ["balance"],
    queryFn: balanceApi.get,
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (typeof balanceData === "number") setBalance(balanceData);
  }, [balanceData, setBalance]);

  useEffect(() => {
    if (isConnected && provider && address && !isAuthenticated) {
      setAuthError(null);
      setWalletClient(provider);
      signAndAuthenticate(address as Address).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Authentication failed";
        setAuthError(message);
      });
    }
  }, [isConnected, provider, address, isAuthenticated]);

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>NFT PROXY</Text>
        <Text style={styles.heroSubtitle}>GAMBLE</Text>
        <Text style={styles.heroTagline}>Play → Win → Own</Text>
      </View>

      {/* Wallet / Balance */}
      {isAuthenticated ? (
        <View style={styles.section}>
          <BalanceDisplay />
          <Text style={styles.walletAddress}>{shortAddress}</Text>
        </View>
      ) : (
        <GlassCard style={styles.connectCard}>
          <Text style={styles.connectTitle}>Connect Your Wallet</Text>
          <Text style={styles.connectBody}>
            Link your Polygon wallet to save progress and cash out NFT vouchers.
          </Text>
          {authError && (
            <Text style={styles.authError} accessibilityRole="alert">
              {authError}
            </Text>
          )}
          <Pressable
            style={styles.primaryButton}
            onPress={() => open()}
            accessibilityRole="button"
            accessibilityLabel="Connect wallet via WalletConnect"
          >
            <Text style={styles.primaryButtonText}>Connect Wallet</Text>
          </Pressable>
        </GlassCard>
      )}

      {/* Game selector */}
      <Text style={styles.sectionHeader}>GAMES</Text>

      <Pressable
        onPress={() => router.push("/(tabs)/play")}
        accessibilityRole="button"
        accessibilityLabel="Play Video Poker — 9/6 Jacks or Better"
        style={({ pressed }) => [
          styles.gameCard,
          pressed && styles.gameCardPressed,
        ]}>
        <View style={styles.gameCardInner}>
          <Text style={styles.gameEmoji}>🃏</Text>
          <View style={styles.gameInfo}>
            <Text style={styles.gameTitle}>Video Poker</Text>
            <Text style={styles.gameSubtitle}>9/6 Jacks or Better</Text>
            <View style={styles.gameBadgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>RTP 99.54%</Text>
              </View>
              <View style={[styles.badge, styles.badgePurple]}>
                <Text style={styles.badgeText}>1–5 coins/hand</Text>
              </View>
            </View>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      {/* Paytable teaser */}
      <GlassCard style={styles.paytableCard}>
        <Text style={styles.paytableTitle}>PAYTABLE HIGHLIGHTS</Text>
        {PAYTABLE_ROWS.map(({ hand, mult }) => (
          <View key={hand} style={styles.paytableRow}>
            <Text style={styles.paytableHand}>{hand}</Text>
            <Text style={styles.paytableMult}>{mult}×</Text>
          </View>
        ))}
      </GlassCard>

      {/* Disconnect */}
      {isAuthenticated && (
        <Pressable
          onPress={async () => { await disconnect(); }}
          style={styles.disconnectButton}
          accessibilityRole="button"
          accessibilityLabel="Disconnect wallet and clear session"
        >
          <Text style={styles.disconnectText}>Disconnect Wallet</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const PAYTABLE_ROWS = [
  { hand: "Royal Flush", mult: 800 },
  { hand: "Straight Flush", mult: 50 },
  { hand: "Four of a Kind", mult: 25 },
  { hand: "Full House", mult: 9 },
  { hand: "Flush", mult: 6 },
  { hand: "Jacks or Better", mult: 1 },
];

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  hero: { alignItems: "center", paddingVertical: spacing.xl },
  heroTitle: { fontSize: 42, fontWeight: "900", color: colors.neonGreen, letterSpacing: 4 },
  heroSubtitle: { fontSize: 42, fontWeight: "900", color: colors.textPrimary, letterSpacing: 4 },
  heroTagline: { ...typography.bodySmall, letterSpacing: 2, marginTop: spacing.sm },

  section: { gap: spacing.sm, alignItems: "center" },
  walletAddress: { ...typography.mono, color: colors.textMuted },

  connectCard: { gap: spacing.md },
  connectTitle: { ...typography.heading3 },
  connectBody: { ...typography.bodySmall },
  authError: { ...typography.bodySmall, color: colors.lose },
  primaryButton: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...shadows.purple,
  },
  primaryButtonText: { ...typography.body, fontWeight: "700" },

  sectionHeader: {
    ...typography.caption,
    letterSpacing: 3,
    color: colors.textMuted,
  },

  gameCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  gameCardPressed: { opacity: 0.8 },
  gameCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  gameEmoji: { fontSize: 40 },
  gameInfo: { flex: 1, gap: spacing.xs },
  gameTitle: { ...typography.heading3 },
  gameSubtitle: { ...typography.bodySmall },
  gameBadgeRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  badge: {
    backgroundColor: `${colors.neonGreen}22`,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: `${colors.neonGreen}44`,
  },
  badgePurple: {
    backgroundColor: `${colors.purple}33`,
    borderColor: `${colors.purple}66`,
  },
  badgeText: { ...typography.caption, color: colors.neonGreen, fontWeight: "600" },
  chevron: { fontSize: 24, color: colors.textMuted },

  paytableCard: { gap: spacing.xs },
  paytableTitle: { ...typography.caption, letterSpacing: 2, marginBottom: spacing.xs },
  paytableRow: { flexDirection: "row", justifyContent: "space-between" },
  paytableHand: { ...typography.bodySmall },
  paytableMult: { ...typography.bodySmall, color: colors.neonGreen, fontWeight: "700" },

  disconnectButton: { alignItems: "center", paddingVertical: spacing.sm },
  disconnectText: { ...typography.bodySmall, color: colors.lose },
});
