// Async, real-data counterparts to agent/decide.js's chooseBestWindow /
// listCandidates. Same selection logic (lowest tariffPencePerKwh wins),
// just sourced from agent/reglo-live.js (real REGLO backend, with mock
// fallback) instead of the synchronous synthetic feed.
//
// Kept as separate functions rather than editing decide.js in place, so
// the original sync versions -- and the test suite that imports them --
// are completely untouched.
const { fetchConditions } = require("./reglo-live");

async function listCandidatesLive(requestHour, maxDeferHours = 6) {
  const candidates = [];
  for (let delta = 0; delta <= maxDeferHours; delta++) {
    const hour = (requestHour + delta) % 24;
    const conditions = await fetchConditions(hour);
    for (const c of conditions) {
      candidates.push({ ...c, hour, deferredBy: delta });
    }
  }
  return candidates;
}

async function chooseBestWindowLive(requestHour, maxDeferHours = 6) {
  let best = null;
  for (const c of await listCandidatesLive(requestHour, maxDeferHours)) {
    if (!best || c.tariffPencePerKwh < best.tariffPencePerKwh) {
      best = c;
    }
  }
  return best;
}

module.exports = { listCandidatesLive, chooseBestWindowLive };
