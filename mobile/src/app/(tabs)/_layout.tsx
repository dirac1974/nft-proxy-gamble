import React from "react";
import { Tabs } from "expo-router";
import { colors } from "@/theme";

function TabIcon({ label, emoji }: { label: string; emoji: string }) {
  return null; // expo-router renders tabBarLabel separately; icon placeholder
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.neonGreen,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Lobby",
          tabBarLabel: "Lobby",
          tabBarIcon: ({ color }) => <TabBarEmoji emoji="🎰" color={color} />,
          headerTitle: "NFT Proxy Gamble",
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: "Video Poker",
          tabBarLabel: "Play",
          tabBarIcon: ({ color }) => <TabBarEmoji emoji="🃏" color={color} />,
          headerTitle: "9/6 Jacks or Better",
        }}
      />
      <Tabs.Screen
        name="nfts"
        options={{
          title: "My NFTs",
          tabBarLabel: "NFTs",
          tabBarIcon: ({ color }) => <TabBarEmoji emoji="💎" color={color} />,
          headerTitle: "My Vouchers",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color }) => <TabBarEmoji emoji="👤" color={color} />,
          headerTitle: "Profile & Settings",
        }}
      />
    </Tabs>
  );
}

function TabBarEmoji({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require("react-native");
  return <Text style={{ fontSize: 20, opacity: color === colors.neonGreen ? 1 : 0.5 }}>{emoji}</Text>;
}
