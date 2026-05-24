import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors, radius, spacing, typography, shadows } from "@/theme";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { GlassCard } from "@/components/GlassCard";
import { ConnectWalletSheet } from "@/components/ConnectWalletSheet";
import { NetworkBanner } from "@/components/NetworkBanner";
import { IAPSheet } from "@/components/IAPSheet";
import { useWalletStore } from "@/stores/walletStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { useGameStore } from "@/stores/gameStore";
import { balanceApi } from "@/services/api";
import { initIAP, teardownIAP } from "@/services/iapService";

export default function LobbyScreen() {
  const { isAuthenticated } = useWalletStore();
  const { disconnect, shortAddress } = useWalletConnect();
  const setBalance = useGameStore((s) => s.setBalance);
  const [iapVisible, setIapVisible] = useState(false);

  const { data: balanceData } = useQuery({
    queryKey: ["balance"],
    queryFn: balanceApi.get,
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (balanceData) setBalance(balanceData.coinBalance);
  }, [balanceData, setBalance]);

  // Init IAP when user is authenticated; tear down on unmount
  useEffect(() => {
    if (!isAuthenticated) return;
    void initIAP();
    return () => { teardownIAP(); };
  }, [isAuthenticated]);

  return (
    <>
      <NetworkBanner />
      <IAPSheet visible={iapVisible} onClose={() => setIapVisible(false)} />
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
            <Pressable
              onPress={() => setIapVisible(true)}
              style={styles.buyCoinsButton}
              accessibilityRole="button"
              accessibilityLabel="Buy coins"
            >
              <Text style={styles.buyCoinsText}>+ Buy Coins</Text>
            </Pressable>
          </View>
        ) : (
          <ConnectWalletSheet />
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
          ]}
        >
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
            onPress={disconnect}
            style={styles.disconnectButton}
            accessibilityRole="button"
            accessibilityLabel="Disconnect wallet and clear session"
          >
            <Text style={styles.disconnectText}>Disconnect Wallet</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
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
  buyCoinsButton: {
    borderWidth: 1,
    borderColor: colors.neonGreen,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  buyCoinsText: { ...typography.bodySmall, color: colors.neonGreen, fontWeight: "700" },

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
