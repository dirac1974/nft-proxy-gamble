# EAS Secrets Checklist — Pre-Beta Build Gate

All secrets must be set before triggering a `production` EAS build.
Use `eas secret:list` to verify.

## Required for every profile (development / testnet / production)

| Secret | Where used | Source |
|--------|-----------|--------|
| `EXPO_PUBLIC_API_URL` | API client base URL | Backend deployment URL |
| `EXPO_PUBLIC_WC_PROJECT_ID` | WalletConnect v2 | cloud.walletconnect.com |
| `EXPO_PUBLIC_CONTRACT_ADDRESS` | NFT redeem/transfer | `contracts/deployments/amoy.json` or mainnet address |
| `EXPO_PUBLIC_BALANCE_VERIFY_KEY` | Signed balance verification | Derive: see below |

### Deriving EXPO_PUBLIC_BALANCE_VERIFY_KEY

This key must match the signing key used by the backend (`balanceSigning.ts`):

```bash
# On the backend server (Node.js):
node -e "
  const { createHmac } = require('crypto');
  const key = createHmac('sha256', process.env.JWT_SECRET)
    .update('nfpg_balance_v1')
    .digest('hex');
  console.log(key);
"
```

The output is the value for `EXPO_PUBLIC_BALANCE_VERIFY_KEY`.

## Required for production profile only

| Secret | Where used | Notes |
|--------|-----------|-------|
| `CERT_PIN_PRIMARY` | iOS/Android cert pinning | SHA-256 SPKI hash (base64). See `docs/CERT_PINNING_ROTATION.md` |
| `CERT_PIN_BACKUP` | iOS/Android cert pinning | Backup pin for rotation. Must differ from PRIMARY |
| `CERT_PIN_EXPIRY` | Rotation reminder | Format: `YYYY-MM-DD`. Rotate 30+ days before this date |
| `API_HOST` | Android `network_security_config.xml` | Hostname only, no `https://` prefix |

## Required for App Store / Play Store submit profiles

| Secret | Where used | Source |
|--------|-----------|--------|
| `APPLE_APP_STORE_CONNECT_API_KEY_ID` | EAS Submit (iOS) | App Store Connect → API Keys |
| `APPLE_APP_STORE_CONNECT_ISSUER_ID` | EAS Submit (iOS) | App Store Connect → API Keys |
| `APPLE_APP_STORE_CONNECT_API_KEY` | EAS Submit (iOS) | `.p8` file contents (base64) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | EAS Submit (Android) | Service account JSON (base64) |

## Setting secrets via EAS CLI

```bash
# Interactive (prompts for value — hides input)
eas secret:create --scope project --name SECRET_NAME

# Non-interactive
eas secret:create --scope project --name SECRET_NAME --value "value" --type string

# List all current secrets
eas secret:list

# Delete a secret
eas secret:delete --id <secret-id>
```

## Checklist before triggering beta build

- [ ] All "Required for every profile" secrets set
- [ ] All "Required for production" secrets set
- [ ] `CERT_PIN_PRIMARY` and `CERT_PIN_BACKUP` are real SPKI hashes (not placeholder `AAAA...`)
- [ ] `EXPO_PUBLIC_BALANCE_VERIFY_KEY` matches backend's derived key (test with a signed /balance call)
- [ ] `EXPO_PUBLIC_CONTRACT_ADDRESS` points to the re-deployed contract (with `commitPurchase()`)
- [ ] `prisma db push` has been run on the production DB (see `docs/DEPLOYMENT_RUNBOOK.md`)
- [ ] Backend `DEVICE_ATTESTATION_ENFORCE=false` in production until 50+ shadow samples collected
- [ ] `EXPO_PUBLIC_WC_PROJECT_ID` is the production project ID (not the `demo_project_id` stub)
