import type { Href } from "expo-router";

export type GameId = "video-poker" | "blackjack" | "roulette" | "keno" | "keno-quad" | "slot";
export type GameSection = "machines" | "tables";

export interface GameInfo {
  id: GameId;
  title: string;
  description: string;
  route: Href;
  section: GameSection;
  isNew?: boolean;
  // Return-to-player, only where it follows from backend rules:
  //  video poker — backend/src/services/videoPoker.ts 9/6 Jacks or Better, 800x royal at max bet (99.54%)
  //  blackjack   — backend/src/services/blackjack.ts header: "House edge ≈ 0.5%" (6 decks, 3:2)
  //  roulette    — backend/src/services/roulette.ts single zero, 37 pockets, 35:1 straight (36/37 = 97.3%)
  rtp: string;
  // Bet limits from backend route validation:
  //  game.ts startSchema betAmount 1–5, blackjack.ts BJ_MIN_BET/BJ_MAX_BET 1–500,
  //  roulette.ts amount ≥ 1 with MAX_TOTAL_WAGER 1000 per spin
  betRange: string;
}

export const GAMES: GameInfo[] = [
  {
    id: "video-poker",
    title: "Video Poker",
    description: "Hold the best cards, draw the rest.",
    route: "/games/video-poker",
    section: "machines",
    rtp: "Pays back up to 99.5%",
    betRange: "Bet 1–5 coins",
  },
  {
    id: "blackjack",
    title: "Blackjack",
    description: "Beat the dealer to 21. Blackjack pays 3 to 2.",
    route: "/games/blackjack",
    section: "tables",
    rtp: "Pays back about 99.5%",
    betRange: "Bet 1–500 coins",
  },
  {
    id: "roulette",
    title: "Roulette",
    description: "Single-zero European wheel.",
    route: "/games/roulette",
    section: "tables",
    rtp: "Pays back 97.3%",
    betRange: "Bet 1–1,000 coins",
  },
  // Keno: backend/src/services/keno.ts — RTP 92.5–94.4% by spot count, bets 10/20/50 per card.
  {
    id: "keno",
    title: "Midnight Keno",
    description: "Pick up to 10 numbers. 20 balls are drawn.",
    route: { pathname: "/games/keno", params: { mode: "single" } },
    section: "machines",
    rtp: "Pays back about 93.5%",
    betRange: "Bet 10–50 coins",
    isNew: true,
  },
  {
    id: "keno-quad",
    title: "Midnight Keno ×4",
    description: "Play up to four cards against one draw.",
    route: { pathname: "/games/keno", params: { mode: "quad" } },
    section: "machines",
    rtp: "Pays back about 93.5%",
    betRange: "Bet 10–200 coins",
    isNew: true,
  },
];
