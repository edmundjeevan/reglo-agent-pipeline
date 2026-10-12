// Runs the FULL pipeline live on whichever network Hardhat is pointed at
// (use --network monadTestnet). Does five real things, in order:
//
//   1. Generates (or reuses) two throwaway wallets: "agent" and "oracle".
//      Their keys are saved to .demo-wallets.json (gitignored) so re-running
//      this script doesn't generate new ones every time.
//   2. Sends the agent wallet a little MON so it can pay gas for its own
//      submitJobResult transaction later.
//   3. Calls fundAndSetMandate on the deployed escrow (your funded account
//      is "user"), depositing DEPOSIT_MON and wiring up agent/oracle.
//   4. Runs the real decision + oracle-attestation logic from agent/decide.js
//      and agent/oracle.js (same code the test suite uses).
//   5. Sends submitJobResult from the agent wallet and prints the payout.
//
// Usage:
//   ESCROW_ADDRESS=0x... npx hardhat run scripts/testnet-demo.js --no-compile --network monadTestnet
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { attestJobResult } = require("../agent/oracle");
const { chooseBestWindow } = require("../agent/decide");

const WALLETS_FILE = path.join(__dirname, "..", ".demo-wallets.json");
const DEPOSIT_MON = "1.0";
const AGENT_GAS_TOPUP_MON = "0.05";
const AGENT_SHARE_BPS = 2000; // 20%
const MAX_PER_CLAIM_MON = "0.5";
const ADVISORY_FEE_MON = "0.001";

function loadOrCreateWallets(provider) {
  if (fs.existsSync(WALLETS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
    return {
      agent: new ethers.Wallet(saved.agent.privateKey, provider),
      oracle: new ethers.Wallet(saved.oracle.privateKey, provider),
    };
  }
  const agent = ethers.Wallet.createRandom();
  const oracle = ethers.Wallet.createRandom();
  fs.writeFileSync(
    WALLETS_FILE,
    JSON.stringify(
      {
        agent: { address: agent.address, privateKey: agent.privateKey },
        oracle: { address: oracle.address, privateKey: oracle.privateKey },
      },
      null,
      2
    )
  );
  console.log("Generated new demo wallets, saved to .demo-wallets.json");
  return {
    agent: agent.connect(provider),
    oracle: oracle.connect(provider),
  };
}

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS;
  if (!escrowAddress) {
    throw new Error("Set ESCROW_ADDRESS to the address printed by npm run deploy:testnet");
  }

  const [user] = await ethers.getSigners();
  const { agent, oracle } = loadOrCreateWallets(ethers.provider);

  console.log("User (you):   ", user.address);
  console.log("Agent wallet: ", agent.address);
  console.log("Oracle wallet:", oracle.address, "(signs attestations off-chain, never sends a tx)");

  const escrow = await ethers.getContractAt("RegloAgentEscrow", escrowAddress, user);

  // Step 1: make sure the agent wallet can afford its own gas later.
  const agentBalance = await ethers.provider.getBalance(agent.address);
  if (agentBalance < ethers.parseEther("0.01")) {
    console.log(`Sending agent wallet ${AGENT_GAS_TOPUP_MON} MON for gas...`);
    const tx = await user.sendTransaction({
      to: agent.address,
      value: ethers.parseEther(AGENT_GAS_TOPUP_MON),
    });
    await tx.wait();
  }

  // Step 2: fund the mandate, if this user doesn't already have one.
  const existing = await escrow.mandates(user.address);
  if (existing.agent === ethers.ZeroAddress) {
    console.log(`Funding mandate with ${DEPOSIT_MON} MON...`);
    const tx = await escrow.fundAndSetMandate(
      agent.address,
      oracle.address,
      AGENT_SHARE_BPS,
      ethers.parseEther(MAX_PER_CLAIM_MON),
      ethers.parseEther(ADVISORY_FEE_MON),
      { value: ethers.parseEther(DEPOSIT_MON) }
    );
    const receipt = await tx.wait();
    console.log("Mandate funded. Tx:", receipt.hash);
  } else {
    console.log("Mandate already exists for this user, reusing it.");
  }

  // Step 3: the agent decides when/where, using the same logic the tests use.
  const requestHour = process.env.REQUEST_HOUR ? parseInt(process.env.REQUEST_HOUR, 10) : 8;
  const chosen = chooseBestWindow(requestHour, 6);
  console.log(
    `Agent's decision: defer to ${chosen.name} at hour ${chosen.hour} ` +
      `(curtailment risk ${chosen.curtailmentRisk}, tariff ${chosen.tariffPencePerKwh}p/kWh)`
  );

  const jobId = ethers.id(`job-${Date.now()}`);
  const attestation = await attestJobResult(oracle, {
    jobId,
    user: user.address,
    agent: agent.address,
    siteId: chosen.siteId,
    requestHour,
    chosenHour: chosen.hour,
    jobEnergyKwh: 10,
  });

  const savings = attestation.baselineCost - attestation.actualCost;
  if (savings <= 0n) {
    console.log("No saving in this scenario (request hour already cheapest) -- nothing to claim this run.");
    return;
  }
  console.log(`Verified saving: ${ethers.formatEther(savings)} (demo-scaled) MON-equivalent`);

  // Step 4: agent claims its share on-chain.
  const escrowAsAgent = escrow.connect(agent);
  const tx = await escrowAsAgent.submitJobResult(
    user.address,
    attestation.jobId,
    attestation.baselineCost,
    attestation.actualCost,
    attestation.timestamp,
    attestation.signature
  );
  const receipt = await tx.wait();
  console.log("Payout claimed. Tx:", receipt.hash);
  console.log("Check it on https://testnet.monadscan.com/tx/" + receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
