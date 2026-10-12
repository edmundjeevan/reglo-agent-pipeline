// Real REGLO integration: calls Edmund's actual REGLO backend (the FastAPI
// app in reglo_backend/, same code/data as reglo.uk -- real Aura Power site
// capacities, real curtailment-detection math) over HTTP, instead of the
// synthetic agent/reglo-mock.js feed.
//
// Honesty note, so this isn't oversold: REGLO's real product tracks solar
// curtailment risk and generation forecasts -- it has never tracked retail
// electricity tariffs (that's not what the business does). So the per-kWh
// tariff number below is still a DERIVED, DOCUMENTED ASSUMPTION (same
// formula reglo-mock.js already used: tariff falls as curtailment risk
// rises, modelling "too much solar for the grid to use -> cheap power").
// What's real now is the curtailment/Kt/generation signal driving that
// formula, not a claim that REGLO hands us a live tariff feed.
//
// Resilience: if the backend isn't running (Edmund forgot to start
// `uvicorn app.main:app --port 8000`, or it's unreachable for any reason),
// this falls back to agent/reglo-mock.js and says so -- same pattern as
// agent/reason.js's Ollama fallback. A live demo should never hard-fail
// just because a side process isn't up.

const { getConditions: getMockConditions, SITES: MOCK_SITES } = require("./reglo-mock");

const REGLO_API_URL = process.env.REGLO_API_URL || "http://localhost:8000";
const TIMEOUT_MS = Number(process.env.REGLO_API_TIMEOUT_MS || 5000);

// Real backend's curtailment_risk is LOW | MED | HIGH (see
// reglo_backend/app/routers/solar_sites.py). The rest of this pipeline
// (agent/decide.js, agent/reason.js's LLM prompt, console output) was built
// around REGLO's original three-level naming, LOW | MEDIUM | CRITICAL --
// mapped here so nothing downstream needs to change.
const RISK_MAP = { LOW: "LOW", MED: "MEDIUM", HIGH: "CRITICAL" };

const BASE_PENCE = 28; // same assumed UK standard variable rate as reglo-mock.js

// Second bug found while debugging a "no saving, every hour" live run:
// this used to compute tariff from the forecast's `kt` field. In the real
// backend (reglo_backend/app/routers/solar_sites.py), that field is the
// ZONE-WIDE clear-sky index -- the same number repeated for every hour and
// every site in a given forecast, not something that varies through the
// day. Deriving tariff from it meant the tariff barely moved hour to hour,
// so there was never a real deferral benefit to find, regardless of which
// hour was requested.
//
// The field that actually varies by hour in that same response is
// `curtailment_prob` -- it's literally REGLO's own per-hour estimate of
// how much oversupply there is (peaks at local midday, scaled down outside
// spring, per that router's forecast_site_day()). That's the right signal
// for "tariff falls when there's too much solar for the grid to use" --
// it's what the formula was always trying to approximate, now pointed at
// the field that's actually designed to carry that signal.
function tariffFromCurtailmentProb(curtailmentProb) {
  return Math.max(2, Math.round(BASE_PENCE * (1 - curtailmentProb * 0.85)));
}

async function fetchSiteForecast(siteId) {
  const realSiteId = siteId.replace(/-/g, "_"); // aura-rayleigh -> aura_rayleigh
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${REGLO_API_URL}/api/solar-sites/${realSiteId}/forecast`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`REGLO API returned HTTP ${res.status} for ${realSiteId}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// Whole-run reachability cache. Deliberately checked ONCE per process and
// remembered, rather than re-attempted on every fetchConditions() call.
//
// Why this matters: a script makes several fetchConditions() calls over
// its lifetime (one per candidate hour, then again for the transparency
// check, then again in the oracle verification step). If the backend is
// mid-startup (seeding its DB, spinning up the scheduler thread) when a
// script begins, it can go from unreachable to reachable *during* that
// one run -- which would mean the agent's decision gets made against mock
// data while the oracle verifies against real data moments later. Two
// different numeric worlds in one run produces nonsense results (a
// "transparency check" comparing apples to oranges, or a real saving that
// silently evaporates). Caching the health check once forces one run to be
// either "mock throughout" or "real-attempted throughout" -- consistent,
// even if that means missing a backend that only became ready partway
// through. Start the backend and confirm it's responding (see the curl
// command below) *before* running a script, not concurrently with it.
let backendReachablePromise = null;

function checkBackendReachable() {
  if (!backendReachablePromise) {
    backendReachablePromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${REGLO_API_URL}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`health check returned HTTP ${res.status}`);
        console.log(`[agent/reglo-live.js] REGLO backend is up at ${REGLO_API_URL} -- using real data for this run.`);
        return true;
      } catch (err) {
        clearTimeout(timeout);
        console.log(
          `[agent/reglo-live.js] REGLO backend unreachable at ${REGLO_API_URL} (${err.message}) -- ` +
            `using agent/reglo-mock.js synthetic fallback for this ENTIRE run (cached, not re-checked per call). ` +
            `Start it with: cd reglo_backend && uvicorn app.main:app --port 8000 -- then confirm with ` +
            `curl ${REGLO_API_URL}/api/health before re-running.`
        );
        return false;
      }
    })();
  }
  return backendReachablePromise;
}

/**
 * Real-data equivalent of reglo-mock.js's getConditions(hourOfDay).
 * Same output shape: [{siteId, name, hourOfDay, ghi, kt, curtailmentRisk, tariffPencePerKwh}]
 * Falls back to the mock feed on any failure -- see checkBackendReachable()
 * above for why that fallback decision is cached for the whole run.
 */
async function fetchConditions(hourOfDay) {
  const reachable = await checkBackendReachable();
  if (!reachable) return getMockConditions(hourOfDay);

  try {
    const forecasts = await Promise.all(MOCK_SITES.map((s) => fetchSiteForecast(s.siteId)));
    return MOCK_SITES.map((site, i) => {
      const forecast = forecasts[i];
      const hour = forecast.hours.find((h) => h.hour_utc === hourOfDay);
      if (!hour) throw new Error(`No hour_utc=${hourOfDay} in forecast for ${site.siteId}`);
      return {
        siteId: site.siteId,
        name: site.name,
        hourOfDay,
        ghi: hour.ghi_wm2,
        kt: hour.kt,
        curtailmentRisk: RISK_MAP[hour.curtailment_risk] || "LOW",
        tariffPencePerKwh: tariffFromCurtailmentProb(hour.curtailment_prob),
      };
    });
  } catch (err) {
    // The backend passed its health check but this specific call still
    // failed (e.g. a transient blip). Falls back for just this hour --
    // the whole-run cache above already confirmed the backend is
    // generally up, so this is logged distinctly rather than re-flipping
    // that cache.
    console.log(
      `[agent/reglo-live.js] forecast fetch failed for hour=${hourOfDay} (${err.message}) -- using mock for this hour only.`
    );
    return getMockConditions(hourOfDay);
  }
}

module.exports = { fetchConditions, REGLO_API_URL, RISK_MAP, tariffFromCurtailmentProb };
