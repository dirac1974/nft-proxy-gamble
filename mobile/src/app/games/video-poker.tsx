import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fonts, motion, spacing } from "@/theme";
import { AppText, Button, CARD_RATIO, EmptyState, FairnessBadge, PlayingCard, Toast, haptic, type FairnessState, type ToastTone } from "@/components/ui";
import { WinOverlay } from "@/components/WinOverlay";
import { useRgBlock } from "@/components/shell/RgBlockNotice";
import { PaytableModal } from "@/components/PaytableModal";
import { ProvablyFairModal, isVerified, verifyVideoPokerHand } from "@/components/ProvablyFairModal";
import { PAYTABLE_MIN_ROW, PaytableGrid } from "@/components/videopoker/PaytableGrid";
import { ControlDeck } from "@/components/videopoker/ControlDeck";
import { MeterBar } from "@/components/videopoker/MeterBar";
import { CabinetButton } from "@/components/videopoker/CabinetButton";
import { evaluateHand } from "@/components/videopoker/handEval";
import { cab, cabText, cabTiming } from "@/components/videopoker/cabinet";
import {
  MAX_BET,
  PAYTABLES,
  VARIANTS,
  friendlyError,
  isLosingRank,
  isPremiumRank,
  rankLabel,
  spokenCard,
  variantInfo,
} from "@/components/videopoker/pokerData";
import { useGameStore } from "@/stores/gameStore";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { balanceApi, gameApi, type PokerVariant } from "@/services/api";
import { playBetBeep, playSound } from "@/services/soundService";

const HAND_SIZE = 5;
const CARD_GAP = spacing.sm;
const SIDE = spacing.s12;

type Overlay = { title: string; amount: number } | null;

// Vertical budget (dp) for everything in the body except the card row and paytable rows.
const BANNER_H = 58;
const HELD_H = 26;
const HOLD_H = 28;
const FAIR_H = 28;
const TABS_H = 30;
const METER_H = 44;
const DECK_H = 60;
const BODY_GAPS = spacing.sm * 4 + spacing.sm;
const TABLE_GAPS = spacing.sm * 3;
const SLACK_H = 24;

// Cards are capped by width (5 across); leftover height grows the paytable glass
// instead of leaving empty bands around the banner.
export function cabinetLayout(screenW: number, bodyH: number | null, rows: number): { cardWidth: number; rowHeight: number } {
  const byWidth = Math.floor((screenW - SIDE * 2 - CARD_GAP * (HAND_SIZE - 1)) / HAND_SIZE);
  if (!bodyH) return { cardWidth: Math.min(80, byWidth), rowHeight: PAYTABLE_MIN_ROW };
  const fixed = TABS_H + METER_H + DECK_H + BODY_GAPS + BANNER_H + HELD_H + HOLD_H + FAIR_H + TABLE_GAPS + SLACK_H;
  const minPaytable = rows * PAYTABLE_MIN_ROW;
  const byHeight = Math.floor((bodyH - fixed - minPaytable) / CARD_RATIO);
  const cardWidth = Math.max(48, Math.min(96, byWidth, byHeight));
  const rowHeight = (bodyH - fixed - cardWidth * CARD_RATIO) / rows;
  return { cardWidth, rowHeight };
}

export default function VideoPokerScreen() {
  const qc = useQueryClient();
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const openIAP = useUiStore((s) => s.openIAP);
  const openConnect = useUiStore((s) => s.openConnect);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const {
    phase,
    session,
    dealt,
    result,
    betAmount,
    variant,
    coinBalance,
    setBalance,
    setBetAmount,
    setVariant,
    setSession,
    setDealt,
    toggleHold,
    setResult,
    reset,
  } = useGameStore();

  const [paytableOpen, setPaytableOpen] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const rg = useRgBlock();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [dealKey, setDealKey] = useState(0);
  const [dealDelays, setDealDelays] = useState<number[]>([0, 0, 0, 0, 0]);
  const [drawDelays, setDrawDelays] = useState<number[]>([0, 0, 0, 0, 0]);
  const [dealShown, setDealShown] = useState(phase === "dealt");
  const [revealed, setRevealed] = useState(phase === "drawn");
  const [winMeter, setWinMeter] = useState(phase === "drawn" && result ? result.payout : 0);
  const [creditOverride, setCreditOverride] = useState<number | null>(null);
  const [showUsd, setShowUsd] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rackTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const stopRack = useCallback(() => {
    if (rackTimer.current) clearInterval(rackTimer.current);
    rackTimer.current = null;
  }, []);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      stopRack();
    },
    [stopRack],
  );

  // ---- Balance (server-authoritative, signature-verified in balanceApi) ----
  const { data: balanceData } = useQuery({ queryKey: ["balance"], queryFn: balanceApi.get, enabled: isAuthenticated });
  useEffect(() => {
    if (typeof balanceData === "number") setBalance(balanceData);
  }, [balanceData, setBalance]);

  const { width: screenW } = useWindowDimensions();
  const [bodyH, setBodyH] = useState<number | null>(null);
  const { cardWidth, rowHeight } = cabinetLayout(screenW, bodyH, PAYTABLES[variant].length);

  // ---- DEAL chains start-session → deal: a fresh seed commitment for every hand ----
  const dealMutation = useMutation({
    mutationFn: async ({ bet, v }: { bet: number; v: PokerVariant }) => {
      const s = await gameApi.startSession(bet, v);
      setSession({ sessionId: s.sessionId, serverSeedHash: s.serverSeedHash, clientSeed: s.clientSeed, betAmount: bet });
      const d = await gameApi.deal(s.sessionId);
      return d.dealtCards;
    },
    onSuccess: (cards) => {
      const step = reduceMotion ? 0 : cabTiming.dealStep;
      const delays = cards.map((_, i) => i * step);
      setDealDelays(delays);
      setDealt(cards);
      if (reduceMotion) void playSound("vp_deal");
      else delays.forEach((d) => later(() => void playSound("vp_deal"), d));
      later(() => setDealShown(true), delays[HAND_SIZE - 1]! + motion.flip);
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (err) => {
      haptic("error");
      if (!rg.intercept(err)) setToast({ message: friendlyError(err), tone: "danger" });
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
  });

  const drawMutation = useMutation({
    mutationFn: ({ sessionId, holds }: { sessionId: string; holds: boolean[] }) => gameApi.draw(sessionId, holds),
    onSuccess: (data, { holds }) => {
      let k = 0;
      const step = reduceMotion ? 0 : cabTiming.drawStep;
      const delays = holds.map((h) => (h ? 0 : k++ * step));
      setDrawDelays(delays);
      setRevealed(false);
      setResult({ drawnCards: data.drawnCards, rank: data.rank, payout: data.payout, serverSeed: data.serverSeed }, data.newBalance);
      const replaced = holds.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
      if (reduceMotion) {
        if (replaced.length) void playSound("vp_draw");
      } else {
        replaced.forEach((i) => later(() => void playSound("vp_draw"), delays[i]!));
      }
      const settle = replaced.length ? Math.max(...replaced.map((i) => delays[i]!)) + motion.flip : 0;
      later(() => setRevealed(true), settle + 60);
      qc.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (err) => {
      haptic("error");
      if (!rg.intercept(err)) setToast({ message: friendlyError(err), tone: "danger" });
    },
  });

  const busy = dealMutation.isPending || drawMutation.isPending;
  const inHand = phase === "dealt";
  const showFinal = phase === "drawn" && !!result;
  const handBet = session?.betAmount ?? betAmount;
  const payout = showFinal ? result!.payout : 0;
  const paysMoreThanBet = payout > handBet;
  const premium = showFinal && paysMoreThanBet && isPremiumRank(result!.rank, variant);

  // ---- Result: rack-up WIN + CREDIT with a tick per step, then jingle (only if paid > bet) ----
  const announced = useRef<string | null>(phase === "drawn" ? (session?.sessionId ?? null) : null);
  useEffect(() => {
    if (!revealed || !showFinal) return;
    const key = session?.sessionId ?? "";
    if (announced.current === key) return;
    announced.current = key;

    if (payout <= 0 || isLosingRank(result!.rank)) {
      void playSound("vp_game_over");
      return;
    }
    const finish = () => {
      stopRack();
      setWinMeter(payout);
      setCreditOverride(null);
      if (!paysMoreThanBet) return; // push: no celebration
      void playSound(premium ? "vp_win_big" : "vp_win");
      // WinOverlay fires its own haptic; only buzz here when it isn't shown.
      if (premium) setOverlay({ title: rankLabel(result!.rank), amount: payout - handBet });
      else haptic("success");
    };
    const start = coinBalance - payout;
    if (reduceMotion || !paysMoreThanBet) {
      // Push (bet returned) snaps the meters with a single tick — no rack-up that reads like a win.
      void playSound("vp_credit_tick");
      finish();
      return;
    }
    const steps = Math.min(payout, premium ? cabTiming.rackPremiumSteps : cabTiming.rackMaxSteps);
    const interval = Math.min(90, (premium ? cabTiming.rackPremiumMs : cabTiming.rackNormalMs) / steps);
    let n = 0;
    setWinMeter(0);
    setCreditOverride(start);
    stopRack();
    rackTimer.current = setInterval(() => {
      n += 1;
      const paid = Math.round((payout * n) / steps);
      setWinMeter(paid);
      setCreditOverride(start + paid);
      void playSound("vp_credit_tick");
      if (n >= steps) finish();
    }, interval);
  }, [revealed, showFinal, session?.sessionId, payout, paysMoreThanBet, premium, result, handBet, coinBalance, reduceMotion, stopRack]);

  // ---- Actions ----
  const startHand = (bet: number) => {
    if (busy || inHand) return;
    if (balanceData !== undefined && coinBalance < bet) {
      haptic("warning");
      setToast({ message: `Not enough credits for a ${bet}-credit bet. Tap + to add coins.`, tone: "warn" });
      return;
    }
    stopRack();
    setOverlay(null);
    setFairOpen(false);
    setRevealed(false);
    setDealShown(false);
    setWinMeter(0);
    setCreditOverride(null);
    reset();
    setDealKey((k) => k + 1);
    dealMutation.mutate({ bet, v: variant });
  };

  const onDraw = () => {
    if (busy || !session || !dealt) return;
    drawMutation.mutate({ sessionId: session.sessionId, holds: [...dealt.holds] });
  };

  const onToggleHold = (i: number) => {
    if (!inHand || busy || !dealt) return;
    haptic("light");
    void playSound(dealt.holds[i] ? "vp_unhold" : "vp_hold");
    toggleHold(i);
  };

  const onBetOne = () => {
    const next = betAmount >= MAX_BET ? 1 : betAmount + 1;
    void playBetBeep(next);
    setBetAmount(next);
  };

  const onBetMax = () => {
    if (betAmount !== MAX_BET) void playBetBeep(MAX_BET);
    setBetAmount(MAX_BET);
    startHand(MAX_BET);
  };

  const onVariant = (v: PokerVariant) => {
    if (inHand || busy || v === variant) return;
    haptic("select");
    void playBetBeep(1);
    stopRack();
    setWinMeter(0);
    setCreditOverride(null);
    setRevealed(false);
    reset();
    setVariant(v);
  };

  // ---- Derived view state ----
  const faces: (number | null)[] = showFinal
    ? result!.drawnCards
    : dealt
      ? dealt.dealtCards
      : Array<number | null>(HAND_SIZE).fill(null);

  const madeHand = useMemo(() => (inHand && dealt ? evaluateHand(dealt.dealtCards, variant) : "LOSE"), [inHand, dealt, variant]);

  const verification = useMemo(
    () => (session && dealt && result ? verifyVideoPokerHand(session, dealt, result) : null),
    [session, dealt, result],
  );
  const fairOk = verification ? isVerified(verification) : null;
  const fairState: FairnessState | null =
    fairOk === true ? "verified" : fairOk === false ? "failed" : session ? "sealed" : busy ? "pending" : null;

  const creditShown = creditOverride ?? (showFinal && !revealed ? coinBalance - payout : coinBalance);
  const hideToast = useCallback(() => setToast(null), []);
  const dismissOverlay = useCallback(() => setOverlay(null), []);
  const info = variantInfo(variant);

  // Banner text over the cards, like a cabinet.
  let bannerMain = "";
  let bannerSub = "";
  let bannerTone: "yellow" | "white" = "yellow";
  if (showFinal && revealed) {
    if (payout <= 0) {
      bannerMain = "Game over";
      bannerSub = `No win · −${handBet} credit${handBet === 1 ? "" : "s"}`;
      bannerTone = "white";
    } else {
      bannerMain = rankLabel(result!.rank);
      bannerSub = paysMoreThanBet ? `Win ${winMeter}` : "Push — bet returned";
      if (!paysMoreThanBet) bannerTone = "white";
    }
  } else if (inHand) {
    if (dealShown && !isLosingRank(madeHand)) bannerMain = rankLabel(madeHand);
    bannerSub = "Tap cards to hold";
  } else if (!busy && !showFinal) {
    bannerMain = `Play ${betAmount} credit${betAmount === 1 ? "" : "s"}`;
    if (betAmount < MAX_BET) bannerSub = "Bet max for royal bonus";
    bannerTone = "white";
  }

  const paytableSheet = (
    <PaytableModal
      visible={paytableOpen}
      betAmount={betAmount}
      variant={variant}
      highlightRank={showFinal && revealed && paysMoreThanBet ? result!.rank : null}
      onClose={() => setPaytableOpen(false)}
    />
  );

  const topBar = (
    <View style={styles.topBar}>
      <Pressable
        onPress={() => {
          haptic("light");
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
        style={styles.iconBtn}
        accessibilityRole="button"
        accessibilityLabel="Back to lobby"
        hitSlop={8}
        testID="game-back"
      >
        <Ionicons name="chevron-back" size={22} color={cab.white} />
      </Pressable>
      <View style={styles.titleWrap}>
        <AppText style={styles.title} numberOfLines={1}>
          {info.name}
        </AppText>
        <AppText style={styles.subtitle} numberOfLines={1}>
          Video Poker · {info.spec}
        </AppText>
      </View>
      {isAuthenticated && (
        <Pressable
          onPress={() => {
            haptic("light");
            openIAP();
          }}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Add coins"
          hitSlop={8}
          testID="add-coins"
        >
          <Ionicons name="add" size={22} color={cab.yellow} />
        </Pressable>
      )}
      <Pressable
        onPress={() => {
          haptic("light");
          setPaytableOpen(true);
        }}
        style={styles.iconBtn}
        accessibilityRole="button"
        accessibilityLabel="Rules and payouts"
        hitSlop={8}
        testID="game-info"
      >
        <Ionicons name="information-circle-outline" size={22} color={cab.yellow} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root} testID="video-poker">
      <LinearGradient colors={[cab.screenTop, cab.screenBottom]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {topBar}

        {!isAuthenticated ? (
          <View style={styles.locked}>
            <EmptyState
              icon="wallet-outline"
              title="Connect your wallet to start playing"
              body="Your credits and every hand are tied to your wallet. You can look at the pays first."
              cta={{ label: "Connect wallet", onPress: openConnect, testID: "connect-wallet" }}
              testID="video-poker-locked"
            />
            <Button label="See pays" variant="ghost" icon="grid-outline" onPress={() => setPaytableOpen(true)} testID="paytable-button" />
          </View>
        ) : (
          <View style={styles.body} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
            <Toast message={toast?.message ?? null} tone={toast?.tone ?? "danger"} onHide={hideToast} />
            {rg.notice}

            <View style={styles.gameSelect} accessibilityRole="tablist">
              {VARIANTS.map((v) => (
                <CabinetButton
                  key={v.id}
                  label={v.short}
                  onPress={() => onVariant(v.id)}
                  tone="blue"
                  active={v.id === variant}
                  disabled={(inHand || busy) && v.id !== variant}
                  height={30}
                  fontSize={10}
                  haptic={false}
                  style={styles.flex}
                  testID={`variant-${v.id}`}
                  accessibilityLabel={`${v.name}${v.id === variant ? ", selected" : ""}`}
                />
              ))}
            </View>

            <PaytableGrid
              variant={variant}
              bet={betAmount}
              winningRank={showFinal && revealed && paysMoreThanBet ? result!.rank : null}
              blink={!reduceMotion}
              onPress={() => setPaytableOpen(true)}
              rowHeight={rowHeight}
            />

            <View style={styles.table}>
              <View style={styles.banner} accessibilityLiveRegion="polite" testID="cabinet-banner">
                <AppText
                  numberOfLines={1}
                  style={[styles.bannerMain, bannerTone === "white" && styles.bannerWhite]}
                  testID="banner-main"
                >
                  {bannerMain}
                </AppText>
                <AppText
                  numberOfLines={1}
                  style={[styles.bannerSub, (inHand || (showFinal && payout <= 0)) && styles.bannerHint]}
                  testID={inHand ? "hold-hint" : "banner-sub"}
                >
                  {bannerSub}
                </AppText>
              </View>

              <View style={[styles.cardRow, { gap: CARD_GAP }]}>
                {faces.map((face, i) => {
                  const held = inHand && !!dealt?.holds[i];
                  return (
                    <View key={`${dealKey}-${i}`} style={styles.slot}>
                      <AppText style={[styles.held, !held && styles.hidden]} accessibilityElementsHidden={!held}>
                        HELD
                      </AppText>
                      <PlayingCard
                        testID={`card-${i}`}
                        cardIndex={face}
                        faceDown={face === null}
                        held={held}
                        showHeldTab={false}
                        width={cardWidth}
                        flipDelay={showFinal ? drawDelays[i]! : dealDelays[i]!}
                        onPress={() => onToggleHold(i)}
                        disabled={!inHand || busy}
                        accessibilityLabel={face === null ? `Card ${i + 1}, face down` : `${spokenCard(face)}${held ? ", held" : ""}`}
                      />
                    </View>
                  );
                })}
              </View>

              <View style={[styles.cardRow, { gap: CARD_GAP }]}>
                {faces.map((_, i) => (
                  <CabinetButton
                    key={i}
                    label="Hold"
                    onPress={() => onToggleHold(i)}
                    tone="yellow"
                    active={inHand && !!dealt?.holds[i]}
                    disabled={!inHand || busy}
                    height={28}
                    fontSize={10}
                    haptic={false}
                    style={{ width: cardWidth }}
                    testID={`hold-${i}`}
                    accessibilityLabel={`Hold card ${i + 1}`}
                  />
                ))}
              </View>

              <View style={styles.fairRow}>
                {fairState ? (
                  <FairnessBadge state={fairState} onPress={verification ? () => setFairOpen(true) : undefined} />
                ) : null}
              </View>
            </View>

            <MeterBar
              win={winMeter}
              bet={inHand || showFinal ? handBet : betAmount}
              credit={creditShown}
              showUsd={showUsd}
              onToggleUnits={() => {
                haptic("select");
                setShowUsd((u) => !u);
              }}
            />

            <ControlDeck
              bet={betAmount}
              mode={inHand ? "draw" : "deal"}
              busy={busy}
              betLocked={inHand}
              heldCount={dealt?.holds.filter(Boolean).length ?? 0}
              onSeePays={() => setPaytableOpen(true)}
              onBetOne={onBetOne}
              onBetMax={onBetMax}
              onPrimary={() => (inHand ? onDraw() : startHand(betAmount))}
            />
          </View>
        )}
      </SafeAreaView>

      {paytableSheet}

      {session && dealt && result && (
        <ProvablyFairModal visible={fairOpen} onClose={() => setFairOpen(false)} session={session} dealt={dealt} result={result} />
      )}

      <WinOverlay
        visible={!!overlay}
        tier="big"
        title={overlay?.title ?? ""}
        amount={overlay?.amount ?? 0}
        onDismiss={dismissOverlay}
        silent
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cab.screenBottom },
  flex: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: SIDE, paddingVertical: spacing.xs },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1 },
  title: { ...cabText.banner, fontSize: 16, lineHeight: 20, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: cab.dimWhite },
  locked: { flex: 1, justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  body: { flex: 1, paddingHorizontal: SIDE, paddingBottom: spacing.sm, gap: spacing.sm },
  gameSelect: { flexDirection: "row", gap: spacing.xs },
  table: { flex: 1, justifyContent: "center", gap: spacing.sm, minHeight: 0 },
  banner: { alignItems: "center", justifyContent: "flex-end", minHeight: 40 },
  bannerMain: { ...cabText.banner, fontSize: 20, lineHeight: 24, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  bannerWhite: { color: cab.white },
  bannerSub: { fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16, color: cab.yellow, letterSpacing: 1.2, textTransform: "uppercase" },
  bannerHint: { color: cab.white },
  cardRow: { flexDirection: "row", justifyContent: "center" },
  slot: { alignItems: "center" },
  held: {
    ...cabText.banner,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 3,
  },
  hidden: { opacity: 0 },
  fairRow: { alignItems: "center", justifyContent: "center", height: FAIR_H },
});
