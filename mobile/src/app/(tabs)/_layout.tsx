import React from "react";
import { StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/theme";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface TabIconProps {
  name: IoniconsName;
  activeName: IoniconsName;
  color: string;
  focused: boolean;
  size: number;
}

function TabIcon({ name, activeName, color, focused, size }: TabIconProps) {
  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
      <Ionicons name={focused ? activeName : name} size={size} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "rgba(22, 0, 41, 0.97)",
          borderTopColor: "rgba(61, 0, 120, 0.60)",
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.neonGreen,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.8,
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomColor: "rgba(61, 0, 120, 0.50)",
          borderBottomWidth: 1,
        } as object,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "800", fontSize: 16, letterSpacing: 0.3 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Lobby",
          tabBarLabel: "Lobby",
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon
              name="albums-outline"
              activeName="albums"
              color={color}
              focused={focused}
              size={size}
            />
          ),
          headerTitle: "NFT Proxy Gamble",
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: "Video Poker",
          tabBarLabel: "Play",
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon
              name="card-outline"
              activeName="card"
              color={color}
              focused={focused}
              size={size}
            />
          ),
          headerTitle: "9/6 Jacks or Better",
        }}
      />
      <Tabs.Screen
        name="nfts"
        options={{
          title: "My NFTs",
          tabBarLabel: "NFTs",
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon
              name="diamond-outline"
              activeName="diamond"
              color={color}
              focused={focused}
              size={size}
            />
          ),
          headerTitle: "My Vouchers",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon
              name="person-outline"
              activeName="person"
              color={color}
              focused={focused}
              size={size}
            />
          ),
          headerTitle: "Profile & Settings",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 38,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  iconWrapperActive: {
    backgroundColor: `${colors.neonGreen}18`,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
});
