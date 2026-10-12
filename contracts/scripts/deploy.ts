import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * 2026-10 hardened deploy (docs/CONTRACT_HARDENING_2026-10.md).
 *
 * Env var NAMES read (values come from the shell / CI secrets):
 *   ADMIN_SAFE            DEFAULT_ADMIN (Gnosis Safe). Required on public networks; must be a contract
 *                         unless ALLOW_EOA_ADMIN=YES (testnet only).
 *   MINTER_ADDRESS        backend minter (KMS-backed). Optional — zero = grant later via the 24h queue.
 *   PAUSER_ADDRESS        guardian (pause / freeze / quarantine / void / veto). Optional.
 *   DAILY_MINT_CAP_COINS  rolling 24h mint budget in coins. Required on public networks.
 *   USDC_ADDRESS          overrides USDC_BY_NETWORK.
 *   CONFIRM_MAINNET=YES   required for polygon.
 *
 * Admin handover: the Safe is passed as `initialAdmin` to the constructor, so the deployer EOA never
 * holds DEFAULT_ADMIN (a begin/accept handover would leave the deployer as admin for >= 48h). The
 * initial minter/pauser are set atomically in the constructor; every later grant goes through
 * proposeRoleGrant -> 24h -> executeRoleGrant (scripts/grant-minter.ts). The script ends by asserting
 * the deployer holds no role at all.
 */
const USDC_BY_NETWORK: Record<string, string> = {
  amoy: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};
const LOCAL = new Set(["hardhat", "localhost"]);

function optAddress(name: string): string {
  const v = process.env[name];
  if (!v) return ethers.ZeroAddress;
  if (!ethers.isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`);
  return ethers.getAddress(v);
}

async function main() {
  const net = network.name;
  const local = LOCAL.has(net);
  console.log(`Network:        ${net}`);

  if (net === "polygon") {
    console.log("\nMAINNET DEPLOY — confirm by setting CONFIRM_MAINNET=YES in the env.");
    if (process.env.CONFIRM_MAINNET !== "YES") {
      throw new Error("Mainnet deploy requires CONFIRM_MAINNET=YES env var.");
    }
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      `No deployer signer configured for network "${net}". PRIVATE_KEY must be a 64-char hex string.`
    );
  }
  const deployer = signers[0];
  console.log(`Deployer:       ${deployer.address}`);

  let adminSafe = optAddress("ADMIN_SAFE");
  let minter = optAddress("MINTER_ADDRESS");
  let pauser = optAddress("PAUSER_ADDRESS");
  let capCoins = process.env.DAILY_MINT_CAP_COINS ? BigInt(process.env.DAILY_MINT_CAP_COINS) : 0n;
  let usdcAddress: string;

  if (local) {
    // Local dry-run: stand-ins for the Safe / KMS minter / guardian and a mock USDC.
    if (adminSafe === ethers.ZeroAddress) adminSafe = signers[1].address;
    if (minter === ethers.ZeroAddress) minter = signers[2].address;
    if (pauser === ethers.ZeroAddress) pauser = signers[3].address;
    if (capCoins === 0n) capCoins = 500_000n;
    const Mock = await ethers.getContractFactory("MockERC20");
    const mock = await Mock.deploy("USD Coin", "USDC", 6);
    await mock.waitForDeployment();
    usdcAddress = await mock.getAddress();
  } else {
    if (adminSafe === ethers.ZeroAddress) throw new Error("ADMIN_SAFE is required on public networks.");
    if (capCoins === 0n) throw new Error("DAILY_MINT_CAP_COINS is required on public networks.");
    const code = await ethers.provider.getCode(adminSafe);
    if (code === "0x" && process.env.ALLOW_EOA_ADMIN !== "YES") {
      throw new Error(`ADMIN_SAFE ${adminSafe} has no code — expected a Gnosis Safe. (ALLOW_EOA_ADMIN=YES overrides, testnet only.)`);
    }
    if (net === "polygon" && code === "0x") throw new Error("Mainnet admin must be a Safe contract.");
    usdcAddress = process.env.USDC_ADDRESS || USDC_BY_NETWORK[net];
    if (!usdcAddress || !ethers.isAddress(usdcAddress)) {
      throw new Error(`No valid USDC address for "${net}". Set USDC_ADDRESS or extend USDC_BY_NETWORK.`);
    }
  }

  const me = deployer.address;
  for (const [label, a] of [["ADMIN_SAFE", adminSafe], ["MINTER_ADDRESS", minter], ["PAUSER_ADDRESS", pauser]] as const) {
    if (a === me) throw new Error(`${label} must not be the deployer (${me}).`);
  }
  if (minter !== ethers.ZeroAddress && (minter === adminSafe || minter === pauser)) {
    throw new Error("MINTER_ADDRESS must differ from ADMIN_SAFE and PAUSER_ADDRESS (role separation).");
  }

  console.log(`USDC token:     ${usdcAddress}${local ? " (local mock)" : ""}`);
  console.log(`Admin (Safe):   ${adminSafe}`);
  console.log(`Minter:         ${minter}`);
  console.log(`Guardian:       ${pauser}`);
  console.log(`Daily cap:      ${capCoins} coins (${Number(capCoins) / 100} USDC)`);

  const Voucher = await ethers.getContractFactory("NFTProxyVoucher");
  const args = [usdcAddress, adminSafe, capCoins, minter, pauser] as const;
  const voucher = await Voucher.deploy(...args);
  await voucher.waitForDeployment();
  const voucherAddr = await voucher.getAddress();
  console.log(`\nNFTProxyVoucher deployed to: ${voucherAddr}`);

  // ---- Post-deploy assertions: fail loudly. ----
  const roles: Record<string, string> = {
    DEFAULT_ADMIN_ROLE: await voucher.DEFAULT_ADMIN_ROLE(),
    MINTER_ROLE: await voucher.MINTER_ROLE(),
    PAUSER_ROLE: await voucher.PAUSER_ROLE(),
  };
  const held = [];
  for (const [name, role] of Object.entries(roles)) {
    if (await voucher.hasRole(role, me)) held.push(name);
  }
  if (held.length) throw new Error(`ASSERTION FAILED: deployer ${me} still holds ${held.join(", ")}`);
  if ((await voucher.defaultAdmin()) !== adminSafe) throw new Error("ASSERTION FAILED: defaultAdmin != ADMIN_SAFE");
  const [pendingAdmin] = await voucher.pendingDefaultAdmin();
  if (pendingAdmin !== ethers.ZeroAddress) throw new Error(`ASSERTION FAILED: unexpected pending admin ${pendingAdmin}`);
  if ((await voucher.defaultAdminDelay()) < 48n * 3600n) throw new Error("ASSERTION FAILED: admin delay < 48h");
  if ((await voucher.dailyMintCapCoins()) !== capCoins) throw new Error("ASSERTION FAILED: cap mismatch");
  if (minter !== ethers.ZeroAddress && !(await voucher.hasRole(roles.MINTER_ROLE, minter))) {
    throw new Error("ASSERTION FAILED: minter not granted");
  }
  console.log("Assertions OK: deployer holds no roles; admin = Safe; admin delay >= 48h.");

  if (!local) {
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(deploymentsDir, { recursive: true });
    const outFile = path.join(deploymentsDir, `${net}.json`);
    fs.writeFileSync(
      outFile,
      JSON.stringify(
        {
          network: net,
          address: voucherAddr,
          usdc: usdcAddress,
          admin: adminSafe,
          minter,
          guardian: pauser,
          dailyMintCapCoins: capCoins.toString(),
          deployer: me,
          deployedAt: new Date().toISOString(),
          txHash: voucher.deploymentTransaction()?.hash,
          version: "2026-10-hardened",
        },
        null,
        2
      )
    );
    console.log(`Deployment metadata written to: ${outFile}`);
  }

  console.log("\nNext steps:");
  console.log(`  1. Verify: npx hardhat verify --network ${net} ${voucherAddr} ${args.map(String).join(" ")}`);
  console.log(`  2. Fund with USDC: liabilities are tracked on-chain; minting needs free liquidity.`);
  console.log(`  3. Further role grants: scripts/grant-minter.ts (propose -> 24h -> execute, from the Safe).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
