// IMPORTANT: this polyfill import MUST be the very first thing evaluated, before any
// other code touches crypto / WebSocket / TextEncoder. Reown AppKit (WalletConnect)
// cannot initialise without it, and the failure mode is silent: tapping "Connect
// Wallet" simply does nothing. Because _layout.tsx imports this module first, these
// polyfills are installed before the app renders.
import "@walletconnect/react-native-compat";

import { createAppKit } from "@reown/appkit-react-native";
import { EthersAdapter } from "@reown/appkit-ethers-react-native";
import { polygon, polygonAmoy } from "viem/chains";
import { storage } from "./storage";

const IS_DEV = process.env.NODE_ENV !== "production";

// Reown Cloud project ID. The env var (set per EAS build profile) wins; the literal
// fallback is this project's real ID so a build can never silently fall back to a
// placeholder again. It's a public client identifier, not a secret.
const projectId =
  process.env.EXPO_PUBLIC_WC_PROJECT_ID ?? "19c604c156cfc63e0268badfd24e60b0";

const metadata = {
  name: "NFT Proxy Gamble",
  description: "Provably fair video poker on Polygon",
  url: "https://nft-proxy-gamble.app",
  icons: ["https://nft-proxy-gamble.app/icon.png"],
  // `native` MUST match the `scheme` in app.config.js ("nftproxygamble") so the wallet
  // app can deep-link back here after approval. The old value ("nfpg://") did not match.
  redirect: { native: "nftproxygamble://", universal: "" },
};

export const appKit = createAppKit({
  projectId,
  networks: [polygon, polygonAmoy],
  defaultNetwork: IS_DEV ? polygonAmoy : polygon,
  adapters: [new EthersAdapter()],
  storage,
  metadata,
});
