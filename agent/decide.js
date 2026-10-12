// The agent's decision logic: given a request hour, look across REGLO's
// sites and the next few hours, and pick the site/hour with the lowest
// tariff (equivalently, highest curtailment risk) within a deferral
// window the user's mandate allows.
const { getConditions } = require("./reglo-mock");

/**
 * @param {number} requestHour hour the job was requested
 * @param {number} maxDeferHours how many hours the agent is allowed to wait
 * @returns {{siteId, name, hour, tariffPencePerKwh, curtailmentRisk}}
 */
function chooseBestWindow(requestHour, maxDeferHours = 6) {
  let best = null;
  for (const c of listCandidates(requestHour, maxDeferHours)) {
    if (!best || c.tariffPencePerKwh < best.tariffPencePerKwh) {
      best = c;
    }
  }
  return best;
}

/**
 * Every candidate (site, hour) option within the deferral window --
 * the full list agent/reason.js's LLM call picks from, rather than the
 * single cheapest one chooseBestWindow collapses straight to.
 */
function listCandidates(requestHour, maxDeferHours = 6) {
  const candidates = [];
  for (let delta = 0; delta <= maxDeferHours; delta++) {
    const hour = (requestHour + delta) % 24;
    for (const c of getConditions(hour)) {
      candidates.push({ ...c, hour, deferredBy: delta });
    }
  }
  return candidates;
}

module.exports = { chooseBestWindow, listCandidates };
