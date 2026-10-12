import React from "react";
import { StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette } from "@/theme";
import { haptic } from "@/components/ui";

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ focused, name, color }: { focused: boolean; name: IconName; color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={22} color={color} />
      <View style={[styles.dot, focused && styles.dotActive]} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic("select") }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.gold,
        tabBarInactiveTintColor: palette.textFaint,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, marginTop: 2 },
        tabBarStyle: styles.bar,
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.barTint]} />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Lobby",
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} name="diamond" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} name="wallet" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} name="person-circle" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(233,196,106,0.25)",
    backgroundColor: "transparent",
    elevation: 0,
  },
  barTint: { backgroundColor: "rgba(7,9,15,0.78)" },
  iconWrap: { alignItems: "center", justifyContent: "center", paddingTop: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: "transparent" },
  dotActive: { backgroundColor: palette.gold },
});
