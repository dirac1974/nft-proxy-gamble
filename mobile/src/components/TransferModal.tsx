import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "@/theme";

interface TransferModalProps {
  visible: boolean;
  coinAmount: number;
  onClose: () => void;
  onConfirm: (toAddress: string) => Promise<void>;
}

export function TransferModal({ visible, coinAmount, onClose, onConfirm }: TransferModalProps) {
  const [toAddress, setToAddress] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(toAddress);

  const handleConfirm = async () => {
    if (!isValidAddress) return;
    setIsPending(true);
    setError(null);
    try {
      await onConfirm(toAddress);
      setToAddress("");
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "Transfer failed");
    } finally {
      setIsPending(false);
    }
  };

  const handleClose = () => {
    if (isPending) return;
    setToAddress("");
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Transfer NFT Voucher</Text>
          <Text style={styles.subtitle}>
            Transfer {coinAmount.toLocaleString()} coin voucher to another wallet
          </Text>

          <Text style={styles.label}>Recipient Address</Text>
          <TextInput
            style={[styles.input, !isValidAddress && toAddress.length > 0 && styles.inputError]}
            placeholder="0x..."
            placeholderTextColor={colors.textMuted}
            value={toAddress}
            onChangeText={setToAddress}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isPending}
            accessibilityLabel="Recipient wallet address"
          />
          {toAddress.length > 0 && !isValidAddress && (
            <Text style={styles.validationHint}>Enter a valid Ethereum address (0x…)</Text>
          )}

          <View style={styles.warning}>
            <Text style={styles.warningText}>
              ⚠ Transfers are irreversible. Verify the address carefully.
            </Text>
          </View>

          {error && (
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
          )}

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={handleClose} disabled={isPending}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, (!isValidAddress || isPending) && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={!isValidAddress || isPending}
              accessibilityRole="button"
              accessibilityLabel="Confirm transfer"
              accessibilityState={{ disabled: !isValidAddress || isPending }}
            >
              {isPending ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.confirmText}>Transfer</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { ...typography.heading3, textAlign: "center" },
  subtitle: { ...typography.bodySmall, textAlign: "center" },
  label: { ...typography.caption, letterSpacing: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
  },
  inputError: { borderColor: colors.lose },
  validationHint: { ...typography.caption, color: colors.lose },
  warning: {
    backgroundColor: `${colors.warning}22`,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.warning}44`,
  },
  warningText: { ...typography.bodySmall, color: colors.warning },
  error: { ...typography.bodySmall, color: colors.lose, textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  cancelText: { ...typography.body, color: colors.textSecondary },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  confirmText: { ...typography.body, fontWeight: "700" },
  buttonDisabled: { opacity: 0.4 },
});
