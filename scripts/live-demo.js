// The full pipeline, but with REAL data at both ends that matter:
//   - agent/decide-live.js + agent/reglo-live.js: the agent reasons over
//     candidate windows built from Edmund's actual REGLO backend (real
//     Aura Power sites, real curtailment-detection math), not synthetic
//     data -- same LLM reasoning step as llm-agent-demo.js.
//   - agent/oracle-live.js: the on-chain payout is verified against that
//     SAME real backend call, independently of what the LLM said, so the
//     "trust math, not wording" property from llm-agent-demo.js still
//     holds with live data underneath it.
//
// Before running this: start the real REGLO backend in another terminal --
//   cd reglo_backend && uvicorn app.main:app --port 8000
// If it's not running (or REGLO_API_URL is wrong), agent/reglo-live.js
// falls back to the synthetic mock feed and says so -- this script will
// still complete, just without real REGLO data behind it.
//
// Usage:
//   ESCROW_ADDRESS=0x... npx hardhat run scripts/live-demo.js --no-compile --network monadTestnet
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { attestJobResultLive } = require("../agent/oracle-live");
const { listCandidatesLive, chooseBestWindowLive } = require("../agent/decide-live");
const { reasonAboutWindows } = require("../agent/reason");
const { fetchConditions, REGLO_API_URL } = require("../agent/reglo-live");

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

  console.log(`REGLO_API_URL: ${REGLO_API_URL}`);

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

  // --- real-data agent step ---
  console.log(`\nFetching candidate windows from REGLO (real backend, fallback-safe)...`);
  const candidates = await listCandidatesLive(requestHour, 6);
  console.log(`Asking the agent to reason over ${candidates.length} real candidate windows...`);
  const { chosen, rationale, usedLLM } = await reasonAboutWindows(candidates);
  console.log(`Decision source: ${usedLLM ? "LLM (Ollama)" : "deterministic fallback"}`);
  console.log(`Chosen: ${chosen.name} at hour ${chosen.hour} (${chosen.curtailmentRisk}, ${chosen.tariffPencePerKwh}p/kWh)`);
  console.log(`Rationale: ${rationale}`);

  // Transparency check (same purpose as llm-agent-demo.js): how does the
  // LLM's pick compare to the real deterministic optimum over the same
  // real candidate list? Fetched once and reused for both calcs so this
  // doesn't double-hit the backend.
  const optimal = await chooseBestWindowLive(requestHour, 6);
  const atRequestConditions = await fetchConditions(requestHour);
  const savingPence = (candidate) => {
    const atRequest = atRequestConditions.find((c) => c.siteId === candidate.siteId);
    return (atRequest.tariffPencePerKwh - candidate.tariffPencePerKwh) * 10;
  };
  const llmSavingPence = savingPence(chosen);
  const optimalSavingPence = savingPence(optimal);
  if (chosen.siteId === optimal.siteId && chosen.hour === optimal.hour) {
    console.log(`Transparency check: this IS the deterministic optimum (${optimalSavingPence}p saved on 10kWh).`);
  } else {
    console.log(
      `Transparency check: deterministic optimum was ${optimal.name} at hour ${optimal.hour} ` +
        `(${optimal.tariffPencePerKwh}p/kWh, would save ${optimalSavingPence}p on 10kWh). ` +
        `LLM's pick saves ${llmSavingPence}p -- ${optimalSavingPence - llmSavingPence}p left on the table.`
    );
  }

  // --- real-data verification step ---
  const jobId = ethers.id(`job-${Date.now()}`);
  const attestation = await attestJobResultLive(oracle, {
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
    console.log("No saving in this scenario (per the real backend's numbers) -- nothing to claim this run.");
    return;
  }
  console.log(`\nVerified saving (REGLO's real curtailment data, independent of the LLM's wording): ${ethers.formatEther(savings)} MON-equivalent`);

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
