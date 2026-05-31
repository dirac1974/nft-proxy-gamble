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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { NeonButton } from "@/components/ui";
import { colors, radius, shadows, spacing, typography } from "@/theme";

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

  const showValidationError = toAddress.length > 0 && !isValidAddress;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={["rgba(40, 8, 78, 0.98)", "rgba(11, 0, 20, 0.99)"]}
          style={styles.sheet}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <MaterialCommunityIcons name="send-circle" size={20} color={colors.purpleGlow} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Transfer NFT Voucher</Text>
              <Text style={styles.subtitle}>
                Transfer {coinAmount.toLocaleString()} coin voucher to another wallet
              </Text>
            </View>
            {!isPending && (
              <Pressable
                onPress={handleClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close transfer modal"
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Body */}
          <View style={styles.body}>
            {/* Address input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                <Ionicons name="wallet-outline" size={11} color={colors.textMuted} />
                {"  RECIPIENT ADDRESS"}
              </Text>
              <View style={[
                styles.inputWrap,
                showValidationError && styles.inputWrapError,
                isValidAddress && styles.inputWrapValid,
              ]}>
                <TextInput
                  style={styles.input}
                  placeholder="0x..."
                  placeholderTextColor={colors.textMuted}
                  value={toAddress}
                  onChangeText={setToAddress}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isPending}
                  accessibilityLabel="Recipient wallet address"
                />
                {isValidAddress && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.win} style={styles.inputIcon} />
                )}
                {showValidationError && (
                  <Ionicons name="alert-circle" size={18} color={colors.lose} style={styles.inputIcon} />
                )}
              </View>
              {showValidationError && (
                <Text style={styles.validationHint}>Enter a valid Ethereum address (0x…)</Text>
              )}
            </View>

            {/* Warning */}
            <View style={styles.warning}>
              <Ionicons name="warning" size={16} color={colors.warning} />
              <Text style={styles.warningText}>
                Transfers are irreversible. Verify the address carefully.
              </Text>
            </View>

            {/* Error */}
            {error && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Ionicons name="close-circle" size={15} color={colors.lose} />
                <Text style={styles.error}>{error}</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.footer}>
            <View style={styles.buttonRow}>
              <NeonButton
                label="Cancel"
                onPress={handleClose}
                variant="ghost"
                size="md"
                style={styles.cancelBtn}
                disabled={isPending}
                accessibilityLabel="Cancel transfer"
              />
              <NeonButton
                label={isPending ? "" : "Transfer"}
                onPress={handleConfirm}
                variant="primary"
                size="md"
                style={styles.confirmBtn}
                disabled={!isValidAddress || isPending}
                loading={isPending}
                accessibilityLabel="Confirm transfer"
                icon={!isPending ? <MaterialCommunityIcons name="send" size={16} color={colors.textPrimary} /> : undefined}
              />
            </View>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
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
    backgroundColor: `${colors.purpleGlow}15`,
    borderWidth: 1,
    borderColor: `${colors.purpleGlow}30`,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.heading3 },
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

  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },

  inputGroup: { gap: spacing.xs },
  inputLabel: {
    ...typography.overline,
    color: colors.textMuted,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundDeep,
  },
  inputWrapError: { borderColor: colors.lose },
  inputWrapValid: { borderColor: `${colors.win}55` },
  input: {
    flex: 1,
    padding: spacing.md,
    color: colors.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
  },
  inputIcon: { paddingRight: spacing.md },
  validationHint: { ...typography.caption, color: colors.lose },

  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: `${colors.warning}12`,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.warning}30`,
  },
  warningText: { ...typography.bodySmall, color: colors.warning, flex: 1 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.lose}12`,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.lose}28`,
  },
  error: { ...typography.bodySmall, color: colors.lose, flex: 1 },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  cancelBtn: { flex: 1 },
  confirmBtn: { flex: 1 },
});
