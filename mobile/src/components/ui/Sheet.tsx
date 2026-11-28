import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette, radius, spacing } from "@/theme";
import { AppText } from "./AppText";

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  dismissable?: boolean;
  scroll?: boolean;
  footer?: React.ReactNode;
  testID?: string;
}

// Bottom sheet used by every modal so they share one look.
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  dismissable = true,
  scroll = true,
  footer,
  testID,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      <View style={styles.root} testID={testID}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
          accessibilityLabel={dismissable ? "Close" : undefined}
        >
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Pressable>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.grabber} />
          {(title || dismissable) && (
            <View style={styles.header}>
              <View style={styles.flex}>
                {title ? <AppText variant="heading2">{title}</AppText> : null}
                {subtitle ? (
                  <AppText variant="bodySmall" style={styles.subtitle}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
              {dismissable && (
                <Pressable
                  onPress={onClose}
                  style={styles.close}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={10}
                  testID="sheet-close"
                >
                  <Ionicons name="close" size={20} color={palette.textDim} />
                </Pressable>
              )}
            </View>
          )}
          {scroll ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.bodyContent}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { backgroundColor: "rgba(4,6,10,0.55)" },
  sheet: {
    backgroundColor: palette.bgRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: "rgba(233,196,106,0.25)",
    maxHeight: "90%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.hairlineStrong,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  flex: { flex: 1 },
  subtitle: { marginTop: 2 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.surfaceHi,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
