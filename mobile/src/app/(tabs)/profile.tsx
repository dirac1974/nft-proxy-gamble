import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import { colors, radius, spacing, typography } from "@/theme";
import { GlassCard } from "@/components/GlassCard";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { AgeGateModal } from "@/components/AgeGateModal";
import { useWalletStore } from "@/stores/walletStore";
import { CHAIN } from "@/services/walletService";

export default function ProfileScreen() {
  const { address, isAuthenticated, disconnect, ageConfirmed } = useWalletStore();
  const contractAddress = (Constants.expoConfig?.extra?.contractAddress as string | undefined) ?? "Not configured";

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect Wallet",
      "Your JWT session will be cleared. You'll need to reconnect and re-sign to play.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: () => disconnect() },
      ]
    );
  };

  const shortAddress = address
    ? `${address.slice(0, 10)}…${address.slice(-8)}`
    : "Not connected";

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Account */}
      <GlassCard>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Wallet</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{shortAddress}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Network</Text>
          <Text style={styles.rowValue}>{CHAIN.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <Text style={[styles.rowValue, isAuthenticated ? styles.statusActive : styles.statusInactive]}>
            {isAuthenticated ? "Authenticated ✓" : "Not connected"}
          </Text>
        </View>
      </GlassCard>

      {/* Balance */}
      {isAuthenticated && <BalanceDisplay />}

      {/* Legal */}
      <GlassCard>
        <Text style={styles.sectionTitle}>LEGAL & COMPLIANCE</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Age Verification</Text>
          <Text style={[styles.rowValue, ageConfirmed ? styles.statusActive : styles.rowValue]}>
            {ageConfirmed ? "Confirmed 18+" : "Pending"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Jurisdiction</Text>
          <Text style={styles.rowValue}>Entertainment only — not real money gambling</Text>
        </View>
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            This app is for entertainment purposes only. NFT vouchers represent in-app collectibles,
            not financial instruments. Must be 18+ to use. Not available in jurisdictions where
            restricted by law.
          </Text>
        </View>
      </GlassCard>

      {/* App info */}
      <GlassCard>
        <Text style={styles.sectionTitle}>APP</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>0.3.0 (Phase 3 alpha)</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Contract</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {contractAddress.length > 20
              ? `${contractAddress.slice(0, 10)}…${contractAddress.slice(-8)}`
              : contractAddress}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>RNG</Text>
          <Text style={styles.rowValue}>Provably fair (keccak256 commit-reveal)</Text>
        </View>
      </GlassCard>

      {/* Disconnect */}
      {isAuthenticated && (
        <Pressable
          style={styles.disconnectButton}
          onPress={handleDisconnect}
          accessibilityRole="button"
          accessibilityLabel="Disconnect wallet and clear session"
        >
          <Text style={styles.disconnectText}>Disconnect Wallet</Text>
        </Pressable>
      )}

      {/* Age gate — only shown if authenticated but not yet confirmed */}
      <AgeGateModal visible={isAuthenticated && !ageConfirmed} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  sectionTitle: { ...typography.caption, letterSpacing: 2, marginBottom: spacing.md },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { ...typography.bodySmall, flex: 1 },
  rowValue: { ...typography.bodySmall, color: colors.textSecondary, flex: 2, textAlign: "right" },
  rowChevron: { fontSize: 20, color: colors.textMuted },
  statusActive: { color: colors.neonGreen },
  statusInactive: { color: colors.lose },

  disclaimer: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: `${colors.warning}11`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.warning}33`,
  },
  disclaimerText: { ...typography.caption, color: colors.warning, lineHeight: 18 },

  disconnectButton: {
    borderWidth: 1,
    borderColor: colors.lose,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  disconnectText: { ...typography.body, color: colors.lose, fontWeight: "700" },

});
