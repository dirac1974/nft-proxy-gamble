import { createWalletClient, custom, defineChain, http, type WalletClient, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";
import { authApi } from "./api";
import { useWalletStore } from "@/stores/walletStore";

// M4: chain comes from an explicit EXPO_PUBLIC_CHAIN_ID (set per EAS profile),
// never inferred from NODE_ENV. Release builds refuse to start without it.
export const SUPPORTED_CHAIN_IDS = [polygonAmoy.id, polygon.id] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export function resolveChainId(raw: string | undefined, isDev: boolean): SupportedChainId {
  if (!raw) {
    if (isDev) return polygonAmoy.id;
    throw new Error("EXPO_PUBLIC_CHAIN_ID is not set — refusing to start a release build");
  }
  const id = Number(raw);
  if (!(SUPPORTED_CHAIN_IDS as readonly number[]).includes(id)) {
    throw new Error(`EXPO_PUBLIC_CHAIN_ID must be one of ${SUPPORTED_CHAIN_IDS.join(", ")} (got ${raw})`);
  }
  return id as SupportedChainId;
}

const BASE_CHAIN = resolveChainId(process.env.EXPO_PUBLIC_CHAIN_ID, __DEV__) === polygon.id ? polygon : polygonAmoy;

// DEBUG-ONLY end-to-end test hooks. All of: __DEV__ (false in release builds,
// so this code is dead-stripped), explicit EXPO_PUBLIC_E2E_* env at bundle time,
// EXPO_PUBLIC_E2E_CHAIN_ID=31337 and a loopback RPC. app.config.js and CI also
// refuse EXPO_PUBLIC_E2E_* in any EAS build. Used to drive the app on an
// emulator against a local chain.
export const E2E_CHAIN_ID = 31337;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

export function isLoopbackRpc(url: string | undefined): boolean {
  const m = url ? /^https?:\/\/([^/:?#]+)(:\d+)?([/?#].*)?$/i.exec(url.trim()) : null;
  return !!m && LOOPBACK_HOSTS.has(m[1]!.toLowerCase());
}

export function e2eAllowed(isDev: boolean, rpc: string | undefined, pk: string | undefined, chainId: string | undefined): boolean {
  return isDev && !!pk && !!rpc && chainId === String(E2E_CHAIN_ID) && isLoopbackRpc(rpc);
}

const E2E_ENABLED_RAW = __DEV__
  ? e2eAllowed(
      __DEV__,
      process.env.EXPO_PUBLIC_E2E_CHAIN_RPC,
      process.env.EXPO_PUBLIC_E2E_WALLET_PK,
      process.env.EXPO_PUBLIC_E2E_CHAIN_ID,
    )
  : false;
// Every EXPO_PUBLIC_E2E_* read sits directly behind a literal __DEV__ so the minifier
// drops it from release bundles (CI greps the exported bundle to prove it).
const E2E_CHAIN_RPC = __DEV__ && E2E_ENABLED_RAW ? process.env.EXPO_PUBLIC_E2E_CHAIN_RPC : undefined;
const E2E_WALLET_PK = __DEV__ && E2E_ENABLED_RAW ? process.env.EXPO_PUBLIC_E2E_WALLET_PK : undefined;
export const E2E_WALLET_ENABLED = __DEV__ && E2E_ENABLED_RAW;

const E2E_CHAIN = E2E_CHAIN_RPC
  ? defineChain({
      id: E2E_CHAIN_ID,
      name: "Local test chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [E2E_CHAIN_RPC] } },
    })
  : null;

export const CHAIN = E2E_CHAIN ?? BASE_CHAIN;

let _walletClient: WalletClient | null = null;
let _provider: unknown = null;

export const REQUIRED_CHAIN_ID = CHAIN.id;

export function setWalletClient(provider: unknown): void {
  _provider = provider;
  _walletClient = createWalletClient({
    chain: CHAIN,
    transport: custom(provider as Parameters<typeof custom>[0]),
  });
}

/** DEBUG-ONLY: sign in with a local test key (see E2E_WALLET_ENABLED). */
export async function connectE2EWallet(): Promise<void> {
  if (!E2E_WALLET_ENABLED || !E2E_WALLET_PK || !E2E_CHAIN) throw new Error("Test wallet unavailable");
  const account = privateKeyToAccount(E2E_WALLET_PK as `0x${string}`);
  _provider = null;
  _walletClient = createWalletClient({ account, chain: E2E_CHAIN, transport: http(E2E_CHAIN_RPC) });
  await signAndAuthenticate(account.address);
}

export function clearWalletClient(): void {
  _walletClient = null;
  _provider = null;
}

export function getWalletClient(): WalletClient {
  // DEBUG-ONLY: restore the local test signer after an app restart.
  if (!_walletClient && E2E_WALLET_ENABLED && E2E_WALLET_PK && E2E_CHAIN) {
    _walletClient = createWalletClient({
      account: privateKeyToAccount(E2E_WALLET_PK as `0x${string}`),
      chain: E2E_CHAIN,
      transport: http(E2E_CHAIN_RPC),
    });
  }
  if (!_walletClient) throw new Error("Wallet not connected");
  return _walletClient;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export async function isOnRequiredNetwork(): Promise<boolean> {
  if (!_provider) return false;
  try {
    const chainIdHex = (await (_provider as EthereumProvider).request({
      method: "eth_chainId",
    })) as string;
    return parseInt(chainIdHex, 16) === REQUIRED_CHAIN_ID;
  } catch {
    return false;
  }
}

export async function switchToRequiredNetwork(): Promise<void> {
  if (!_provider) throw new Error("Wallet not connected");
  const chainIdHex = `0x${REQUIRED_CHAIN_ID.toString(16)}`;
  await (_provider as EthereumProvider).request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: chainIdHex }],
  });
  useWalletStore.getState().setNetworkMismatch(false);
}

export async function signAndAuthenticate(address: Address): Promise<void> {
  const client = getWalletClient();
  const { nonce, message } = await authApi.nonce(address);
  // EIP-4361 (SIWE): sign the full server-issued message. Refuse anything that
  // isn't bound to this address and nonce, so a tampered response can't make
  // the user sign an arbitrary statement.
  if (message && (!message.toLowerCase().includes(address.toLowerCase()) || !message.includes(nonce))) {
    throw new Error("Sign-in message didn't match this wallet. Please try again.");
  }
  const signature = await client.signMessage({
    account: client.account ?? address,
    message: message ?? nonce,
  });
  const { token, userId, ageConfirmed } = await authApi.verify(address, signature, message);
  useWalletStore.getState().connect(address);
  useWalletStore.getState().setJwt(token, userId, ageConfirmed);
}

// Card display helpers (card integer 0-51 → rank + suit)
const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUIT_LABELS = ["♣", "♦", "♥", "♠"] as const;
const SUIT_NAMES = ["clubs", "diamonds", "hearts", "spades"] as const;

export interface CardInfo {
  rank: string;
  suit: string;
  suitName: "clubs" | "diamonds" | "hearts" | "spades";
  isRed: boolean;
  label: string;
}

export function decodeCard(card: number): CardInfo {
  const rank = RANK_LABELS[card % 13]!;
  const suitIdx = Math.floor(card / 13);
  const suit = SUIT_LABELS[suitIdx]!;
  const suitName = SUIT_NAMES[suitIdx]!;
  const isRed = suitIdx === 1 || suitIdx === 2;
  return { rank, suit, suitName, isRed, label: `${rank}${suit}` };
}
