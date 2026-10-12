import React, { useRef, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "@/stores/settingsStore";
import { playVoice } from "@/services/soundService";
import { AppText, Button, ChipGraphic, CoinIcon, PlayingCard } from "@/components/ui";
import { BRAND } from "@/config/brand";
import { fonts, gradients, palette, radius, spacing } from "@/theme";

// Kept verbatim from the original age gate declaration.
export const JURISDICTION_DECLARATION =
  "By tapping Yes, you declare that you are 18 or older and that online gambling is legal in your jurisdiction.";
export const GAMBLE_AWARE_URL = "https://www.begambleaware.org";

export function ShieldEmblem({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <SvgGradient id="shieldGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.goldLight} />
          <Stop offset="0.55" stopColor={palette.gold} />
          <Stop offset="1" stopColor={palette.goldDeep} />
        </SvgGradient>
      </Defs>
      <Path d="M48 6 L84 18 V46 C84 68 68 84 48 90 C28 84 12 68 12 46 V18 Z" fill="url(#shieldGold)" />
      <Path
        d="M48 14 L77 23.5 V46 C77 63.5 64.5 76.5 48 82 C31.5 76.5 19 63.5 19 46 V23.5 Z"
        fill={palette.bgRaised}
        stroke={palette.goldDeep}
        strokeWidth={1}
      />
      <Path d="M35 49 L44.5 58.5 L62 38" fill="none" stroke={palette.gold} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

type Step = "age" | "blocked" | "onboarding";

const SLIDES: { key: string; title: string; body: string; art: React.ReactNode }[] = [
  {
    key: "play",
    title: "Buy coins, play games.",
    body: "Video poker, blackjack and roulette. Every bet is in coins.",
    art: (
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <View style={{ transform: [{ rotate: "-8deg" }], marginRight: -18 }}>
          <PlayingCard cardIndex={51} width={78} showHeldTab={false} />
        </View>
        <View style={{ transform: [{ rotate: "7deg" }] }}>
          <PlayingCard cardIndex={37} width={78} showHeldTab={false} />
        </View>
        <View style={{ marginLeft: -14, marginBottom: -10 }}>
          <ChipGraphic value={100} size={56} />
        </View>
      </View>
    ),
  },
  {
    key: "cashout",
    title: "Cash out your winnings.",
    body: `Turn coins into a voucher anytime. ${BRAND.coinsPerUsd} coins = $1 USDC.`,
    art: (
      <View style={{ alignItems: "center" }}>
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: 1.5 }}>
          <View style={{ backgroundColor: palette.surface, borderRadius: radius.lg - 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, alignItems: "center", gap: 2 }}>
            <AppText variant="overline" tone="gold">
              USDC voucher
            </AppText>
            <AppText style={{ fontFamily: fonts.displayBlack, fontSize: 40, lineHeight: 48, color: palette.gold }}>$5.00</AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CoinIcon size={14} />
              <AppText variant="caption">500 coins</AppText>
            </View>
          </View>
        </LinearGradient>
      </View>
    ),
  },
  {
    key: "fair",
    title: "Every deal is checkable.",
    body: "Before each hand we lock in the shuffle and show you a fingerprint of it. Afterwards you can check the cards weren't changed.",
    art: <ShieldEmblem size={120} />,
  },
];

function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const last = page === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };

  const next = () => {
    if (last) {
      onDone();
      return;
    }
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };

  return (
    <View style={styles.flex}>
      <View style={styles.skipRow}>
        {!last && (
          <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button" testID="onboarding-skip">
            <AppText variant="bodyStrong" tone="dim">
              Skip
            </AppText>
          </Pressable>
        )}
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.flex}
      >
        {SLIDES.map((s) => (
          <View key={s.key} style={[styles.slide, { width }]} testID={`onboarding-${s.key}`}>
            <View style={styles.art}>{s.art}</View>
            <AppText variant="title" align="center">
              {s.title}
            </AppText>
            <AppText variant="body" tone="dim" align="center" style={styles.slideBody}>
              {s.body}
            </AppText>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <Button
          label={last ? "Start playing" : "Next"}
          onPress={next}
          fullWidth
          size="lg"
          testID={last ? "onboarding-done" : "onboarding-next"}
        />
      </View>
    </View>
  );
}

export function FirstRunFlow() {
  const ageConfirmedLocal = useSettingsStore((s) => s.ageConfirmedLocal);
  const onboardingSeen = useSettingsStore((s) => s.onboardingSeen);
  const setSetting = useSettingsStore((s) => s.set);
  const [blocked, setBlocked] = useState(false);

  const visible = !ageConfirmedLocal || !onboardingSeen;
  const step: Step = !ageConfirmedLocal ? (blocked ? "blocked" : "age") : "onboarding";

  const finish = () => {
    setSetting("onboardingSeen", true);
    void playVoice("vo_welcome");
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.root}>
        <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
          {step === "age" && (
            <View style={styles.center} testID="first-run-age">
              <ShieldEmblem />
              <AppText style={styles.wordmark}>{BRAND.wordmark}</AppText>
              <AppText variant="title" align="center">
                Are you 18 or older?
              </AppText>
              <AppText variant="body" tone="dim" align="center" style={styles.decl}>
                {JURISDICTION_DECLARATION}
              </AppText>
              <View style={styles.actions}>
                <Button
                  label="Yes, I'm 18+"
                  onPress={() => setSetting("ageConfirmedLocal", true)}
                  fullWidth
                  size="lg"
                  testID="age-yes"
                />
                <Button label="No" variant="ghost" onPress={() => setBlocked(true)} fullWidth testID="age-no" />
              </View>
            </View>
          )}

          {step === "blocked" && (
            <View style={styles.center} testID="first-run-blocked">
              <View style={styles.blockedIcon}>
                <Ionicons name="hand-left-outline" size={34} color={palette.textDim} />
              </View>
              <AppText variant="title" align="center">
                Sorry, you can't play yet
              </AppText>
              <AppText variant="body" tone="dim" align="center" style={styles.decl}>
                {BRAND.name} is only for adults aged 18 and over. Thanks for being honest.
              </AppText>
              <AppText variant="bodySmall" align="center" style={styles.decl}>
                If gambling is affecting you or someone you know, free and confidential help is available.
              </AppText>
              <View style={styles.actions}>
                <Button
                  label="Visit BeGambleAware"
                  variant="secondary"
                  icon="open-outline"
                  onPress={() => void Linking.openURL(GAMBLE_AWARE_URL)}
                  fullWidth
                />
                <Button label="I made a mistake" variant="ghost" onPress={() => setBlocked(false)} fullWidth />
              </View>
            </View>
          )}

          {step === "onboarding" && <Onboarding onDone={finish} />}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, gap: spacing.md },
  wordmark: { fontFamily: fonts.displayBlack, fontSize: 16, letterSpacing: 6, color: palette.gold, marginTop: -spacing.xs },
  decl: { maxWidth: 340 },
  actions: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.lg },
  blockedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  skipRow: { height: 44, paddingHorizontal: spacing.lg, alignItems: "flex-end", justifyContent: "center" },
  slide: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.md },
  art: { height: 200, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  slideBody: { maxWidth: 320 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.hairlineStrong },
  dotActive: { width: 24, backgroundColor: palette.gold },
});
