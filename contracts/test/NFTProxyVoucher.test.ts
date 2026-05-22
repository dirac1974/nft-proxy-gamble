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

  const COIN_AMOUNT = 1250; // e.g. 12.50 USDC

  beforeEach(async function () {
    [owner, minter, user1, user2] = await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockERC20");
    usdc = await MockUSDC.deploy("USD Coin", "USDC", 6); // 6 decimals like real USDC
    await usdc.deployed();

    // Deploy voucher
    const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
    voucher = await Voucher.deploy(usdc.address);
    await voucher.deployed();

    // Fund contract with USDC for redemptions
    await usdc.mint(voucher.address, ethers.utils.parseUnits("10000", 6));

    // Grant minter role
    await voucher.grantRole(await voucher.MINTER_ROLE(), minter.address);
  });

  it("Should mint a voucher with correct on-chain balance", async function () {
    await voucher.connect(minter).mint(user1.address, COIN_AMOUNT, "jacks-or-better-9-6", 12345);

    const tokenId = 0; // first
    expect(await voucher.coinBalance(tokenId)).to.equal(COIN_AMOUNT);
    expect(await voucher.balanceOf(user1.address, tokenId)).to.equal(1);
  });

  it("Should redeem correctly and transfer USDC (100 coins = 1 USDC)", async function () {
    await voucher.connect(minter).mint(user1.address, 500, "jacks-or-better-9-6", 1); // 5.00 USDC

    const initialUSDC = await usdc.balanceOf(user1.address);
    await voucher.connect(user1).redeem(0);

    expect(await voucher.balanceOf(user1.address, 0)).to.equal(0);
    expect(await usdc.balanceOf(user1.address)).to.equal(initialUSDC.add(ethers.utils.parseUnits("5", 6)));
  });

  it("Should prevent non-owner from redeeming", async function () {
    await voucher.connect(minter).mint(user1.address, 100, "test", 1);
    await expect(voucher.connect(user2).redeem(0)).to.be.revertedWith("Not owner or already redeemed");
  });

  it("Should prevent double redeem", async function () {
    await voucher.connect(minter).mint(user1.address, 100, "test", 1);
    await voucher.connect(user1).redeem(0);
    await expect(voucher.connect(user1).redeem(0)).to.be.reverted;
  });

  it("Only MINTER can mint", async function () {
    await expect(voucher.connect(user1).mint(user1.address, 100, "test", 1))
      .to.be.revertedWith(/AccessControl/);
  });

  // Add more: pausable, events, large amounts, zero amount, etc.
  // Claude: Expand to 20+ tests covering all edges, fuzzing if possible.
});