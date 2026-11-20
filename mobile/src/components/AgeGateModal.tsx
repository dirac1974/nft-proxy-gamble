import React, { useEffect, useRef, useState } from "react";
import { Linking, Modal, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { authApi } from "@/services/api";
import { useWalletStore } from "@/stores/walletStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { AppText, Button } from "@/components/ui";
import { GAMBLE_AWARE_URL, JURISDICTION_DECLARATION, ShieldEmblem } from "@/components/FirstRunFlow";
import { palette, radius, shadows, spacing } from "@/theme";

interface AgeGateModalProps {
  visible: boolean;
}

// Server-side age confirmation. If the user already made the declaration in the
// first-run gate (settingsStore.ageConfirmedLocal), submit it silently once and
// only show this UI if that request fails.
export function AgeGateModal({ visible }: AgeGateModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFailed, setAutoFailed] = useState(false);
  const autoTried = useRef(false);
  const setAgeConfirmed = useWalletStore((s) => s.setAgeConfirmed);
  const ageConfirmedLocal = useSettingsStore((s) => s.ageConfirmedLocal);

  const handleConfirm = async (): Promise<boolean> => {
    setIsPending(true);
    setError(null);
    try {
      await authApi.confirmAge();
      setAgeConfirmed();
      return true;
    } catch {
      setError("We couldn't save your confirmation. Check your connection and try again.");
      return false;
    } finally {
      setIsPending(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      autoTried.current = false;
      setAutoFailed(false);
      return;
    }
    if (!ageConfirmedLocal || autoTried.current) return;
    autoTried.current = true;
    void handleConfirm().then((ok) => {
      if (!ok) setAutoFailed(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ageConfirmedLocal]);

  const showUi = visible && (!ageConfirmedLocal || autoFailed);

  return (
    <Modal visible={showUi} transparent animationType="fade" statusBarTranslucent accessibilityViewIsModal>
      <View style={styles.overlay}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        <View style={styles.card} testID="age-gate-modal">
          <ShieldEmblem size={72} />
          <AppText variant="heading2" align="center">
            Confirm your age
          </AppText>
          <AppText variant="body" tone="dim" align="center">
            {JURISDICTION_DECLARATION}
          </AppText>

          {error && (
            <AppText variant="bodySmall" tone="danger" align="center" accessibilityRole="alert">
              {error}
            </AppText>
          )}

          <Button
            label="Yes, I'm 18+"
            onPress={() => void handleConfirm()}
            loading={isPending}
            fullWidth
            testID="age-gate-confirm"
            accessibilityLabel="Confirm I am 18 or older"
          />

          <AppText variant="caption" align="center">
            Gambling can be addictive. Play responsibly. For help, visit{" "}
            <AppText
              variant="caption"
              tone="gold"
              onPress={() => void Linking.openURL(GAMBLE_AWARE_URL)}
              accessibilityRole="link"
            >
              begambleaware.org
            </AppText>
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  scrim: { backgroundColor: "rgba(4,6,10,0.7)" },
  card: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: palette.bgRaised,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.3)",
    ...shadows.e3,
  },
});
