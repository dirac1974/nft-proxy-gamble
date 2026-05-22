import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";

import * as dotenv from "dotenv";
dotenv.config();

// Only attach the deployer key to live networks if it looks like a real 32-byte hex key.
// Placeholder values (e.g. PLACEHOLDER_FILL_ME_IN) or blanks would otherwise crash
// hardhat at config-load time, blocking `compile` / `test` for anyone who hasn't filled in .env.
const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim();
const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;
const accounts =
  PRIVATE_KEY && HEX_KEY.test(PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`)
    ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`]
    : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OZ v5 utils/Arrays.sol uses `mcopy` (Cancun). Polygon PoS supports Cancun.
      evmVersion: "cancun",
    },
  },
  paths: {
    sources: "./src",
  },
  networks: {
    hardhat: {},
    amoy: {
      url: process.env.POLYGON_AMOY_RPC || "https://rpc-amoy.polygon.technology",
      accounts,
    },
    polygon: {
      url: process.env.POLYGON_RPC || "https://polygon-rpc.com",
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: process.env.GAS_REPORT_FILE || undefined,
  },
};

export default config;
