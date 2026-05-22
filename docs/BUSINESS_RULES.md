# Business & Economic Rules

## Coin Economy
- **Base Unit**: 1 coin = $0.01 USD equivalent (100 coins = 1 USDC).
- **Redemption Rate**: 1:1 (100 coins = 1 USDC sent on redeem). No slippage.
- **IAP Packages** (example - adjust for App Store optimization):
  - 500 coins - $4.99 (effective ~20% bonus vs direct)
  - 1,200 coins - $9.99 (~20% bonus)
  - 2,500 coins - $19.99
  - 6,500 coins - $49.99 (best value)
- **Platform Fee on IAP**: Apple/Google 15-30% cut absorbed in pricing. House profit from this spread + game RTP edge (~0.46%).
- **Cashout Fee**: 0% initially (to attract users). Later 2-5% or flat 50 coins min.
- **Min Cashout**: 100 coins (1 USDC) to avoid dust.
- **Max Single Cashout**: 100,000 coins (~$1,000) without additional verification (KYC placeholder for >$500).

## Game Economics
- Video Poker RTP 99.54% -> Player expected loss 0.46% per hand (very player friendly).
- Long-term house profit primarily from IAP margins and volume.
- No "rake" on P2P NFT transfers.

## User Acquisition & Retention
- First-time bonus: 200 free coins on wallet connect + email verify (or age gate).
- Daily login bonus: 50 coins.
- Referral: 10% of referred user's first IAP in coins.

## Compliance Positioning
- **Not Gambling**: Marketed as "skill-based entertainment + digital collectible NFTs".
- **Jurisdictions**: Target where skill games or collectibles are legal (e.g. many US states for skill, or international). Avoid advertising in strict gambling ban areas.
- **Age Gate**: Strict 18+ with ID upload placeholder for high-value redemptions.
- **Disclaimers**: Prominent in app and ToS: "For entertainment purposes only. NFT vouchers represent in-game progress. Redemption to USDC is a separate service."

## Operator Responsibilities (Banker Side)
- Fund USDC liquidity pool in redemption contract regularly.
- Monitor redemptions, investigate suspicious patterns (multi-accounting, bot play).
- Maintain hot/cold wallet split for minter.

Claude: Hardcode these constants in a `config/economy.ts` shared file. Make packages configurable via admin API later.