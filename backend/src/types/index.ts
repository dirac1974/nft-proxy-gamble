export type HandRank =
  | "ROYAL_FLUSH"
  | "STRAIGHT_FLUSH"
  | "FOUR_OF_A_KIND"
  | "FULL_HOUSE"
  | "FLUSH"
  | "STRAIGHT"
  | "THREE_OF_A_KIND"
  | "TWO_PAIR"
  | "JACKS_OR_BETTER"
  | "LOSE";

export interface HandRecord {
  handNumber: number;
  deck: number[];        // first 10 cards: [0-4] dealt, [5-9] draw pool
  holds: boolean[];      // set at draw time; 5 booleans
  rank: HandRank | null; // null until draw
  payout: number;        // coins; 0 until draw
}

export interface DealResult {
  sessionId: string;
  handNumber: number;
  dealtCards: number[];   // cards[0..4]
  serverSeedHash: string;
  clientSeed: string;
}

export interface DrawResult {
  drawnCards: number[];   // final 5-card hand
  holds: boolean[];
  rank: HandRank;
  payout: number;
  newBalance: number;
  serverSeed: string;     // revealed so player can verify
}

export interface JwtPayload {
  userId: string;
  walletAddress: string;
}

export interface IAPVerifyResult {
  valid: boolean;
  productId: string;
  coinsGranted: number;
  receiptHash: string;
}

export const IAP_PRODUCTS: Record<string, number> = {
  coins_100: 100,
  coins_500: 500,
  coins_1000: 1000,
  coins_5000: 5000,
};
