import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIAPStore, type CoinProduct } from "@/stores/iapStore";
import { useGameStore } from "@/stores/gameStore";
import { purchaseProduct } from "@/services/iapService";
import { rgApi } from "@/services/api";
import { useWalletStore } from "@/stores/walletStore";
import { RG_QUERY_KEY } from "@/components/shell/ResponsibleGamingSection";
import { PROFILE_ROUTE, formatRgTime } from "@/components/shell/RgBlockNotice";
import { playSound } from "@/services/soundService";
import { AppText, CoinIcon, Sheet, haptic } from "@/components/ui";
import { BRAND, formatCoins } from "@/config/brand";
import { fonts, gradients, palette, radius, shadows, spacing } from "@/theme";

interface IAPSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fired once per successful, server-verified purchase (after the sheet closes). */
  onPurchased?: (coins: number) => void;
}

function priceValue(p: CoinProduct): number {
  const n = parseFloat(p.localizedPrice.replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function bestValueId(products: CoinProduct[]): string | null {
  if (products.length < 2) return null;
  const rates = products.map((p) => ({ id: p.productId, rate: p.coins / priceValue(p), coins: p.coins }));
  if (rates.some((r) => !Number.isFinite(r.rate))) {
    return products.reduce((a, b) => (b.coins > a.coins ? b : a)).productId;
  }
  return rates.reduce((a, b) => (b.rate > a.rate ? b : a)).id;
}

function CoinStack({ count }: { count: number }) {
  return (
    <View style={[styles.stack, { width: 30 + (count - 1) * 10 }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.stackCoin, { left: i * 10, top: 6 - i * 2 }]}>
          <CoinIcon size={30} />
        </View>
      ))}
    </View>
  );
}

function CoinPackCard({
  product,
  tier,
  best,
  pending,
  dimmed,
  disabled,
  note,
  onPress,
}: {
  product: CoinProduct;
  tier: number;
  best: boolean;
  pending: boolean;
  dimmed: boolean;
  disabled: boolean;
  /** Why the pack is unavailable (e.g. over today's deposit limit). */
  note?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`coin-pack-${product.coins}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Buy ${product.coins} coins for ${product.localizedPrice}${best ? ", best value" : ""}${note ? `. ${note}` : ""}`}
      accessibilityState={{ busy: pending, disabled }}
      style={({ pressed }) => [
        styles.pack,
        best && styles.packBest,
        pending && styles.packActive,
        dimmed && styles.dimmed,
        pressed && styles.pressed,
      ]}
    >
      {best && (
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ribbon}>
          <AppText style={styles.ribbonText}>BEST VALUE</AppText>
        </LinearGradient>
      )}
      <CoinStack count={tier + 1} />
      <View style={styles.packInfo}>
        <View style={styles.packAmountRow}>
          <AppText variant="money" style={styles.packCoins}>
            {formatCoins(product.coins)}
          </AppText>
          <AppText variant="bodySmall">coins</AppText>
        </View>
        {product.bonus ? (
          <AppText variant="caption" tone="win">
            {product.bonus.replace(/BONUS/i, "bonus")}
          </AppText>
        ) : (
          <AppText variant="caption">Starter pack</AppText>
        )}
        {note ? (
          <AppText variant="caption" testID={`coin-pack-note-${product.coins}`}>
            {note}
          </AppText>
        ) : null}
      </View>
      <View style={styles.price}>
        {pending ? (
          <ActivityIndicator color={palette.gold} />
        ) : (
          <AppText variant="bodyStrong" style={styles.priceText}>
            {product.localizedPrice}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

export function IAPSheet({ visible, onClose, onPurchased }: IAPSheetProps) {
  const { products, purchaseStatus, purchaseError, pendingProductId, history } = useIAPStore();
  const balance = useGameStore((s) => s.coinBalance);
  const isBusy = purchaseStatus === "loading" || purchaseStatus === "verifying";
  const best = useMemo(() => bestValueId(products), [products]);
  const sorted = useMemo(() => [...products].sort((a, b) => a.coins - b.coins), [products]);
  const handled = useRef<number | null>(null);
  const qc = useQueryClient();
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const rg = useQuery({ queryKey: RG_QUERY_KEY, queryFn: rgApi.get, enabled: visible && isAuthenticated });
  const depositLimit = rg.data?.limits.dailyDepositLimitCoins ?? null;
  const usedToday = rg.data?.today.depositsCoins ?? 0;
  const remaining = depositLimit === null ? Infinity : Math.max(0, depositLimit - usedToday);
  const pausedUntil = rg.data?.selfExcludedUntil ?? rg.data?.coolOffUntil ?? null;
  const rgNotice = purchaseError && /deposit limit|break|self-exclu/i.test(purchaseError) ? purchaseError : null;
  const openLimits = () => {
    onClose();
    router.push(PROFILE_ROUTE);
  };

  // Auto-close on a verified purchase and celebrate once.
  useEffect(() => {
    if (purchaseStatus !== "success" || !visible) return;
    const latest = history[0];
    const stamp = latest?.timestamp ?? Date.now();
    if (handled.current === stamp) return;
    handled.current = stamp;
    haptic("success");
    void playSound("chip_collect");
    void qc.invalidateQueries({ queryKey: RG_QUERY_KEY });
    const t = setTimeout(() => {
      onClose();
      onPurchased?.(latest?.coins ?? 0);
    }, 700);
    return () => clearTimeout(t);
  }, [purchaseStatus, visible, history, onClose, onPurchased, qc]);

  const onBuy = async (productId: string) => {
    if (isBusy) return;
    await purchaseProduct(productId);
  };

  return (
    <Sheet visible={visible} onClose={onClose} dismissable={!isBusy} title="Buy coins" testID="iap-sheet">
      <View style={styles.balanceRow}>
        <AppText variant="bodySmall">Current balance</AppText>
        <View style={styles.balanceValue}>
          <CoinIcon size={16} />
          <AppText variant="money" style={styles.balanceText}>
            {formatCoins(balance)}
          </AppText>
        </View>
      </View>

      <AppText variant="bodySmall">
        Play with coins. Cash out anytime: {BRAND.coinsPerUsd} coins = $1 USDC.
      </AppText>

      {depositLimit !== null && (
        <View style={styles.limitRow} testID="iap-deposit-limit">
          <Ionicons name="shield-checkmark-outline" size={16} color={palette.gold} />
          <AppText variant="bodySmall" style={styles.flex}>
            Daily deposit limit: {formatCoins(Math.min(usedToday, depositLimit))} of {formatCoins(depositLimit)} used
          </AppText>
          <Pressable onPress={openLimits} accessibilityRole="link" hitSlop={8} testID="iap-set-limits">
            <AppText variant="bodySmall" tone="gold">
              Set limits
            </AppText>
          </Pressable>
        </View>
      )}
      {pausedUntil && (
        <View style={styles.status} accessibilityRole="alert" testID="iap-rg-paused">
          <Ionicons name="cafe-outline" size={18} color={palette.gold} />
          <AppText variant="bodySmall" style={styles.flex}>
            {rg.data?.selfExcludedUntil ? "You've self-excluded" : `You're taking a break until ${formatRgTime(pausedUntil)}`}, so
            coin purchases are paused. You can still cash out anytime.
          </AppText>
        </View>
      )}

      {isBusy && (
        <View style={styles.status} accessibilityRole="alert">
          <ActivityIndicator color={palette.gold} size="small" />
          <AppText variant="bodyStrong">Adding coins…</AppText>
        </View>
      )}
      {purchaseStatus === "success" && (
        <View style={[styles.status, styles.statusSuccess]} accessibilityRole="alert">
          <Ionicons name="checkmark-circle" size={18} color={palette.emerald} />
          <AppText variant="bodyStrong">Coins added</AppText>
        </View>
      )}
      {purchaseError && (
        <View style={[styles.status, styles.statusError]} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={palette.danger} />
          <AppText variant="bodySmall" style={styles.flex}>
            {rgNotice ??
              (purchaseError.toLowerCase().includes("already processed")
                ? "This purchase was already processed. Your coins were added once."
                : "Purchase didn't go through. Please try again.")}
          </AppText>
        </View>
      )}

      <View style={styles.grid}>
        {sorted.map((product, i) => {
          const pending = pendingProductId === product.productId && isBusy;
          const overLimit = product.coins > remaining;
          const blocked = overLimit || !!pausedUntil;
          return (
            <CoinPackCard
              key={product.productId}
              product={product}
              tier={Math.min(i, 3)}
              best={product.productId === best}
              pending={pending}
              dimmed={(isBusy && !pending) || blocked}
              disabled={isBusy || blocked}
              note={
                overLimit && !pausedUntil
                  ? remaining > 0
                    ? `Over today's limit — ${formatCoins(remaining)} coins left today`
                    : "Today's deposit limit reached"
                  : undefined
              }
              onPress={() => void onBuy(product.productId)}
            />
          );
        })}
      </View>

      <AppText variant="caption" align="center">
        All sales final. 18+ only.
      </AppText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(233,196,106,0.08)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.3)",
  },
  balanceValue: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  balanceText: { fontSize: 15 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: "rgba(233,196,106,0.08)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.3)",
  },
  statusSuccess: { backgroundColor: "rgba(43,212,143,0.1)", borderColor: "rgba(43,212,143,0.35)" },
  statusError: { backgroundColor: "rgba(229,72,77,0.1)", borderColor: "rgba(229,72,77,0.35)" },
  grid: { gap: spacing.s12 },
  pack: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: "hidden",
    ...shadows.e1,
  },
  packBest: { borderColor: "rgba(233,196,106,0.6)", paddingTop: spacing.lg },
  packActive: { borderColor: palette.gold },
  dimmed: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  ribbon: {
    position: "absolute",
    top: 0,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderBottomLeftRadius: radius.xs,
    borderBottomRightRadius: radius.xs,
  },
  ribbonText: { fontFamily: fonts.heavy, fontSize: 9.5, letterSpacing: 1.2, color: palette.goldInk },
  stack: { height: 36, justifyContent: "center" },
  stackCoin: { position: "absolute" },
  packInfo: { flex: 1, gap: 2 },
  packAmountRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  packCoins: { fontSize: 22 },
  price: { minWidth: 64, alignItems: "flex-end" },
  priceText: { color: palette.gold },
});
