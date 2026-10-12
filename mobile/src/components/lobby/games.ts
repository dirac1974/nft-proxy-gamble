export type GameId = "video-poker" | "blackjack" | "roulette";

export interface GameInfo {
  id: GameId;
  title: string;
  description: string;
  route: "/games/video-poker" | "/games/blackjack" | "/games/roulette";
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
    rtp: "Pays back up to 99.5%",
    betRange: "Bet 1–5 coins",
  },
  {
    id: "blackjack",
    title: "Blackjack",
    description: "Beat the dealer to 21. Blackjack pays 3 to 2.",
    route: "/games/blackjack",
    rtp: "Pays back about 99.5%",
    betRange: "Bet 1–500 coins",
  },
  {
    id: "roulette",
    title: "Roulette",
    description: "Single-zero European wheel.",
    route: "/games/roulette",
    rtp: "Pays back 97.3%",
    betRange: "Bet 1–1,000 coins",
  },
];
