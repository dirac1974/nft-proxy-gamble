import React, { useCallback, useState } from "react";
import { Linking, StyleSheet, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, ListRow, ListSection, SegmentedControl, Sheet, Toast, haptic, type ToastTone } from "@/components/ui";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWalletStore } from "@/stores/walletStore";
import {
  SELF_EXCLUDE_CONFIRM,
  rgApi,
  type CoolOffHours,
  type RgLimits,
  type RgStatus,
  type SelfExcludeMonths,
} from "@/services/api";
import { formatRgDate, formatRgTime } from "@/components/shell/RgBlockNotice";
import { formatCoins } from "@/config/brand";
import { palette, radius, spacing } from "@/theme";

export const GAMBLE_AWARE_URL = "https://www.begambleaware.org";
export const REMINDER_OPTIONS = [0, 30, 60, 120];
export const RG_QUERY_KEY = ["rg"] as const;

export function reminderLabel(m: number): string {
  return m === 0 ? "Off" : m < 60 ? `${m} min` : `${m / 60} hr`;
}

type LimitKey = keyof RgLimits;

const LIMIT_COPY: Record<LimitKey, { label: string; icon: "card-outline" | "trending-down-outline"; about: string }> = {
  dailyDepositLimitCoins: {
    label: "Daily deposit limit",
    icon: "card-outline",
    about: "The most coins you can buy in one day (resets at midnight UTC).",
  },
  dailyLossLimitCoins: {
    label: "Daily loss limit",
    icon: "trending-down-outline",
    about: "Once your net loss for the day reaches this, new rounds pause until midnight UTC.",
  },
};

const COOL_OFF_OPTIONS: { value: `${CoolOffHours}`; label: string }[] = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "1 week" },
  { value: "720", label: "30 days" },
];

const SELF_EXCLUDE_OPTIONS: { value: `${SelfExcludeMonths}`; label: string }[] = [
  { value: "6", label: "6 months" },
  { value: "12", label: "1 year" },
  { value: "60", label: "5 years" },
  { value: "permanent", label: "Permanent" },
];

export function limitValueLabel(v: number | null): string {
  return v === null ? "No limit" : `${formatCoins(v)} coins`;
}

/** "Takes effect …" copy for a queued increase/removal of one limit, or null. */
export function pendingNote(status: RgStatus | undefined, key: LimitKey): string | null {
  const p = status?.pending;
  if (!p || !(key in p)) return null;
  const next = p[key] ?? null;
  return `${next === null ? "Removal" : `Change to ${formatCoins(next)}`} · Takes effect ${formatRgTime(p.effectiveAt)}`;
}

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Limit editor
// ---------------------------------------------------------------------------
function LimitSheet({
  limitKey,
  status,
  onClose,
  onSaved,
}: {
  limitKey: LimitKey;
  status: RgStatus;
  onClose: () => void;
  onSaved: (s: RgStatus, queued: boolean) => void;
}) {
  const current = status.limits[limitKey];
  const [text, setText] = useState(current === null ? "" : String(current));
  const parsed = /^\d+$/.test(text.trim()) ? parseInt(text.trim(), 10) : NaN;
  const valid = Number.isFinite(parsed) && parsed >= 1;
  const copy = LIMIT_COPY[limitKey];

  const mutation = useMutation({
    mutationFn: (value: number | null) => rgApi.setLimits({ [limitKey]: value }),
    onSuccess: (r) => onSaved(r, r.queued.includes(limitKey)),
  });

  return (
    <Sheet visible onClose={onClose} title={copy.label} subtitle={copy.about} testID="rg-limit-sheet">
      <View style={styles.field}>
        <AppText variant="overline">Coins per day</AppText>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => setText(t.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="e.g. 500"
          placeholderTextColor={palette.textFaint}
          accessibilityLabel={`${copy.label} in coins`}
          testID="rg-limit-input"
          editable={!mutation.isPending}
        />
        <AppText variant="caption">Current: {limitValueLabel(current)}</AppText>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="time-outline" size={16} color={palette.gold} />
        <AppText variant="bodySmall" style={styles.flex}>
          Lowering a limit takes effect right away. Raising or removing it takes effect after 24 hours.
        </AppText>
      </View>

      {mutation.error ? (
        <AppText variant="bodySmall" tone="danger" testID="rg-limit-error">
          {errorText(mutation.error)}
        </AppText>
      ) : null}

      <Button
        label="Save limit"
        onPress={() => mutation.mutate(parsed)}
        disabled={!valid}
        loading={mutation.isPending}
        fullWidth
        testID="rg-limit-save"
      />
      {current !== null ? (
        <Button
          label="Remove limit"
          variant="ghost"
          onPress={() => mutation.mutate(null)}
          disabled={mutation.isPending}
          fullWidth
          testID="rg-limit-remove"
        />
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Take a break (cool-off)
// ---------------------------------------------------------------------------
function CoolOffSheet({ status, onClose, onDone }: { status: RgStatus; onClose: () => void; onDone: (s: RgStatus) => void }) {
  const [hours, setHours] = useState<`${CoolOffHours}`>("24");
  const mutation = useMutation({
    mutationFn: () => rgApi.coolOff(Number(hours) as CoolOffHours),
    onSuccess: onDone,
  });
  return (
    <Sheet visible onClose={onClose} title="Take a break" subtitle="Step away from play for a while." testID="rg-cooloff-sheet">
      <SegmentedControl options={COOL_OFF_OPTIONS} value={hours} onChange={setHours} testIDPrefix="rg-cooloff" />
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={palette.gold} />
        <AppText variant="bodySmall" style={styles.flex}>
          During your break you can't play or buy coins, and the break can't be ended early. You can still cash out
          your balance anytime.
        </AppText>
      </View>
      {status.coolOffUntil ? (
        <AppText variant="caption">Your current break ends {formatRgTime(status.coolOffUntil)}. Choosing a longer break extends it.</AppText>
      ) : null}
      {mutation.error ? (
        <AppText variant="bodySmall" tone="danger">
          {errorText(mutation.error)}
        </AppText>
      ) : null}
      <Button label="Start break" onPress={() => mutation.mutate()} loading={mutation.isPending} fullWidth testID="rg-cooloff-confirm" />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Self-exclusion — strong, typed confirmation
// ---------------------------------------------------------------------------
const CONSEQUENCES = [
  "You won't be able to play any game or buy coins for the whole period.",
  "It can't be cancelled or shortened — not by you, and not by support.",
  "You can still cash out your coin balance anytime from Wallet.",
  "If you're struggling, free and confidential help is available at begambleaware.org.",
];

function SelfExcludeSheet({ onClose, onDone }: { onClose: () => void; onDone: (s: RgStatus) => void }) {
  const [period, setPeriod] = useState<`${SelfExcludeMonths}`>("6");
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim() === SELF_EXCLUDE_CONFIRM;
  const mutation = useMutation({
    mutationFn: () => rgApi.selfExclude(period === "permanent" ? "permanent" : (Number(period) as SelfExcludeMonths)),
    onSuccess: onDone,
  });
  const periodLabel = SELF_EXCLUDE_OPTIONS.find((o) => o.value === period)!.label.toLowerCase();

  return (
    <Sheet
      visible
      onClose={onClose}
      dismissable={!mutation.isPending}
      title="Self-exclusion"
      subtitle="Close your account to play for a set time."
      testID="rg-selfexclude-sheet"
    >
      <SegmentedControl options={SELF_EXCLUDE_OPTIONS} value={period} onChange={setPeriod} testIDPrefix="rg-selfexclude" />

      <View style={[styles.infoBox, styles.warnBox]} accessibilityRole="alert">
        <View style={styles.consequences}>
          <AppText variant="bodyStrong">
            {period === "permanent" ? "Permanent self-exclusion means:" : `For ${periodLabel}:`}
          </AppText>
          {CONSEQUENCES.map((c) => (
            <View key={c} style={styles.bullet}>
              <AppText variant="bodySmall">•</AppText>
              <AppText variant="bodySmall" style={styles.flex}>
                {c}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="overline">Type {SELF_EXCLUDE_CONFIRM} to confirm</AppText>
        <TextInput
          style={styles.input}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={SELF_EXCLUDE_CONFIRM}
          placeholderTextColor={palette.textFaint}
          accessibilityLabel={`Type ${SELF_EXCLUDE_CONFIRM} to confirm`}
          testID="rg-selfexclude-input"
          editable={!mutation.isPending}
        />
      </View>

      {mutation.error ? (
        <AppText variant="bodySmall" tone="danger">
          {errorText(mutation.error)}
        </AppText>
      ) : null}

      <Button
        label={period === "permanent" ? "Self-exclude permanently" : `Self-exclude for ${periodLabel}`}
        variant="danger"
        onPress={() => mutation.mutate()}
        disabled={!confirmed}
        loading={mutation.isPending}
        haptic="warning"
        fullWidth
        testID="rg-selfexclude-confirm"
      />
      <Button label="Cancel" variant="ghost" onPress={onClose} disabled={mutation.isPending} fullWidth />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Profile → Responsible gaming
// ---------------------------------------------------------------------------
type OpenSheet = { kind: "limit"; key: LimitKey } | { kind: "cooloff" } | { kind: "selfexclude" } | null;

export function ResponsibleGamingSection() {
  const minutes = useSettingsStore((s) => s.sessionReminderMin);
  const setSetting = useSettingsStore((s) => s.set);
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const qc = useQueryClient();
  const rg = useQuery({ queryKey: RG_QUERY_KEY, queryFn: rgApi.get, enabled: isAuthenticated });
  const status = rg.data;
  const [open, setOpen] = useState<OpenSheet>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const cycleReminder = () => {
    haptic("select");
    const i = REMINDER_OPTIONS.indexOf(minutes);
    setSetting("sessionReminderMin", REMINDER_OPTIONS[(i + 1) % REMINDER_OPTIONS.length]!);
  };

  const applyStatus = (s: RgStatus, message: string) => {
    qc.setQueryData(RG_QUERY_KEY, s);
    setOpen(null);
    haptic("success");
    setToast({ message, tone: "success" });
  };

  const selfExcluded = !!status?.selfExcludedUntil;
  const limitRow = (key: LimitKey) => (
    <ListRow
      key={key}
      icon={LIMIT_COPY[key].icon}
      label={LIMIT_COPY[key].label}
      detail={pendingNote(status, key) ?? undefined}
      value={status ? limitValueLabel(status.limits[key]) : "…"}
      onPress={status ? () => setOpen({ kind: "limit", key }) : undefined}
      testID={`rg-row-${key}`}
    />
  );

  return (
    <View style={styles.wrap} testID="responsible-gaming-section">
      <Toast message={toast?.message ?? null} tone={toast?.tone} onHide={hideToast} testID="rg-toast" />
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
        {!isAuthenticated ? (
          <>
            <AppText variant="overline" style={styles.limitsTitle}>
              Limits & self-exclusion
            </AppText>
            <AppText variant="caption" style={styles.limitsNote} testID="rg-limits-signed-out">
              Connect your wallet to set deposit and loss limits, take a break, or self-exclude.
            </AppText>
          </>
        ) : rg.isError ? (
          <>
            <AppText variant="overline" style={styles.limitsTitle}>
              Limits & self-exclusion
            </AppText>
            <AppText variant="caption" style={styles.limitsNote} testID="rg-limits-error">
              Couldn't load your limits. <AppText variant="caption" tone="gold" onPress={() => void rg.refetch()}>Try again</AppText>
            </AppText>
          </>
        ) : (
          <ListSection title="Limits & self-exclusion">
            {limitRow("dailyDepositLimitCoins")}
            {limitRow("dailyLossLimitCoins")}
            <ListRow
              icon="cafe-outline"
              label="Take a break"
              detail={status?.coolOffUntil ? `On a break until ${formatRgTime(status.coolOffUntil)}` : "Pause play for 24 hours up to 30 days"}
              value={status?.coolOffUntil ? "On" : "Off"}
              onPress={status && !selfExcluded ? () => setOpen({ kind: "cooloff" }) : undefined}
              testID="rg-row-cooloff"
            />
            <ListRow
              icon="hand-left-outline"
              label="Self-exclusion"
              tone="danger"
              detail={
                status?.selfExclusionPermanent
                  ? "Permanently self-excluded"
                  : status?.selfExcludedUntil
                    ? `Self-excluded until ${formatRgDate(status.selfExcludedUntil)}`
                    : "Close your account to play for 6 months or more"
              }
              value={selfExcluded ? "Active" : undefined}
              onPress={status && !status.selfExclusionPermanent ? () => setOpen({ kind: "selfexclude" }) : undefined}
              testID="rg-row-selfexclude"
            />
          </ListSection>
        )}
        {status ? (
          <AppText variant="caption" style={[styles.limitsNote, styles.today]} testID="rg-today">
            Today: {formatCoins(status.today.depositsCoins)} coins bought · {formatCoins(status.today.netLossCoins)} net loss
          </AppText>
        ) : null}
      </View>

      {status && open?.kind === "limit" ? (
        <LimitSheet
          limitKey={open.key}
          status={status}
          onClose={() => setOpen(null)}
          onSaved={(s, queued) =>
            applyStatus(
              s,
              queued && s.pending ? `Saved. Takes effect ${formatRgTime(s.pending.effectiveAt)}.` : "Limit updated.",
            )
          }
        />
      ) : null}
      {status && open?.kind === "cooloff" ? (
        <CoolOffSheet
          status={status}
          onClose={() => setOpen(null)}
          onDone={(s) => applyStatus(s, `Break started. See you ${s.coolOffUntil ? formatRgTime(s.coolOffUntil) : "soon"}.`)}
        />
      ) : null}
      {status && open?.kind === "selfexclude" ? (
        <SelfExcludeSheet onClose={() => setOpen(null)} onDone={(s) => applyStatus(s, "Self-exclusion is now active.")} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  flex: { flex: 1 },
  limitsTitle: { marginLeft: spacing.xs, marginBottom: spacing.sm },
  limitsNote: { marginHorizontal: spacing.xs },
  today: { marginTop: spacing.sm },
  field: { gap: spacing.xs },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  infoBox: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: "rgba(233,196,106,0.08)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.3)",
  },
  warnBox: { backgroundColor: "rgba(229,72,77,0.08)", borderColor: "rgba(229,72,77,0.35)" },
  consequences: { flex: 1, gap: spacing.xs },
  bullet: { flexDirection: "row", gap: spacing.sm },
});
