// The "oracle" the contract trusts (RegloAgentEscrow.mandate.oracle).
// Today this is a local signer reading the mocked REGLO feed. Tomorrow,
// this logic lives in REGLO's own backend, signing with a key REGLO
// controls, after actually calling reglo.uk's API instead of reglo-mock.js.
//
// Deliberate simplification flagged here and in the README: a single
// trusted oracle key is a real, production-used pattern (most price
// oracles work this way), but it is a single point of trust. A hardened
// version would use multiple independent attestors or a published data
// feed the contract checks directly.

const { ethers } = require("ethers");
const { getConditions } = require("./reglo-mock");

// Placeholder conversion rate: 1 pence of compute cost == 1e14 wei of
// "savings" for this demo, so numbers are sensible against small testnet
// MON balances. A real version replaces this with an actual pence<->MON
// (or pence<->stablecoin) price feed -- it is NOT a claim that 1p == a
// specific MON amount.
const PENCE_TO_WEI = 10n ** 14n;

/**
 * Decide whether deferring a job to `chosenHour` at `siteId`, versus
 * running it immediately at `requestHour`, produced a real saving --
 * and sign an attestation of that result.
 *
 * @param {ethers.Wallet} oracleWallet
 * @param {object} params { jobId, user, agent, siteId, requestHour, chosenHour, jobEnergyKwh }
 */
async function attestJobResult(oracleWallet, params) {
  const { jobId, user, agent, siteId, requestHour, chosenHour, jobEnergyKwh } = params;

  const atRequest = getConditions(requestHour).find((c) => c.siteId === siteId);
  const atExecution = getConditions(chosenHour).find((c) => c.siteId === siteId);

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

module.exports = { attestJobResult, PENCE_TO_WEI };
