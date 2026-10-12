import React from "react";
import { Linking, StyleSheet, View } from "react-native";
import { AppText, ListRow, ListSection, haptic } from "@/components/ui";
import { useSettingsStore } from "@/stores/settingsStore";
import { BRAND } from "@/config/brand";
import { spacing } from "@/theme";

export const GAMBLE_AWARE_URL = "https://www.begambleaware.org";
export const REMINDER_OPTIONS = [0, 30, 60, 120];

export function reminderLabel(m: number): string {
  return m === 0 ? "Off" : m < 60 ? `${m} min` : `${m / 60} hr`;
}

// Profile → responsible gaming. Owned jointly: the limits/self-exclusion engineer extends the
// "Limits & self-exclusion" section below with real rows once the backend lands.
export function ResponsibleGamingSection() {
  const minutes = useSettingsStore((s) => s.sessionReminderMin);
  const setSetting = useSettingsStore((s) => s.set);

  const cycleReminder = () => {
    haptic("select");
    const i = REMINDER_OPTIONS.indexOf(minutes);
    setSetting("sessionReminderMin", REMINDER_OPTIONS[(i + 1) % REMINDER_OPTIONS.length]!);
  };

  return (
    <View style={styles.wrap} testID="responsible-gaming-section">
      <ListSection title="Responsible gaming">
        <ListRow
          icon="time"
          label="Reality check"
          detail="A pause with your session time and result after this much play"
          value={reminderLabel(minutes)}
          onPress={cycleReminder}
          testID="session-reminder"
        />
        <ListRow
          icon="heart"
          label="Get support"
          detail="Free, confidential help at begambleaware.org"
          onPress={() => void Linking.openURL(GAMBLE_AWARE_URL)}
          testID="rg-support"
        />
      </ListSection>

      <View testID="rg-limits-section">
        <AppText variant="overline" style={styles.limitsTitle}>
          Limits & self-exclusion
        </AppText>
        {/* Limits rows (deposit/loss/wager limits, cool-off, self-exclusion) are added here. */}
        <AppText variant="caption" style={styles.limitsNote} testID="rg-limits-placeholder">
          Spending limits, cool-off periods and self-exclusion are on the way. Need one now? Email{" "}
          {BRAND.supportEmail} and we'll set it up for you.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  limitsTitle: { marginLeft: spacing.xs, marginBottom: spacing.sm },
  limitsNote: { marginHorizontal: spacing.xs },
});
