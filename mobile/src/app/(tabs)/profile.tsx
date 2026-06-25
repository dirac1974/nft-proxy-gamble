import React from "react";
import {
  Alert,
  Linking,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";
import { GradientBackground, NeonButton } from "@/components/ui";
import { GlassCard } from "@/components/GlassCard";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { AgeGateModal } from "@/components/AgeGateModal";
import { useWalletStore } from "@/stores/walletStore";
import { CHAIN } from "@/services/walletService";

function SectionTitle({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>{icon}</View>
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

function SettingsRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueWrap}>{children}</View>
    </View>
  );
}

function StatusChip({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <View
      style={[
        styles.statusChip,
        active ? styles.statusChipActive : styles.statusChipInactive,
      ]}
    >
      {active ? (
        <Ionicons name="checkmark-circle" size={12} color={colors.neonGreen} style={styles.chipIcon} />
      ) : (
        <Ionicons name="ellipse-outline" size={12} color={colors.textMuted} style={styles.chipIcon} />
      )}
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
        {active ? activeLabel : inactiveLabel}
      </Text>
    </View>
  );
}

function LinkRow({
  label,
  onPress,
  accessibilityLabel,
  icon,
  last,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  icon: React.ReactNode;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.linkRow,
        last && styles.rowLast,
        pressed && styles.linkRowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.linkRowLeft}>
        <View style={styles.linkIconWrap}>{icon}</View>
        <Text style={styles.linkRowLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { address, isAuthenticated, disconnect, ageConfirmed } = useWalletStore();
  const contractAddress =
    (Constants.expoConfig?.extra?.contractAddress as string | undefined) ?? "Not configured";

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect Wallet",
      "Your JWT session will be cleared. You'll need to reconnect and re-sign to play.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: () => disconnect() },
      ],
    );
  };

  const shortAddress = address
    ? `${address.slice(0, 10)}…${address.slice(-8)}`
    : "Not connected";

  const handleSendFeedback = async () => {
    const appVersion = Constants.expoConfig?.version ?? "unknown";
    const osLine = `${Platform.OS} ${Platform.Version}`;
    const subject = encodeURIComponent("NFT Proxy Gamble — Beta Feedback");
    const body = encodeURIComponent(
      [
        "Describe the issue or feedback:",
        "",
        "",
        "---",
        `App: ${appVersion}`,
        `Platform: ${osLine}`,
        `Wallet: ${address ?? "(not connected)"}`,
        `Network: ${CHAIN.name}`,
      ].join("\n"),
    );
    const mailto = `mailto:beta@nftproxygamble.app?subject=${subject}&body=${body}`;
    const supported = await Linking.canOpenURL(mailto);
    if (!supported) {
      Alert.alert(
        "No mail app available",
        "Please email beta@nftproxygamble.app from another device with the details.",
      );
      return;
    }
    void Linking.openURL(mailto);
  };

  const handleReportBug = async () => {
    const issuesUrl = "https://github.com/dirac1974/nft-proxy-gamble/issues/new";
    const supported = await Linking.canOpenURL(issuesUrl);
    if (!supported) {
      Alert.alert("Cannot open browser", issuesUrl);
      return;
    }
    void Linking.openURL(issuesUrl);
  };

  return (
    <GradientBackground variant="warm">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Account */}
        <GlassCard>
          <SectionTitle
            label="ACCOUNT"
            icon={<Ionicons name="wallet-outline" size={14} color={colors.purpleLight} />}
          />
          <SettingsRow label="Wallet">
            <Text style={styles.rowValue} numberOfLines={1}>
              {shortAddress}
            </Text>
          </SettingsRow>
          <SettingsRow label="Network">
            <Text style={styles.rowValue}>{CHAIN.name}</Text>
          </SettingsRow>
          <SettingsRow label="Status" last>
            <StatusChip
              active={isAuthenticated}
              activeLabel="Authenticated"
              inactiveLabel="Not connected"
            />
          </SettingsRow>
        </GlassCard>

        {/* Balance */}
        {isAuthenticated && <BalanceDisplay />}

        {/* Legal */}
        <GlassCard>
          <SectionTitle
            label="LEGAL & COMPLIANCE"
            icon={<Ionicons name="shield-checkmark-outline" size={14} color={colors.purpleLight} />}
          />
          <SettingsRow label="Age Verification">
            <StatusChip
              active={ageConfirmed}
              activeLabel="Confirmed 18+"
              inactiveLabel="Pending"
            />
          </SettingsRow>
          <SettingsRow label="Jurisdiction" last>
            <Text style={styles.rowValueSmall} numberOfLines={2}>
              Entertainment only — not real money gambling
            </Text>
          </SettingsRow>

          {/* Disclaimer card */}
          <View style={styles.disclaimer}>
            <View style={styles.disclaimerHeader}>
              <Ionicons name="warning-outline" size={15} color={colors.warning} />
              <Text style={styles.disclaimerHeading}>Important Notice</Text>
            </View>
            <Text style={styles.disclaimerText}>
              This app is for entertainment purposes only. NFT vouchers represent in-app collectibles,
              not financial instruments. Must be 18+ to use. Not available in jurisdictions where
              restricted by law.
            </Text>
          </View>
        </GlassCard>

        {/* App info */}
        <GlassCard>
          <SectionTitle
            label="APP"
            icon={<Ionicons name="information-circle-outline" size={14} color={colors.purpleLight} />}
          />
          <SettingsRow label="Version">
            <Text style={styles.rowValue}>0.3.0 (Phase 3 alpha)</Text>
          </SettingsRow>
          <SettingsRow label="Contract">
            <Text style={styles.rowValueMono} numberOfLines={1}>
              {contractAddress.length > 20
                ? `${contractAddress.slice(0, 10)}…${contractAddress.slice(-8)}`
                : contractAddress}
            </Text>
          </SettingsRow>
          <SettingsRow label="RNG" last>
            <Text style={styles.rowValueSmall} numberOfLines={1}>
              Provably fair (keccak256 commit-reveal)
            </Text>
          </SettingsRow>
        </GlassCard>

        {/* Feedback */}
        <GlassCard>
          <SectionTitle
            label="HELP & FEEDBACK"
            icon={<Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.purpleLight} />}
          />
          <LinkRow
            label="Send feedback"
            onPress={handleSendFeedback}
            accessibilityLabel="Send beta feedback by email"
            icon={<Ionicons name="mail-outline" size={15} color={colors.textSecondary} />}
          />
          <LinkRow
            label="Report a bug"
            onPress={handleReportBug}
            accessibilityLabel="Report a bug on GitHub"
            icon={<MaterialCommunityIcons name="bug-outline" size={15} color={colors.textSecondary} />}
            last
          />
        </GlassCard>

        {/* Disconnect */}
        {isAuthenticated && (
          <NeonButton
            variant="danger"
            size="md"
            label="Disconnect Wallet"
            onPress={handleDisconnect}
            haptics="warning"
            icon={<Ionicons name="log-out-outline" size={18} color={colors.textPrimary} />}
            fullWidth
            accessibilityLabel="Disconnect wallet and clear session"
          />
        )}

        {/* Age gate — only shown if authenticated but not yet confirmed */}
        <AgeGateModal visible={isAuthenticated && !ageConfirmed} />
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  sectionIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: `${colors.purpleLight}1a`,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    ...typography.overline,
    letterSpacing: 2,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { ...typography.bodySmall, flex: 1 },
  rowValueWrap: { flex: 2, alignItems: "flex-end" },
  rowValue: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "right" },
  rowValueSmall: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "right",
    lineHeight: 16,
  },
  rowValueMono: {
    ...typography.mono,
    fontSize: 11,
    textAlign: "right",
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusChipActive: {
    backgroundColor: `${colors.neonGreen}14`,
    borderColor: `${colors.neonGreen}44`,
  },
  statusChipInactive: {
    backgroundColor: `${colors.border}33`,
    borderColor: colors.borderSubtle,
  },
  chipIcon: { marginRight: 4 },
  chipText: { ...typography.caption, fontWeight: "700" },
  chipTextActive: { color: colors.neonGreen },
  chipTextInactive: { color: colors.textMuted },

  disclaimer: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: `${colors.warning}0d`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.warning}33`,
    gap: spacing.sm,
  },
  disclaimerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  disclaimerHeading: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.warning,
    letterSpacing: 0.5,
  },
  disclaimerText: {
    ...typography.caption,
    color: colors.warning,
    lineHeight: 18,
    opacity: 0.85,
  },

  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  linkRowPressed: { opacity: 0.65 },
  linkRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  linkIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: `${colors.surfaceElevated}cc`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  linkRowLabel: { ...typography.body },
});
