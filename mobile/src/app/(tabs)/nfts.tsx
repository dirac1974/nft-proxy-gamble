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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, radius, shadows, spacing, typography } from "@/theme";
import { GradientBackground, NeonButton } from "@/components/ui";
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

function StatusPill({ mintStatus }: { mintStatus: string }) {
  const isPending = mintStatus === "PENDING" || mintStatus === "MINTING";
  const isMinted = mintStatus === "MINTED";
  const isFailed = mintStatus === "FAILED";

  const bg = isPending
    ? `${colors.warning}28`
    : isMinted
    ? `${colors.neonGreen}22`
    : isFailed
    ? `${colors.lose}22`
    : `${colors.border}55`;

  const borderColor = isPending
    ? `${colors.warning}66`
    : isMinted
    ? `${colors.neonGreen}55`
    : isFailed
    ? `${colors.lose}55`
    : colors.border;

  const textColor = isPending
    ? colors.warning
    : isMinted
    ? colors.neonGreen
    : isFailed
    ? colors.lose
    : colors.textMuted;

  return (
    <View style={[styles.statusPill, { backgroundColor: bg, borderColor }]}>
      {isPending && (
        <Ionicons name="time-outline" size={11} color={textColor} style={styles.pillIcon} />
      )}
      {isMinted && (
        <Ionicons name="checkmark-circle" size={11} color={textColor} style={styles.pillIcon} />
      )}
      {isFailed && (
        <Ionicons name="alert-circle" size={11} color={textColor} style={styles.pillIcon} />
      )}
      <Text style={[styles.pillText, { color: textColor }]}>{mintStatus}</Text>
    </View>
  );
}

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
      await waitForRedemption(txHash);
      onRedeemed();
    },
    [item.tokenId, walletAddress, onRedeemed],
  );

  return (
    <>
      <GlassCard neonBorder={isMinted} style={styles.voucherCard}>
        {/* Gold accent bar at top for minted cards */}
        {isMinted && (
          <LinearGradient
            colors={gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.goldAccentBar}
          />
        )}

        {/* Header: value + status */}
        <View style={styles.voucherHeader}>
          <View style={styles.valueBlock}>
            <View style={styles.coinRow}>
              <MaterialCommunityIcons
                name="bitcoin"
                size={20}
                color={colors.gold}
                style={styles.coinIcon}
              />
              <Text style={styles.voucherCoins}>
                {item.coinBalance.toLocaleString()}
              </Text>
              <Text style={styles.coinsLabel}> coins</Text>
            </View>
            <Text style={styles.voucherUsd}>
              ≈ ${(item.coinBalance / 100).toFixed(2)} USDC
            </Text>
          </View>
          <StatusPill mintStatus={item.mintStatus} />
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <Text style={styles.voucherDate}>{date}</Text>
          {item.tokenId != null && (
            <Text style={styles.tokenId}>Token #{item.tokenId}</Text>
          )}
        </View>

        {/* Mint tx link */}
        {item.txHash && (
          <Pressable
            onPress={() => Linking.openURL(polygonscanUrl(item.txHash!))}
            style={styles.txLinkRow}
            accessibilityRole="link"
            accessibilityLabel="View mint transaction on Polygonscan"
          >
            <Text style={styles.txLink}>View mint tx on Polygonscan</Text>
            <Ionicons name="open-outline" size={13} color={colors.purpleLight} />
          </Pressable>
        )}

        {/* Mint in progress */}
        {isPending && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.warning} />
            <Text style={styles.pendingText}>Mint in progress…</Text>
          </View>
        )}

        {/* Idle action buttons */}
        {isMinted && redeemStatus === "idle" && (
          <View style={styles.actionRow}>
            <View style={styles.actionBtn}>
              <NeonButton
                variant="gold"
                size="sm"
                label="Redeem → USDC"
                onPress={handleRedeem}
                disabled={isRedeemBusy}
                haptics="success"
                icon={<MaterialCommunityIcons name="swap-horizontal" size={15} color="#2a1500" />}
                fullWidth
                accessibilityLabel={`Redeem ${item.coinBalance} coins for USDC`}
              />
            </View>
            <View style={styles.actionBtn}>
              <NeonButton
                variant="ghost"
                size="sm"
                label="Transfer"
                onPress={() => setTransferOpen(true)}
                haptics="light"
                icon={<Ionicons name="arrow-forward-circle-outline" size={15} color={colors.neonGreen} />}
                fullWidth
                accessibilityLabel="Transfer NFT to another wallet"
              />
            </View>
          </View>
        )}

        {/* Redeem busy state */}
        {isRedeemBusy && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.gold} />
            <Text style={styles.redeemBusyText}>
              {redeemStatus === "pending" ? "Awaiting wallet signature…" : "Confirming on-chain…"}
            </Text>
          </View>
        )}

        {/* Redeem confirmed */}
        {redeemStatus === "confirmed" && redeemTxHash && (
          <View style={styles.successBlock}>
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.neonGreen} />
              <Text style={styles.successText}>Redeemed! USDC sent to your wallet.</Text>
            </View>
            <Pressable
              onPress={() => Linking.openURL(polygonscanUrl(redeemTxHash))}
              style={styles.txLinkRow}
              accessibilityRole="link"
              accessibilityLabel="View redemption transaction on Polygonscan"
            >
              <Text style={styles.txLink}>View redemption tx</Text>
              <Ionicons name="open-outline" size={13} color={colors.purpleLight} />
            </Pressable>
          </View>
        )}

        {/* Redeem failed */}
        {redeemStatus === "failed" && redeemError && (
          <View style={styles.errorBlock} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={15} color={colors.lose} />
            <Text style={styles.errorText}>{redeemError}</Text>
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
    refetchInterval: (q) => {
      const vouchers = q.state.data ?? [];
      const anyPending = vouchers.some(
        (v) => v.mintStatus === "PENDING" || v.mintStatus === "MINTING",
      );
      return anyPending ? 5_000 : false;
    },
  });

  const handleRedeemed = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["nfts"] });
    qc.invalidateQueries({ queryKey: ["balance"] });
  }, [qc]);

  if (!isAuthenticated) {
    return (
      <GradientBackground>
        <View style={styles.centred}>
          <View style={styles.stateIconWrap}>
            <Ionicons name="lock-closed" size={40} color={colors.purpleGlow} />
          </View>
          <Text style={styles.stateTitle}>Wallet Required</Text>
          <Text style={styles.stateBody}>
            Connect your wallet to view your NFT vouchers.
          </Text>
        </View>
      </GradientBackground>
    );
  }

  if (isLoading) {
    return (
      <GradientBackground>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.neonGreen} size="large" />
          <Text style={styles.stateBody}>Loading vouchers…</Text>
        </View>
      </GradientBackground>
    );
  }

  if (!data || data.length === 0) {
    return (
      <GradientBackground>
        <View style={styles.centred}>
          <View style={styles.stateIconWrap}>
            <MaterialCommunityIcons
              name="ticket-outline"
              size={44}
              color={colors.textMuted}
            />
          </View>
          <Text style={styles.stateTitle}>No Vouchers Yet</Text>
          <Text style={styles.stateBody}>
            Win coins in Video Poker and cash out to mint an NFT voucher redeemable for USDC.
          </Text>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
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
          <View style={styles.listHeader}>
            <MaterialCommunityIcons name="wallet-outline" size={16} color={colors.textMuted} />
            <Text style={styles.listHeaderText}>
              {data.length} voucher{data.length !== 1 ? "s" : ""}
            </Text>
          </View>
        }
      />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  listHeaderText: {
    ...typography.caption,
    letterSpacing: 0.5,
  },

  centred: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  stateIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.surface}cc`,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  stateTitle: {
    ...typography.heading3,
    textAlign: "center",
  },
  stateBody: {
    ...typography.bodySmall,
    textAlign: "center",
    color: colors.textSecondary,
    maxWidth: 280,
  },

  voucherCard: { gap: spacing.sm, overflow: "hidden" },
  goldAccentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },

  voucherHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: spacing.xs,
  },
  valueBlock: { gap: 2 },
  coinRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  coinIcon: { marginRight: 4 },
  voucherCoins: {
    ...typography.heading3,
    color: colors.gold,
    ...shadows.gold,
  },
  coinsLabel: {
    ...typography.bodySmall,
    color: colors.textMuted,
    alignSelf: "flex-end",
    marginBottom: 1,
  },
  voucherUsd: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: 2,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillIcon: { marginRight: 4 },
  pillText: {
    ...typography.caption,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  voucherDate: { ...typography.caption },
  tokenId: { ...typography.mono, fontSize: 11 },

  txLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  txLink: {
    ...typography.caption,
    color: colors.purpleLight,
    textDecorationLine: "underline",
  },

  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: { flex: 1 },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pendingText: { ...typography.bodySmall, color: colors.warning },
  redeemBusyText: { ...typography.bodySmall, color: colors.gold },

  successBlock: { gap: spacing.xs },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  successText: { ...typography.bodySmall, color: colors.neonGreen, fontWeight: "600" },

  errorBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: `${colors.lose}14`,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.lose}33`,
  },
  errorText: { ...typography.bodySmall, color: colors.lose, flex: 1 },
});
