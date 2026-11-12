import React, { useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Badge, Button, ListRow, ListSection, haptic } from "@/components/ui";
import { copyText } from "@/components/wallet/clipboard";
import { ResponsibleGamingSection } from "@/components/shell/ResponsibleGamingSection";
import { useWalletStore } from "@/stores/walletStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { CHAIN } from "@/services/walletService";
import { BRAND } from "@/config/brand";
import { fonts, palette, spacing } from "@/theme";

const APP_VERSION = "0.3.0";

type ToggleKey = "soundOn" | "voiceOn" | "hapticsOn" | "reduceMotion";

function avatarColors(address: string): [string, string] {
  let h = 0;
  for (let i = 2; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) % 360;
  return [`hsl(${h}, 55%, 52%)`, `hsl(${(h + 50) % 360}, 60%, 32%)`];
}

function GoldSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      value={value}
      onValueChange={(v) => {
        haptic("select");
        onChange(v);
      }}
      trackColor={{ false: palette.surfaceHi, true: palette.goldDeep }}
      thumbColor={Platform.OS === "android" ? (value ? palette.gold : palette.textDim) : undefined}
      ios_backgroundColor={palette.surfaceHi}
      accessibilityLabel={label}
    />
  );
}

export default function ProfileScreen() {
  const { address, isAuthenticated, disconnect } = useWalletStore();
  const settings = useSettingsStore();
  const openConnect = useUiStore((s) => s.openConnect);
  const tabBarHeight = useBottomTabBarHeight();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const contractAddress = (Constants.expoConfig?.extra?.contractAddress as string | undefined) ?? "Not configured";

  const connected = isAuthenticated && !!address;
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  const initials = address ? address.slice(2, 4).toUpperCase() : "";
  const [c1, c2] = avatarColors(address ?? "0x00");

  const handleDisconnect = () => {
    Alert.alert("Disconnect wallet?", "You'll need to reconnect your wallet to play again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => void disconnect() },
    ]);
  };

  const handleCopy = () => {
    if (!address) return;
    if (copyText(address)) {
      haptic("success");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleReportBug = async () => {
    const osLine = `${Platform.OS} ${Platform.Version}`;
    const subject = encodeURIComponent(`${BRAND.name} — Bug report`);
    const body = encodeURIComponent(
      [
        "What happened?",
        "",
        "",
        "---",
        `App: ${APP_VERSION} (${Constants.expoConfig?.version ?? "unknown"})`,
        `Platform: ${osLine}`,
        `Wallet: ${address ?? "(not connected)"}`,
        `Network: ${CHAIN.name}`,
      ].join("\n"),
    );
    const mailto = `mailto:${BRAND.supportEmail}?subject=${subject}&body=${body}`;
    const supported = await Linking.canOpenURL(mailto).catch(() => false);
    if (!supported) {
      Alert.alert("No mail app available", `Please email ${BRAND.supportEmail} with the details.`);
      return;
    }
    void Linking.openURL(mailto);
  };

  const toggle = (key: ToggleKey) => (v: boolean) => settings.set(key, v);


  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerBar}>
        <AppText variant="title">Profile</AppText>
      </SafeAreaView>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {connected ? (
          <View style={styles.identity} testID="profile-identity">
            <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
              <AppText style={styles.initials}>{initials}</AppText>
            </LinearGradient>
            <View style={styles.flex}>
              <View style={styles.addrRow}>
                <AppText variant="heading3">{shortAddress}</AppText>
                <Pressable
                  onPress={handleCopy}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Copy wallet address"
                  testID="copy-address"
                >
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={palette.gold} />
                </Pressable>
              </View>
              <Badge label="Connected" tone="success" icon="ellipse" />
            </View>
          </View>
        ) : (
          <View style={styles.identity}>
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Ionicons name="person" size={26} color={palette.textFaint} />
            </View>
            <View style={styles.flex}>
              <AppText variant="heading3">Not connected</AppText>
              <AppText variant="bodySmall">Connect a wallet to play and cash out.</AppText>
            </View>
            <Button label="Connect" size="sm" onPress={openConnect} testID="profile-connect" />
          </View>
        )}

        <ListSection title="Play">
          <ListRow icon="volume-high" label="Sound" right={<GoldSwitch value={settings.soundOn} onChange={toggle("soundOn")} label="Sound" />} />
          <ListRow
            icon="mic"
            label="Dealer voice"
            right={<GoldSwitch value={settings.voiceOn} onChange={toggle("voiceOn")} label="Dealer voice" />}
          />
          <ListRow
            icon="phone-portrait"
            label="Haptics"
            right={<GoldSwitch value={settings.hapticsOn} onChange={toggle("hapticsOn")} label="Haptics" />}
          />
          <ListRow
            icon="sparkles"
            label="Reduce motion"
            right={<GoldSwitch value={settings.reduceMotion} onChange={toggle("reduceMotion")} label="Reduce motion" />}
          />
        </ListSection>

        <ResponsibleGamingSection />

        {connected && (
          <ListSection title="Account">
            <ListRow icon="log-out-outline" label="Disconnect wallet" tone="danger" onPress={handleDisconnect} testID="disconnect" />
          </ListSection>
        )}

        <ListSection title="About">
          <ListRow icon="information-circle" label="Version" value={APP_VERSION} />
          <ListRow icon="bug" label="Report a bug" onPress={() => void handleReportBug()} />
          <ListRow
            icon="construct"
            label="Advanced"
            onPress={() => setAdvancedOpen((v) => !v)}
            right={<Ionicons name={advancedOpen ? "chevron-up" : "chevron-down"} size={16} color={palette.textFaint} />}
            chevron={false}
          />
          {advancedOpen && <ListRow label="Network" value={CHAIN.name} />}
          {advancedOpen && (
            <ListRow
              label="Voucher contract"
              value={contractAddress.length > 20 ? `${contractAddress.slice(0, 8)}…${contractAddress.slice(-6)}` : contractAddress}
            />
          )}
          {advancedOpen && <ListRow label="Fairness method" detail="keccak256 commit-reveal, per-user server-seed chain" />}
        </ListSection>

        {/* TODO(legal): "Entertainment only — not real money gambling" contradicts USDC cash-out. Needs legal review. */}
        <View style={styles.legal}>
          <AppText variant="caption" align="center">
            Entertainment only — not real money gambling
          </AppText>
          <AppText variant="caption" align="center">
            This app is for entertainment purposes only. NFT vouchers represent in-app collectibles, not financial
            instruments. Must be 18+ to use. Not available in jurisdictions where restricted by law.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  headerBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.s12 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.lg },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  avatarEmpty: { backgroundColor: palette.surfaceHi, borderWidth: 1, borderColor: palette.hairlineStrong },
  initials: { fontFamily: fonts.heavy, fontSize: 22, color: palette.text, letterSpacing: 1 },
  addrRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  legal: { paddingHorizontal: spacing.md, gap: spacing.xs },
});
