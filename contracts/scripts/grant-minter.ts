import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const net = network.name;
  console.log(`Network: ${net}`);

  let contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    const deploymentFile = path.join(__dirname, "..", "deployments", `${net}.json`);
    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
      contractAddress = deployment.address;
      console.log(`Loaded contract address from deployments/${net}.json: ${contractAddress}`);
    } else {
      throw new Error(
        `Set CONTRACT_ADDRESS env var or run scripts/deploy.ts first to create deployments/${net}.json`
      );
    }
  }

  const minterAddress = process.env.MINTER_ADDRESS;
  if (!minterAddress || !ethers.isAddress(minterAddress)) {
    throw new Error(
      "Set MINTER_ADDRESS env var to the backend hot wallet address that should be granted MINTER_ROLE"
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error(
      `No signer for network "${net}". Ensure PRIVATE_KEY is set in contracts/.env to the deployer who holds DEFAULT_ADMIN_ROLE.`
    );
  }
  console.log(`Admin signer:    ${signer.address}`);
  console.log(`Contract:        ${contractAddress}`);
  console.log(`Minter to grant: ${minterAddress}`);

  const voucher = await ethers.getContractAt("NFTProxyVoucher", contractAddress!, signer);
  const MINTER_ROLE = await voucher.MINTER_ROLE();

  const alreadyHas = await voucher.hasRole(MINTER_ROLE, minterAddress);
  if (alreadyHas) {
    console.log(`\n${minterAddress} already has MINTER_ROLE — nothing to do.`);
    return;
  }

  console.log(`\nSending grantRole tx...`);
  const tx = await voucher.grantRole(MINTER_ROLE, minterAddress);
  console.log(`Tx hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt?.blockNumber}`);

  const confirmed = await voucher.hasRole(MINTER_ROLE, minterAddress);
  if (!confirmed) {
    throw new Error("grantRole tx confirmed but hasRole still false — investigate");
  }
  console.log(`\n${minterAddress} now holds MINTER_ROLE on ${contractAddress}.`);
  console.log(`Next: set CONTRACT_ADDRESS=${contractAddress} in backend/.env and restart the backend.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
