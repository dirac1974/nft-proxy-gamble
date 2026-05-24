import { createWalletClient, custom, type WalletClient, type Address } from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import { authApi } from "./api";
import { useWalletStore } from "@/stores/walletStore";

const IS_DEV = process.env.NODE_ENV !== "production";
export const CHAIN = IS_DEV ? polygonAmoy : polygon;

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

export function clearWalletClient(): void {
  _walletClient = null;
  _provider = null;
}

export function getWalletClient(): WalletClient {
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
  const { nonce } = await authApi.nonce(address);
  const signature = await client.signMessage({
    account: address,
    message: nonce,
  });
  const { token, userId, ageConfirmed } = await authApi.verify(address, signature);
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
