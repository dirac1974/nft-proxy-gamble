import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Polygon USDC on Amoy (test) or mainnet - update accordingly
  const USDC_ADDRESS = "0x41E94Eb019C0762f9Bfc9d3a7a3e2a3c5c5c5c5c"; // TODO: Replace with real Amoy USDC or mock

  const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
  const voucher = await Voucher.deploy(USDC_ADDRESS);
  await voucher.deployed();

  console.log("NFTProxyVoucher deployed to:", voucher.address);
  console.log("Grant MINTER_ROLE to backend wallet in .env");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});