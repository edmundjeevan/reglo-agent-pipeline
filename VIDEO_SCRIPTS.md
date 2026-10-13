# Video scripts — Metropolis (Monad) hackathon submission

Both scripts are written so you can read them off a second screen while
recording. Record the demo first — it's the one that proves the product
works, and you can lean on what it actually showed when you record the
pitch right after.

The demo script below is now written against the **best verified run** on
Monad testnet (13 Oct 2026) — real REGLO data, real Qwen reasoning, and a
real on-chain payout, all in one — so what you read on screen should match
what you see almost line for line.

---

## Demo video (≤ 3:00) — "show the product working"

Rule from the submission: no slides, no code walkthrough — screen-record
the real thing running, up to 3 minutes, hosted on YouTube, Loom, Vimeo,
or another video host.

**Before recording, open three things:**
1. A terminal in the repo folder (`cd ~/Downloads/reglo-agent-pipeline`)
2. Your dashboard: `https://edmundjeevan.github.io/reglo-agent-pipeline/`
3. Monadscan, pinned to the contract: `https://testnet.monadscan.com/address/0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4`

**Start REGLO first, in a separate terminal tab** (leave it running):
```
cd ~/Downloads/reglo_backend
uvicorn app.main:app --reload --port 8000
```
Confirm it's up with `curl http://localhost:8000/api/health` before you
start recording.

**0:00–0:20 — What you're about to see**
Voiceover, over the dashboard page:
> "This is REGLO — an AI agent that decides *when* to run compute based on
> real solar-curtailment and tariff data, and gets paid automatically in
> MON, on-chain, only when it proves it actually saved money. Everything
> I'm about to show runs against a contract already deployed and live on
> Monad testnet — nothing here is a slide."

Point at the contract address and balance on the dashboard.

**0:20–1:50 — Run the real flow**
Switch to the terminal. Run (REGLO running, real Qwen key set):

```
REGLO_API_URL=http://localhost:8000 DASHSCOPE_API_KEY=your-key REASONING_PROVIDER=qwen ESCROW_ADDRESS=0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4 npx hardhat run scripts/live-demo.js --no-compile --network monadTestnet
```

This is the verified best-case run. Here's exactly what printed last time
— narrate each block as it lands rather than reading your own script, so
it feels live (because it is). Your exact numbers (site, hour, saving,
tx hash) will differ on your take since REGLO's real data changes — just
narrate whatever actually prints, not these specific figures.

```
User (you):    0x7B21BD1b28c84A69141dE40777d297b456795D17
Agent wallet:  0x5ce00fb49150ABdf9113cD4Ef58E79441e5246F4
Oracle wallet: 0x07D917cBCD524891dCC5F68FDFe184e481e883A2
Mandate already exists for this user, reusing it.

Fetching candidate windows from REGLO (real backend, fallback-safe)...
```
> "Those are three real wallets on Monad testnet — mine, the agent's, and
> an oracle that independently verifies the agent's work. The mandate
> funding already happened in an earlier run, so it's reusing it."

```
[agent/reglo-live.js] REGLO backend is up at http://localhost:8000 -- using real data for this run.
```
> "It's reading curtailment and tariff windows live, straight from my
> real REGLO backend, right now."

```
Asking the agent to reason over 28 real candidate windows...
Decision source: LLM (Qwen)
Chosen: Rayleigh at hour 13 (LOW, 25p/kWh)
Rationale: It has the lowest electricity price among the available windows while all options carry the same low curtailment risk.
Transparency check: this IS the deterministic optimum (30p saved on 10kWh).
```
> "That decision was made by Qwen, Alibaba Cloud's model, called live over
> their API — it picked the Rayleigh site at hour 13, the cheapest tariff
> window available. The 'transparency check' line is the agent grading
> its own homework: it's independently confirming this really was the
> best available option, not just a plausible-sounding one."

Then the payout:
```
Verified saving (REGLO's real curtailment data, independent of the LLM's wording): 0.003 MON-equivalent
Payout claimed. Tx: 0x546ac9b63ce72f00467e8e2c25f1d3c8186a0cdacfa0806019fa3639cb929bda
Check it on https://testnet.monadscan.com/tx/0x546ac...
```
> "And that's the payout — settled on-chain, right now, in MON."

**If REGLO or the Qwen key aren't available when you actually record,**
fall back to the simpler command without those two env vars — the script
still completes honestly on the documented fallback, just say so on
camera rather than pretending otherwise:
```
ESCROW_ADDRESS=0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4 npx hardhat run scripts/live-demo.js --no-compile --network monadTestnet
```

**1:50–2:30 — Prove it on-chain**
Switch to the Monadscan tab, paste in the tx hash just printed, show
Status: Success. Then switch to your dashboard tab and click **"Rescan
from latest"** — the new `SavingsClaimed` event should appear in the
table within a few seconds, with a working link back to that same
transaction.
> "That event, that balance change — read straight off the chain by this
> page, live, right now. Nothing on this dashboard is mocked."

**2:30–2:50 — One honest caveat, fast**
> "The payment rail, the escrow logic, the REGLO curtailment data, and
> this decision from Qwen are all real. What I've simplified for the
> hackathon window is documented plainly in the README. Nothing here is
> hidden."

**2:50–3:00 — Close**
> "REGLO: an agent that gets paid for real, verified, power-aware work —
> built on Monad."

**Hosting:** Loom is the fastest option — gives you a shareable link the
moment you stop recording. YouTube (set to Unlisted) works too.

---

## Pitch video (≤ 2:00) — "team / problem / why"

**0:00–0:15 — Hook + problem**
> "AI agents are starting to do real work — but there's no trustworthy way
> for one to get paid for *verifiably* doing it well, and no way for it to
> know it's doing that work at the cheapest, greenest possible moment."

**0:15–0:40 — The problem, specifically**
> "I work in energy — I'm a PM at Trayam Energy, and I run REGLO, a
> solar-curtailment SaaS. I see this gap directly: compute jobs get
> scheduled with no regard for live grid tariff or curtailment data, so
> both the energy and the money get wasted."

**0:40–1:10 — The solution**
> "REGLO Agent is a small escrow contract on Monad plus an agent that: reads
> real curtailment and tariff windows, decides when to run a job, proves
> the result on-chain, and gets paid automatically in MON through x402 —
> no invoice, no manual approval, no trust assumption beyond the contract
> itself."

**1:10–1:35 — Why Monad**
> "This only works if payment settlement is fast and cheap enough to run
> per-job, not per-invoice. That's why it's built on Monad — the contract's
> deployed and live on testnet right now, and the architecture is EVM-
> native so it carries over to mainnet without changes."

**1:35–1:55 — Who's building it / what's next**
> "I'm Edmund — field and deployment engineer, UCL Applied ML postgrad,
> and co-founder of Health Haven Technologies. I built this solo for
> Metropolis. Next step is wiring REGLO's live tariff feed in as the
> permanent oracle and opening it up to other agent developers who want
> their agents to get paid for provably efficient work."

**1:55–2:00 — Close**
> "REGLO — pay agents for real, verified, power-aware work."

*(Trim the "who's building it" section if you end up over time — the demo
video is the one judges weight most heavily for proof-of-work; this one
just needs to land the problem and the "why Monad" fast.)*

---

### Note on the dashboard URL above
It's already live: `https://edmundjeevan.github.io/reglo-agent-pipeline/`
(GitHub Pages, deployed from `/docs` on `main`).
