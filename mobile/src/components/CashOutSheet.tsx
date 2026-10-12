import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppText, Button, CoinIcon, Sheet, haptic } from "@/components/ui";
import { useGameStore } from "@/stores/gameStore";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { newIdempotencyKey, nftApi, walletApi, type Voucher } from "@/services/api";
import { useSessionStore } from "@/components/shell/sessionStore";
import { playSound } from "@/services/soundService";
import { BRAND, coinsToUsd, formatCoins } from "@/config/brand";
import { fonts, palette, radius, spacing } from "@/theme";

// Backend: POST /wallet/cashout takes { coinsToCashout, idempotencyKey? } with
// coinsToCashout an int in [100, 100_000] and ≤ balance, so partial amounts are
// supported. No game session needed. One idempotency key per (sheet open, amount):
// re-tapping Confirm after a network error replays the original cash-out
// instead of creating a second one.
export const MIN_CASHOUT = 100;
const MAX_CASHOUT = 100_000; // NFTProxyVoucher.MAX_COIN_BALANCE
const STEP = 100;

interface CashOutSheetProps {
  visible: boolean;
  onClose: () => void;
}

function friendlyCashOutError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("daily cashout limit")) return "You've reached today's cash-out limit. You can cash out again tomorrow.";
  if (msg.includes("insufficient")) return "Your balance changed. Check the amount and try again.";
  if (msg.includes("age confirmation")) return "Please finish confirming your age, then try again.";
  if (msg.includes("not available in your region") || msg.includes("jurisdiction") || msg.includes("region")) {
    return "Cash-outs aren't available in your region.";
  }
  if (msg.includes("session expired")) return "Your session expired. Reconnect your wallet and try again.";
  return "Cash-out didn't go through. Please try again.";
}

export function CashOutSheet({ visible, onClose }: CashOutSheetProps) {
  const balance = useGameStore((s) => s.coinBalance);
  const setBalance = useGameStore((s) => s.setBalance);
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const qc = useQueryClient();
  const idemKey = useRef<{ coins: number; key: string } | null>(null);

  const maxCashOut = Math.min(Math.floor(balance), MAX_CASHOUT);
  const [amount, setAmount] = useState(maxCashOut);

  const mutation = useMutation({
    mutationFn: (coins: number) => {
      const k = idemKey.current;
      const key = k && k.coins === coins ? k.key : newIdempotencyKey();
      idemKey.current = { coins, key };
      return walletApi.cashout(coins, key);
    },
    onSuccess: (res, coins) => {
      setBalance(res.newBalance);
      useSessionStore.getState().recordCashOut(coins);
      qc.invalidateQueries({ queryKey: ["nfts"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      haptic("success");
      void playSound("chip_collect");
    },
    onError: () => {
      haptic("error");
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
  });

  // Reset each time the sheet opens.
  useEffect(() => {
    if (visible) {
      idemKey.current = null;
      setAmount(Math.min(Math.floor(useGameStore.getState().coinBalance), MAX_CASHOUT));
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const clamped = Math.max(MIN_CASHOUT, Math.min(amount, maxCashOut));
  const canCashOut = isAuthenticated && maxCashOut >= MIN_CASHOUT;
  const done = mutation.isSuccess;
  const busy = mutation.isPending;

  const step = (delta: number) => {
    haptic("select");
    setAmount((a) => Math.max(MIN_CASHOUT, Math.min(maxCashOut, Math.max(MIN_CASHOUT, Math.min(a, maxCashOut)) + delta)));
  };

  // After success, watch the new voucher so the copy says "ready" only once it is actually minted.
  const voucherId = mutation.data?.voucherId ?? null;
  const initiallyMinted = mutation.data?.mintStatus === "MINTED";
  const { data: vouchers } = useQuery({
    queryKey: ["nfts"],
    queryFn: nftApi.list,
    enabled: visible && done && !!voucherId && !initiallyMinted,
    refetchInterval: (q) => {
      const v = (q.state.data as Voucher[] | undefined)?.find((x) => x.id === voucherId);
      return v?.mintStatus === "MINTED" || v?.mintStatus === "FAILED" ? false : 5_000;
    },
  });
  const voucherStatus = initiallyMinted
    ? "MINTED"
    : ((vouchers as Voucher[] | undefined)?.find((x) => x.id === voucherId)?.mintStatus ?? mutation.data?.mintStatus);
  const minted = voucherStatus === "MINTED";

  const viewInWallet = () => {
    onClose();
    router.push("/wallet");
  };

  if (done) {
    const cashed = mutation.variables ?? clamped;
    return (
      <Sheet visible={visible} onClose={onClose} testID="cashout-sheet">
        <View style={styles.success}>
          <View style={styles.successMedal}>
            <Ionicons name="checkmark" size={34} color={palette.goldInk} />
          </View>
          <AppText variant="heading2" align="center">
            {minted ? "Voucher ready" : "Cash-out started"}
          </AppText>
          <AppText variant="body" tone="dim" align="center" testID="cashout-success-copy">
            {minted
              ? `Your ${coinsToUsd(cashed)} voucher is ready. Turn it into USDC from Wallet whenever you like.`
              : `Your ${coinsToUsd(cashed)} voucher is being created — usually under a minute. It'll appear in Wallet.`}
          </AppText>
        </View>
        <Button label="View in Wallet" onPress={viewInWallet} fullWidth testID="cashout-view-wallet" />
        <Button label="Done" variant="ghost" onPress={onClose} fullWidth />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} dismissable={!busy} title="Cash out" testID="cashout-sheet">
      {!isAuthenticated ? (
        <View style={styles.below}>
          <AppText variant="body">Connect your wallet to cash out your coins.</AppText>
          <Button
            label="Connect wallet"
            onPress={() => useUiStore.getState().openConnect()}
            fullWidth
            style={styles.belowBtn}
          />
        </View>
      ) : !canCashOut ? (
        <View style={styles.below}>
          <AppText variant="body">
            You need at least {MIN_CASHOUT} coins ({coinsToUsd(MIN_CASHOUT)}) to cash out.
          </AppText>
          <AppText variant="bodySmall">You have {formatCoins(balance)} coins right now.</AppText>
          <Button label="Got it" variant="secondary" onPress={onClose} fullWidth style={styles.belowBtn} />
        </View>
      ) : (
        <>
          <View style={styles.picker}>
            <AppText variant="overline" align="center">
              Amount to cash out
            </AppText>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => step(-STEP)}
                disabled={busy || clamped <= MIN_CASHOUT}
                style={[styles.stepBtn, (busy || clamped <= MIN_CASHOUT) && styles.stepDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Decrease by ${STEP} coins`}
                testID="cashout-minus"
              >
                <Ionicons name="remove" size={22} color={palette.gold} />
              </Pressable>
              <View style={styles.amountBox} accessibilityLiveRegion="polite">
                <View style={styles.amountRow}>
                  <CoinIcon size={22} />
                  <AppText style={styles.amount} testID="cashout-amount">
                    {formatCoins(clamped)}
                  </AppText>
                </View>
                <AppText variant="caption">coins</AppText>
              </View>
              <Pressable
                onPress={() => step(STEP)}
                disabled={busy || clamped >= maxCashOut}
                style={[styles.stepBtn, (busy || clamped >= maxCashOut) && styles.stepDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Increase by ${STEP} coins`}
                testID="cashout-plus"
              >
                <Ionicons name="add" size={22} color={palette.gold} />
              </Pressable>
            </View>
            <View style={styles.quickRow}>
              {[
                { label: "Min", value: MIN_CASHOUT },
                { label: "Half", value: Math.max(MIN_CASHOUT, Math.floor(maxCashOut / 2)) },
                { label: "All", value: maxCashOut },
              ].map((q) => {
                const active = clamped === q.value;
                return (
                  <Pressable
                    key={q.label}
                    onPress={() => {
                      haptic("select");
                      setAmount(q.value);
                    }}
                    disabled={busy}
                    style={[styles.quick, active && styles.quickActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    testID={`cashout-quick-${q.label.toLowerCase()}`}
                  >
                    <AppText style={[styles.quickText, active && styles.quickTextActive]}>{q.label}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.summary}>
            <AppText variant="bodyStrong" align="center">
              You'll get {coinsToUsd(clamped)} USDC as a voucher
            </AppText>
            <AppText variant="bodySmall" align="center">
              {BRAND.coinsPerUsd} coins = $1. Balance after: {formatCoins(Math.floor(balance) - clamped)} coins.
            </AppText>
            <AppText variant="caption" align="center">
              The voucher appears in Wallet. Turn it into USDC whenever you like.
            </AppText>
          </View>

          {mutation.isError && (
            <View style={styles.error} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={palette.danger} />
              <AppText variant="bodySmall" style={styles.flex}>
                {friendlyCashOutError((mutation.error as Error)?.message ?? "")}
              </AppText>
            </View>
          )}

          <Button
            label={`Confirm ${coinsToUsd(clamped)} cash-out`}
            onPress={() => mutation.mutate(clamped)}
            loading={busy}
            fullWidth
            size="lg"
            testID="cashout-confirm"
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  below: { gap: spacing.sm, paddingTop: spacing.xs },
  belowBtn: { marginTop: spacing.sm },
  picker: {
    gap: spacing.s12,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDisabled: { opacity: 0.3 },
  amountBox: { alignItems: "center" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amount: { fontFamily: fonts.heavy, fontSize: 34, lineHeight: 42, color: palette.text, fontVariant: ["tabular-nums"] },
  quickRow: { flexDirection: "row", gap: spacing.sm },
  quick: {
    flex: 1,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  quickActive: { backgroundColor: palette.gold, borderColor: palette.gold },
  quickText: { fontFamily: fonts.bold, fontSize: 12, color: palette.textDim },
  quickTextActive: { color: palette.goldInk },
  summary: { gap: spacing.xs },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: "rgba(229,72,77,0.1)",
    borderWidth: 1,
    borderColor: "rgba(229,72,77,0.35)",
  },
  success: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  successMedal: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
});
