import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { colors, gradients, radius, spacing, typography, shadows } from "@/theme";
import { GradientBackground, NeonButton, haptic } from "@/components/ui";
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
    if (typeof balanceData === "number") setBalance(balanceData);
  }, [balanceData, setBalance]);

  // Init IAP when user is authenticated; tear down on unmount
  useEffect(() => {
    if (!isAuthenticated) return;
    void initIAP();
    return () => { teardownIAP(); };
  }, [isAuthenticated]);

  const openBuyCoins = () => {
    haptic("medium");
    setIapVisible(true);
  };

  const openPlay = () => {
    haptic("select");
    router.push("/(tabs)/play");
  };

  return (
    <GradientBackground>
      <NetworkBanner />
      <IAPSheet visible={iapVisible} onClose={() => setIapVisible(false)} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero} accessibilityRole="header">
          <View style={styles.heroCrest}>
            <LinearGradient
              colors={gradients.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCrestInner}
            >
              <MaterialCommunityIcons name="cards-playing-spade-multiple" size={26} color="#2a1500" />
            </LinearGradient>
          </View>

          <Text style={styles.heroTitle} accessibilityLabel="NFT Proxy Gamble">
            NFT PROXY
          </Text>
          <Text style={styles.heroSubtitle}>GAMBLE</Text>

          <View style={styles.taglinePill}>
            <Text style={styles.taglineWord}>Play</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.neonGreen} />
            <Text style={styles.taglineWord}>Win</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.gold} />
            <Text style={[styles.taglineWord, styles.taglineOwn]}>Own</Text>
          </View>
        </View>

        {/* Wallet / Balance */}
        {isAuthenticated ? (
          <GlassCard style={styles.walletCard}>
            <BalanceDisplay />

            <View style={styles.walletRow}>
              <View style={styles.walletAddressChip}>
                <Ionicons name="wallet-outline" size={14} color={colors.neonGreen} />
                <Text style={styles.walletAddress} numberOfLines={1}>
                  {shortAddress}
                </Text>
              </View>

              <NeonButton
                label="Buy Coins"
                variant="gold"
                size="sm"
                onPress={openBuyCoins}
                haptics={null}
                accessibilityLabel="Buy coins"
                icon={<Ionicons name="add-circle" size={16} color="#2a1500" />}
              />
            </View>
          </GlassCard>
        ) : (
          <ConnectWalletSheet />
        )}

        {/* Game selector */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>GAMES</Text>
          <View style={styles.sectionRule} />
        </View>

        <Pressable
          onPress={openPlay}
          accessibilityRole="button"
          accessibilityLabel="Play Video Poker — 9/6 Jacks or Better. RTP 99.54 percent, 1 to 5 coins per hand"
          style={({ pressed }) => [
            styles.gameCard,
            shadows.purple,
            pressed && styles.gameCardPressed,
          ]}
        >
          <LinearGradient
            colors={gradients.glassHighlight}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gameCardInner}
          >
            <LinearGradient
              colors={gradients.purpleBright}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gameIconBadge}
            >
              <MaterialCommunityIcons
                name="cards-playing-outline"
                size={30}
                color={colors.textPrimary}
              />
            </LinearGradient>

            <View style={styles.gameInfo}>
              <Text style={styles.gameTitle}>Video Poker</Text>
              <Text style={styles.gameSubtitle}>9/6 Jacks or Better</Text>
              <View style={styles.gameBadgeRow}>
                <View style={styles.badge}>
                  <Ionicons name="trending-up" size={11} color={colors.neonGreen} />
                  <Text style={styles.badgeText}>RTP 99.54%</Text>
                </View>
                <View style={[styles.badge, styles.badgePurple]}>
                  <MaterialCommunityIcons name="poker-chip" size={11} color={colors.purpleGlow} />
                  <Text style={[styles.badgeText, styles.badgeTextPurple]}>1–5 coins/hand</Text>
                </View>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </LinearGradient>
        </Pressable>

        {/* Paytable teaser */}
        <GlassCard style={styles.paytableCard}>
          <View style={styles.paytableHeaderRow}>
            <MaterialCommunityIcons name="trophy-variant" size={16} color={colors.gold} />
            <Text style={styles.paytableTitle}>PAYTABLE HIGHLIGHTS</Text>
          </View>
          {PAYTABLE_ROWS.map(({ hand, mult }) => (
            <View key={hand} style={styles.paytableRow}>
              <Text style={styles.paytableHand}>{hand}</Text>
              <Text style={styles.paytableMult}>{mult}×</Text>
            </View>
          ))}
        </GlassCard>

        {/* Disconnect */}
        {isAuthenticated && (
          <NeonButton
            label="Disconnect Wallet"
            variant="ghost"
            size="sm"
            onPress={disconnect}
            haptics="light"
            style={styles.disconnectButton}
            accessibilityLabel="Disconnect wallet and clear session"
            icon={<Ionicons name="log-out-outline" size={16} color={colors.neonGreen} />}
          />
        )}
      </ScrollView>
    </GradientBackground>
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
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  // Hero
  hero: { alignItems: "center", paddingTop: spacing.lg, paddingBottom: spacing.md },
  heroCrest: {
    marginBottom: spacing.md,
    borderRadius: radius.full,
    ...shadows.gold,
  },
  heroCrestInner: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 44,
    fontWeight: "900",
    color: colors.neonGreen,
    letterSpacing: 5,
    textShadowColor: colors.neonGreen,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  heroSubtitle: {
    fontSize: 44,
    fontWeight: "900",
    color: colors.textPrimary,
    letterSpacing: 9,
    marginTop: -spacing.xs,
    textShadowColor: colors.purpleGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  taglinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  taglineWord: {
    ...typography.overline,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  taglineOwn: { color: colors.gold },

  // Wallet card
  walletCard: { gap: spacing.md },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  walletAddressChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: `${colors.neonGreen}12`,
    borderWidth: 1,
    borderColor: `${colors.neonGreen}33`,
  },
  walletAddress: { ...typography.mono, color: colors.textSecondary, flexShrink: 1 },

  // Section header
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  sectionHeader: { ...typography.overline, letterSpacing: 3, color: colors.textMuted },
  sectionRule: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },

  // Game card
  gameCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  gameCardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  gameCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  gameIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.purple,
  },
  gameInfo: { flex: 1, gap: spacing.xs },
  gameTitle: { ...typography.heading3 },
  gameSubtitle: { ...typography.bodySmall },
  gameBadgeRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs, flexWrap: "wrap" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${colors.neonGreen}22`,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${colors.neonGreen}44`,
  },
  badgePurple: {
    backgroundColor: `${colors.purple}33`,
    borderColor: `${colors.purple}66`,
  },
  badgeText: { ...typography.caption, color: colors.neonGreen, fontWeight: "700" },
  badgeTextPurple: { color: colors.purpleGlow },

  // Paytable
  paytableCard: { gap: spacing.xs },
  paytableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  paytableTitle: { ...typography.overline, letterSpacing: 2, color: colors.textSecondary },
  paytableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  paytableHand: { ...typography.bodySmall },
  paytableMult: { ...typography.bodySmall, color: colors.gold, fontWeight: "800" },

  // Disconnect
  disconnectButton: { alignSelf: "center", marginTop: spacing.sm },
});
