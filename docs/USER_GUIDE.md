# NFT Proxy Gamble — User Guide

A short, plain-language guide for everyone playing the game. Three sections:

1. [How to Play](#how-to-play)
2. [Cashing Out: NFT Vouchers → USDC](#cashing-out-nft-vouchers--usdc)
3. [Provably Fair: How to Verify Every Hand](#provably-fair-how-to-verify-every-hand)

---

## How to Play

**The game is 9/6 Jacks-or-Better video poker** — a 5-card draw poker variant where the goal is to end up holding a winning hand. "9/6" means the Full House pays 9 and the Flush pays 6 at 1-coin bet (the highest-return paytable variant).

### Setup

1. **Connect your wallet** on the Lobby screen. We support any WalletConnect-compatible wallet (MetaMask, Trust, Rainbow, etc.).
2. **Sign the login message.** You sign a one-time nonce — no transaction, no gas. This proves you control the wallet.
3. **Confirm you are 18 or older.** This is a one-time gate per account.
4. **Buy coins** if your balance is zero. Tap "Buy Coins" and pick a bundle. Purchases go through the App Store / Play Store sandbox. Coins are credited the moment the receipt is verified.

### The turn

A single hand is three taps:

| Tap | What happens |
|---|---|
| **DEAL** | Backend draws 5 cards from a fresh deck. The bet is debited from your balance. |
| Tap cards to **HOLD** | Cards you tap are held. The others get replaced. |
| **DRAW** | Backend replaces non-held cards from positions 6–10 of the same deck. Winning hand is paid out. |

You can bet 1–5 coins per hand. Royal Flush at 5-coin bet pays the special 800× bonus (4000 coins). Every other hand scales linearly with bet.

### Paytable (per 1 coin bet)

| Hand | Payout |
|---|---|
| Royal Flush | 250 (or 800 at max bet) |
| Straight Flush | 50 |
| Four of a Kind | 25 |
| Full House | 9 |
| Flush | 6 |
| Straight | 4 |
| Three of a Kind | 3 |
| Two Pair | 2 |
| Jacks or Better (pair of Jacks, Queens, Kings, or Aces) | 1 |
| Anything else | 0 |

A "Jacks or Better" pair returns your bet — break-even, not a win. Lower pairs lose.

### Tips

- Hold high pairs and four-to-flushes / four-to-straights aggressively.
- Don't hold a kicker with a high pair — it costs you a draw.
- Royal Flush is the only hand where chasing at max bet pays off mathematically. At 1–4 coin bet, just play optimal strategy.

---

## Cashing Out: NFT Vouchers → USDC

You play with **coins** (off-chain, server-side). You cash out into an **NFT voucher** (on-chain, ERC-1155 on Polygon Amoy / mainnet). Each voucher carries a `coinBalance` on-chain and can be redeemed for USDC.

### Conversion rate

**100 coins = 1 USDC.** Exact, no fee, no truncation. So:

- 100 coins → 1.00 USDC
- 350 coins → 3.50 USDC
- 5,000 coins → 50.00 USDC

### Cashing out from the app

1. On the game screen, after a hand resolves, the **Cash Out** button appears if you hold ≥ 100 coins.
2. Tap **Cash Out**. The amount you choose is debited from your coin balance and an NFT voucher is created on-chain in your wallet.
3. You can do this at most **5 times per UTC day**. The header `X-Cashout-Remaining` shows your remaining count for the day.

### Why an NFT in the middle?

Two reasons:

1. **You hold the value, not us.** Once minted, the voucher is yours. If our backend went down, the voucher would still be redeemable directly against the contract via Etherscan, MetaMask, or any wallet.
2. **It's transferable.** You can send the voucher to another wallet (e.g. cold storage) before redeeming. The voucher's `coinBalance` is fixed at mint time and can't be drained by anyone but the holder.

### Redeeming the voucher for USDC

1. Open the **My NFTs** tab.
2. Tap a voucher → **Redeem**.
3. Confirm the transaction in your wallet. Gas is a small amount of POL (Polygon's native token).
4. The voucher NFT is burned; USDC equal to `coinBalance / 100` is transferred to your wallet from the contract.

### Bounds

- **Minimum cashout**: 100 coins (1 USDC)
- **Maximum per voucher**: 100,000 coins (1,000 USDC)
- **Cashouts per day**: 5
- **Daily total**: up to 500,000 coins (5,000 USDC) under normal limits

If the on-chain liquidity runs out, redemption pauses until it's refilled. The voucher is preserved — you can redeem later.

### Transferring a voucher

In **My NFTs → tap voucher → Transfer**, enter another wallet address, and sign. Standard ERC-1155 `safeTransferFrom` under the hood. The recipient gets the full `coinBalance` of the voucher.

---

## Provably Fair: How to Verify Every Hand

Every hand can be independently verified to prove the deck was not tampered with after you started playing. This is the cryptographic backbone of the system.

### How it works (the contract you're testing)

When you start a session, the server commits to a secret seed:

1. Server generates a random `serverSeed` (256 bits of entropy)
2. Server computes `serverSeedHash = keccak256(serverSeed)` and gives **only the hash** to your client, before any card is dealt
3. Client picks a `clientSeed` (or accepts a random one)
4. For each hand `n` in the session, the deck is determined by:

   ```
   deck = fisherYatesShuffle(seed = keccak256(serverSeed || ":" || clientSeed || ":" || handNumber))
   ```

   The 52-card deck is shuffled deterministically — same inputs always produce the same deck. Cards 0–4 are dealt, cards 5–9 are the draw pool.

5. When the session ends, the server **reveals `serverSeed`** in the response.

Because you saw `serverSeedHash` BEFORE any card was dealt, and `keccak256` is a one-way function, the server could not have changed `serverSeed` after the fact to manipulate any deck.

### Verifying in-app

Tap the **"Verify provably fair ›"** link below any completed hand. The modal opens with:

- The original `serverSeedHash` (committed before deal)
- The revealed `serverSeed` (delivered after draw)
- The result of recomputing `keccak256(serverSeed)` — should match the hash
- The deck the client regenerates locally — should match the actual cards dealt and drawn

If any of those don't match, the hand was tampered with. Report it to support immediately.

### Verifying outside the app

You don't have to trust the in-app verifier. Use any tool that supports keccak-256 + the Fisher-Yates algorithm. A standalone reference implementation is at:

`mobile/src/services/provablyFair.ts` (open the file on GitHub — the algorithm is ~50 lines)

The exact byte-level algorithm:

```typescript
import { keccak256, toBytes } from "viem";

function generateDeck(serverSeed: string, clientSeed: string, handNumber: number): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let hash = keccak256(toBytes(`${serverSeed}:${clientSeed}:${handNumber}`));
  for (let i = 51; i > 0; i--) {
    hash = keccak256(hash);
    const j = Number(BigInt(hash) % BigInt(i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
```

Card encoding: integer 0–51, where `rank = card % 13` (0=2, 1=3, …, 8=10, 9=J, 10=Q, 11=K, 12=A) and `suit = floor(card / 13)` (0=♣, 1=♦, 2=♥, 3=♠).

The first 5 cards of the deck are what the server dealt. Cards 5–9 are the draw pool used to replace non-held cards.

If you regenerate the deck and the first 5 cards match what you saw, the deal is honest. If the final 5 cards (after applying holds) match the drawn hand, the draw is honest.

### What this DOES NOT protect against

This proves the deck was not manipulated. It does NOT prove:

- **The backend computed your payout correctly.** Payout is determined by `rank * bet` and is a small lookup; bugs there would be code bugs, not crypto failures. The HMAC-signed balance response on every endpoint means you can detect tampering with balance values.
- **The IAP was credited correctly.** That's verified server-side against Apple/Google's signed receipts.
- **Network-level attacks.** Use HTTPS (we enforce certificate pinning in production builds) and a wallet you control.

---

## Common Questions

**Q: Can I play without paying?**
Buy the smallest coin bundle to start. There is no free play in the production build.

**Q: Do I need POL/MATIC?**
Only for the redeem and transfer transactions on Polygon. Cashout (minting the voucher) is paid for by the backend. The redeem step (burning the voucher for USDC) requires you to sign and pay a small gas fee in POL.

**Q: My voucher minted but the tx is still PENDING in the app.**
Mints are async — the backend submits to Polygon and polls for confirmation. Usually <30 seconds on Amoy / ~1 minute on mainnet. If it's stuck past 5 minutes, contact support with your voucher ID.

**Q: I got an "Account flagged for suspicious activity" message.**
Our behavioral analytics watches for bot-like patterns (very high hands/hour, very high win rate, unusual cashout cadence). If you hit those thresholds, cashout is paused while support reviews. Normal play does not trigger it.

**Q: I lost my phone — are my coins / vouchers gone?**
Your coins are tied to your wallet, not your phone. Connect the same wallet on a new device and your coin balance + voucher history are back. Vouchers are NFTs in your wallet — they're accessible from anywhere the wallet is.

---

## Support

Open `mobile/SECRETS_CHECKLIST.md` for ops setup. For player support, see the in-app "Help" link on the Profile screen.
