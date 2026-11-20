import React, { useCallback, useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/ui";
import { LobbyTopBar } from "@/components/lobby/LobbyTopBar";
import { FeaturedGameBanner } from "@/components/lobby/FeaturedGameBanner";
import { GameTile } from "@/components/lobby/GameTile";
import { GAMES, type GameInfo } from "@/components/lobby/games";
import { useWalletStore } from "@/stores/walletStore";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { balanceApi } from "@/services/api";
import { initIAP, teardownIAP } from "@/services/iapService";
import { BRAND } from "@/config/brand";
import { palette, spacing } from "@/theme";

const FEATURED = GAMES.find((g) => g.id === "slot") ?? GAMES.find((g) => g.id === "blackjack")!;
const TAB_BAR_BASE = 56;
const SECTIONS = [
  { id: "machines", title: "Machines" },
  { id: "tables", title: "Table games" },
] as const;

export default function LobbyScreen() {
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const coinBalance = useGameStore((s) => s.coinBalance);
  const setBalance = useGameStore((s) => s.setBalance);
  const openIAP = useUiStore((s) => s.openIAP);
  const openConnect = useUiStore((s) => s.openConnect);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  // The tab bar is absolutely positioned; reserve its full height (incl. gesture inset) so the last tile clears it.
  const bottomPad = Math.max(tabBarHeight, TAB_BAR_BASE + insets.bottom) + spacing.lg;

  const { data: balanceData, refetch: refetchBalance } = useQuery({
    queryKey: ["balance"],
    queryFn: balanceApi.get,
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (typeof balanceData === "number") setBalance(balanceData);
  }, [balanceData, setBalance]);

  // Refresh the balance whenever this tab comes into view.
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) void refetchBalance();
    }, [isAuthenticated, refetchBalance]),
  );

  // Init IAP when user is authenticated; tear down on unmount
  useEffect(() => {
    if (!isAuthenticated) return;
    void initIAP();
    return () => {
      teardownIAP();
    };
  }, [isAuthenticated]);

  const openGame = useCallback(
    (game: GameInfo) => {
      if (!isAuthenticated) {
        openConnect();
        return;
      }
      router.push(game.route);
    },
    [isAuthenticated, openConnect],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.top}>
        <LobbyTopBar
          isAuthenticated={isAuthenticated}
          balance={coinBalance}
          onAddCoins={openIAP}
          onConnect={openConnect}
        />
      </SafeAreaView>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        testID="lobby-scroll"
      >
        <AppText variant="bodySmall" style={styles.tagline}>
          {BRAND.tagline}
        </AppText>

        <FeaturedGameBanner game={FEATURED} onPress={() => openGame(FEATURED)} />

        {SECTIONS.map(({ id, title }) => (
          <View key={id} style={styles.section}>
            <AppText variant="overline" style={styles.sectionTitle}>
              {title}
            </AppText>
            {GAMES.filter((g) => g.section === id && g.id !== FEATURED.id).map((game) => (
              <GameTile key={game.id} game={game} onPress={() => openGame(game)} />
            ))}
          </View>
        ))}

        {!isAuthenticated && (
          <AppText variant="caption" align="center" style={styles.hint}>
            Browse freely. Connect a wallet when you're ready to play.
          </AppText>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  top: { backgroundColor: palette.bg, zIndex: 2 },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.lg },
  tagline: { marginBottom: -spacing.sm },
  section: { gap: spacing.s12 },
  sectionTitle: { marginLeft: spacing.xs },
  hint: { marginTop: -spacing.sm },
});
