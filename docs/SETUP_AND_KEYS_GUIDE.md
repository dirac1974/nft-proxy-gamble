# Setup and Keys Guide - NFT Proxy Gamble

**Goal**: Get the entire system running locally and on testnet so you can test end-to-end flows before production deployment.

---

## Current Deployment Status (2026-05-24)

| Component | State | Detail |
|---|---|---|
| Supabase DB | ✅ Live | project `yzodntgnaydfkqvibmff`, 6 tables applied |
| NFTProxyVoucher (Amoy) | ✅ Deployed + verified | `0x2Ed681d659E67A0ef154875CA4743Ed865B60255` |
| Backend `.env` | ✅ Wired | DATABASE_URL, JWT_SECRET, MINTER_PRIVATE_KEY, CONTRACT_ADDRESS all set |
| MINTER_ROLE | ✅ Held by backend wallet | Granted by constructor (deployer = minter wallet) |
| EAS mobile build | ⏳ Pending | needs Apple/Google credentials |
| Apple/Google IAP creds | ⏳ Pending | only needed for receipt verification |

---

## 1. Required Secrets (5 Total)

| Secret | Where to Get It | How to Use It |
|--------|------------------|---------------|
| `PRIVATE_KEY` | Your wallet (MetaMask, etc.) | Deploy contract + sign backend transactions |
| `DATABASE_URL` | Neon / Supabase / Railway / local Postgres | Backend database connection |
| `POLYGONSCAN_API_KEY` | [polygonscan.com](https://polygonscan.com) (free) | Verify contract on Amoy |
| `MINTER_ADDRESS` | Backend wallet address | Grant MINTER_ROLE after deploy |
| `JWT_SECRET` | Generate random string (32+ chars) | Backend authentication |

---

## 2. Step-by-Step Setup

### Step 1: Backend Environment (contracts/ + backend/)

1. Copy the example files:
   ```bash
   cp contracts/.env.example contracts/.env
   cp backend/.env.example backend/.env
   ```

2. Fill in the values:

**contracts/.env**
```env
POLYGON_AMOY_RPC=https://rpc-amoy.polygon.technology
PRIVATE_KEY=0xYourPrivateKeyHere
POLYGONSCAN_API_KEY=YourPolygonscanKey
```

**backend/.env**
```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=YourSuperSecretJWTKeyHere1234567890
MINTER_ADDRESS=0xYourBackendWalletAddress
POLYGON_AMOY_RPC=https://rpc-amoy.polygon.technology
```

### Step 2: Get Test MATIC (Amoy)

Go to: https://faucet.polygon.technology/
- Select **Amoy** network
- Paste your wallet address
- Request 0.2 – 0.5 MATIC

### Step 3: Get Polygonscan API Key (Free)

1. Go to https://polygonscan.com/
2. Create a free account
3. Go to **API Keys** → Create new key
4. Copy the key into your `.env` files

### Step 4: Generate JWT Secret

Run this command:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output into `JWT_SECRET`.

### Step 5: Mobile / EAS Setup

1. Go to https://expo.dev/
2. Create an account and create a new project
3. Run:
   ```bash
   eas login
   eas whoami
   ```
4. Create `mobile/.env` and `mobile/eas.json` with your project ID

**Recommended secrets for EAS** (add via `eas secret:create`):
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_BALANCE_VERIFY_KEY` (same as backend HMAC key)
- Certificate pinning keys (if using)

---

## 3. Local Testing Flow (Recommended Before Full Deploy)

1. Start backend:
   ```bash
   cd backend
   npm run dev
   ```

2. Start mobile:
   ```bash
   cd mobile
   npx expo start
   ```

3. Test these flows locally:
   - Wallet connection
   - Video Poker (mocked backend)
   - IAP flow (use sandbox mode)
   - Balance updates

4. Once local testing passes, proceed to testnet deployment.

---

## 4. Full Deployment (One Script)

When ready, use the deployment script (copy-paste from Claude session or `DEPLOYMENT_RUNBOOK.md`).

It will automatically:
- Deploy contract
- Verify on Polygonscan
- Grant MINTER_ROLE
- Run Prisma migration
- Build mobile app
- Submit to TestFlight + Google Play Internal Testing

---

## 5. Quick Test Checklist

- [ ] Backend starts without errors
- [ ] Mobile app connects to backend
- [ ] Wallet connects successfully
- [ ] Can purchase coins (sandbox)
- [ ] Can play Video Poker
- [ ] Can cash out to NFT (testnet)
- [ ] Can view NFT in wallet
- [ ] Can redeem NFT for test USDC

---

**Tip**: Do all testing on Amoy testnet first. Only move to mainnet after beta validation.

**Last Updated**: May 24, 2026