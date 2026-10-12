import { setupTestDb, teardownTestDb, prisma } from "./setup";
import { acquireLease, releaseLease } from "../../src/services/chainWorker";

// A graceful shutdown must hand the minter lease over immediately; otherwise
// every rolling deploy pauses cash-out mints for a full lease TTL.
describe("WorkerLease handover", () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "WorkerLease"');
    await teardownTestDb();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "WorkerLease"');
  });

  it("blocks a second holder while the lease is live", async () => {
    expect(await acquireLease("instance-a")).toBe(true);
    expect(await acquireLease("instance-b")).toBe(false);
  });

  it("lets a successor acquire immediately after release", async () => {
    expect(await acquireLease("instance-a")).toBe(true);
    await releaseLease("instance-a");
    expect(await acquireLease("instance-b")).toBe(true);
  });

  it("release by a non-holder does not drop someone else's lease", async () => {
    expect(await acquireLease("instance-a")).toBe(true);
    await releaseLease("instance-b");
    expect(await acquireLease("instance-c")).toBe(false);
  });
});
