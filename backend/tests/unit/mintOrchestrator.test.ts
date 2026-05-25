// Regression test for: tokenId parsed from the wrong log topic.
// The original code read `receipt.logs[0].topics[3]` assuming logs[0] was
// VoucherMinted — but ERC1155 emits TransferSingle FIRST, whose topics[3] is
// the `to` address. The fix parses logs via the contract interface and
// extracts tokenId from the VoucherMinted event specifically.

// Mock ethers BEFORE the import — capture contract behaviour per test.
const mockMint = jest.fn();
const mockWait = jest.fn();

jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn(() => ({ address: "0xdeadbeef" })),
    NonceManager: jest.fn((w: unknown) => w),
    Contract: jest.fn().mockImplementation((_addr: string, abi: string[]) => {
      // Use real Interface so parseLog works correctly
      const iface = new actual.Interface(abi);
      return {
        mint: mockMint,
        interface: iface,
      };
    }),
  };
});

// Stub config so the orchestrator initialises cleanly in unit tests.
jest.mock("../../src/config/index.js", () => ({
  config: {
    POLYGON_RPC: "http://localhost:8545",
    MINTER_PRIVATE_KEY: "0x" + "ab".repeat(32),
    CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
  },
}));

import { id as keccak256Id, AbiCoder, getAddress } from "ethers";
import { mintVoucher } from "../../src/services/mintOrchestrator.js";

const VOUCHER_MINTED_SIG = keccak256Id(
  "VoucherMinted(uint256,address,uint256,bytes32,bytes32)",
);
const TRANSFER_SINGLE_SIG = keccak256Id(
  "TransferSingle(address,address,address,uint256,uint256)",
);

function pad32(hex: string): string {
  return "0x" + hex.replace(/^0x/, "").padStart(64, "0");
}

function addressTopic(addr: string): string {
  return pad32(getAddress(addr).slice(2));
}

beforeEach(() => {
  mockMint.mockReset();
  mockWait.mockReset();
});

describe("mintVoucher tokenId extraction", () => {
  it("returns the correct tokenId from VoucherMinted, ignoring TransferSingle (logs[0])", async () => {
    const tokenId = 42n;
    const to = "0x1111111111111111111111111111111111111111";

    const transferSingleLog = {
      // operator, from(0x0), to — to is at topics[3]. THIS WAS THE PREVIOUS BUG SOURCE.
      topics: [
        TRANSFER_SINGLE_SIG,
        addressTopic(to),
        pad32("0".repeat(40)),
        addressTopic(to),
      ],
      data: AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256"],
        [tokenId, 1n],
      ),
    };
    const voucherMintedLog = {
      // tokenId, to, gameType — tokenId is at topics[1]
      topics: [
        VOUCHER_MINTED_SIG,
        pad32(tokenId.toString(16)),
        addressTopic(to),
        pad32("47616d6531"), // "Game1" as bytes32 padding
      ],
      data: AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32"],
        [100n, "0x" + "00".repeat(31) + "01"],
      ),
    };

    mockWait.mockResolvedValue({
      hash: "0xtx",
      logs: [transferSingleLog, voucherMintedLog],
    });
    mockMint.mockResolvedValue({ hash: "0xtx", wait: mockWait });

    const result = await mintVoucher(to, 100, "Game1", "session-1");
    expect(result.tokenId).toBe("42");
    expect(result.txHash).toBe("0xtx");
  });

  it("returns '0' when no VoucherMinted log present (defensive default)", async () => {
    mockWait.mockResolvedValue({ hash: "0xtx", logs: [] });
    mockMint.mockResolvedValue({ hash: "0xtx", wait: mockWait });

    const result = await mintVoucher(
      "0x1111111111111111111111111111111111111111",
      100,
      "Game1",
      "session-1",
    );
    expect(result.tokenId).toBe("0");
  });

  it("handles tokenId 0 (first mint) correctly", async () => {
    const to = "0x1111111111111111111111111111111111111111";
    const voucherMintedLog = {
      topics: [
        VOUCHER_MINTED_SIG,
        pad32("0"),
        addressTopic(to),
        pad32("47616d6531"),
      ],
      data: AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32"],
        [100n, "0x" + "00".repeat(31) + "01"],
      ),
    };
    mockWait.mockResolvedValue({ hash: "0xtx", logs: [voucherMintedLog] });
    mockMint.mockResolvedValue({ hash: "0xtx", wait: mockWait });

    const result = await mintVoucher(to, 100, "Game1", "session-1");
    expect(result.tokenId).toBe("0");
  });
});
