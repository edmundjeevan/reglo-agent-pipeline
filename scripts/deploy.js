// Deploy RegloAgentEscrow and, optionally, fund a mandate in the same run.
//
// Local (Hardhat in-memory network):
//   npx hardhat run scripts/deploy.js --no-compile
//
// Monad testnet (needs PRIVATE_KEY + funded testnet MON from
// https://faucet.monad.xyz in your .env):
//   npx hardhat run scripts/deploy.js --no-compile --network monadTestnet
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH/MON");

  const Escrow = await ethers.getContractFactory("RegloAgentEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();

  console.log("RegloAgentEscrow deployed to:", await escrow.getAddress());
  console.log("\nNext step (example): fund a mandate from the deployer account:");
  console.log(
    "  await escrow.fundAndSetMandate(agentAddress, oracleAddress, 2000, ethers.parseEther('0.5'), ethers.parseEther('0.001'), { value: ethers.parseEther('1') })"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
