require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * Network notes (confirmed from docs.monad.xyz/developer-essentials/testnet,
 * current as of Oct 2026 — re-check before relying on this during judging,
 * testnets get reset):
 *
 *   Chain ID: 10143
 *   Public RPC: https://testnet-rpc.monad.xyz  (or rpc.ankr.com/monad_testnet)
 *   Faucet: https://faucet.monad.xyz
 *   Explorer: https://testnet.monadscan.com
 *
 * Put your deployer private key in a .env file (never commit it):
 *   PRIVATE_KEY=0xyourtestnetonlykey
 *   MONAD_TESTNET_RPC=https://testnet-rpc.monad.xyz
 */

const MONAD_TESTNET_RPC = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x".padEnd(66, "1"); // dummy, local-only default

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    monadTestnet: {
      url: MONAD_TESTNET_RPC,
      chainId: 10143,
      accounts: [PRIVATE_KEY],
    },
  },
};
