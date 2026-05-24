import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import * as fc from "fast-check";

const GAME = ethers.encodeBytes32String("jacks-or-better-9-6");
const SESSION = ethers.encodeBytes32String("sess_abc123");
const COIN_AMOUNT = 1250n;
const USDC_DECIMALS = 6;

const usdcAmt = (whole: string) => ethers.parseUnits(whole, USDC_DECIMALS);

describe("NFTProxyVoucher", function () {
  let voucher: any;
  let voucherAddr: string;
  let usdc: any;
  let usdcAddr: string;
  let owner: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let pauser: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, minter, user1, user2, pauser] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockERC20");
    usdc = await Mock.deploy("USD Coin", "USDC", USDC_DECIMALS);
    await usdc.waitForDeployment();
    usdcAddr = await usdc.getAddress();

    const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
    voucher = await Voucher.deploy(usdcAddr);
    await voucher.waitForDeployment();
    voucherAddr = await voucher.getAddress();

    // Fund the contract with 100,000 USDC of liquidity.
    await usdc.mint(voucherAddr, usdcAmt("100000"));

    await voucher.grantRole(await voucher.MINTER_ROLE(), minter.address);
    await voucher.grantRole(await voucher.PAUSER_ROLE(), pauser.address);
  });

  // ============================================================
  // T1–T2  Original behaviour
  // ============================================================

  it("T1. mints a voucher with correct on-chain balance", async function () {
    await voucher.connect(minter).mint(user1.address, COIN_AMOUNT, GAME, SESSION);
    expect(await voucher.coinBalance(0)).to.equal(COIN_AMOUNT);
    expect(await voucher.balanceOf(user1.address, 0)).to.equal(1n);
  });

  it("T2. redeems correctly (100 coins = 1 USDC)", async function () {
    await voucher.connect(minter).mint(user1.address, 500, GAME, SESSION);
    const before = await usdc.balanceOf(user1.address);
    await voucher.connect(user1).redeem(0);
    expect(await voucher.balanceOf(user1.address, 0)).to.equal(0n);
    expect(await usdc.balanceOf(user1.address)).to.equal(before + usdcAmt("5"));
  });

  // ============================================================
  // T3–T20  Grok-added tests, migrated to ethers v6 + bytes32 + invariants
  // ============================================================

  it("T3. reverts when non-minter tries to mint", async function () {
    await expect(
      voucher.connect(user1).mint(user1.address, 100, GAME, SESSION)
    ).to.be.revertedWithCustomError(voucher, "AccessControlUnauthorizedAccount");
  });

  it("T4. reverts mint below MIN_COIN_BALANCE (0 and 99)", async function () {
    await expect(
      voucher.connect(minter).mint(user1.address, 0, GAME, SESSION)
    ).to.be.revertedWith("Below min coin balance");
    await expect(
      voucher.connect(minter).mint(user1.address, 99, GAME, SESSION)
    ).to.be.revertedWith("Below min coin balance");
  });

  it("T5. prevents double redeem", async function () {
    await voucher.connect(minter).mint(user1.address, 100, GAME, SESSION);
    await voucher.connect(user1).redeem(0);
    await expect(voucher.connect(user1).redeem(0)).to.be.reverted;
  });

  it("T6. prevents non-owner from redeeming", async function () {
    await voucher.connect(minter).mint(user1.address, 100, GAME, SESSION);
    await expect(voucher.connect(user2).redeem(0)).to.be.revertedWith(
      "Not owner or already redeemed"
    );
  });

  it("T7. handles 6-decimal USDC math (12,300 coins = 123.00 USDC)", async function () {
    await voucher.connect(minter).mint(user1.address, 12_300, GAME, SESSION);
    const before = await usdc.balanceOf(user1.address);
    await voucher.connect(user1).redeem(0);
    expect(await usdc.balanceOf(user1.address)).to.equal(
      before + usdcAmt("123")
    );
  });

  it("T8. emits VoucherMinted with correct data (bytes32 gameType + sessionId)", async function () {
    await expect(
      voucher.connect(minter).mint(user1.address, 500, GAME, SESSION)
    )
      .to.emit(voucher, "VoucherMinted")
      .withArgs(0, user1.address, 500n, GAME, SESSION);
  });

  it("T9. emits VoucherRedeemed", async function () {
    await voucher.connect(minter).mint(user1.address, 300, GAME, SESSION);
    await expect(voucher.connect(user1).redeem(0))
      .to.emit(voucher, "VoucherRedeemed")
      .withArgs(0, user1.address, usdcAmt("3"));
  });

  it("T10. blocks mint and redeem when paused", async function () {
    await voucher.connect(minter).mint(user1.address, 100, GAME, SESSION);
    await voucher.connect(pauser).pause();
    await expect(
      voucher.connect(minter).mint(user1.address, 100, GAME, SESSION)
    ).to.be.revertedWithCustomError(voucher, "EnforcedPause");
    await expect(voucher.connect(user1).redeem(0)).to.be.revertedWithCustomError(
      voucher,
      "EnforcedPause"
    );
  });

  it("T11. allows mint after unpause", async function () {
    await voucher.connect(pauser).pause();
    await voucher.connect(pauser).unpause();
    await expect(
      voucher.connect(minter).mint(user1.address, 100, GAME, SESSION)
    ).to.not.be.reverted;
  });

  it("T12. supports the documented max coin amount (MAX_COIN_BALANCE = 100,000)", async function () {
    const max = await voucher.MAX_COIN_BALANCE();
    expect(max).to.equal(100_000n);
    await voucher.connect(minter).mint(user1.address, max, GAME, SESSION);
    expect(await voucher.coinBalance(0)).to.equal(max);
  });

  it("T13. reverts redeem if contract has insufficient USDC (drain via emergencyWithdrawUSDC)", async function () {
    await voucher.connect(minter).mint(user1.address, 10_000, GAME, SESSION);
    const liquidity = await usdc.balanceOf(voucherAddr);
    await voucher
      .connect(owner)
      .emergencyWithdrawUSDC(liquidity, owner.address);
    await expect(voucher.connect(user1).redeem(0)).to.be.revertedWith(
      "Insufficient USDC liquidity"
    );
  });

  it("T14. supports multiple vouchers per user", async function () {
    await voucher.connect(minter).mint(user1.address, 100, GAME, SESSION);
    await voucher
      .connect(minter)
      .mint(user1.address, 200, GAME, ethers.encodeBytes32String("s2"));
    expect(await voucher.balanceOf(user1.address, 0)).to.equal(1n);
    expect(await voucher.balanceOf(user1.address, 1)).to.equal(1n);
  });

  it("T15. tracks gameType (bytes32) per token", async function () {
    const bj = ethers.encodeBytes32String("blackjack-3-2");
    await voucher.connect(minter).mint(user1.address, 500, bj, SESSION);
    expect(await voucher.gameType(0)).to.equal(bj);
  });

  it("T16. stores mintedTimestamp near block.timestamp", async function () {
    const tx = await voucher
      .connect(minter)
      .mint(user1.address, 100, GAME, SESSION);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const stamped = await voucher.mintedTimestamp(0);
    expect(stamped).to.be.closeTo(BigInt(block!.timestamp), 5n);
  });

  it("T17. reverts when redeeming a non-existent token", async function () {
    await expect(voucher.connect(user1).redeem(999)).to.be.reverted;
  });

  it("T18. allows admin to update URI", async function () {
    const newURI = "https://new-api.example.com/{id}.json";
    await expect(voucher.connect(owner).setURI(newURI)).to.not.be.reverted;
    expect(await voucher.uri(0)).to.equal(newURI);
  });

  it("T19. supports ERC1155 batch transfer", async function () {
    await voucher.connect(minter).mint(user1.address, 100, GAME, SESSION);
    await voucher
      .connect(minter)
      .mint(user1.address, 200, GAME, ethers.encodeBytes32String("s2"));
    await expect(
      voucher
        .connect(user1)
        .safeBatchTransferFrom(user1.address, user2.address, [0, 1], [1, 1], "0x")
    ).to.not.be.reverted;
  });

  it("T20. rejects non-admin setURI", async function () {
    await expect(
      voucher.connect(user1).setURI("https://malicious.example.com/{id}")
    ).to.be.revertedWithCustomError(voucher, "AccessControlUnauthorizedAccount");
  });

  // ============================================================
  // T21–T30  New tests from pre-plan §5.B
  // ============================================================

  it("T21. redeem after P2P transfer — new owner can redeem, original cannot", async function () {
    await voucher.connect(minter).mint(user1.address, 500, GAME, SESSION);
    await voucher
      .connect(user1)
      .safeTransferFrom(user1.address, user2.address, 0, 1, "0x");

    await expect(voucher.connect(user1).redeem(0)).to.be.revertedWith(
      "Not owner or already redeemed"
    );

    const before = await usdc.balanceOf(user2.address);
    await voucher.connect(user2).redeem(0);
    expect(await usdc.balanceOf(user2.address)).to.equal(before + usdcAmt("5"));
  });

  it("T22. reentrancy attempt on redeem is blocked by nonReentrant", async function () {
    const Reentrant = await ethers.getContractFactory("ReentrantERC20");
    const reent = await Reentrant.deploy();
    await reent.waitForDeployment();
    const reentAddr = await reent.getAddress();

    const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
    const v = await Voucher.deploy(reentAddr);
    await v.waitForDeployment();
    const vAddr = await v.getAddress();

    await reent.mint(vAddr, usdcAmt("1000"));
    await v.grantRole(await v.MINTER_ROLE(), minter.address);

    // Two vouchers so the reentrant call targets a different tokenId than the outer call.
    await v.connect(minter).mint(user1.address, 100, GAME, SESSION);
    await v
      .connect(minter)
      .mint(user1.address, 100, GAME, ethers.encodeBytes32String("s2"));

    await reent.setAttack(vAddr, 1);

    // Outer redeem of token 0 triggers ReentrantERC20.transfer → reenters v.redeem(1) → ReentrancyGuard reverts.
    await expect(v.connect(user1).redeem(0)).to.be.revertedWithCustomError(
      v,
      "ReentrancyGuardReentrantCall"
    );

    // State rolled back: token 0 still belongs to user1, USDC unchanged.
    expect(await v.balanceOf(user1.address, 0)).to.equal(1n);
    expect(await reent.balanceOf(user1.address)).to.equal(0n);
  });

  it("T23. MAX_COIN_BALANCE boundary — exactly 100,000 OK; 100,001 reverts", async function () {
    await voucher.connect(minter).mint(user1.address, 100_000, GAME, SESSION);
    await expect(
      voucher.connect(minter).mint(user1.address, 100_001, GAME, SESSION)
    ).to.be.revertedWith("Above max coin balance");
  });

  it("T24. arbitrary non-round coinAmounts (350, 12_345) mint cleanly with exact USDC math", async function () {
    await voucher.connect(minter).mint(user1.address, 350, GAME, SESSION);
    const before = await usdc.balanceOf(user1.address);
    await voucher.connect(user1).redeem(0);
    // 350 * 10_000 = 3_500_000 raw units = 3.50 USDC
    expect(await usdc.balanceOf(user1.address)).to.equal(
      before + usdcAmt("3.5")
    );

    await voucher.connect(minter).mint(user1.address, 12_345, GAME, SESSION);
    const before2 = await usdc.balanceOf(user1.address);
    await voucher.connect(user1).redeem(1);
    // 12_345 * 10_000 = 123_450_000 raw units = 123.45 USDC
    expect(await usdc.balanceOf(user1.address)).to.equal(
      before2 + usdcAmt("123.45")
    );
  });

  it("T25. transfers are allowed while paused (only mint+redeem are gated)", async function () {
    await voucher.connect(minter).mint(user1.address, 100, GAME, SESSION);
    await voucher.connect(pauser).pause();
    await expect(
      voucher
        .connect(user1)
        .safeTransferFrom(user1.address, user2.address, 0, 1, "0x")
    ).to.not.be.reverted;
    await voucher.connect(pauser).unpause();
    const before = await usdc.balanceOf(user2.address);
    await voucher.connect(user2).redeem(0);
    expect(await usdc.balanceOf(user2.address)).to.equal(before + usdcAmt("1"));
  });

  it("T26. emergencyWithdrawUSDC is admin-only and emits EmergencyWithdrawal", async function () {
    await expect(
      voucher.connect(user1).emergencyWithdrawUSDC(usdcAmt("1"), user1.address)
    ).to.be.revertedWithCustomError(voucher, "AccessControlUnauthorizedAccount");

    await expect(
      voucher.connect(owner).emergencyWithdrawUSDC(0, ethers.ZeroAddress)
    ).to.be.revertedWith("Zero recipient");

    const target = user2.address;
    const amount = usdcAmt("250");
    const before = await usdc.balanceOf(target);
    await expect(voucher.connect(owner).emergencyWithdrawUSDC(amount, target))
      .to.emit(voucher, "EmergencyWithdrawal")
      .withArgs(target, amount);
    expect(await usdc.balanceOf(target)).to.equal(before + amount);
  });

  it("T27. MINTER_ROLE revocation prevents further mints from revoked party", async function () {
    const MINTER = await voucher.MINTER_ROLE();
    expect(await voucher.hasRole(MINTER, minter.address)).to.equal(true);
    await voucher.connect(owner).revokeRole(MINTER, minter.address);
    expect(await voucher.hasRole(MINTER, minter.address)).to.equal(false);
    await expect(
      voucher.connect(minter).mint(user1.address, 100, GAME, SESSION)
    ).to.be.revertedWithCustomError(voucher, "AccessControlUnauthorizedAccount");
  });

  it("T28. gas snapshots — mint < 150,000 and redeem < 80,000", async function () {
    const tx1 = await voucher
      .connect(minter)
      .mint(user1.address, 500, GAME, SESSION);
    const r1 = await tx1.wait();
    expect(Number(r1!.gasUsed)).to.be.lessThan(150_000);

    const tx2 = await voucher.connect(user1).redeem(0);
    const r2 = await tx2.wait();
    expect(Number(r2!.gasUsed)).to.be.lessThan(80_000);
  });

  it("T29. property — random valid mints redeem to coinAmount * 1e4 raw USDC units", async function () {
    this.timeout(60_000);
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000 }).map((n) => BigInt(n) * 100n), // multiples of 100, capped well below MAX
        async (coinAmount) => {
          const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
          const Mock = await ethers.getContractFactory("MockERC20");
          const u = await Mock.deploy("USD Coin", "USDC", USDC_DECIMALS);
          await u.waitForDeployment();
          const uAddr = await u.getAddress();
          const v = await Voucher.deploy(uAddr);
          await v.waitForDeployment();
          const vAddr = await v.getAddress();
          await u.mint(vAddr, usdcAmt("10000000"));
          await v.grantRole(await v.MINTER_ROLE(), minter.address);

          await v.connect(minter).mint(user1.address, coinAmount, GAME, SESSION);
          const before = await u.balanceOf(user1.address);
          await v.connect(user1).redeem(0);
          const got = (await u.balanceOf(user1.address)) - before;
          // 100 coins -> 1 USDC -> 1e6 raw units. Per coin: 1e4 raw units.
          expect(got).to.equal(coinAmount * 10_000n);
        }
      ),
      { numRuns: 20 } // keep tight; hardhat redeploys are expensive
    );
  });

  it("T30. uri() returns the constructor base URI by default", async function () {
    expect(await voucher.uri(0)).to.equal(
      "https://api.nftproxygamble.com/metadata/{id}.json"
    );
    expect(await voucher.uri(99)).to.equal(
      "https://api.nftproxygamble.com/metadata/{id}.json"
    );
  });

  // Branch / function coverage fillers

  it("T31. non-PAUSER reverts on pause and unpause", async function () {
    await expect(voucher.connect(user1).pause()).to.be.revertedWithCustomError(
      voucher,
      "AccessControlUnauthorizedAccount"
    );
    await voucher.connect(pauser).pause();
    await expect(
      voucher.connect(user1).unpause()
    ).to.be.revertedWithCustomError(voucher, "AccessControlUnauthorizedAccount");
  });

  it("T32. constructor reverts on zero USDC address", async function () {
    const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
    await expect(Voucher.deploy(ethers.ZeroAddress)).to.be.revertedWith(
      "USDC address required"
    );
  });

  it("T33. supportsInterface reports ERC1155 + AccessControl", async function () {
    // ERC165
    expect(await voucher.supportsInterface("0x01ffc9a7")).to.equal(true);
    // ERC1155
    expect(await voucher.supportsInterface("0xd9b67a26")).to.equal(true);
    // ERC1155MetadataURI
    expect(await voucher.supportsInterface("0x0e89341c")).to.equal(true);
    // AccessControl
    expect(await voucher.supportsInterface("0x7965db0b")).to.equal(true);
    // Random unknown
    expect(await voucher.supportsInterface("0xffffffff")).to.equal(false);
  });

  it("T34. invalid bytes32 gameType / sessionId revert", async function () {
    await expect(
      voucher
        .connect(minter)
        .mint(user1.address, 100, ethers.ZeroHash, SESSION)
    ).to.be.revertedWith("Invalid game type");
    await expect(
      voucher.connect(minter).mint(user1.address, 100, GAME, ethers.ZeroHash)
    ).to.be.revertedWith("Invalid session id");
  });
});
