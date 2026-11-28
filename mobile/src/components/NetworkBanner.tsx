import React, { useContext } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWalletStore } from "@/stores/walletStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { CHAIN } from "@/services/walletService";
import { AppText } from "@/components/ui/AppText";
import { fonts, palette, radius, spacing } from "@/theme";

// Global slim banner (mounted once in the root layout) shown while the connected
// wallet is on the wrong network. "Fix it" calls wallet_switchEthereumChain.
export function NetworkBanner() {
  const networkMismatch = useWalletStore((s) => s.networkMismatch);
  const connectionError = useWalletStore((s) => s.connectionError);
  const { switchNetwork, isBusy } = useWalletConnect();
  const topInset = useContext(SafeAreaInsetsContext)?.top ?? 0;

  // Show on network mismatch, or if error contains "Wrong network"
  const showNetworkError =
    networkMismatch ||
    (connectionError?.toLowerCase().includes("wrong network") ?? false) ||
    (connectionError?.toLowerCase().includes("chain") ?? false);

  if (!showNetworkError) return null;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]} pointerEvents="box-none">
      <View style={styles.banner} accessibilityRole="alert" accessible testID="network-banner">
        <Ionicons name="warning" size={16} color={palette.warn} />
        <AppText variant="bodySmall" style={styles.message} numberOfLines={2}>
          Your wallet is on the wrong network.
        </AppText>
        {isBusy ? (
          <ActivityIndicator color={palette.warn} size="small" />
        ) : (
          <Pressable
            onPress={switchNetwork}
            accessibilityRole="button"
            accessibilityLabel={`Switch wallet to ${CHAIN.name}`}
            style={styles.fix}
            hitSlop={8}
            testID="network-fix"
          >
            <AppText style={styles.fixText}>Fix it</AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 100, elevation: 100 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    paddingLeft: spacing.s12,
    paddingRight: spacing.xs,
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: "#2A1E08",
    borderWidth: 1,
    borderColor: "rgba(245,165,36,0.45)",
  },
  message: { flex: 1, color: palette.text },
  fix: {
    backgroundColor: palette.warn,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: 6,
  },
  fixText: { fontFamily: fonts.bold, fontSize: 13, color: palette.goldInk },
});
