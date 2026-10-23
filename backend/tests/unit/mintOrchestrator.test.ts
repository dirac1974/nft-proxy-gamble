// tokenId extraction (B-2 regression: TransferSingle is logs[0] and its
// topics[3] is the recipient), L-3 (no default "0"), L-4 (full session id),
// and revert classification per the 2026-10 contract-hardening policy.
import { AbiCoder, encodeBytes32String, getAddress, id as keccak256Id, keccak256, toUtf8Bytes } from "ethers";
import {
  classifyChainError,
  legacySessionIdToBytes32,
  sessionIdToBytes32,
  tokenIdFromLogs,
  voucherInterface,
} from "../../src/services/mintOrchestrator.js";
import { backoffMs, bumpFees, signPersistBroadcast, withSenderLock } from "../../src/services/chainSender.js";
import { FakeChain, revertError } from "../helpers/fakeChain.js";

const TRANSFER_SINGLE_SIG = keccak256Id("TransferSingle(address,address,address,uint256,uint256)");
const pad32 = (hex: string) => "0x" + hex.replace(/^0x/, "").padStart(64, "0");
const addressTopic = (addr: string) => pad32(getAddress(addr).slice(2));
const TO = "0x1111111111111111111111111111111111111111";
const SID = sessionIdToBytes32("cm0session0000000000000001");

function voucherLog(tokenId: bigint, sid = SID) {
  return voucherInterface.encodeEventLog("VoucherMinted", [tokenId, TO, 100n, encodeBytes32String("Game1"), sid]);
}
const transferSingleLog = {
  topics: [TRANSFER_SINGLE_SIG, addressTopic(TO), pad32("0"), addressTopic(TO)],
  data: AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [42n, 1n]),
};

describe("tokenIdFromLogs", () => {
  it("returns the tokenId from VoucherMinted, ignoring TransferSingle (logs[0])", () => {
    expect(tokenIdFromLogs([transferSingleLog, voucherLog(42n)])).toBe("42");
  });

  it("handles tokenId 0 (first mint)", () => {
    expect(tokenIdFromLogs([voucherLog(0n)])).toBe("0");
  });

  it("L-3: throws (never defaults to '0') when no VoucherMinted log is present", () => {
    expect(() => tokenIdFromLogs([transferSingleLog])).toThrow(/VoucherMinted event not found/);
    expect(() => tokenIdFromLogs([])).toThrow();
  });

  it("only accepts the event for the expected sessionId", () => {
    const other = sessionIdToBytes32("other");
    expect(() => tokenIdFromLogs([voucherLog(5n, other)], SID)).toThrow();
    expect(tokenIdFromLogs([voucherLog(5n, other), voucherLog(6n)], SID)).toBe("6");
  });
});

describe("session id encoding (L-4)", () => {
  it("is keccak256(utf8(sessionId)) of the FULL id", () => {
    const id = "a".repeat(40);
    expect(sessionIdToBytes32(id)).toBe(keccak256(toUtf8Bytes(id)));
    expect(sessionIdToBytes32(id)).not.toBe(sessionIdToBytes32("a".repeat(31)));
  });

  it("legacy encoding stays available only for pre-L-4 rows", () => {
    expect(legacySessionIdToBytes32("abc")).toBe(encodeBytes32String("abc"));
  });

  it("rejects an empty id", () => {
    expect(() => sessionIdToBytes32("")).toThrow();
  });
});

describe("classifyChainError", () => {
  it.each([
    ["Session id already used", "ALREADY_MINTED"],
    ["Daily mint cap exceeded", "RETRY_CAP"],
    ["Insufficient backing", "RETRY_BACKING"],
    ["Pausable: paused", "RETRY_PAUSED"],
    ["Above max coin balance", "TERMINAL"],
    ["Below min coin balance", "TERMINAL"],
    ["Invalid game type", "TERMINAL"],
    ["Invalid session id", "TERMINAL"],
    ["Something else", "UNKNOWN_REVERT"],
  ])("%s → %s", (reason, kind) => {
    expect(classifyChainError(revertError(reason)).kind).toBe(kind);
  });

  it("decodes OZ custom errors from revert data", () => {
    const paused = voucherInterface.encodeErrorResult("EnforcedPause", []);
    expect(classifyChainError({ code: "CALL_EXCEPTION", reason: null, data: paused }).kind).toBe("RETRY_PAUSED");
    const role = voucherInterface.encodeErrorResult("AccessControlUnauthorizedAccount", [TO, "0x" + "00".repeat(32)]);
    expect(classifyChainError({ code: "CALL_EXCEPTION", reason: null, data: role }).kind).toBe("RETRY_CONFIG");
    const recv = voucherInterface.encodeErrorResult("ERC1155InvalidReceiver", [TO]);
    expect(classifyChainError({ code: "CALL_EXCEPTION", reason: null, data: recv }).kind).toBe("TERMINAL");
  });

  it("network errors are TRANSIENT (never refunded)", () => {
    expect(classifyChainError(Object.assign(new Error("ECONNREFUSED"), { code: "NETWORK_ERROR" })).kind).toBe("TRANSIENT");
  });
});

describe("chainSender", () => {
  it("bumps EIP-1559 fees by > 10%", () => {
    const f = bumpFees({ maxFeePerGas: 1000n, maxPriorityFeePerGas: 100n });
    expect(f.maxFeePerGas! * 10n).toBeGreaterThan(1000n * 11n);
    expect(f.maxPriorityFeePerGas! * 10n).toBeGreaterThan(100n * 11n);
    expect(bumpFees({ gasPrice: 80n }).gasPrice).toBe(91n);
  });

  it("backoff grows and caps at 30 minutes", () => {
    expect(backoffMs(1)).toBe(15_000);
    expect(backoffMs(2)).toBe(30_000);
    expect(backoffMs(50)).toBe(30 * 60_000);
  });

  it("serializes critical sections", async () => {
    const order: string[] = [];
    const slow = (tag: string, ms: number) =>
      withSenderLock(async () => {
        order.push(`${tag}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${tag}:end`);
      });
    await Promise.all([slow("a", 30), slow("b", 1), withSenderLock(async () => Promise.reject(new Error("x"))).catch(() => undefined), slow("c", 1)]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("persists before broadcast and does not broadcast when persist fails", async () => {
    const chain = new FakeChain();
    const call = { fn: "commitPurchase" as const, args: [TO, 1n, "0x" + "11".repeat(32)] };
    await expect(
      signPersistBroadcast(chain, call, {}, async () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");
    expect(chain.broadcasts).toHaveLength(0);

    let persistedAt = -1;
    const s = await signPersistBroadcast(chain, call, {}, async () => {
      persistedAt = chain.broadcasts.length;
    });
    expect(persistedAt).toBe(0);
    expect(chain.broadcasts).toEqual([s.hash]);
    expect(s.nonce).toBe(0);
  });

  it("reads the pending nonce from the chain on every send (no local counter)", async () => {
    const chain = new FakeChain();
    const call = { fn: "commitPurchase" as const, args: [TO, 1n, "0x" + "11".repeat(32)] };
    chain.latestNonce = 7; // e.g. txs sent by another process / after a restart
    const s = await signPersistBroadcast(chain, call, {}, async () => undefined);
    expect(s.nonce).toBe(7);
  });
});
