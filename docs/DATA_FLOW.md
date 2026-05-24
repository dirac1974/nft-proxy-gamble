# Data Flow — NFT Proxy Gamble

**Purpose**: Authoritative reference for how data moves through the system. Every boundary is annotated with its trust level. Use this when reviewing PRs, writing tests, or designing new features.

---

## Trust Boundary Legend

| Label | Meaning |
|-------|---------|
| `[UNTRUSTED]` | Client device — can be jailbroken, proxied, or Frida-hooked. Never trust input at face value. |
| `[TRUSTED]` | Backend server — runs in a controlled environment; validates all external input. |
| `[IMMUTABLE]` | On-chain contract — state is permanent and publicly auditable. |
| `[EXTERNAL]` | Apple/Google IAP servers — trusted third party; still validate responses server-side. |

---

## Flow 1: IAP Purchase → Coins Credited

```
[UNTRUSTED] Mobile App
  │  User taps "Buy 100 coins"
  │
  ▼
[UNTRUSTED] react-native-iap
  │  initiatePayment("nfpg.coins.100")
  │  OS payment sheet shown to user
  │
  ▼
[EXTERNAL] Apple App Store / Google Play
  │  Payment processed
  │  Returns: signedReceipt (base64)
  │
  ▼
[UNTRUSTED] Mobile App
  │  purchaseUpdatedListener fires
  │  POST /iap/verify { receipt, productId, platform }
  │  (raw receipt — never trusted, just forwarded)
  │
  ▼
[TRUSTED] Backend: POST /iap/verify
  │  1. Validate receipt with Apple/Google API (server-to-server)
  │  2. Check receipt hash not in DB (replay prevention)
  │  3. Compute coinsAdded from productId
  │  4. Build receiptHash = SHA-256(receipt)
  │
  ├──▶ [IMMUTABLE] Polygon: NFTProxyVoucher.commitPurchase(userAddress, coinsAdded, receiptHash)
  │       Event: PurchaseCommitted(user, coinsAdded, receiptHash, timestamp)
  │       Gas: ~25,000 / purchase (batched up to 20, ~$0.001–0.005 total)
  │       ⚠ Backend waits for tx receipt before proceeding
  │
  ├──▶ [TRUSTED] Database
  │       INSERT receipt_hash (UNIQUE — rejects replay)
  │       UPDATE user.coinBalance += coinsAdded
  │
  │  5. Sign new balance: HMAC-SHA256(SIGNING_KEY, "userId:newBalance:timestamp")
  │  6. Return: { newBalance, balanceSig, sigTimestamp }
  │
  ▼
[UNTRUSTED] Mobile App
  │  Verify balanceSig before display
  │  Reject if |now - sigTimestamp| > 60s
  │  gameStore.setBalance(newBalance)  ← only call site from IAP
  │  finishTransaction({ isConsumable: true })  ← always, even on error
```

**Trust assertion**: coins are only credited after (a) Apple/Google validation, (b) on-chain commitment, (c) receipt hash uniqueness. The client cannot short-circuit any step.

---

## Flow 2: Game Session → Video Poker Hand

```
[UNTRUSTED] Mobile App
  │  User taps "NEW GAME"
  │  POST /game/start-session { betAmount }
  │  JWT in Authorization header
  │
  ▼
[TRUSTED] Backend: POST /game/start-session
  │  1. Verify JWT, extract userId
  │  2. Verify coinBalance ≥ betAmount (server DB check)
  │  3. Generate serverSeed (CSPRNG)
  │  4. Compute serverSeedHash = SHA-256(serverSeed)
  │  5. Deduct betAmount from coinBalance
  │  6. Create session record (sessionId, serverSeedHash, clientSeed slot)
  │  Return: { sessionId, serverSeedHash, coinBalance, balanceSig, sigTimestamp }
  │
  ▼
[UNTRUSTED] Mobile App
  │  Displays sessionId, stores serverSeedHash for later verification
  │  User taps "DEAL"
  │  POST /game/deal { sessionId }
  │
  ▼
[TRUSTED] Backend: POST /game/deal
  │  1. Validate session belongs to userId
  │  2. Generate clientSeed (CSPRNG, server-generated for Phase 3)
  │  3. Shuffle deck: SHA-256(serverSeed + clientSeed + sessionId)
  │  4. Deal 5 cards (indices 0–51)
  │  Return: { dealtCards: number[5], holds: boolean[5] }
  │
  ▼
[UNTRUSTED] Mobile App
  │  Renders 5 cards — user taps to toggle holds
  │  holds array stored in gameStore (local UI state only)
  │  User taps "DRAW"
  │  POST /game/draw { sessionId, holds: boolean[5] }
  │
  ▼
[TRUSTED] Backend: POST /game/draw
  │  1. Validate session + userId
  │  2. Replace non-held cards from remaining deck (same seed derivation)
  │  3. Evaluate final 5-card hand → rank + payout
  │  4. Credit payout to coinBalance
  │  5. Reveal serverSeed (commit-reveal complete)
  │  6. Sign new balance
  │  Return: { drawnCards, rank, payout, serverSeed, newBalance, balanceSig, sigTimestamp }
  │
  ▼
[UNTRUSTED] Mobile App
  │  Verify balanceSig
  │  gameStore.setBalance(newBalance)  ← only call site from game
  │  User can verify fairness: SHA-256(serverSeed + clientSeed + sessionId) must match deal order
```

**Trust assertion**: payout is computed and credited entirely server-side. The `holds` array is the only client input to the draw — and it cannot increase payout (server re-evaluates independently).

---

## Flow 3: Cashout → NFT Voucher Minted

```
[UNTRUSTED] Mobile App
  │  coinBalance ≥ 100, user taps "Cash Out"
  │  POST /game/cashout { sessionId, coinBalance }
  │  JWT in Authorization header
  │
  ▼
[TRUSTED] Backend: POST /game/cashout
  │  1. Verify JWT, extract userId + walletAddress
  │  2. Look up coinBalance from DB (ignore client-supplied value)
  │  3. Verify coinBalance ≥ 100 (minimum cashout)
  │  4. Check cashout rate limit: ≤ 5/wallet/day
  │  5. Run device attestation check (Phase 3.5+)
  │  6. verifyCashoutIntegrity(): sum PurchaseCommitted events on-chain ≥ coinBalance
  │
  ├──▶ [IMMUTABLE] Polygon: NFTProxyVoucher.mint(walletAddress, coinBalance, gameType, sessionId)
  │       Emits: TransferSingle(operator, 0x0, walletAddress, tokenId, 1)
  │       Gas: ~130,000 / mint
  │       Returns: tokenId
  │
  ├──▶ [TRUSTED] Database
  │       UPDATE user.coinBalance = 0
  │       INSERT cashout_log (userId, tokenId, coinBalance, txHash, timestamp)
  │
  │  Return: { tokenId, txHash, newBalance: 0, balanceSig, sigTimestamp }
  │
  ▼
[UNTRUSTED] Mobile App
  │  Verify balanceSig (expects newBalance = 0)
  │  Invalidate React Query "balance" + "nfts" caches
  │  Navigate to My NFTs tab
```

**Trust assertion**: the cashout amount is read from the DB, not the client. On-chain commitment integrity check ensures coins were legitimately purchased before allowing mint.

---

## Flow 4: NFT Redemption → USDC

```
[UNTRUSTED] Mobile App
  │  User selects NFT voucher, taps "Redeem to USDC"
  │  Wallet signs EIP-712 approval for contract
  │
  ▼
[UNTRUSTED] Mobile App → WalletConnect → User Wallet
  │  viem: walletClient.writeContract({ abi, functionName: "redeem", args: [tokenId] })
  │  Transaction signed by user's private key (never leaves wallet)
  │
  ▼
[IMMUTABLE] Polygon: NFTProxyVoucher.redeem(tokenId)
  │  1. Verify msg.sender owns tokenId
  │  2. Look up coinBalance for tokenId
  │  3. Compute usdcAmount = coinBalance * USDC_UNITS_PER_COIN (10,000 units = $0.01)
  │  4. Burn tokenId (ERC-1155 burn)
  │  5. Transfer USDC from contract reserve to msg.sender
  │  Emits: Redeemed(user, tokenId, usdcAmount)
  │  Gas: ~70,000 / redeem
  │
  ▼
[UNTRUSTED] Mobile App
  │  Wait for tx confirmation (poll ethers or viem watchContractEvent)
  │  Show Polygonscan link
  │  Invalidate "nfts" cache
```

**Trust assertion**: redemption is fully on-chain. The backend is not involved — contract state is authoritative. The user controls the private key; the contract controls the USDC.

---

## Component Responsibility Matrix

| Component | Reads balance from | Writes balance to | Can initiate cashout | Signs transactions |
|-----------|-------------------|-------------------|---------------------|--------------------|
| Mobile App | Signed backend response only | ❌ Never directly | ❌ Only requests | User wallet (redeem only) |
| Backend API | DB (authoritative) | DB via IAP/game/cashout routes | ✅ Mints NFT on-chain | Hot wallet (mint, commitPurchase) |
| Smart Contract | On-chain storage | On-chain storage (mint/redeem/commitPurchase) | N/A | N/A |

---

## Failure Modes & Safe Defaults

| Failure | System Behavior | Trust Implication |
|---------|----------------|-------------------|
| Backend returns unsigned balance | Client rejects, shows cached balance | Client never displays unverified balance |
| IAP receipt verification fails | 402 returned; `finishTransaction` still called; coins NOT credited | Replay attempted later by OS — deduplicated by receipt hash |
| `commitPurchase` tx fails | Backend retries up to 3×; if all fail, coins not credited; receipt queued | No coins without on-chain evidence |
| `draw` response lost in transit | Session remains open; client can retry; server is idempotent per session | Duplicate draw rejected (session already in `drawn` state) |
| Cashout `mint` tx fails | Backend returns 503; coinBalance unchanged; user can retry | No NFT minted without transaction hash |
| Device attestation fails | Cashout rejected with 403; balance preserved | Jailbroken device cannot cash out |
