import { createWalletClient, custom, type WalletClient, type Address } from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import { authApi } from "./api";
import { useWalletStore } from "@/stores/walletStore";

const IS_DEV = process.env.NODE_ENV !== "production";
export const CHAIN = IS_DEV ? polygonAmoy : polygon;
export const REQUIRED_CHAIN_ID = CHAIN.id; // 80002 (Amoy) or 137 (Polygon)

// WalletConnect provider injected by @walletconnect/modal-react-native
let _walletClient: WalletClient | null = null;

export function setWalletClient(provider: unknown): void {
  _walletClient = createWalletClient({
    chain: CHAIN,
    transport: custom(provider as Parameters<typeof custom>[0]),
  });
}

export function getWalletClient(): WalletClient {
  if (!_walletClient) throw new Error("Wallet not connected");
  return _walletClient;
}

export function clearWalletClient(): void {
  _walletClient = null;
}

/**
 * Returns the connected wallet's current chain ID by calling eth_chainId.
 * Throws if no wallet client is set.
 */
export async function getChainId(): Promise<number> {
  const client = getWalletClient();
  const chainId = await client.getChainId();
  return chainId;
}

/**
 * Returns true when the wallet is on the correct network.
 */
export async function isOnRequiredNetwork(): Promise<boolean> {
  try {
    const chainId = await getChainId();
    return chainId === REQUIRED_CHAIN_ID;
  } catch {
    return false;
  }
}

/**
 * Requests the wallet to switch to the required chain.
 * Throws with a user-readable message if the request fails.
 */
export async function switchToRequiredNetwork(): Promise<void> {
  const client = getWalletClient();
  try {
    await client.switchChain({ id: REQUIRED_CHAIN_ID });
    useWalletStore.getState().setNetworkMismatch(false);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to switch network";
    throw new Error(`Switch network failed: ${message}`);
  }
}

/**
 * Validates network and signs the nonce-based auth flow.
 * Sets walletStore state throughout the flow.
 */
export async function signAndAuthenticate(address: Address): Promise<void> {
  const store = useWalletStore.getState();
  store.setStatus("authenticating");

  // Network check — must be on CHAIN before signing
  const onCorrectChain = await isOnRequiredNetwork();
  if (!onCorrectChain) {
    store.setNetworkMismatch(true);
    throw new Error(
      `Wrong network. Please switch to ${CHAIN.name} (chain ID ${REQUIRED_CHAIN_ID}).`
    );
  }

  const client = getWalletClient();
  const { nonce } = await authApi.nonce(address);
  const signature = await client.signMessage({
    account: address,
    message: nonce,
  });
  const { token } = await authApi.verify(address, signature);
  store.connect(address);
  store.setJwt(token);
}

// ── Card display helpers ──────────────────────────────────────────────────────
// ADR-002: rank = card % 13 (0→2 … 12→A), suit = floor(card/13) (0=♣ 1=♦ 2=♥ 3=♠)

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
