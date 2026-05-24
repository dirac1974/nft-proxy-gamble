# IAP + Blockchain Anchoring Design

**Goal**: Create a low-cost, secure link between fiat in-app purchases and on-chain coin balances / NFTs.

## Problem Statement
We need to prevent fake coin creation while keeping transaction costs extremely low (ideally <$0.01 per purchase on average).

## Recommended Architecture (Hybrid Model)

### Option A: Purchase Commitment Events (Recommended for v1)

**Flow**:
1. User buys coins via IAP
2. Backend validates receipt
3. Backend credits internal balance
4. Backend emits a cheap `PurchaseCommitted` event on Polygon (or batches multiple purchases)
5. When user cashes out, backend includes recent purchase events in verification

**Cost**: ~$0.001 - $0.005 per transaction (Polygon)
**Benefits**:
- Immutable audit trail
- Low cost
- Easy to implement
- Strong anti-replay protection

### Option B: Purchase Receipt NFTs (More Secure but Higher Cost)

**Flow**:
1. User buys coins via IAP
2. Backend validates receipt
3. Backend mints a cheap "Purchase Receipt" ERC-1155 or ERC-721
4. User can optionally hold or burn the receipt NFT
5. Cashout process verifies linked receipt NFTs

**Cost**: ~$0.01 - $0.03 per purchase (still very cheap on Polygon)
**Benefits**:
- Fully on-chain proof of purchase
- User can see their purchase history on-chain
- Strongest auditability

### Option C: Hybrid (Best Long-Term)

- Use **Option A** (cheap commitment events) for every purchase
- Use **Option B** (receipt NFTs) only for large purchases (>$50)
- This keeps average cost very low while providing strong security for big transactions

## Implementation Details

### Smart Contract Changes (Future)
- Add `PurchaseCommitted` event
- Add mapping from user to recent purchase events
- Optional: `mintPurchaseReceipt()` function

### Backend Changes
- After successful IAP validation, call a function to emit on-chain event
- Store transaction hash in database
- Include recent purchase events when verifying cashout requests

### Cost Optimization Techniques
- Batch multiple purchases into single transactions (every 10-20 purchases)
- Use Polygon (already selected)
- Consider Base or Arbitrum in the future for even lower fees
- Use events instead of storage when possible

## Security Benefits
- Creates immutable link between fiat money and game coins
- Makes large-scale fraud extremely difficult
- Provides regulators/auditors with clear on-chain evidence
- Allows users to verify their own purchase history

## Recommendation
Start with **Option A (Purchase Commitment Events)** in Phase 3.2 or 3.3.
This gives us strong security at almost zero extra cost.

Later upgrade to full receipt NFTs for high-value purchases if needed.

**This design significantly reduces the risk of coin spoofing while keeping costs minimal.**