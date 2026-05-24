import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useIAPStore } from "@/stores/iapStore";
import { purchaseProduct } from "@/services/iapService";
import { colors, radius, shadows, spacing, typography } from "@/theme";

interface IAPSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function IAPSheet({ visible, onClose }: IAPSheetProps) {
  const { products, purchaseStatus, purchaseError, pendingProductId } = useIAPStore();
  const isBusy = purchaseStatus === "loading" || purchaseStatus === "verifying";

  const onBuy = async (productId: string) => {
    if (isBusy) return;
    await purchaseProduct(productId);
  };

  const statusMessage =
    purchaseStatus === "loading" ? "Processing purchase…"
    : purchaseStatus === "verifying" ? "Verifying receipt…"
    : purchaseStatus === "success" ? "Coins added to your balance!"
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.backdrop} onPress={isBusy ? undefined : onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>BUY COINS</Text>
          <Text style={styles.subtitle}>
            Coins are used to place bets. 100 coins can be cashed out as an NFT voucher.
          </Text>
          {!isBusy && (
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close purchase sheet"
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Status / error banner */}
        {statusMessage && (
          <View
            style={[
              styles.statusBanner,
              purchaseStatus === "success" ? styles.successBanner : styles.loadingBanner,
            ]}
            accessibilityRole="alert"
          >
            {isBusy && <ActivityIndicator color={colors.neonGreen} size="small" />}
            <Text style={[
              styles.statusText,
              purchaseStatus === "success" && styles.successText,
            ]}>
              {statusMessage}
            </Text>
          </View>
        )}

        {purchaseError && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>{purchaseError}</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.productsContainer}>
          {products.map((product) => {
            const isPending = pendingProductId === product.productId && isBusy;
            return (
              <Pressable
                key={product.productId}
                style={({ pressed }) => [
                  styles.productCard,
                  isPending && styles.productCardActive,
                  pressed && styles.productCardPressed,
                  isBusy && !isPending && styles.productCardDimmed,
                ]}
                onPress={() => onBuy(product.productId)}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={`Buy ${product.coins} coins for ${product.localizedPrice}`}
                accessibilityState={{ busy: isPending, disabled: isBusy && !isPending }}
              >
                <View style={styles.productLeft}>
                  <Text style={styles.productCoins}>{product.coins.toLocaleString()}</Text>
                  <Text style={styles.productCoinsLabel}>COINS</Text>
                  {product.bonus && (
                    <View style={styles.bonusBadge}>
                      <Text style={styles.bonusBadgeText}>{product.bonus}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.productRight}>
                  {isPending ? (
                    <ActivityIndicator color={colors.neonGreen} />
                  ) : (
                    <Text style={styles.productPrice}>{product.localizedPrice}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Purchases validated server-side. All sales final. 18+ only.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: "75%",
  },

  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  title: { ...typography.heading2, color: colors.neonGreen },
  subtitle: { ...typography.bodySmall },
  closeButton: {
    position: "absolute",
    right: spacing.lg,
    top: spacing.lg,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: { ...typography.body, color: colors.textSecondary },

  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  loadingBanner: {
    backgroundColor: `${colors.neonGreen}11`,
    borderColor: `${colors.neonGreen}33`,
  },
  successBanner: {
    backgroundColor: `${colors.win}11`,
    borderColor: `${colors.win}33`,
  },
  statusText: { ...typography.bodySmall, color: colors.neonGreen },
  successText: { color: colors.win, fontWeight: "700" },

  errorBanner: {
    backgroundColor: `${colors.lose}22`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.lose}44`,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.lose },

  productsContainer: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  productCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    ...shadows.purple,
  },
  productCardActive: {
    borderColor: colors.neonGreen,
    backgroundColor: `${colors.neonGreen}11`,
  },
  productCardPressed: { opacity: 0.8 },
  productCardDimmed: { opacity: 0.4 },

  productLeft: { flex: 1, gap: 2 },
  productCoins: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.neonGreen,
    letterSpacing: -1,
  },
  productCoinsLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 2,
  },
  bonusBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bonusBadgeText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: "900",
    letterSpacing: 1,
  },

  productRight: { alignItems: "flex-end" },
  productPrice: {
    ...typography.heading3,
    color: colors.textPrimary,
  },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: { ...typography.caption, textAlign: "center" },
});
