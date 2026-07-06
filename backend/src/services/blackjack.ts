import { randomBytes } from "crypto";
import { keccak256, toUtf8Bytes } from "ethers";

// ---------------------------------------------------------------------------
// Provably-fair blackjack engine (pure, serializable state).
//
// Card encoding matches videoPoker.ts: 0–51, rank = card % 13
//   (0=2 … 7=9, 8=10, 9=J, 10=Q, 11=K, 12=A), suit = Math.floor(card / 13).
// A multi-deck SHOE is derived deterministically from (serverSeed, clientSeed)
// via the same keccak256 Fisher-Yates chain used for video poker, so once the
// serverSeed is revealed at settle the client can reproduce the ENTIRE shoe and
// verify every card dealt. serverSeed stays secret until the round ends, so the
// player cannot see undealt cards or the dealer hole card mid-round.
//
// One round per session (FABLE-2026-07 C-1): after settle the serverSeed is
// revealed, so the session must never deal again — the route enforces this and
// the per-session seed comes from the committed server-seed chain.
//
// House edge ≈ 0.5% with 6 decks, dealer stands/ hits soft 17 (configurable),
// blackjack 3:2, double any two, split to 4 hands, split-aces one card.
// ---------------------------------------------------------------------------

export const BLACKJACK_GAME_TYPE = "blackjack-6deck-h17-1-0";
export const DEFAULT_NUM_DECKS = 6;
export const MAX_HANDS = 4; // player may split up to 4 total hands

export type BlackjackAction = "hit" | "stand" | "double" | "split";
export type BlackjackPhase = "insurance" | "player" | "dealer" | "settled";
export type HandOutcome = "blackjack" | "win" | "push" | "lose" | "bust" | "surrender";

export interface BlackjackHand {
  cards: number[];
  bet: number;
  stood: boolean;
  doubled: boolean;
  busted: boolean;
  isSplitAces: boolean;
  done: boolean;
}

export interface HandResult {
  outcome: HandOutcome;
  bet: number;
  ret: number; // coins returned to the player for this hand (stake + winnings)
}

export interface BlackjackState {
  numDecks: number;
  dealerHitsSoft17: boolean;
  cursor: number; // next index into the (recomputable) shoe
  baseBet: number;
  dealer: number[]; // dealer[0] = upcard, dealer[1] = hole (hidden until reveal)
  hands: BlackjackHand[];
  active: number; // index of the hand currently acting
  insurance: number; // insurance wager (0 = none)
  insuranceResolved: boolean;
  phase: BlackjackPhase;
  playerBlackjack: boolean;
  dealerBlackjack: boolean;
  results: HandResult[];
  totalWagered: number;
  totalReturn: number;
  netProfit: number;
}

export class BlackjackError extends Error {}

export function generateClientSeed(): string {
  return randomBytes(16).toString("hex");
}

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

// rank index 0..12 -> blackjack pip value (ace as 11 here; softened in handValue).
export function cardValue(card: number): number {
  const r = ((card % 13) + 13) % 13;
  if (r <= 7) return r + 2; // 2..9
  if (r <= 11) return 10; // 10, J, Q, K
  return 11; // Ace
}

export function handValue(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    if (v === 11) aces++;
    total += v;
  }
  // Demote aces from 11 to 1 while busting.
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: number[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

// Deterministic multi-deck shoe. Fisher-Yates driven by a keccak256 chain seeded
// by (serverSeed, clientSeed). numDecks*52 cards; card = index % 52.
export function generateShoe(serverSeed: string, clientSeed: string, numDecks: number): number[] {
  const size = numDecks * 52;
  const shoe: number[] = Array.from({ length: size }, (_, i) => i % 52);
  let hash = keccak256(toUtf8Bytes(`${serverSeed}:${clientSeed}:blackjack:0`));
  for (let i = size - 1; i > 0; i--) {
    hash = keccak256(hash);
    const j = Number(BigInt(hash) % BigInt(i + 1));
    const tmp = shoe[i];
    shoe[i] = shoe[j];
    shoe[j] = tmp;
  }
  return shoe;
}

function newHand(cards: number[], bet: number, isSplitAces = false): BlackjackHand {
  return { cards, bet, stood: false, doubled: false, busted: false, isSplitAces, done: false };
}

// Deal the opening round. Draws player, dealer, player, dealer. Sets the phase:
// - dealer upcard Ace  -> "insurance" (player chooses, then we peek).
// - dealer upcard 10   -> peek immediately (no insurance); natural ends the round.
// - otherwise          -> "player".
// A player natural (and no dealer natural) is auto-resolved at settle.
export function deal(
  shoe: number[],
  baseBet: number,
  opts: { numDecks: number; dealerHitsSoft17: boolean },
): BlackjackState {
  if (baseBet <= 0) throw new BlackjackError("bet must be positive");
  const player = [shoe[0], shoe[2]];
  const dealer = [shoe[1], shoe[3]];
  const state: BlackjackState = {
    numDecks: opts.numDecks,
    dealerHitsSoft17: opts.dealerHitsSoft17,
    cursor: 4,
    baseBet,
    dealer,
    hands: [newHand(player, baseBet)],
    active: 0,
    insurance: 0,
    insuranceResolved: false,
    phase: "player",
    playerBlackjack: isBlackjack(player),
    dealerBlackjack: isBlackjack(dealer),
    results: [],
    totalWagered: baseBet,
    totalReturn: 0,
    netProfit: 0,
  };

  const upIsAce = cardValue(dealer[0]) === 11;
  const upIsTen = cardValue(dealer[0]) === 10;

  if (upIsAce) {
    state.phase = "insurance";
    return state;
  }
  if (upIsTen) {
    // Peek for a natural; if dealer has blackjack the round ends now.
    if (state.dealerBlackjack) return settle(state);
  }
  if (state.playerBlackjack) {
    // Player natural, dealer cannot have one (upcard is not A/10 here) -> settle.
    return settle(state);
  }
  return state;
}

// Player takes or declines insurance (only valid in the insurance phase). After
// resolving, we peek the hole: dealer natural ends the round immediately.
export function resolveInsurance(state: BlackjackState, take: boolean, shoe: number[]): BlackjackState {
  if (state.phase !== "insurance") throw new BlackjackError("insurance not offered");
  if (state.insuranceResolved) throw new BlackjackError("insurance already resolved");
  const s = clone(state);
  s.insuranceResolved = true;
  if (take) {
    const maxIns = Math.floor(s.baseBet / 2);
    if (maxIns < 1) throw new BlackjackError("bet too small to insure");
    s.insurance = maxIns;
    s.totalWagered += maxIns;
  }
  // Peek.
  if (s.dealerBlackjack) return settle(s);
  if (s.playerBlackjack) return settle(s);
  s.phase = "player";
  return advancePastCompletedHands(s, shoe);
}

function draw(state: BlackjackState, shoe: number[]): number {
  if (state.cursor >= shoe.length) throw new BlackjackError("shoe exhausted");
  return shoe[state.cursor++];
}

// Apply a player action to the ACTIVE hand. Pure: returns a new state.
export function applyAction(
  state: BlackjackState,
  action: BlackjackAction,
  shoe: number[],
): BlackjackState {
  if (state.phase !== "player") throw new BlackjackError(`cannot act in phase ${state.phase}`);
  const s = clone(state);
  const hand = s.hands[s.active];
  if (!hand || hand.done) throw new BlackjackError("no active hand");

  switch (action) {
    case "hit": {
      if (hand.isSplitAces) throw new BlackjackError("split aces receive one card only");
      hand.cards.push(draw(s, shoe));
      const v = handValue(hand.cards);
      if (v.total > 21) {
        hand.busted = true;
        hand.done = true;
      } else if (v.total === 21) {
        hand.stood = true;
        hand.done = true;
      }
      break;
    }
    case "stand": {
      hand.stood = true;
      hand.done = true;
      break;
    }
    case "double": {
      if (hand.cards.length !== 2) throw new BlackjackError("double only on first two cards");
      if (hand.isSplitAces) throw new BlackjackError("cannot double split aces");
      hand.bet *= 2;
      hand.doubled = true;
      s.totalWagered += state.hands[s.active].bet; // the added stake equals the original hand bet
      hand.cards.push(draw(s, shoe));
      if (handValue(hand.cards).total > 21) hand.busted = true;
      hand.done = true;
      break;
    }
    case "split": {
      if (hand.cards.length !== 2) throw new BlackjackError("split only on a two-card hand");
      if (cardValue(hand.cards[0]) !== cardValue(hand.cards[1])) {
        throw new BlackjackError("split requires two equal-value cards");
      }
      if (s.hands.length >= MAX_HANDS) throw new BlackjackError("max split hands reached");
      const splittingAces = cardValue(hand.cards[0]) === 11;
      const movedCard = hand.cards.pop()!;
      // Each split hand carries its own bet equal to the base bet.
      const addedBet = hand.bet;
      s.totalWagered += addedBet;
      const second = newHand([movedCard], addedBet, splittingAces);
      hand.isSplitAces = splittingAces;
      // Insert the new hand right after the active one.
      s.hands.splice(s.active + 1, 0, second);
      // Deal one card to each split hand.
      hand.cards.push(draw(s, shoe));
      second.cards.push(draw(s, shoe));
      if (splittingAces) {
        // Split aces: one card each, then both hands are done.
        hand.done = true;
        second.done = true;
      } else {
        // 21 after split is not a blackjack; auto-stand a 21.
        if (handValue(hand.cards).total === 21) {
          hand.stood = true;
          hand.done = true;
        }
      }
      break;
    }
    default:
      throw new BlackjackError("unknown action");
  }

  return advancePastCompletedHands(s, shoe);
}

// Move `active` to the next not-done hand. When all hands are done, either every
// hand busted (dealer need not draw) or we go to dealer play + settle.
function advancePastCompletedHands(state: BlackjackState, shoe: number[]): BlackjackState {
  const s = state;
  while (s.active < s.hands.length) {
    const h = s.hands[s.active];
    if (h.done) {
      s.active++;
      continue;
    }
    // Auto-stand any hand sitting on 21 (e.g. a freshly-reached split hand) —
    // there is never a reason to hit 21, so we don't leave it awaiting input.
    if (handValue(h.cards).total === 21) {
      h.stood = true;
      h.done = true;
      s.active++;
      continue;
    }
    break;
  }
  if (s.active < s.hands.length) return s;
  // All hands resolved -> dealer plays (unless every hand busted).
  return playDealerAndSettle(s, shoe);
}

// Dealer draws to 17, hitting soft 17 only when configured. Skips drawing if
// every player hand busted (dealer wins automatically) — but we still reveal.
export function playDealerAndSettle(state: BlackjackState, shoe: number[]): BlackjackState {
  const s = clone(state);
  s.phase = "dealer";
  const anyLive = s.hands.some((h) => !h.busted);
  if (anyLive) {
    for (;;) {
      const { total, soft } = handValue(s.dealer);
      if (total < 17 || (total === 17 && soft && s.dealerHitsSoft17)) {
        s.dealer.push(draw(s, shoe));
      } else {
        break;
      }
    }
  }
  return settle(s);
}

// Final settlement of all hands + insurance. Computes per-hand returns and the
// round totals. 3:2 blackjack (floored on odd bets, house-favorable), 1:1 wins,
// pushes return the stake, insurance pays 2:1 when the dealer has a natural.
export function settle(state: BlackjackState): BlackjackState {
  const s = clone(state);
  const dealer = handValue(s.dealer);
  const dealerBusted = dealer.total > 21;
  const results: HandResult[] = [];

  for (const hand of s.hands) {
    const bet = hand.bet;
    // A natural blackjack only counts on the original (un-split) two-card hand.
    const naturalBJ = s.hands.length === 1 && isBlackjack(hand.cards);
    const pv = handValue(hand.cards);

    if (hand.busted || pv.total > 21) {
      results.push({ outcome: "bust", bet, ret: 0 });
      continue;
    }
    if (naturalBJ) {
      if (s.dealerBlackjack) {
        results.push({ outcome: "push", bet, ret: bet });
      } else {
        // 3:2 — profit = floor(bet * 3 / 2); return includes the stake.
        const profit = Math.floor((bet * 3) / 2);
        results.push({ outcome: "blackjack", bet, ret: bet + profit });
      }
      continue;
    }
    if (s.dealerBlackjack) {
      // Dealer natural beats any non-natural player hand.
      results.push({ outcome: "lose", bet, ret: 0 });
      continue;
    }
    if (dealerBusted || pv.total > dealer.total) {
      results.push({ outcome: "win", bet, ret: bet * 2 });
    } else if (pv.total === dealer.total) {
      results.push({ outcome: "push", bet, ret: bet });
    } else {
      results.push({ outcome: "lose", bet, ret: 0 });
    }
  }

  // Insurance: pays 2:1 when the dealer has a natural, else it is lost.
  let insuranceReturn = 0;
  if (s.insurance > 0) {
    insuranceReturn = s.dealerBlackjack ? s.insurance * 3 : 0;
  }

  const handReturn = results.reduce((a, r) => a + r.ret, 0);
  s.results = results;
  s.totalReturn = handReturn + insuranceReturn;
  s.netProfit = s.totalReturn - s.totalWagered;
  s.phase = "settled";
  return s;
}

// Legal actions for the active hand (drives UI + server-side validation).
export function legalActions(state: BlackjackState): BlackjackAction[] {
  if (state.phase !== "player") return [];
  const hand = state.hands[state.active];
  if (!hand || hand.done) return [];
  const actions: BlackjackAction[] = ["stand"];
  if (!hand.isSplitAces) actions.push("hit");
  const twoCards = hand.cards.length === 2;
  if (twoCards && !hand.isSplitAces) actions.push("double");
  if (
    twoCards &&
    state.hands.length < MAX_HANDS &&
    cardValue(hand.cards[0]) === cardValue(hand.cards[1])
  ) {
    actions.push("split");
  }
  return actions;
}

// A client-safe projection: the dealer hole card is hidden until the round is
// settled. NEVER send the full state (serverSeed / undealt shoe) mid-round.
export function publicView(state: BlackjackState, opts: { reveal: boolean }): unknown {
  const dealer = opts.reveal || state.phase === "settled" ? state.dealer : [state.dealer[0]];
  return {
    phase: state.phase,
    dealer,
    dealerValue:
      opts.reveal || state.phase === "settled"
        ? handValue(state.dealer).total
        : cardValue(state.dealer[0]),
    dealerHoleHidden: !(opts.reveal || state.phase === "settled"),
    hands: state.hands.map((h) => ({
      cards: h.cards,
      value: handValue(h.cards).total,
      soft: handValue(h.cards).soft,
      bet: h.bet,
      busted: h.busted,
      done: h.done,
      isSplitAces: h.isSplitAces,
    })),
    active: state.active,
    insurance: state.insurance,
    legalActions: legalActions(state),
    results: state.phase === "settled" ? state.results : undefined,
    totalWagered: state.totalWagered,
    totalReturn: state.phase === "settled" ? state.totalReturn : undefined,
    netProfit: state.phase === "settled" ? state.netProfit : undefined,
  };
}

function clone(state: BlackjackState): BlackjackState {
  return {
    ...state,
    dealer: [...state.dealer],
    hands: state.hands.map((h) => ({ ...h, cards: [...h.cards] })),
    results: state.results.map((r) => ({ ...r })),
  };
}
