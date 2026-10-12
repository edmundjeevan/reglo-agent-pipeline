// Real-data counterpart to agent/oracle.js's attestJobResult. Identical
// logic and signature -- same message hash, same oracle-signing pattern --
// the ONLY difference is where baseline/actual cost come from: here it's
// agent/reglo-live.js's real REGLO backend call (with mock fallback),
// instead of the static agent/reglo-mock.js import.
//
// Why this exists as its own file instead of editing oracle.js: the
// decision (agent/decide-live.js) and the verification (this file) must
// use the SAME data source for the same hour/site, or the oracle could
// sign an attestation that doesn't match what the agent actually saw when
// it chose the window. Duplicating the ~15 lines here keeps that
// consistency obvious at a glance, and leaves oracle.js -- and the test
// suite built on it -- untouched.
const { ethers } = require("ethers");
const { fetchConditions } = require("./reglo-live");

const PENCE_TO_WEI = 10n ** 14n; // same placeholder conversion as oracle.js

async function attestJobResultLive(oracleWallet, params) {
  const { jobId, user, agent, siteId, requestHour, chosenHour, jobEnergyKwh } = params;

  const [atRequestAll, atExecutionAll] = await Promise.all([
    fetchConditions(requestHour),
    fetchConditions(chosenHour),
  ]);
  const atRequest = atRequestAll.find((c) => c.siteId === siteId);
  const atExecution = atExecutionAll.find((c) => c.siteId === siteId);

  const baselinePence = atRequest.tariffPencePerKwh * jobEnergyKwh;
  const actualPence = atExecution.tariffPencePerKwh * jobEnergyKwh;

  const baselineCost = BigInt(baselinePence) * PENCE_TO_WEI;
  const actualCost = BigInt(actualPence) * PENCE_TO_WEI;
  const timestamp = Math.floor(Date.now() / 1000);

  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
    [jobId, user, agent, baselineCost, actualCost, timestamp]
  );

  const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));

  return {
    jobId,
    baselineCost,
    actualCost,
    timestamp,
    signature,
    detail: { atRequest, atExecution },
  };
}

module.exports = { attestJobResultLive, PENCE_TO_WEI };
