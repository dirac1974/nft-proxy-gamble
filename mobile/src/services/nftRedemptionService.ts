import { getWalletClient, CHAIN } from "./walletService";
import { createPublicClient, http, type Address } from "viem";
import Constants from "expo-constants";

const CONTRACT_ADDRESS = (
  Constants.expoConfig?.extra?.contractAddress as string | undefined
) as Address | undefined;

const REDEEM_ABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "redeem",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const TRANSFER_ABI = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function getContractAddress(): Address {
  if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not configured in app.config.ts extra");
  return CONTRACT_ADDRESS;
}

function getPublicClient() {
  return createPublicClient({ chain: CHAIN, transport: http() });
}

export async function redeemVoucher(
  tokenId: bigint,
  walletAddress: Address,
): Promise<`0x${string}`> {
  const client = getWalletClient();
  const contractAddress = getContractAddress();

  const txHash = await client.writeContract({
    account: walletAddress,
    address: contractAddress,
    abi: REDEEM_ABI,
    functionName: "redeem",
    args: [tokenId],
    chain: CHAIN,
  });

  return txHash;
}

export async function waitForRedemption(txHash: `0x${string}`): Promise<void> {
  const publicClient = getPublicClient();
  await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
}

export async function transferVoucher(
  tokenId: bigint,
  fromAddress: Address,
  toAddress: Address,
): Promise<`0x${string}`> {
  const client = getWalletClient();
  const contractAddress = getContractAddress();

  const txHash = await client.writeContract({
    account: fromAddress,
    address: contractAddress,
    abi: TRANSFER_ABI,
    functionName: "safeTransferFrom",
    args: [fromAddress, toAddress, tokenId, 1n, "0x"],
    chain: CHAIN,
  });

  return txHash;
}

export function polygonscanUrl(txHash: string): string {
  const isMainnet = CHAIN.id === 137; // polygon mainnet
  const subdomain = isMainnet ? "polygonscan.com" : "amoy.polygonscan.com";
  return `https://${subdomain}/tx/${txHash}`;
}
