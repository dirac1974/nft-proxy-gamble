import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { Address } from "viem";
import { AppText, Button } from "@/components/ui";
import { TransferModal } from "@/components/TransferModal";
import { redeemVoucher, waitForRedemption, transferVoucher, polygonscanUrl } from "@/services/nftRedemptionService";
import type { Voucher } from "@/services/api";
import { coinsToUsd, formatCoins } from "@/config/brand";
import { fonts, gradients, palette, radius, shadows, spacing } from "@/theme";
import { StatusPill, voucherDisplayStatus } from "./StatusPill";

type TxStatus = "idle" | "pending" | "confirming" | "confirmed" | "failed";

const REDEEM_FAILED_COPY = "Redemption didn't go through. You weren't charged. Try again.";

interface VoucherCardProps {
  item: Voucher;
  walletAddress: string;
  onRedeemed: () => void;
}

export function VoucherCard({ item, walletAddress, onRedeemed }: VoucherCardProps) {
  const [redeemStatus, setRedeemStatus] = useState<TxStatus>("idle");
  const [redeemTxHash, setRedeemTxHash] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isMinted = item.mintStatus === "MINTED" && item.tokenId != null;
  const isRedeemBusy = redeemStatus === "pending" || redeemStatus === "confirming";
  const status = voucherDisplayStatus(item.mintStatus, redeemStatus === "confirmed");
  const usd = coinsToUsd(item.coinBalance);

  const date = new Date(item.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleRedeem = useCallback(async () => {
    if (!item.tokenId) return;
    setRedeemStatus("pending");
    try {
      const txHash = await redeemVoucher(BigInt(item.tokenId), walletAddress as Address);
      setRedeemTxHash(txHash);
      setRedeemStatus("confirming");
      await waitForRedemption(txHash);
      setRedeemStatus("confirmed");
      onRedeemed();
    } catch {
      setRedeemStatus("failed");
    }
  }, [item.tokenId, walletAddress, onRedeemed]);

  const handleTransfer = useCallback(
    async (toAddress: string) => {
      if (!item.tokenId) throw new Error("Token not yet minted");
      const txHash = await transferVoucher(BigInt(item.tokenId), walletAddress as Address, toAddress as Address);
      await waitForRedemption(txHash); // reuse wait helper
      onRedeemed();
    },
    [item.tokenId, walletAddress, onRedeemed],
  );

  return (
    <>
      <LinearGradient
        colors={status === "ready" ? gradients.gold : [palette.hairlineStrong, palette.hairline]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.foil, status === "ready" && shadows.goldGlow]}
        testID={`voucher-${item.id}`}
      >
        <View style={styles.ticket}>
          <LinearGradient
            colors={["rgba(233,196,106,0.10)", "rgba(233,196,106,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 0.7 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.top}>
            <View style={styles.flex}>
              <AppText variant="overline" tone="gold">
                USDC voucher
              </AppText>
              <AppText style={styles.amount} accessibilityLabel={`${usd} voucher`}>
                {usd}
              </AppText>
              <AppText variant="caption">
                {formatCoins(item.coinBalance)} coins · {date}
              </AppText>
            </View>
            <StatusPill status={status} />
          </View>

          <View style={styles.perforation}>
            <View style={[styles.notch, styles.notchLeft]} />
            <View style={styles.dash} />
            <View style={[styles.notch, styles.notchRight]} />
          </View>

          <View style={styles.bottom}>
            {status === "creating" && (
              <View style={styles.progress}>
                <ActivityIndicator size="small" color={palette.textDim} />
                <AppText variant="bodySmall">Creating your voucher. This takes about a minute.</AppText>
              </View>
            )}

            {status === "failed" && (
              <AppText variant="bodySmall">
                We couldn't create this voucher. Contact support and we'll sort it out.
              </AppText>
            )}

            {isMinted && redeemStatus === "idle" && (
              <View style={styles.actions}>
                <Button
                  label={`Get ${usd} USDC`}
                  onPress={() => void handleRedeem()}
                  size="sm"
                  style={styles.flex}
                  accessibilityLabel={`Get ${usd} USDC for this voucher`}
                  testID={`redeem-${item.id}`}
                />
                <Button
                  label="Send"
                  variant="secondary"
                  size="sm"
                  icon="paper-plane-outline"
                  onPress={() => setTransferOpen(true)}
                  accessibilityLabel="Send voucher to someone"
                />
              </View>
            )}

            {isRedeemBusy && (
              <View style={styles.progress} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={palette.gold} />
                <AppText variant="bodyStrong">
                  {redeemStatus === "pending" ? "Approve in your wallet app…" : "Sending USDC (about 30 sec)…"}
                </AppText>
              </View>
            )}

            {redeemStatus === "confirmed" && (
              <View style={styles.progress}>
                <Ionicons name="checkmark-circle" size={18} color={palette.emerald} />
                <AppText variant="bodyStrong" tone="win" style={styles.flex}>
                  {usd} USDC sent to your wallet.
                </AppText>
                {redeemTxHash && (
                  <Pressable
                    onPress={() => void Linking.openURL(polygonscanUrl(redeemTxHash))}
                    accessibilityRole="link"
                    accessibilityLabel="View receipt"
                    hitSlop={8}
                  >
                    <AppText variant="bodySmall" tone="gold">
                      View receipt ↗
                    </AppText>
                  </Pressable>
                )}
              </View>
            )}

            {redeemStatus === "failed" && (
              <View style={styles.failed} accessibilityRole="alert">
                <AppText variant="bodySmall" tone="danger" style={styles.flex}>
                  {REDEEM_FAILED_COPY}
                </AppText>
                <Button label="Try again" size="sm" variant="secondary" onPress={() => void handleRedeem()} />
              </View>
            )}

            {(item.tokenId != null || item.txHash) && (
              <Pressable
                onPress={() => setDetailsOpen((v) => !v)}
                style={styles.detailsToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                hitSlop={6}
              >
                <AppText variant="caption">Details</AppText>
                <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={12} color={palette.textFaint} />
              </Pressable>
            )}

            {detailsOpen && (
              <View style={styles.details}>
                {item.tokenId != null && (
                  <View style={styles.detailRow}>
                    <AppText variant="caption">Voucher ID</AppText>
                    <AppText style={styles.mono} selectable>
                      #{item.tokenId}
                    </AppText>
                  </View>
                )}
                {item.txHash && (
                  <Pressable
                    onPress={() => void Linking.openURL(polygonscanUrl(item.txHash!))}
                    accessibilityRole="link"
                    accessibilityLabel="View receipt for this voucher"
                    style={styles.detailRow}
                  >
                    <AppText variant="caption">Created</AppText>
                    <AppText variant="caption" tone="gold">
                      View receipt ↗
                    </AppText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <TransferModal
        visible={transferOpen}
        coinAmount={item.coinBalance}
        onClose={() => setTransferOpen(false)}
        onConfirm={handleTransfer}
      />
    </>
  );
}

const NOTCH = 14;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  foil: { borderRadius: radius.lg, padding: 1.5 },
  ticket: { borderRadius: radius.lg - 1, backgroundColor: palette.surface, overflow: "hidden" },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.s12, padding: spacing.md, paddingBottom: spacing.s12 },
  amount: { fontFamily: fonts.displayBlack, fontSize: 32, lineHeight: 40, color: palette.gold, letterSpacing: 0.5 },
  perforation: { height: NOTCH, flexDirection: "row", alignItems: "center" },
  notch: { width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: palette.bg },
  notchLeft: { marginLeft: -NOTCH / 2 },
  notchRight: { marginRight: -NOTCH / 2 },
  dash: {
    flex: 1,
    marginHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.hairlineStrong,
  },
  bottom: { padding: spacing.md, paddingTop: spacing.s12, gap: spacing.s12 },
  actions: { flexDirection: "row", gap: spacing.sm },
  progress: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  failed: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  detailsToggle: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start" },
  details: {
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: palette.bgRaised,
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mono: { fontFamily: "monospace", fontSize: 12, color: palette.textDim },
});
