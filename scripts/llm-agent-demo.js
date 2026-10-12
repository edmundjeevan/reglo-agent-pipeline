// Same end-to-end flow as testnet-demo.js, but the decision step is made
// by an actual LLM (via agent/reason.js, local Ollama by default) reasoning
// over every candidate window, instead of a plain min()-over-tariff loop.
// The payout math is untouched -- it's still gated by REGLO's real numbers
// via agent/oracle.js, same as before. This script just proves the "AI
// agent" part honestly: there's a model call in the loop, with a visible
// rationale, not just deterministic logic dressed up as one.
//
// Usage:
//   ESCROW_ADDRESS=0x... npx hardhat run scripts/llm-agent-demo.js --no-compile --network monadTestnet
//
// If Ollama isn't running or no model is pulled, this still completes --
// agent/reason.js falls back to the deterministic pick and says so.
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { attestJobResult } = require("../agent/oracle");
const { chooseBestWindow, listCandidates } = require("../agent/decide");
const { reasonAboutWindows } = require("../agent/reason");
const { getConditions } = require("../agent/reglo-mock");

// Display-only helper (not used anywhere near the payout): what a
// candidate would save vs. running immediately, same site, same math
// agent/oracle.js uses for real, just without the wei conversion/signing.
function wouldBeSavingPence(candidate, requestHour, jobEnergyKwh) {
  const atRequest = getConditions(requestHour).find((c) => c.siteId === candidate.siteId);
  return (atRequest.tariffPencePerKwh - candidate.tariffPencePerKwh) * jobEnergyKwh;
}

const WALLETS_FILE = path.join(__dirname, "..", ".demo-wallets.json");
const DEPOSIT_MON = "1.0";
const AGENT_GAS_TOPUP_MON = "0.05";
const AGENT_SHARE_BPS = 2000;
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
  return { agent: agent.connect(provider), oracle: oracle.connect(provider) };
}

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS;
  if (!escrowAddress) {
    throw new Error("Set ESCROW_ADDRESS to the address printed by npm run deploy:testnet");
  }
  const requestHour = process.env.REQUEST_HOUR ? parseInt(process.env.REQUEST_HOUR, 10) : 8;

  const [user] = await ethers.getSigners();
  const { agent, oracle } = loadOrCreateWallets(ethers.provider);

  console.log("User (you):   ", user.address);
  console.log("Agent wallet: ", agent.address);
  console.log("Oracle wallet:", oracle.address);

  const escrow = await ethers.getContractAt("RegloAgentEscrow", escrowAddress, user);

  const agentBalance = await ethers.provider.getBalance(agent.address);
  if (agentBalance < ethers.parseEther("0.01")) {
    console.log(`Sending agent wallet ${AGENT_GAS_TOPUP_MON} MON for gas...`);
    await (await user.sendTransaction({ to: agent.address, value: ethers.parseEther(AGENT_GAS_TOPUP_MON) })).wait();
  }

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
    console.log("Mandate funded. Tx:", (await tx.wait()).hash);
  } else {
    console.log("Mandate already exists for this user, reusing it.");
  }

  // --- the actual "real agent" step ---
  const candidates = listCandidates(requestHour, 6);
  console.log(`\nAsking the agent to reason over ${candidates.length} candidate windows...`);
  const { chosen, rationale, usedLLM } = await reasonAboutWindows(candidates);
  console.log(`Decision source: ${usedLLM ? "LLM (Ollama)" : "deterministic fallback"}`);
  console.log(`Chosen: ${chosen.name} at hour ${chosen.hour} (${chosen.curtailmentRisk}, ${chosen.tariffPencePerKwh}p/kWh)`);
  console.log(`Rationale: ${rationale}`);

  // Transparency check: how does the LLM's pick compare to the actual
  // cheapest option in the same candidate list? The LLM only chooses
  // WHICH option to act on -- this comparison never feeds back into the
  // payout, it's purely so a demo audience (or you) can see whether the
  // model's reasoning matched reality.
  const optimal = chooseBestWindow(requestHour, 6);
  const llmSavingPence = wouldBeSavingPence(chosen, requestHour, 10);
  const optimalSavingPence = wouldBeSavingPence(optimal, requestHour, 10);
  if (chosen.siteId === optimal.siteId && chosen.hour === optimal.hour) {
    console.log(`Transparency check: this IS the deterministic optimum (${optimalSavingPence}p saved on 10kWh).`);
  } else {
    console.log(
      `Transparency check: deterministic optimum was ${optimal.name} at hour ${optimal.hour} ` +
        `(${optimal.tariffPencePerKwh}p/kWh, would save ${optimalSavingPence}p on 10kWh). ` +
        `LLM's pick saves ${llmSavingPence}p -- ${optimalSavingPence - llmSavingPence}p left on the table.`
    );
  }
  // --- end agent step; everything below is identical to testnet-demo.js ---

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
    console.log("No saving in this scenario -- nothing to claim this run.");
    return;
  }
  console.log(`\nVerified saving (from REGLO's numbers, independent of the LLM's wording): ${ethers.formatEther(savings)} MON-equivalent`);

  const tx = await escrow.connect(agent).submitJobResult(
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
