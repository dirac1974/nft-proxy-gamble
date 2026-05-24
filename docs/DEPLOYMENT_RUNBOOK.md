# Deployment Runbook — Phase 3.7

## 1. Prisma DB Migration

The security-hardening branch adds three schema changes:

| Change | Table | Type |
|--------|-------|------|
| `ageConfirmed Boolean @default(false)` | `User` | New column |
| `onChainTxHash String?` | `IAPReceipt` | New column |
| `UserAnalytics` model | — | New table |
| `RiskLevel` enum | — | New enum |

### Commands (run on deployed DB)

```bash
# 1. Set DATABASE_URL to production Postgres
export DATABASE_URL="postgresql://..."

# 2. Push schema (non-destructive — adds columns/tables, no drops)
cd backend
npx prisma db push

# 3. Verify
npx prisma studio   # opens browser UI to confirm tables/columns exist
```

`prisma db push` is safe here: all new columns have `@default` values
(`false` for `ageConfirmed`, `null` for `onChainTxHash`) so existing rows
are unaffected with no downtime.

### Rollback

If rollback is needed, the columns are nullable/defaulted — drop them manually:

```sql
ALTER TABLE "User" DROP COLUMN "ageConfirmed";
ALTER TABLE "IAPReceipt" DROP COLUMN "onChainTxHash";
DROP TABLE "UserAnalytics";
DROP TYPE "RiskLevel";
```

---

## 2. NFTProxyVoucher.sol — Re-deploy with commitPurchase()

The Phase 3.6 contract adds `commitPurchase(address user, uint256 coinsAdded, bytes32 receiptHash)`
which emits `PurchaseCommitted` for the on-chain audit trail. This is a new function
not present in the Phase 1 deployment, so a full re-deploy is required.

**Previous Amoy deployment:** `0xf0d9bD16292A06a189220E4369a561442aEC15Cd`
**USDC on Amoy:** `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`

### Pre-deploy checklist

- [ ] `contracts/.env` contains a valid `PRIVATE_KEY` (64 hex chars, no 0x prefix)
- [ ] `contracts/.env` contains `POLYGONSCAN_API_KEY` for verification
- [ ] Deployer wallet has MATIC on Amoy (faucet: `faucet.polygon.technology`)

### Deploy commands

```bash
cd contracts

# 1. Compile + run tests
npx hardhat compile
npx hardhat test

# 2. Deploy to Amoy
npx hardhat run scripts/deploy.ts --network amoy

# 3. Verify on Polygonscan
# (address printed by deploy script — also written to deployments/amoy.json)
npx hardhat verify --network amoy <NEW_CONTRACT_ADDRESS> 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
```

### Post-deploy steps

```bash
# 4. Grant MINTER_ROLE to the backend hot wallet
#    Replace <NEW_CONTRACT_ADDRESS> and <BACKEND_WALLET_ADDRESS>
#    This can be done via hardhat console or a grant-minter script:
npx hardhat console --network amoy
> const v = await ethers.getContractAt("NFTProxyVoucher", "<NEW_CONTRACT_ADDRESS>")
> const MINTER = await v.MINTER_ROLE()
> await v.grantRole(MINTER, "<BACKEND_WALLET_ADDRESS>")

# 5. Update backend env
#    CONTRACT_ADDRESS=<NEW_CONTRACT_ADDRESS>

# 6. Update mobile env (EAS secret or app.config.js extra.contractAddress)
#    EXPO_PUBLIC_CONTRACT_ADDRESS=<NEW_CONTRACT_ADDRESS>

# 7. Verify commitPurchase works (call from backend with a test receipt hash)
#    Look for PurchaseCommitted event on Polygonscan
```

### On Polygon mainnet

Same steps but add `CONFIRM_MAINNET=YES` to the env and use `--network polygon`.
**Do not deploy to mainnet without a full audit.**

---

## 3. Backend Environment (production)

See `backend/env.production.example` for all required vars.

Critical new vars added in Phase 3.6:

```bash
# Signed balance token key (derive from JWT_SECRET — see balanceSigning.ts)
# The key is computed as HMAC-SHA256(JWT_SECRET, "nfpg_balance_v1") — not a separate secret.
# As long as JWT_SECRET is set, balance signing works automatically.

# Device attestation (set after 50+ shadow samples)
DEVICE_ATTESTATION_ENFORCE=true
APPLE_APP_ATTEST_TEAM_ID=<your-team-id>
APPLE_APP_ATTEST_BUNDLE_ID=com.nftproxygamble.app
GOOGLE_PLAY_INTEGRITY_PACKAGE=com.nftproxygamble.app

# Behavioral analytics (no extra config — runs automatically)
# Risk thresholds are hardcoded in analyticsService.ts:
#   high_velocity: >400 hands/hour
#   high_win_rate: >42% with >=20 hands
#   high_coins_added: >10000 coins/hour
#   cashout_limit: >=5/day
```

---

## 4. EAS Secrets (before beta build)

See `mobile/SECRETS_CHECKLIST.md` for the full list.

Quick reference:

```bash
# Set EAS secrets for the production profile
eas secret:create --scope project --name CERT_PIN_PRIMARY --value <sha256-base64>
eas secret:create --scope project --name CERT_PIN_BACKUP --value <sha256-base64>
eas secret:create --scope project --name CERT_PIN_EXPIRY --value 2027-06-01
eas secret:create --scope project --name API_HOST --value api.nftproxygamble.com
eas secret:create --scope project --name EXPO_PUBLIC_BALANCE_VERIFY_KEY --value <key>
eas secret:create --scope project --name EXPO_PUBLIC_WC_PROJECT_ID --value <wc-project-id>
eas secret:create --scope project --name EXPO_PUBLIC_CONTRACT_ADDRESS --value <address>
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.nftproxygamble.com
```

To generate cert pin hashes: see `docs/CERT_PINNING_ROTATION.md`.
