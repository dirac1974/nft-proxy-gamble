import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Timelocked role grant (2026-10 hardening). grantRole(MINTER|PAUSER) now reverts; grants go
 * proposeRoleGrant -> ROLE_GRANT_DELAY (24h) -> executeRoleGrant, both from the same admin (the Safe).
 * Run twice: first run proposes, a run after the ETA executes.
 *
 * Env var NAMES: CONTRACT_ADDRESS (or deployments/<net>.json), MINTER_ADDRESS (grantee),
 *   GRANT_ROLE=MINTER|PAUSER (default MINTER), CONFIRM_MAINNET=YES for polygon.
 *
 * If the signer is not the admin (normal case: admin is a Safe), the script sends nothing and prints
 * the Safe transaction (to/data) to queue in the Safe UI instead.
 */
async function main() {
  const net = network.name;
  console.log(`Network: ${net}`);
  if (net === "polygon" && process.env.CONFIRM_MAINNET !== "YES") {
    throw new Error("Mainnet role grant requires CONFIRM_MAINNET=YES env var.");
  }

  let contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    const deploymentFile = path.join(__dirname, "..", "deployments", `${net}.json`);
    if (!fs.existsSync(deploymentFile)) {
      throw new Error(`Set CONTRACT_ADDRESS or run scripts/deploy.ts first to create deployments/${net}.json`);
    }
    contractAddress = JSON.parse(fs.readFileSync(deploymentFile, "utf8")).address;
  }
  const grantee = process.env.MINTER_ADDRESS;
  if (!grantee || !ethers.isAddress(grantee)) throw new Error("Set MINTER_ADDRESS to the grantee address.");
  const roleName = (process.env.GRANT_ROLE || "MINTER").toUpperCase();
  if (roleName !== "MINTER" && roleName !== "PAUSER") throw new Error("GRANT_ROLE must be MINTER or PAUSER.");

  const [signer] = await ethers.getSigners();
  const voucher = await ethers.getContractAt("NFTProxyVoucher", contractAddress!, signer);
  const role = roleName === "MINTER" ? await voucher.MINTER_ROLE() : await voucher.PAUSER_ROLE();
  const admin = await voucher.defaultAdmin();

  console.log(`Contract: ${contractAddress}`);
  console.log(`Admin:    ${admin}`);
  console.log(`Grant:    ${roleName}_ROLE -> ${grantee}`);

  if (await voucher.hasRole(role, grantee)) {
    console.log("Already granted — nothing to do.");
    return;
  }
  if (roleName === "MINTER" && ethers.getAddress(grantee) === admin) {
    throw new Error("Refusing: the admin can never hold MINTER_ROLE.");
  }

  const [eta, proposer] = await voucher.pendingRoleGrant(role, grantee);
  const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  let fn: "proposeRoleGrant" | "executeRoleGrant";
  if (eta === 0n) {
    fn = "proposeRoleGrant";
  } else if (now < eta) {
    console.log(`Pending, proposed by ${proposer}; executable at ${new Date(Number(eta) * 1000).toISOString()} (in ${eta - now}s).`);
    return;
  } else {
    fn = "executeRoleGrant";
  }

  const data = fn === "proposeRoleGrant"
    ? voucher.interface.encodeFunctionData("proposeRoleGrant", [role, grantee])
    : voucher.interface.encodeFunctionData("executeRoleGrant", [role, grantee]);
  if (signer?.address !== admin) {
    console.log(`\nSigner is not the admin. Queue this in the Safe (${admin}):`);
    console.log(`  to:    ${contractAddress}`);
    console.log(`  value: 0`);
    console.log(`  data:  ${data}   (${fn})`);
    return;
  }

  console.log(`\nSending ${fn}...`);
  const tx = fn === "proposeRoleGrant"
    ? await voucher.proposeRoleGrant(role, grantee)
    : await voucher.executeRoleGrant(role, grantee);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt?.blockNumber} (${tx.hash})`);
  if (fn === "executeRoleGrant") {
    if (!(await voucher.hasRole(role, grantee))) throw new Error("executeRoleGrant confirmed but hasRole is false");
    console.log(`${grantee} now holds ${roleName}_ROLE.`);
  } else {
    const [newEta] = await voucher.pendingRoleGrant(role, grantee);
    console.log(`Proposed. Re-run after ${new Date(Number(newEta) * 1000).toISOString()} to execute. Guardian/admin can cancelRoleGrant meanwhile.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
