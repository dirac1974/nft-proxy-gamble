import { polygonscanUrl } from "@/services/nftRedemptionService";

// polygonscanUrl is the only pure function we can unit-test without a wallet
describe("polygonscanUrl", () => {
  const txHash = "0x" + "a".repeat(64);

  it("returns amoy URL for non-mainnet chain (chain id !== 137)", () => {
    // In test/dev env, CHAIN is polygonAmoy (chain id 80002)
    const url = polygonscanUrl(txHash);
    expect(url).toContain("amoy.polygonscan.com");
    expect(url).toContain(txHash);
  });

  it("URL contains /tx/ path", () => {
    const url = polygonscanUrl(txHash);
    expect(url).toMatch(/\/tx\/0x[a-f0-9]+/);
  });
});
