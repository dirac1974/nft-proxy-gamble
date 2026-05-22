import { expect } from "chai";
import { ethers } from "hardhat";
import { NFTProxyVoucher } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Mock USDC for testing
describe("NFTProxyVoucher", function () {
  let voucher: NFTProxyVoucher;
  let usdc: any;
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let pauser: SignerWithAddress;

  const COIN_AMOUNT = 1250;

  beforeEach(async function () {
    [owner, minter, user1, user2, pauser] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockERC20");
    usdc = await MockUSDC.deploy("USD Coin", "USDC", 6);
    await usdc.deployed();

    const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
    voucher = await Voucher.deploy(usdc.address);
    await voucher.deployed();

    await usdc.mint(voucher.address, ethers.utils.parseUnits("100000", 6));
    await voucher.grantRole(await voucher.MINTER_ROLE(), minter.address);
    await voucher.grantRole(await voucher.PAUSER_ROLE(), pauser.address);
  });

  // === ORIGINAL TESTS (kept for reference) ===
  it("Should mint a voucher with correct on-chain balance", async function () {
    await voucher.connect(minter).mint(user1.address, COIN_AMOUNT, "jacks-or-better-9-6", 12345);
    const tokenId = 0;
    expect(await voucher.coinBalance(tokenId)).to.equal(COIN_AMOUNT);
    expect(await voucher.balanceOf(user1.address, tokenId)).to.equal(1);
  });

  it("Should redeem correctly and transfer USDC (100 coins = 1 USDC)", async function () {
    await voucher.connect(minter).mint(user1.address, 500, "jacks-or-better-9-6", 1);
    const initialUSDC = await usdc.balanceOf(user1.address);
    await voucher.connect(user1).redeem(0);
    expect(await voucher.balanceOf(user1.address, 0)).to.equal(0);
    expect(await usdc.balanceOf(user1.address)).to.equal(initialUSDC.add(ethers.utils.parseUnits("5", 6)));
  });

  // === 18 NEW CRITICAL TESTS (Added by Grok) ===

  it("Should revert when non-minter tries to mint", async function () {
    await expect(voucher.connect(user1).mint(user1.address, 100, "test", 1))
      .to.be.revertedWith(/AccessControl/);
  });

  it("Should revert mint with zero coin amount", async function () {
    await expect(voucher.connect(minter).mint(user1.address, 0, "test", 1))
      .to.be.revertedWith("Coin amount must be > 0");
  });

  it("Should prevent double redeem", async function () {
    await voucher.connect(minter).mint(user1.address, 100, "test", 1);
    await voucher.connect(user1).redeem(0);
    await expect(voucher.connect(user1).redeem(0)).to.be.reverted;
  });

  it("Should prevent non-owner from redeeming", async function () {
    await voucher.connect(minter).mint(user1.address, 100, "test", 1);
    await expect(voucher.connect(user2).redeem(0)).to.be.revertedWith("Not owner or already redeemed");
  });

  it("Should correctly handle 6-decimal USDC math (100 coins = 1 USDC)", async function () {
    await voucher.connect(minter).mint(user1.address, 12345, "test", 99); // 123.45 USDC
    const initial = await usdc.balanceOf(user1.address);
    await voucher.connect(user1).redeem(0);
    expect(await usdc.balanceOf(user1.address)).to.equal(initial.add(ethers.utils.parseUnits("123.45", 6)));
  });

  it("Should emit VoucherMinted event with correct data", async function () {
    await expect(voucher.connect(minter).mint(user1.address, 500, "jacks-or-better-9-6", 42))
      .to.emit(voucher, "VoucherMinted")
      .withArgs(0, user1.address, 500, "jacks-or-better-9-6", 42);
  });

  it("Should emit VoucherRedeemed event", async function () {
    await voucher.connect(minter).mint(user1.address, 300, "test", 1);
    await expect(voucher.connect(user1).redeem(0))
      .to.emit(voucher, "VoucherRedeemed")
      .withArgs(0, user1.address, 3);
  });

  it("Should block mint and redeem when paused", async function () {
    await voucher.connect(pauser).pause();
    await expect(voucher.connect(minter).mint(user1.address, 100, "test", 1)).to.be.revertedWith("Pausable: paused");
    await voucher.connect(pauser).unpause();
  });

  it("Should allow mint after unpause", async function () {
    await voucher.connect(pauser).pause();
    await voucher.connect(pauser).unpause();
    await expect(voucher.connect(minter).mint(user1.address, 100, "test", 1)).to.not.be.reverted;
  });

  it("Should handle very large coin amounts (1,000,000 coins)", async function () {
    const largeAmount = 1_000_000;
    await voucher.connect(minter).mint(user1.address, largeAmount, "test", 1);
    expect(await voucher.coinBalance(0)).to.equal(largeAmount);
  });

  it("Should revert redeem if contract has insufficient USDC", async function () {
    // Drain contract USDC first
    const drainAmount = await usdc.balanceOf(voucher.address);
    await usdc.connect(owner).transfer(owner.address, drainAmount); // simulate low liquidity
    await voucher.connect(minter).mint(user1.address, 10000, "test", 1);
    await expect(voucher.connect(user1).redeem(0)).to.be.revertedWith("Insufficient USDC liquidity");
  });

  it("Should support multiple vouchers per user", async function () {
    await voucher.connect(minter).mint(user1.address, 100, "game1", 1);
    await voucher.connect(minter).mint(user1.address, 200, "game2", 2);
    expect(await voucher.balanceOf(user1.address, 0)).to.equal(1);
    expect(await voucher.balanceOf(user1.address, 1)).to.equal(1);
  });

  it("Should correctly track gameType per token", async function () {
    await voucher.connect(minter).mint(user1.address, 500, "blackjack", 55);
    expect(await voucher.gameType(0)).to.equal("blackjack");
  });

  it("Should store mintedTimestamp correctly", async function () {
    const tx = await voucher.connect(minter).mint(user1.address, 100, "test", 1);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    expect(await voucher.mintedTimestamp(0)).to.be.closeTo(block.timestamp, 5);
  });

  it("Should revert if trying to redeem non-existent token", async function () {
    await expect(voucher.connect(user1).redeem(999)).to.be.reverted;
  });

  it("Should allow admin to update URI", async function () {
    await expect(voucher.connect(owner).setURI("https://new-api.example.com/{id}.json")).to.not.be.reverted;
  });

  it("Should support batch transfer (ERC1155 feature)", async function () {
    await voucher.connect(minter).mint(user1.address, 100, "test", 1);
    await voucher.connect(minter).mint(user1.address, 200, "test", 2);
    await expect(voucher.connect(user1).safeBatchTransferFrom(user1.address, user2.address, [0, 1], [1, 1], "0x"))
      .to.not.be.reverted;
  });

  // Claude: Add more fuzz/property tests if using hardhat-fuzz or foundry
});