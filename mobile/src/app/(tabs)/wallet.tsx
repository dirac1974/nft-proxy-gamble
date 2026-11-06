import React, { useCallback, useEffect } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppText, EmptyState } from "@/components/ui";
import { BalanceHero, MIN_CASHOUT_COINS } from "@/components/wallet/BalanceHero";
import { coinsToUsd, formatCoins } from "@/config/brand";
import { VoucherCard } from "@/components/wallet/VoucherCard";
import { useWalletStore } from "@/stores/walletStore";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { balanceApi, nftApi, type Voucher } from "@/services/api";
import { palette, spacing } from "@/theme";

export default function WalletScreen() {
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const address = useWalletStore((s) => s.address);
  const coinBalance = useGameStore((s) => s.coinBalance);
  const setBalance = useGameStore((s) => s.setBalance);
  const openCashOut = useUiStore((s) => s.openCashOut);
  const openIAP = useUiStore((s) => s.openIAP);
  const openConnect = useUiStore((s) => s.openConnect);
  const tabBarHeight = useBottomTabBarHeight();
  const qc = useQueryClient();

  const { data: balanceData, refetch: refetchBalance } = useQuery({
    queryKey: ["balance"],
    queryFn: balanceApi.get,
    enabled: isAuthenticated,
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

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["nfts"],
    queryFn: nftApi.list,
    enabled: isAuthenticated,
    // Only poll while there are vouchers in a transient state. Once everything
    // is MINTED or FAILED, polling adds zero value and just burns battery + data.
    refetchInterval: (q) => {
      const vouchers = q.state.data ?? [];
      const anyPending = vouchers.some((v) => v.mintStatus === "PENDING" || v.mintStatus === "MINTING");
      return anyPending ? 5_000 : false;
    },
  });

  const handleRedeemed = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["nfts"] });
    qc.invalidateQueries({ queryKey: ["balance"] });
  }, [qc]);

  const onRefresh = useCallback(() => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ["balance"] });
  }, [refetch, qc]);

  const header = (
    <SafeAreaView edges={["top"]} style={styles.header}>
      <AppText variant="title">Wallet</AppText>
    </SafeAreaView>
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.root}>
        {header}
        <View style={[styles.centred, { paddingBottom: tabBarHeight }]}>
          <EmptyState
            icon="wallet-outline"
            title="Connect to see your wallet"
            body="Your coins, cash-outs and vouchers live here once your wallet is connected."
            cta={{ label: "Connect wallet", onPress: openConnect, testID: "wallet-connect" }}
          />
        </View>
      </View>
    );
  }

  const vouchers = (data ?? []) as Voucher[];
  const canCashOut = Math.floor(coinBalance) >= MIN_CASHOUT_COINS;

  return (
    <View style={styles.root}>
      {header}
      <FlatList
        style={styles.flex}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + spacing.lg }]}
        data={vouchers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <VoucherCard item={item} walletAddress={address ?? ""} onRedeemed={handleRedeemed} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={palette.gold} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <BalanceHero balance={coinBalance} onCashOut={openCashOut} onBuy={openIAP} />
            <AppText variant="overline" style={styles.sectionTitle}>
              Your cash-outs
            </AppText>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={palette.gold} style={styles.loading} />
          ) : (
            <EmptyState
              icon="ticket-outline"
              title="No cash-outs yet"
              body={
                canCashOut
                  ? "When you cash out, your coins become a voucher here. Turn it into USDC whenever you like."
                  : `When you cash out, your coins become a voucher here. Cash-outs start at ${formatCoins(MIN_CASHOUT_COINS)} coins (${coinsToUsd(MIN_CASHOUT_COINS)}).`
              }
              cta={canCashOut ? { label: "Cash out", onPress: openCashOut, testID: "empty-cashout" } : undefined}
              testID="vouchers-empty"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.s12, backgroundColor: palette.bg },
  centred: { flex: 1, justifyContent: "center" },
  listContent: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  listHeader: { gap: spacing.lg, marginBottom: spacing.s12 },
  sectionTitle: { marginLeft: spacing.xs, marginBottom: -spacing.xs },
  separator: { height: spacing.s12 },
  loading: { marginTop: spacing.xl },
});
