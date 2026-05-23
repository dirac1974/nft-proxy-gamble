import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Polygon Amoy testnet USDC (Circle, native USDC, 6 decimals).
 * Verify against https://developers.circle.com/stablecoins/usdc-on-test-networks before each run.
 */
const USDC_BY_NETWORK: Record<string, string> = {
  amoy: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon mainnet native USDC
};

async function main() {
  const net = network.name;
  console.log(`Network:        ${net}`);

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      `No deployer signer configured for network "${net}".\n` +
        `  Check contracts/.env:\n` +
        `    PRIVATE_KEY must be a 64-character hex string, with or without a 0x prefix.\n` +
        `    No quotes, no surrounding whitespace, no trailing newline.\n` +
        `  The hardhat config silently ignores malformed keys so that 'npm test' still works\n` +
        `  for contributors who don't deploy. If your key is correct, double-check the file\n` +
        `  was saved and that you're not running with stale env.`
    );
  }
  const deployer = signers[0];
  console.log(`Deployer:       ${deployer.address}`);

  const envUsdc = process.env.USDC_ADDRESS;
  const fallback = USDC_BY_NETWORK[net];
  const usdcAddress = envUsdc || fallback;

  if (!usdcAddress || usdcAddress === ethers.ZeroAddress) {
    throw new Error(
      `No USDC address available for network "${net}". Set USDC_ADDRESS in .env or extend USDC_BY_NETWORK.`
    );
  }
  if (!ethers.isAddress(usdcAddress)) {
    throw new Error(`USDC_ADDRESS is not a valid address: ${usdcAddress}`);
  }

  console.log(`USDC token:     ${usdcAddress}${envUsdc ? " (from .env)" : " (from script default)"}`);

  if (net === "polygon") {
    console.log("\nMAINNET DEPLOY — confirm by setting CONFIRM_MAINNET=YES in the env.");
    if (process.env.CONFIRM_MAINNET !== "YES") {
      throw new Error("Mainnet deploy requires CONFIRM_MAINNET=YES env var.");
    }
  }

  const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
  const voucher = await Voucher.deploy(usdcAddress);
  await voucher.waitForDeployment();
  const voucherAddr = await voucher.getAddress();

  console.log(`\nNFTProxyVoucher deployed to: ${voucherAddr}`);

  // Persist deployment metadata for downstream tooling and the README updater.
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const out = {
    network: net,
    address: voucherAddr,
    usdc: usdcAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    txHash: voucher.deploymentTransaction()?.hash,
  };
  const outFile = path.join(deploymentsDir, `${net}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Deployment metadata written to: ${outFile}`);

  console.log("\nNext steps:");
  console.log(`  1. Verify on explorer:`);
  console.log(`     npx hardhat verify --network ${net} ${voucherAddr} ${usdcAddress}`);
  console.log(`  2. Grant MINTER_ROLE to the backend hot wallet:`);
  console.log(`     scripts/grant-minter.ts (TODO Phase 2)`);
  console.log(`  3. Fund the contract with USDC liquidity before opening redemptions.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
