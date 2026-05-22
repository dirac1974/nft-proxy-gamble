// TODO (Claude Phase 3): Full implementation
// Use react-native-reanimated for card flips, 5 Card components
// State: betAmount (1-5), cards: string[] (e.g. 'Ah', 'Kd'), holds: boolean[], phase: 'bet' | 'deal' | 'draw' | 'payout'
// Call backend /game/video-poker/* via TanStack Query
// On payout: confetti + update balance store

import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function VideoPokerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>9/6 Jacks or Better</Text>
      <Text>RTP: 99.54% | House Edge: 0.46%</Text>
      {/* Claude: Implement full UI here - cards as Touchable cards with hold toggle */}
      <Button title="DEAL (Stub)" onPress={() => alert('Implement deal flow')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f001a' },
  title: { fontSize: 24, color: '#00ff9f', fontWeight: 'bold' },
});