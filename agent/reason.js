// The "real agent" layer: an LLM reasons over REGLO's candidate
// site/hour windows and picks one, with a one-sentence rationale.
//
// Deliberately kept separate from the trust-critical path: this module
// only influences WHICH candidate gets chosen. The actual baselineCost /
// actualCost numbers that gate the on-chain payout still come straight
// from agent/reglo-mock.js (or agent/reglo-live.js) via the oracle step,
// untouched by anything the LLM says. If the LLM is unreachable,
// mis-configured, or returns garbage, this falls back to the
// deterministic cheapest-tariff pick (same one decide.js always used)
// rather than failing the demo.
//
// Three interchangeable reasoning backends, picked via REASONING_PROVIDER:
//   - "ollama" (default): local Ollama install, no API key, no internet
//     dependency during a live demo -- http://localhost:11434, the
//     standard Ollama REST endpoint. Override with OLLAMA_HOST /
//     OLLAMA_MODEL env vars. Check what you've got pulled with
//     `ollama list`; `ollama pull llama3.2` if nothing's pulled.
//   - "kimi": Moonshot AI's Kimi, via its OpenAI-compatible
//     https://api.moonshot.ai/v1/chat/completions endpoint.
//     Requires KIMI_API_KEY (get one at platform.moonshot.ai). Model
//     defaults to KIMI_MODEL or "kimi-k3".
//   - "qwen": Alibaba Cloud's Qwen3, via DashScope's international
//     OpenAI-compatible endpoint
//     https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions.
//     Requires DASHSCOPE_API_KEY (get one at modelstudio console,
//     international/Singapore region). Model defaults to QWEN_MODEL or
//     "qwen3.8-max".
// Kimi and Qwen both speak the exact same OpenAI chat-completions shape,
// so they share one request/response helper (callOpenAICompatible) --
// only the base URL, key, and model name differ. Whichever provider is
// picked, the SAME deterministic fallback below covers it on any
// failure: unreachable, bad key, timeout, malformed JSON, or an
// out-of-list pick. A live demo should never hard-fail because one
// LLM backend had a bad moment.

const REASONING_PROVIDER = (process.env.REASONING_PROVIDER || "ollama").toLowerCase();

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k3";
const KIMI_BASE_URL = "https://api.moonshot.ai/v1";

const QWEN_API_KEY = process.env.DASHSCOPE_API_KEY;
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3.8-max";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || 15000);

function deterministicFallback(candidates) {
  let best = candidates[0];
  for (const c of candidates) {
    if (c.tariffPencePerKwh < best.tariffPencePerKwh) best = c;
  }
  return { chosen: best, rationale: "(fallback: picked lowest tariff, LLM unavailable)", usedLLM: false };
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found in model response");
  return JSON.parse(match[0]);
}

function buildPrompt(candidates) {
  return `You are a compute-scheduling agent deciding when and where to run a deferrable job.
Here are the available windows (site + hour), each with its REGLO-reported solar curtailment risk and retail electricity tariff:

${JSON.stringify(candidates, null, 2)}

Pick the single best window to minimize cost. Prefer CRITICAL curtailment risk (cheapest, most abundant power) and lower tariffPencePerKwh. If two are close, prefer less deferral (lower deferredBy).

Respond with ONLY a JSON object, no other text:
{"siteId": "...", "hour": <number>, "rationale": "<one sentence, plain language, for a non-technical judge>"}`;
}

// Ollama's /api/generate response shape: { response: "<raw model text>" }
async function callOllama(prompt, signal) {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
  const data = await res.json();
  return data.response;
}

// Shared by Kimi and Qwen: both are OpenAI-chat-completions-compatible --
// same request body, same response shape ({choices: [{message: {content}}]}).
// Only the base URL, API key, and model name differ between the two.
async function callOpenAICompatible(baseUrl, apiKey, model, prompt, signal) {
  if (!apiKey) throw new Error(`no API key set for provider "${REASONING_PROVIDER}"`);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`${model} returned HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${model} response had no message content`);
  return content;
}

async function callLLM(prompt, signal) {
  switch (REASONING_PROVIDER) {
    case "kimi":
      return callOpenAICompatible(KIMI_BASE_URL, KIMI_API_KEY, KIMI_MODEL, prompt, signal);
    case "qwen":
      return callOpenAICompatible(QWEN_BASE_URL, QWEN_API_KEY, QWEN_MODEL, prompt, signal);
    case "ollama":
      return callOllama(prompt, signal);
    default:
      throw new Error(`unknown REASONING_PROVIDER "${REASONING_PROVIDER}" -- use ollama, kimi, or qwen`);
  }
}

/**
 * @param {Array} candidates every {siteId, name, hour, deferredBy, tariffPencePerKwh, curtailmentRisk} option in the window
 * @returns {Promise<{chosen, rationale, usedLLM, provider}>}
 */
async function reasonAboutWindows(candidates) {
  const prompt = buildPrompt(candidates);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const rawText = await callLLM(prompt, controller.signal);
    clearTimeout(timeout);
    const parsed = extractJson(rawText);

    const chosen = candidates.find(
      (c) => c.siteId === parsed.siteId && c.hour === Number(parsed.hour)
    );
    if (!chosen) throw new Error("LLM picked a siteId/hour not in the candidate list");

    return { chosen, rationale: parsed.rationale || "(no rationale given)", usedLLM: true, provider: REASONING_PROVIDER };
  } catch (err) {
    clearTimeout(timeout);
    console.log(`[agent/reason.js] LLM reasoning unavailable via "${REASONING_PROVIDER}" (${err.message}) -- using deterministic fallback.`);
    return { ...deterministicFallback(candidates), provider: REASONING_PROVIDER };
  }
}

module.exports = { reasonAboutWindows, deterministicFallback };
