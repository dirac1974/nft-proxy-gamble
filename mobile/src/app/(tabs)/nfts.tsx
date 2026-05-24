import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, radius, spacing, typography } from "@/theme";
import { GlassCard } from "@/components/GlassCard";
import { TransferModal } from "@/components/TransferModal";
import { useWalletStore } from "@/stores/walletStore";
import { nftApi } from "@/services/api";
import {
  redeemVoucher,
  waitForRedemption,
  transferVoucher,
  polygonscanUrl,
} from "@/services/nftRedemptionService";
import type { Address } from "viem";

interface Voucher {
  id: string;
  coinBalance: number;
  mintStatus: string;
  tokenId: string | null;
  txHash: string | null;
  gameType: string;
  createdAt: string;
}

type TxStatus = "idle" | "pending" | "confirming" | "confirmed" | "failed";

function VoucherCard({
  item,
  walletAddress,
  onRedeemed,
}: {
  item: Voucher;
  walletAddress: string;
  onRedeemed: () => void;
}) {
  const [redeemStatus, setRedeemStatus] = useState<TxStatus>("idle");
  const [redeemTxHash, setRedeemTxHash] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const isPending = item.mintStatus === "PENDING" || item.mintStatus === "MINTING";
  const isMinted = item.mintStatus === "MINTED" && item.tokenId != null;
  const isRedeemBusy = redeemStatus === "pending" || redeemStatus === "confirming";

  const date = new Date(item.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleRedeem = useCallback(async () => {
    if (!item.tokenId) return;
    setRedeemStatus("pending");
    setRedeemError(null);
    try {
      const txHash = await redeemVoucher(BigInt(item.tokenId), walletAddress as Address);
      setRedeemTxHash(txHash);
      setRedeemStatus("confirming");
      await waitForRedemption(txHash);
      setRedeemStatus("confirmed");
      onRedeemed();
    } catch (err) {
      setRedeemError((err as Error).message ?? "Redemption failed");
      setRedeemStatus("failed");
    }
  }, [item.tokenId, walletAddress, onRedeemed]);

  const handleTransfer = useCallback(
    async (toAddress: string) => {
      if (!item.tokenId) throw new Error("Token not yet minted");
      const txHash = await transferVoucher(
        BigInt(item.tokenId),
        walletAddress as Address,
        toAddress as Address,
      );
      await waitForRedemption(txHash); // reuse wait helper
      onRedeemed();
    },
    [item.tokenId, walletAddress, onRedeemed],
  );

  return (
    <>
      <GlassCard neonBorder={isMinted} style={styles.voucherCard}>
        <View style={styles.voucherHeader}>
          <View>
            <Text style={styles.voucherCoins}>{item.coinBalance.toLocaleString()} coins</Text>
            <Text style={styles.voucherUsd}>
              ≈ ${(item.coinBalance / 100).toFixed(2)} USDC
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isPending && styles.statusPending,
              isMinted && styles.statusMinted,
              item.mintStatus === "FAILED" && styles.statusFailed,
            ]}
          >
            <Text style={styles.statusText}>{item.mintStatus}</Text>
          </View>
        </View>

        <Text style={styles.voucherDate}>{date}</Text>

        {item.tokenId != null && (
          <Text style={styles.tokenId}>Token #{item.tokenId}</Text>
        )}

        {item.txHash && (
          <Pressable
            onPress={() => Linking.openURL(polygonscanUrl(item.txHash!))}
            accessibilityRole="link"
            accessibilityLabel="View mint transaction on Polygonscan"
          >
            <Text style={styles.txLink}>View mint tx ↗</Text>
          </Pressable>
        )}

        {isMinted && redeemStatus === "idle" && (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.redeemButton}
              onPress={handleRedeem}
              disabled={isRedeemBusy}
              accessibilityRole="button"
              accessibilityLabel={`Redeem ${item.coinBalance} coins for USDC`}
            >
              <Text style={styles.redeemText}>Redeem → USDC</Text>
            </Pressable>
            <Pressable
              style={styles.transferButton}
              onPress={() => setTransferOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Transfer NFT to another wallet"
            >
              <Text style={styles.transferText}>Transfer</Text>
            </Pressable>
          </View>
        )}

        {isRedeemBusy && (
          <View style={styles.pendingRow}>
            <ActivityIndicator size="small" color={colors.neonGreen} />
            <Text style={styles.pendingText}>
              {redeemStatus === "pending" ? "Awaiting wallet signature…" : "Confirming on-chain…"}
            </Text>
          </View>
        )}

        {redeemStatus === "confirmed" && redeemTxHash && (
          <View style={styles.successRow}>
            <Text style={styles.successText}>Redeemed! USDC sent to your wallet.</Text>
            <Pressable
              onPress={() => Linking.openURL(polygonscanUrl(redeemTxHash))}
              accessibilityRole="link"
              accessibilityLabel="View redemption transaction on Polygonscan"
            >
              <Text style={styles.txLink}>View tx ↗</Text>
            </Pressable>
          </View>
        )}

        {redeemStatus === "failed" && redeemError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {redeemError}
          </Text>
        )}

        {isPending && (
          <View style={styles.pendingRow}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text style={styles.pendingText}>Mint in progress…</Text>
          </View>
        )}
      </GlassCard>

      <TransferModal
        visible={transferOpen}
        coinAmount={item.coinBalance}
        onClose={() => setTransferOpen(false)}
        onConfirm={handleTransfer}
      />
    </>
  );
}

export default function NFTsScreen() {
  const { isAuthenticated, address } = useWalletStore();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["nfts"],
    queryFn: nftApi.list,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const handleRedeemed = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["nfts"] });
    qc.invalidateQueries({ queryKey: ["balance"] });
  }, [qc]);

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
      data={data as Voucher[]}
      keyExtractor={(item) => (item as Voucher).id}
      renderItem={({ item }) => (
        <VoucherCard
          item={item as Voucher}
          walletAddress={address ?? ""}
          onRedeemed={handleRedeemed}
        />
      )}
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

  centred: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  lockIcon: { fontSize: 48 },
  lockText: { ...typography.body, textAlign: "center", color: colors.textSecondary },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...typography.heading3 },
  emptyBody: { ...typography.bodySmall, textAlign: "center" },

  voucherCard: { gap: spacing.sm },
  voucherHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  voucherCoins: { ...typography.heading3, color: colors.neonGreen },
  voucherUsd: { ...typography.bodySmall },
  voucherDate: { ...typography.caption },
  tokenId: { ...typography.mono },
  txLink: { ...typography.caption, color: colors.purple, textDecorationLine: "underline" },

  statusBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.border,
  },
  statusPending: { backgroundColor: `${colors.warning}33` },
  statusMinted: { backgroundColor: `${colors.neonGreen}22` },
  statusFailed: { backgroundColor: `${colors.lose}22` },
  statusText: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },

  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  redeemButton: {
    flex: 1,
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  redeemText: { ...typography.bodySmall, fontWeight: "700" },
  transferButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  transferText: { ...typography.bodySmall, color: colors.textSecondary },

  pendingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pendingText: { ...typography.bodySmall, color: colors.textMuted },

  successRow: { gap: spacing.xs },
  successText: { ...typography.bodySmall, color: colors.neonGreen },
  errorText: { ...typography.bodySmall, color: colors.lose },
});
