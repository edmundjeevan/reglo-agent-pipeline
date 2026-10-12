// Stand-in for REGLO's real backend (reglo.uk) for today's demo.
// Shape matches REGLO's actual output (per-site GHI, clear-sky index Kt,
// and a LOW/MEDIUM/CRITICAL curtailment-risk classification) so swapping
// this module for a real `fetch('https://reglo.uk/api/...')` call later
// is a drop-in change, not a redesign.
//
// Also emits a simple retail tariff (pence/kWh), standing in for the
// Octopus Agile-style feed discussed as the second, independent
// corroborating signal (so payout isn't gameable on REGLO's data alone).

const SITES = [
  { siteId: "aura-rayleigh", name: "Rayleigh" },
  { siteId: "aura-kemble", name: "Kemble" },
  { siteId: "aura-burtree-lane", name: "Burtree Lane" },
  { siteId: "aura-grimsby", name: "Grimsby" },
];

const RISK_LEVELS = ["LOW", "MEDIUM", "CRITICAL"];

// Deterministic-ish pseudo-random so a demo run is reproducible if needed,
// but still varies site-to-site and hour-to-hour.
function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * @param {number} hourOfDay 0-23
 * @returns {Array<{siteId, name, ghi, kt, curtailmentRisk, tariffPencePerKwh}>}
 */
function getConditions(hourOfDay) {
  return SITES.map((site, i) => {
    const seed = hourOfDay * 17 + i * 31;
    const r = pseudoRandom(seed);

    // Midday (10-15) biased toward high GHI/curtailment risk, matching
    // REGLO's real "belly" (midday overgeneration) pattern.
    const middayBoost = hourOfDay >= 10 && hourOfDay <= 15 ? 0.4 : 0;
    const kt = Math.min(0.95, Math.max(0.05, r * 0.6 + middayBoost));
    const ghi = Math.round(kt * 850); // W/m^2, rough scale

    let curtailmentRisk;
    if (kt > 0.7) curtailmentRisk = "CRITICAL";
    else if (kt > 0.45) curtailmentRisk = "MEDIUM";
    else curtailmentRisk = "LOW";

    // Tariff roughly anti-correlates with curtailment risk: when there's
    // too much solar for the grid to use, retail price tends to be cheap.
    const basePence = 28; // ~UK standard variable rate, pence/kWh
    const tariffPencePerKwh = Math.max(2, Math.round(basePence * (1 - kt * 0.85)));

    return {
      siteId: site.siteId,
      name: site.name,
      hourOfDay,
      ghi,
      kt: Number(kt.toFixed(2)),
      curtailmentRisk,
      tariffPencePerKwh,
    };
  });
}

module.exports = { getConditions, SITES, RISK_LEVELS };
