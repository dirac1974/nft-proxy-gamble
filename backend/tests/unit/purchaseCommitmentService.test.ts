// Mock dependencies before importing service
jest.mock("../../src/db/client.js", () => ({
  prisma: {
    iAPReceipt: { update: jest.fn() },
  },
}));

const mockCommitPurchase = jest.fn();
const mockWait = jest.fn();

jest.mock("../../src/services/mintOrchestrator.js", () => ({
  getCommitContract: jest.fn(() => ({
    commitPurchase: mockCommitPurchase,
  })),
}));

import {
  queuePurchaseCommitment,
  flushPendingCommitments,
  getPendingBatchSize,
  _resetForTest,
} from "../../src/services/purchaseCommitmentService.js";
import { prisma } from "../../src/db/client.js";
import { getCommitContract } from "../../src/services/mintOrchestrator.js";

const mockUpdate = prisma.iAPReceipt.update as jest.Mock;
const mockGetContract = getCommitContract as jest.Mock;

const SAMPLE: Parameters<typeof queuePurchaseCommitment>[0] = {
  user: "0xdeadbeef00000000000000000000000000000001",
  coinsAdded: 100,
  receiptHash: "0xabc123",
  iapRecordId: "iap-rec-001",
};

beforeEach(() => {
  _resetForTest();
  jest.clearAllMocks();
  mockCommitPurchase.mockResolvedValue({ wait: mockWait });
  mockWait.mockResolvedValue({ hash: "0xtxhash001" });
  mockUpdate.mockResolvedValue({});
});

afterEach(() => {
  _resetForTest();
});

describe("queuePurchaseCommitment", () => {
  it("accumulates items without flushing below BATCH_SIZE", async () => {
    await queuePurchaseCommitment(SAMPLE);
    await queuePurchaseCommitment(SAMPLE);
    expect(getPendingBatchSize()).toBe(2);
    expect(mockCommitPurchase).not.toHaveBeenCalled();
  });

  it("flushes immediately when BATCH_SIZE (20) is reached", async () => {
    for (let i = 0; i < 20; i++) {
      await queuePurchaseCommitment({ ...SAMPLE, iapRecordId: `iap-${i}` });
    }
    expect(getPendingBatchSize()).toBe(0);
    expect(mockCommitPurchase).toHaveBeenCalledTimes(20);
  });
});

describe("flushPendingCommitments", () => {
  it("calls commitPurchase for each queued item", async () => {
    await queuePurchaseCommitment({ ...SAMPLE, iapRecordId: "a" });
    await queuePurchaseCommitment({ ...SAMPLE, iapRecordId: "b" });
    await flushPendingCommitments();
    expect(mockCommitPurchase).toHaveBeenCalledTimes(2);
    expect(getPendingBatchSize()).toBe(0);
  });

  it("stores onChainTxHash on IAPReceipt after successful commit", async () => {
    await queuePurchaseCommitment(SAMPLE);
    await flushPendingCommitments();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: SAMPLE.iapRecordId },
      data: { onChainTxHash: "0xtxhash001" },
    });
  });

  it("passes correct BigInt coinsAdded and address to contract", async () => {
    await queuePurchaseCommitment(SAMPLE);
    await flushPendingCommitments();
    expect(mockCommitPurchase).toHaveBeenCalledWith(
      SAMPLE.user,
      BigInt(SAMPLE.coinsAdded),
      SAMPLE.receiptHash,
    );
  });

  it("is non-fatal — continues with remaining items if one fails", async () => {
    mockCommitPurchase
      .mockRejectedValueOnce(new Error("node down"))
      .mockResolvedValueOnce({ wait: mockWait });

    await queuePurchaseCommitment({ ...SAMPLE, iapRecordId: "fail-a" });
    await queuePurchaseCommitment({ ...SAMPLE, iapRecordId: "success-b" });
    await flushPendingCommitments();
    expect(mockCommitPurchase).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(1); // only the success
  });

  it("skips flush gracefully when contract not configured", async () => {
    mockGetContract.mockImplementationOnce(() => {
      throw new Error("MINTER_PRIVATE_KEY not set");
    });
    await queuePurchaseCommitment(SAMPLE);
    await flushPendingCommitments();
    expect(mockCommitPurchase).not.toHaveBeenCalled();
    expect(getPendingBatchSize()).toBe(0); // batch cleared even on skip
  });

  it("is idempotent — flushing empty batch does nothing", async () => {
    await flushPendingCommitments();
    expect(mockCommitPurchase).not.toHaveBeenCalled();
  });
});
