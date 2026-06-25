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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useIAPStore } from "@/stores/iapStore";
import { purchaseProduct } from "@/services/iapService";
import { NeonButton } from "@/components/ui";
import { colors, gradients, radius, shadows, spacing, typography } from "@/theme";

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
      <Pressable
        style={styles.backdrop}
        onPress={isBusy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss purchase sheet"
      />
      <LinearGradient
        colors={["rgba(40, 8, 78, 0.98)", "rgba(11, 0, 20, 0.99)"]}
        style={styles.sheet}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialCommunityIcons name="bitcoin" size={22} color={colors.neonGreen} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>BUY COINS</Text>
            <Text style={styles.subtitle}>
              Coins are used to place bets. 100 coins can be cashed out as an NFT voucher.
            </Text>
          </View>
          {!isBusy && (
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close purchase sheet"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
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
            {isBusy
              ? <ActivityIndicator color={colors.neonGreen} size="small" />
              : <Ionicons name="checkmark-circle" size={16} color={colors.win} />
            }
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
            <Ionicons name="alert-circle" size={16} color={colors.lose} />
            <Text style={styles.errorText}>{purchaseError}</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.productsContainer} showsVerticalScrollIndicator={false}>
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
                {isPending && (
                  <LinearGradient
                    colors={["rgba(0,255,159,0.08)", "rgba(0,255,159,0.03)"]}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <View style={styles.productLeft}>
                  <View style={styles.coinIconRow}>
                    <MaterialCommunityIcons name="circle-multiple" size={20} color={colors.neonGreen} />
                    <Text style={styles.productCoins}>{product.coins.toLocaleString()}</Text>
                  </View>
                  <Text style={styles.productCoinsLabel}>COINS</Text>
                  {product.bonus && (
                    <View style={styles.bonusBadge}>
                      <MaterialCommunityIcons name="star" size={10} color={colors.background} />
                      <Text style={styles.bonusBadgeText}>{product.bonus}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.productRight}>
                  {isPending ? (
                    <ActivityIndicator color={colors.neonGreen} />
                  ) : (
                    <>
                      <Text style={styles.productPrice}>{product.localizedPrice}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerIconRow}>
            <Ionicons name="shield-checkmark" size={12} color={colors.textMuted} />
            <Text style={styles.footerText}>
              Purchases validated server-side. All sales final. 18+ only.
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    maxHeight: "75%",
    overflow: "hidden",
  },

  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: `${colors.neonGreen}15`,
    borderWidth: 1,
    borderColor: `${colors.neonGreen}30`,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerText: { flex: 1, gap: 2 },
  title: {
    ...typography.heading3,
    color: colors.neonGreen,
    letterSpacing: 1.5,
  },
  subtitle: { ...typography.bodySmall },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
  },

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
    backgroundColor: `${colors.neonGreen}0e`,
    borderColor: `${colors.neonGreen}30`,
  },
  successBanner: {
    backgroundColor: `${colors.win}0e`,
    borderColor: `${colors.win}30`,
  },
  statusText: { ...typography.bodySmall, color: colors.neonGreen, flex: 1 },
  successText: { color: colors.win, fontWeight: "700" },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.lose}15`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.lose}33`,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.lose, flex: 1 },

  productsContainer: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  productCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
    ...shadows.purple,
  },
  productCardActive: {
    borderColor: `${colors.neonGreen}66`,
  },
  productCardPressed: { opacity: 0.82 },
  productCardDimmed: { opacity: 0.35 },

  productLeft: { flex: 1, gap: 3 },
  coinIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  productCoins: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.neonGreen,
    letterSpacing: -0.5,
  },
  productCoinsLabel: {
    ...typography.overline,
    color: colors.textMuted,
  },
  bonusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bonusBadgeText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  productRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  productPrice: {
    ...typography.heading3,
    color: colors.textPrimary,
  },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  footerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  footerText: { ...typography.caption, textAlign: "center" },
});
