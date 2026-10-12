import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fonts, palette, radius, spacing, typography } from "@/theme";
import {
  AppText,
  Badge,
  Button,
  ChipGraphic,
  CARD_RATIO,
  EmptyState,
  FairnessBadge,
  GameHeader,
  Screen,
  Toast,
  haptic,
  type ToastTone,
} from "@/components/ui";
import { WinOverlay, classifyWin, type WinTier } from "@/components/WinOverlay";
import { useRgBlock } from "@/components/shell/RgBlockNotice";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { preloadGroup, playSound, playVoice, winSoundFor } from "@/services/soundService";
import { balanceApi, blackjackApi, type BlackjackActionName, type BlackjackRound } from "@/services/api";
import { verifyBlackjackDeal, type BlackjackVerificationResult } from "@/services/provablyFair";
import { formatCoins } from "@/config/brand";
import {
  BET_CHIPS,
  BJ_MIN_BET,
  betRejectionMessage,
  handValue,
  humanError,
  isNatural,
  resultView,
  roundVoice,
  tryRaiseBet,
  type Shown,
  type Step,
} from "@/components/blackjack/bjLogic";
import { useDealTimeline } from "@/components/blackjack/useDealTimeline";
import { CardFan, type FanCard } from "@/components/blackjack/CardFan";
import { HandValueBadge } from "@/components/blackjack/HandValueBadge";
import { BetCircle } from "@/components/blackjack/BetCircle";
import { PRINT_HEIGHT, TablePrint } from "@/components/blackjack/TablePrint";
import { ActionBar } from "@/components/blackjack/ActionBar";
import { InsurancePanel } from "@/components/blackjack/InsurancePanel";
import { FairnessSheet, type FairStatus } from "@/components/blackjack/FairnessSheet";
import { RulesSheet } from "@/components/blackjack/RulesSheet";

type Session = {
  sessionId: string;
  serverSeedHash: string;
  clientSeed: string;
  numDecks: number;
  dealerHitsSoft17: boolean;
};

type ToastState = { message: string; tone: ToastTone } | null;
type WinState = { tier: WinTier; title: string; amount: number } | null;

const SESSION_TAIL_MS = 900;
// Non-card vertical space inside the table (labels, badges, bet spot, minimum felt print).
const TABLE_FIXED_H = 250;
const PRINT_MIN_H = 96;

// Card width from the table height measured in the betting layout (the tallest footer),
// so cards grow ~30% on tall phones and never resize mid-round.
export function blackjackCardWidth(tableH: number | null, compact: boolean): number {
  if (!tableH) return compact ? 56 : 64;
  const w = (tableH - TABLE_FIXED_H - PRINT_MIN_H) / (2 * CARD_RATIO);
  return Math.round(Math.max(52, Math.min(88, w)));
}

export default function BlackjackScreen() {
  // Load this game's sounds on mount so the first round has no audio latency.
  useEffect(() => {
    void preloadGroup("blackjack");
  }, []);
  const { isAuthenticated } = useWalletStore();
  const openConnect = useUiStore((s) => s.openConnect);

  if (!isAuthenticated) {
    return (
      <Screen variant="felt" header={<BareHeader />}>
        <View style={styles.center}>
          <EmptyState
            icon="wallet-outline"
            title="Connect your wallet to start playing"
            body="Your coins and every hand you play are tied to your wallet."
            cta={{ label: "Connect wallet", onPress: openConnect, testID: "bj-connect" }}
            testID="bj-not-connected"
          />
        </View>
      </Screen>
    );
  }
  return <BlackjackTable />;
}

function BareHeader() {
  return (
    <View style={styles.bareHeader}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back to lobby"
        hitSlop={8}
        testID="game-back"
      >
        <Ionicons name="chevron-back" size={22} color={palette.text} />
      </Pressable>
      <AppText style={styles.bareTitle}>Blackjack</AppText>
    </View>
  );
}

function BlackjackTable() {
  const qc = useQueryClient();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const compact = screenH < 760;
  const [tableH, setTableH] = useState<number | null>(null);
  const [printH, setPrintH] = useState<number | null>(null);
  const bigCard = blackjackCardWidth(tableH, compact);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const openIAP = useUiStore((s) => s.openIAP);
  const { data: balanceData } = useQuery({ queryKey: ["balance"], queryFn: balanceApi.get });
  const balance = balanceData ?? 0;

  const [session, setSession] = useState<Session | null>(null);
  const [needSession, setNeedSession] = useState(true);
  const [rules, setRules] = useState({ numDecks: 6, dealerHitsSoft17: true });
  const [round, setRound] = useState<BlackjackRound | null>(null);
  const [verification, setVerification] = useState<BlackjackVerificationResult | null>(null);
  const [bet, setBet] = useState(0);
  const [lastBet, setLastBet] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [win, setWin] = useState<WinState>(null);
  const [fairOpen, setFairOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const openingRef = useRef<number[] | null>(null);
  const roundBetRef = useRef(0);
  const pendingBalanceRef = useRef<number | null>(null);
  const tailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insuranceVoiced = useRef<string | null>(null);

  useEffect(() => () => {
    if (tailTimer.current) clearTimeout(tailTimer.current);
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "danger") => setToast({ message, tone }), []);
  const rg = useRgBlock();
  const hideToast = useCallback(() => setToast(null), []);

  // ---- Session: commit a fresh shoe before any bet (one round per session).
  const startMutation = useMutation({
    mutationFn: () => blackjackApi.startSession(),
    onSuccess: (d) => {
      setSession({
        sessionId: d.sessionId,
        serverSeedHash: d.serverSeedHash,
        clientSeed: d.clientSeed,
        numDecks: d.numDecks,
        dealerHitsSoft17: d.dealerHitsSoft17,
      });
      setRules({ numDecks: d.numDecks, dealerHitsSoft17: d.dealerHitsSoft17 });
      setNeedSession(false);
      void playSound("shuffle");
    },
    onError: (e) => {
      setNeedSession(false);
      if (!rg.intercept(e)) showToast(humanError(e));
    },
  });
  const startSession = startMutation.mutate;
  useEffect(() => {
    if (needSession && !session && !startMutation.isPending) startSession();
  }, [needSession, session, startMutation.isPending, startSession]);

  // ---- Presentation timeline
  const onStep = useCallback(
    (step: Step, r: BlackjackRound, s: Shown) => {
      switch (step.kind) {
        case "player": {
          void playSound("card_deal");
          const i = step.hand ?? 0;
          const h = r.hands[i];
          if (h && s.hands[i] === h.cards.length && handValue(h.cards).total > 21) haptic("warning");
          break;
        }
        case "dealer":
          void playSound("card_deal");
          break;
        case "reveal":
          void playSound("card_flip");
          break;
        case "outcome": {
          if (pendingBalanceRef.current !== null) {
            qc.setQueryData(["balance"], pendingBalanceRef.current);
            pendingBalanceRef.current = null;
          }
          const net = r.netProfit ?? 0;
          const base = roundBetRef.current || r.hands[0]?.bet || 0;
          // One win sound (ours, by net) and one haptic: the overlay runs silent and owns the haptic when shown.
          void playSound(winSoundFor(net, base));
          const voice = roundVoice(r);
          if (voice) void playVoice(voice);
          const natural = (r.results ?? []).some((x) => x.outcome === "blackjack");
          const tier = classifyWin(net, base);
          if (tier === "medium" || tier === "big") {
            setWin({ tier, title: natural ? "Blackjack" : "Big win", amount: net });
          } else if (tier) {
            haptic("success");
          }
          setBet(0);
          if (tailTimer.current) clearTimeout(tailTimer.current);
          tailTimer.current = setTimeout(() => setNeedSession(true), reduceMotion ? 250 : SESSION_TAIL_MS);
          break;
        }
      }
    },
    [qc, reduceMotion],
  );
  const { shown, animating } = useDealTimeline(round, reduceMotion, onStep);

  // ---- Round responses
  const onRound = useCallback(
    (r: BlackjackRound, prevWagered: number) => {
      if (r.phase === "settled") {
        // Hold the credited balance until the outcome is on the felt; show the debit now.
        const delta = r.totalWagered - prevWagered;
        qc.setQueryData<number>(["balance"], (b) => (b ?? r.newBalance) - delta);
        pendingBalanceRef.current = r.newBalance;
        setSession(null);
        if (r.serverSeed && r.numDecks) {
          setVerification(
            verifyBlackjackDeal(
              r.serverSeed,
              r.serverSeedHash,
              r.clientSeed,
              r.numDecks,
              openingRef.current ?? r.hands[0]?.cards ?? [],
              r.dealer,
            ),
          );
        }
      } else {
        qc.setQueryData(["balance"], r.newBalance);
      }
      setRound(r);
    },
    [qc],
  );

  const dealMutation = useMutation({
    mutationFn: (v: { sessionId: string; bet: number }) => blackjackApi.deal(v.sessionId, v.bet),
    onSuccess: (r) => {
      openingRef.current = r.hands[0]?.cards.slice(0, 2) ?? null;
      onRound(r, 0);
    },
    onError: (e) => {
      if (!rg.intercept(e)) showToast(humanError(e));
    },
  });
  const actionMutation = useMutation({
    mutationFn: (v: { sessionId: string; action: BlackjackActionName; prevWagered: number }) =>
      blackjackApi.action(v.sessionId, v.action),
    onSuccess: (r, v) => onRound(r, v.prevWagered),
    onError: (e) => {
      if (!rg.intercept(e)) showToast(humanError(e));
    },
  });
  const insuranceMutation = useMutation({
    mutationFn: (v: { sessionId: string; take: boolean; prevWagered: number }) =>
      blackjackApi.insurance(v.sessionId, v.take),
    onSuccess: (r, v) => onRound(r, v.prevWagered),
    onError: (e) => {
      if (!rg.intercept(e)) showToast(humanError(e));
    },
  });

  const pending = dealMutation.isPending || actionMutation.isPending || insuranceMutation.isPending;
  const settledShown = round?.phase === "settled" && shown.settled;
  const betting = !round || settledShown;
  const roundId = round ? `${round.serverSeedHash}:${round.clientSeed}` : null;

  useEffect(() => {
    if (round?.phase === "insurance" && !animating && roundId && insuranceVoiced.current !== roundId) {
      insuranceVoiced.current = roundId;
      void playVoice("vo_insurance");
    }
  }, [round?.phase, animating, roundId]);

  // ---- Betting controls
  const clearTable = useCallback(() => {
    if (round && settledShown) {
      setRound(null);
      setVerification(null);
      openingRef.current = null;
    }
  }, [round, settledShown]);

  const applyBet = useCallback(
    (next: number): boolean => {
      const res = tryRaiseBet(next, balance);
      if (res.bet === null) {
        haptic("warning");
        showToast(betRejectionMessage(res.reason!), "warn");
        return false;
      }
      clearTable();
      setBet(res.bet);
      return true;
    },
    [balance, clearTable, showToast],
  );

  const addChip = (v: number) => {
    if (applyBet(bet + v)) {
      haptic("light");
      void playSound("chip_place");
    }
  };

  const onDeal = () => {
    if (!session) {
      if (!startMutation.isPending) setNeedSession(true);
      showToast("Shuffling a fresh shoe. Try again in a moment.", "info");
      return;
    }
    if (bet < BJ_MIN_BET) return;
    if (bet > balance) {
      showToast(betRejectionMessage("balance"), "warn");
      return;
    }
    if (round) {
      setRound(null);
      setVerification(null);
      openingRef.current = null;
    }
    roundBetRef.current = bet;
    setLastBet(bet);
    dealMutation.mutate({ sessionId: session.sessionId, bet });
  };

  const onAction = (action: BlackjackActionName) => {
    if (!round || !session) return;
    actionMutation.mutate({ sessionId: session.sessionId, action, prevWagered: round.totalWagered });
  };

  const onInsurance = (take: boolean) => {
    if (!round || !session) return;
    insuranceMutation.mutate({ sessionId: session.sessionId, take, prevWagered: round.totalWagered });
  };

  // ---- Derived view
  const contentW = screenW - spacing.md * 2;
  const dealerCards: FanCard[] = useMemo(() => {
    if (!round) return [];
    return Array.from({ length: shown.dealer }, (_, j) =>
      j === 1
        ? { key: "d1", card: shown.hole ? round.dealer[1] : undefined, faceDown: !shown.hole }
        : { key: `d${j}`, card: round.dealer[j] },
    );
  }, [round, shown.dealer, shown.hole]);
  const dealerVisible = round
    ? shown.hole
      ? round.dealer.slice(0, shown.dealer)
      : round.dealer.slice(0, Math.min(1, shown.dealer))
    : [];
  const dealerTotal = handValue(dealerVisible);

  const hands = round?.hands ?? [];
  const nHands = hands.length;
  const cardW = nHands <= 1 ? bigCard : nHands === 2 ? Math.round(bigCard * 0.8) : Math.round(bigCard * 0.66);
  const colW = nHands <= 1 ? contentW * 0.8 : (contentW - (nHands - 1) * spacing.sm) / nHands;

  const activeHand = round && round.phase === "player" ? hands[round.active] : undefined;
  const extraCost = activeHand?.bet ?? 0;
  const inPlay = round ? round.totalWagered : 0;

  const fairStatus: FairStatus =
    round?.phase === "settled" && shown.settled
      ? verification && verification.seedHashMatches && verification.cardsMatch
        ? "verified"
        : "failed"
      : "sealed";
  const fairDetails = round
    ? {
        serverSeedHash: round.serverSeedHash,
        clientSeed: round.clientSeed,
        serverSeed: shown.settled ? round.serverSeed : undefined,
        numDecks: round.numDecks ?? rules.numDecks,
      }
    : session
      ? { serverSeedHash: session.serverSeedHash, clientSeed: session.clientSeed, numDecks: session.numDecks }
      : null;

  const statusText = (() => {
    if (!round) return "";
    if (round.phase === "settled") return shown.settled ? "" : "Dealer's turn";
    if (animating) return "Dealing";
    if (round.phase === "insurance") return "Insurance offered";
    if (pending) return "";
    return nHands > 1 ? `Hand ${round.active + 1} of ${nHands} · Your move` : "Your move";
  })();

  const net = round?.netProfit ?? 0;
  const showNet = settledShown && (nHands > 1 || (round?.insurance ?? 0) > 0);
  const insuranceOpen = round?.phase === "insurance" && !animating;
  const dealerNatural = !!round && shown.hole && isNatural(round.dealer.slice(0, 2)) && shown.dealer === 2;

  return (
    <Screen
      variant="felt"
      edges={["top", "bottom"]}
      contentStyle={styles.content}
      header={
        <GameHeader
          title="Blackjack"
          subtitle={`${rules.numDecks} decks · ${rules.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands on 17"}`}
          balance={balance}
          onAddCoins={openIAP}
          onInfo={() => setRulesOpen(true)}
        />
      }
      footer={
        <View style={styles.deck}>
          {betting ? (
            <>
              <View style={styles.chipRow}>
                {BET_CHIPS.map((v) => {
                  const disabled = pending || bet + v > balance;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => addChip(v)}
                      disabled={pending}
                      style={({ pressed }) => [styles.chipBtn, disabled && styles.dim, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${v} coins to bet`}
                      testID={`chip-${v}`}
                    >
                      <ChipGraphic value={v} size={52} />
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.utilRow}>
                <View style={styles.flex}>
                  <Button
                    label="Clear"
                    variant="secondary"
                    size="sm"
                    fullWidth
                    sound={false}
                    disabled={pending || bet === 0}
                    onPress={() => {
                      setBet(0);
                      void playSound("chip_collect");
                    }}
                    testID="bj-clear"
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    label="Rebet"
                    sublabel={lastBet > 0 ? formatCoins(lastBet) : undefined}
                    variant="secondary"
                    size="sm"
                    fullWidth
                    sound={false}
                    disabled={pending || lastBet === 0 || bet === lastBet}
                    onPress={() => {
                      if (applyBet(lastBet)) void playSound("chip_place");
                    }}
                    testID="bj-rebet"
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    label="2×"
                    variant="secondary"
                    size="sm"
                    fullWidth
                    sound={false}
                    disabled={pending || bet === 0}
                    onPress={() => {
                      if (applyBet(bet * 2)) void playSound("chip_place");
                    }}
                    testID="bj-2x"
                    accessibilityLabel="Double the bet"
                  />
                </View>
              </View>
              <Button
                label="Deal"
                size="lg"
                fullWidth
                haptic="medium"
                sound={false}
                loading={dealMutation.isPending || (!session && startMutation.isPending)}
                disabled={bet < BJ_MIN_BET || dealMutation.isPending}
                onPress={onDeal}
                testID="bj-deal"
              />
            </>
          ) : (
            <>
              <View style={styles.statusRow}>
                <AppText variant="overline" tone="gold" testID="bj-status">
                  {statusText}
                </AppText>
                <View style={styles.inPlay}>
                  <AppText variant="caption">In play</AppText>
                  <AppText style={styles.inPlayAmount}>{formatCoins(inPlay)}</AppText>
                </View>
              </View>
              <ActionBar
                legal={round?.legalActions ?? []}
                enabled={round?.phase === "player" && !animating && !pending}
                extraCost={extraCost}
                balance={balance}
                onAction={onAction}
              />
            </>
          )}
        </View>
      }
    >
      <View
        style={styles.table}
        onLayout={(e) => {
          // Measure only in the betting layout so card size is stable through the round.
          if (betting) setTableH(e.nativeEvent.layout.height);
        }}
      >
        <Toast message={toast?.message ?? null} tone={toast?.tone} onHide={hideToast} />
        {rg.notice}

        <View style={styles.topRow}>
          <AppText variant="overline" style={styles.zoneLabel}>
            Dealer
          </AppText>
          {fairDetails ? (
            <FairnessBadge state={fairStatus} onPress={() => setFairOpen(true)} testID="bj-fair" />
          ) : (
            <FairnessBadge state="pending" />
          )}
        </View>

        <View style={styles.dealerZone}>
          <View style={[styles.dealerCards, { minHeight: bigCard * CARD_RATIO }]}>
            {dealerCards.length > 0 ? (
              <CardFan cards={dealerCards} width={bigCard} maxWidth={contentW * 0.75} reduceMotion={reduceMotion} testID="bj-dealer-cards" />
            ) : (
              <View style={{ height: bigCard * CARD_RATIO }} />
            )}
          </View>
          <View style={styles.badgeSlot}>
            {dealerVisible.length > 0 && (
              <HandValueBadge
                total={dealerTotal.total}
                soft={shown.hole && dealerTotal.soft}
                blackjack={dealerNatural}
                testID="bj-dealer-total"
              />
            )}
          </View>
        </View>

        {insuranceOpen ? (
          <View style={styles.insuranceWrap}>
            <InsurancePanel
              cost={Math.floor((hands[0]?.bet ?? 0) / 2)}
              balance={balance}
              busy={pending}
              reduceMotion={reduceMotion}
              onDecide={onInsurance}
            />
          </View>
        ) : (
          <View style={styles.printWrap} onLayout={(e) => setPrintH(e.nativeEvent.layout.height)}>
            <TablePrint width={contentW} dealerHitsSoft17={rules.dealerHitsSoft17} maxHeight={printH ?? PRINT_HEIGHT} />
          </View>
        )}

        <View style={styles.playerZone}>
          {round && nHands > 0 ? (
            <View style={styles.handsRow}>
              {hands.map((h, i) => {
                const count = shown.hands[i] ?? 0;
                const cards = h.cards.slice(0, count);
                const v = handValue(cards);
                const natural = nHands === 1 && isNatural(cards);
                const isActive = round.phase === "player" && round.active === i && nHands > 1 && !animating;
                const result = shown.settled ? round.results?.[i] : undefined;
                const rv = result ? resultView(result) : null;
                return (
                  <View key={i} style={[styles.handCol, { width: nHands > 1 ? colW : undefined }]}>
                    <View style={[styles.handFrame, isActive && styles.handActive]}>
                      <CardFan
                        cards={cards.map((c, j) => ({ key: `h${i}c${j}`, card: c }))}
                        width={cardW}
                        maxWidth={colW - spacing.sm}
                        reduceMotion={reduceMotion}
                        dimmed={nHands > 1 && round.phase === "player" && !isActive && !animating}
                        testID={`bj-hand-${i}`}
                      />
                    </View>
                    <View style={styles.handMeta}>
                      {count > 0 && <HandValueBadge total={v.total} soft={v.soft} blackjack={natural} testID={`bj-hand-total-${i}`} />}
                      {nHands > 1 && <AppText style={styles.handBet}>{formatCoins(h.bet)}</AppText>}
                    </View>
                    <View style={styles.resultSlot}>
                      {rv && <Badge label={rv.label} tone={rv.tone} testID={`bj-result-${i}`} />}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ height: bigCard * CARD_RATIO + 64 }} />
          )}
        </View>

        <View style={[styles.betZone, insuranceOpen && styles.hidden]}>
          {showNet ? (
            <View style={styles.netRow} testID="bj-net">
              {(round?.insurance ?? 0) > 0 && (
                <Badge
                  label={dealerNatural ? `Insurance +${round!.insurance * 2}` : "Insurance lost"}
                  tone={dealerNatural ? "success" : "neutral"}
                />
              )}
              <Badge
                label={net > 0 ? `Net +${formatCoins(net)}` : net < 0 ? `Net −${formatCoins(-net)}` : "Even"}
                tone={net > 0 ? "success" : net < 0 ? "danger" : "neutral"}
              />
            </View>
          ) : (
            <BetCircle amount={betting ? bet : roundBetRef.current} reduceMotion={reduceMotion} />
          )}
        </View>

      </View>

      <FairnessSheet visible={fairOpen} onClose={() => setFairOpen(false)} status={fairStatus} details={fairDetails} />
      <RulesSheet
        visible={rulesOpen}
        onClose={() => setRulesOpen(false)}
        numDecks={rules.numDecks}
        dealerHitsSoft17={rules.dealerHitsSoft17}
      />
      {win && (
        <WinOverlay visible silent tier={win.tier} title={win.title} amount={win.amount} onDismiss={() => setWin(null)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 0 },
  center: { flex: 1, justifyContent: "center" },
  bareHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.s12, paddingVertical: spacing.sm },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  bareTitle: { fontFamily: fonts.display, fontSize: 18, color: palette.text, letterSpacing: 0.5 },
  table: { flex: 1, position: "relative" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28, marginTop: spacing.xs },
  zoneLabel: { color: palette.goldLight, opacity: 0.7 },
  dealerZone: { alignItems: "center", marginTop: spacing.sm, gap: spacing.sm },
  dealerCards: { alignItems: "center", justifyContent: "center" },
  badgeSlot: { height: 24, justifyContent: "center" },
  printWrap: { flex: 1, minHeight: 0, justifyContent: "center", overflow: "hidden" },
  playerZone: { alignItems: "center" },
  handsRow: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  handCol: { alignItems: "center", gap: spacing.sm },
  handFrame: { padding: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },
  handActive: { borderColor: palette.gold, backgroundColor: "rgba(233,196,106,0.08)" },
  handMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 24 },
  handBet: { ...typography.caption, color: palette.goldLight, fontVariant: ["tabular-nums"] },
  resultSlot: { minHeight: 22, alignItems: "center" },
  betZone: { alignItems: "center", justifyContent: "center", minHeight: 84, marginTop: spacing.xs, marginBottom: spacing.xs },
  netRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  insuranceWrap: { flex: 1, justifyContent: "center", paddingVertical: spacing.sm },
  hidden: { display: "none" },
  deck: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.s12,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    justifyContent: "flex-end",
    backgroundColor: "rgba(4,16,12,0.55)",
    borderTopWidth: 1,
    borderTopColor: "rgba(248,227,163,0.16)",
  },
  chipRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  chipBtn: { borderRadius: 30, padding: 2 },
  dim: { opacity: 0.35 },
  pressed: { transform: [{ translateY: -3 }] },
  utilRow: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 24, marginBottom: spacing.xs },
  inPlay: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  inPlayAmount: { fontFamily: fonts.heavy, fontSize: 15, color: palette.text, fontVariant: ["tabular-nums"] },
});
