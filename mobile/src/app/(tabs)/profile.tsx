import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "@/theme";
import { GlassCard } from "@/components/GlassCard";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { useWalletStore } from "@/stores/walletStore";
import { CHAIN } from "@/services/walletService";

export default function ProfileScreen() {
  const { address, isAuthenticated, disconnect } = useWalletStore();
  const [ageGateVisible, setAgeGateVisible] = useState(false);

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
        <Pressable style={styles.row} onPress={() => setAgeGateVisible(true)}>
          <Text style={styles.rowLabel}>Age Verification</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
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
            0xf0d9bD16…cEC15Cd
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>RNG</Text>
          <Text style={styles.rowValue}>Provably fair (keccak256 commit-reveal)</Text>
        </View>
      </GlassCard>

      {/* Disconnect */}
      {isAuthenticated && (
        <Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect Wallet</Text>
        </Pressable>
      )}

      {/* Age gate modal */}
      <Modal visible={ageGateVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Age Verification</Text>
            <Text style={styles.modalBody}>
              You must be 18 years of age or older to use this application.
              By continuing, you confirm that you meet this requirement.
            </Text>
            <Pressable style={styles.modalButton} onPress={() => setAgeGateVisible(false)}>
              <Text style={styles.modalButtonText}>I am 18 or older — Continue</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
    width: "100%",
  },
  modalTitle: { ...typography.heading2, textAlign: "center" },
  modalBody: { ...typography.body, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  modalButton: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  modalButtonText: { ...typography.body, fontWeight: "700" },
});
