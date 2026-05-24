import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, radius, spacing, typography } from "@/theme";
import { GlassCard } from "@/components/GlassCard";
import { useWalletStore } from "@/stores/walletStore";
import { nftApi, gameApi } from "@/services/api";

interface Voucher {
  id: string;
  coinAmount: number;
  mintStatus: string;
  tokenId: number | null;
  createdAt: string;
}

function VoucherCard({ item }: { item: Voucher }) {
  const qc = useQueryClient();
  const isPending = item.mintStatus === "PENDING" || item.mintStatus === "MINTING";
  const isMinted = item.mintStatus === "MINTED";

  const date = new Date(item.createdAt).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <GlassCard neonBorder={isMinted} style={styles.voucherCard}>
      <View style={styles.voucherHeader}>
        <View>
          <Text style={styles.voucherCoins}>{item.coinAmount.toLocaleString()} coins</Text>
          <Text style={styles.voucherUsd}>≈ ${(item.coinAmount / 100).toFixed(2)} USDC</Text>
        </View>
        <View style={[styles.statusBadge, isPending && styles.statusPending, isMinted && styles.statusMinted]}>
          <Text style={styles.statusText}>{item.mintStatus}</Text>
        </View>
      </View>

      <Text style={styles.voucherDate}>{date}</Text>

      {item.tokenId != null && (
        <Text style={styles.tokenId}>Token #{item.tokenId}</Text>
      )}

      {isMinted && (
        <View style={styles.actionRow}>
          <Pressable style={styles.redeemButton}>
            <Text style={styles.redeemText}>Redeem → USDC</Text>
          </Pressable>
          <Pressable style={styles.transferButton}>
            <Text style={styles.transferText}>Transfer</Text>
          </Pressable>
        </View>
      )}

      {isPending && (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={styles.pendingText}>Mint in progress…</Text>
        </View>
      )}
    </GlassCard>
  );
}

export default function NFTsScreen() {
  const { isAuthenticated } = useWalletStore();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["nfts"],
    queryFn: nftApi.list,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  if (!isAuthenticated) {
    return (
      <View style={styles.centred}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockText}>Connect your wallet to view your NFT vouchers.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color={colors.neonGreen} size="large" />
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centred}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyTitle}>No Vouchers Yet</Text>
        <Text style={styles.emptyBody}>
          Win coins in Video Poker and cash out to mint an NFT voucher redeemable for USDC.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <VoucherCard item={item as Voucher} />}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.neonGreen}
        />
      }
      ListHeaderComponent={
        <Text style={styles.header}>
          {data.length} voucher{data.length !== 1 ? "s" : ""}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { ...typography.bodySmall, marginBottom: spacing.xs },

  centred: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl },
  lockIcon: { fontSize: 48 },
  lockText: { ...typography.body, textAlign: "center", color: colors.textSecondary },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...typography.heading3 },
  emptyBody: { ...typography.bodySmall, textAlign: "center" },

  voucherCard: { gap: spacing.sm },
  voucherHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  voucherCoins: { ...typography.heading3, color: colors.neonGreen },
  voucherUsd: { ...typography.bodySmall },
  voucherDate: { ...typography.caption },
  tokenId: { ...typography.mono },

  statusBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.border,
  },
  statusPending: { backgroundColor: `${colors.warning}33` },
  statusMinted: { backgroundColor: `${colors.neonGreen}22` },
  statusText: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },

  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  redeemButton: {
    flex: 1, backgroundColor: colors.purple,
    borderRadius: radius.full, paddingVertical: spacing.sm,
    alignItems: "center",
  },
  redeemText: { ...typography.bodySmall, fontWeight: "700" },
  transferButton: {
    flex: 1, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.full, paddingVertical: spacing.sm,
    alignItems: "center",
  },
  transferText: { ...typography.bodySmall, color: colors.textSecondary },

  pendingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pendingText: { ...typography.bodySmall, color: colors.textMuted },
});
