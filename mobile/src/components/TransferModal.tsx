import React, { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Sheet } from "@/components/ui";
import { pasteText } from "@/components/wallet/clipboard";
import { coinsToUsd, formatCoins } from "@/config/brand";
import { fonts, palette, radius, spacing } from "@/theme";

interface TransferModalProps {
  visible: boolean;
  coinAmount: number;
  onClose: () => void;
  onConfirm: (toAddress: string) => Promise<void>;
}

function friendlyTransferError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
    return "You cancelled the send in your wallet app. Nothing was sent.";
  }
  return "Send didn't go through. Your voucher is still yours. Try again.";
}

export function TransferModal({ visible, coinAmount, onClose, onConfirm }: TransferModalProps) {
  const [toAddress, setToAddress] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = toAddress.trim();
  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const showHint = trimmed.length > 0 && !isValidAddress;

  const handleConfirm = async () => {
    if (!isValidAddress) return;
    setIsPending(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      setToAddress("");
      onClose();
    } catch (err) {
      setError(friendlyTransferError((err as Error).message ?? ""));
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

  const handlePaste = async () => {
    const text = await pasteText();
    if (text) setToAddress(text.trim());
  };

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      dismissable={!isPending}
      title="Send voucher to someone"
      subtitle={`${coinsToUsd(coinAmount)} voucher · ${formatCoins(coinAmount)} coins`}
      testID="transfer-sheet"
    >
      <View style={styles.field}>
        <AppText variant="overline">Their wallet address</AppText>
        <View style={[styles.inputRow, showHint && styles.inputRowError]}>
          <TextInput
            style={styles.input}
            placeholder="0x…"
            placeholderTextColor={palette.textFaint}
            value={toAddress}
            onChangeText={setToAddress}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isPending}
            accessibilityLabel="Recipient wallet address"
            testID="transfer-address-input"
          />
          <Pressable
            onPress={() => void handlePaste()}
            disabled={isPending}
            style={styles.paste}
            accessibilityRole="button"
            accessibilityLabel="Paste address"
            hitSlop={6}
            testID="transfer-paste"
          >
            <Ionicons name="clipboard-outline" size={14} color={palette.gold} />
            <AppText variant="caption" tone="gold" style={styles.pasteText}>
              Paste
            </AppText>
          </Pressable>
        </View>
        {showHint && (
          <AppText variant="caption" tone="danger">
            That doesn't look like a wallet address. It should start with 0x and be 42 characters long.
          </AppText>
        )}
      </View>

      <View style={styles.warning} accessibilityRole="alert">
        <Ionicons name="warning" size={18} color={palette.danger} />
        <AppText variant="bodySmall" style={styles.warningText}>
          Sends can't be undone. If the address is wrong, the voucher is gone for good. Double-check it.
        </AppText>
      </View>

      {error && (
        <AppText variant="bodySmall" tone="danger" align="center" accessibilityRole="alert">
          {error}
        </AppText>
      )}

      <View style={styles.buttons}>
        <Button label="Cancel" variant="secondary" onPress={handleClose} disabled={isPending} style={styles.flex} />
        <Button
          label={`Send ${coinsToUsd(coinAmount)}`}
          variant="danger"
          onPress={() => void handleConfirm()}
          disabled={!isValidAddress}
          loading={isPending}
          style={styles.flex}
          testID="transfer-confirm"
          accessibilityLabel="Confirm send"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: spacing.sm },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    borderRadius: radius.md,
    backgroundColor: palette.bg,
    paddingRight: spacing.sm,
  },
  inputRowError: { borderColor: palette.danger },
  input: {
    flex: 1,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s12,
    color: palette.text,
    fontFamily: "monospace",
    fontSize: 13,
  },
  paste: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: "rgba(233,196,106,0.12)",
  },
  pasteText: { fontFamily: fonts.bold },
  warning: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: "rgba(229,72,77,0.1)",
    borderWidth: 1,
    borderColor: "rgba(229,72,77,0.4)",
  },
  warningText: { flex: 1, color: palette.text },
  buttons: { flexDirection: "row", gap: spacing.sm },
});
