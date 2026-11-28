import React from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { gradients, palette, spacing } from "@/theme";

interface ScreenProps {
  children: React.ReactNode;
  variant?: "default" | "felt";
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
}

export function Screen({
  children,
  variant = "default",
  scroll = false,
  edges = ["top"],
  contentStyle,
  header,
  footer,
  testID,
}: ScreenProps) {
  return (
    <View style={styles.root} testID={testID}>
      <LinearGradient
        colors={variant === "felt" ? gradients.felt : gradients.screen}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {variant === "felt" && (
        <>
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
            style={styles.vignetteTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
            style={styles.vignetteBottom}
            pointerEvents="none"
          />
        </>
      )}
      <SafeAreaView style={styles.flex} edges={edges}>
        {header}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, contentStyle]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
        )}
        {footer}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  vignetteTop: { position: "absolute", top: 0, left: 0, right: 0, height: 180 },
  vignetteBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 260 },
});
