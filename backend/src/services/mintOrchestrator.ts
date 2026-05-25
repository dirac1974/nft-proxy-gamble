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
  // VoucherMinted is the contract-specific event that carries the canonical tokenId.
  // We parse it instead of relying on log ordering, because the ERC1155 TransferSingle
  // event from OpenZeppelin's _mint() is emitted FIRST (logs[0]) and its topics[3] is
  // the recipient address — parsing that as a uint256 produced a giant garbage "tokenId"
  // before this fix. Use parseLog() against the event signature to be safe.
  "event VoucherMinted(uint256 indexed tokenId, address indexed to, uint256 coinAmount, bytes32 indexed gameType, bytes32 sessionId)",
];

// commitPurchase added in Phase 3.6 — emits PurchaseCommitted event for audit trail
const COMMIT_ABI = [
  "function commitPurchase(address user, uint256 coinsAdded, bytes32 receiptHash) external",
];

let _provider: JsonRpcProvider | null = null;
let _nonceManager: NonceManager | null = null;
let _mintContract: Contract | null = null;
let _commitContract: Contract | null = null;

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

function getMintContract(): Contract {
  if (!_mintContract) {
    if (!config.CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not configured");
    _mintContract = new Contract(config.CONTRACT_ADDRESS, MINT_ABI, getNonceManager());
  }
  return _mintContract;
}

export function getCommitContract(): Contract {
  if (!_commitContract) {
    if (!config.CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not configured");
    _commitContract = new Contract(config.CONTRACT_ADDRESS, COMMIT_ABI, getNonceManager());
  }
  return _commitContract;
}

export async function mintVoucher(
  toAddress: string,
  coinAmount: number,
  gameType: string,
  sessionId: string,
): Promise<{ txHash: string; tokenId: string }> {
  const contract = getMintContract();
  const gameTypeBytes = encodeBytes32String(gameType.slice(0, 31));
  const sessionIdBytes = encodeBytes32String(sessionId.slice(0, 31));

  const tx = await contract.mint(toAddress, coinAmount, gameTypeBytes, sessionIdBytes);
  const receipt = await tx.wait(1);

  // Find the VoucherMinted log by parsing each log with our ABI.
  // ethers v6: contract.interface.parseLog returns null for logs the interface doesn't know.
  let tokenId = "0";
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog({
        topics: [...(log.topics as string[])],
        data: log.data as string,
      });
      if (parsed?.name === "VoucherMinted") {
        tokenId = (parsed.args.tokenId as bigint).toString();
        break;
      }
    } catch {
      // Not a log our ABI recognises (e.g. ERC1155 TransferSingle) — skip.
    }
  }

  return { txHash: tx.hash as string, tokenId };
}

// Exported for testing
export { getMintContract as getContract, getNonceManager };
