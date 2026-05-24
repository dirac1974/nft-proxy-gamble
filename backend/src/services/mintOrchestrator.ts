import {
  JsonRpcProvider,
  Wallet,
  Contract,
  NonceManager,
  encodeBytes32String,
} from "ethers";
import { config } from "../config/index.js";

const MINT_ABI = [
  "function mint(address to, uint256 coinAmount, bytes32 gameType, bytes32 sessionId) external returns (uint256)",
];

let _provider: JsonRpcProvider | null = null;
let _nonceManager: NonceManager | null = null;
let _contract: Contract | null = null;

function getProvider(): JsonRpcProvider {
  if (!_provider) _provider = new JsonRpcProvider(config.POLYGON_RPC);
  return _provider;
}

function getNonceManager(): NonceManager {
  if (!_nonceManager) {
    if (!config.MINTER_PRIVATE_KEY) throw new Error("MINTER_PRIVATE_KEY not configured");
    const wallet = new Wallet(config.MINTER_PRIVATE_KEY, getProvider());
    _nonceManager = new NonceManager(wallet);
  }
  return _nonceManager;
}

function getContract(): Contract {
  if (!_contract) {
    if (!config.CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not configured");
    _contract = new Contract(config.CONTRACT_ADDRESS, MINT_ABI, getNonceManager());
  }
  return _contract;
}

export async function mintVoucher(
  toAddress: string,
  coinAmount: number,
  gameType: string,
  sessionId: string,
): Promise<{ txHash: string; tokenId: string }> {
  const contract = getContract();
  const gameTypeBytes = encodeBytes32String(gameType.slice(0, 31));
  const sessionIdBytes = encodeBytes32String(sessionId.slice(0, 31));

  const tx = await contract.mint(toAddress, coinAmount, gameTypeBytes, sessionIdBytes);
  const receipt = await tx.wait(1);

  const log = receipt.logs?.[0];
  const tokenId = log ? BigInt(log.topics?.[3] ?? "0").toString() : "0";

  return { txHash: tx.hash as string, tokenId };
}

// Exported for testing
export { getContract, getNonceManager };
