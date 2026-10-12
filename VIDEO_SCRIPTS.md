# Video scripts — Metropolis (Monad) hackathon submission

Both scripts are written so you can read them off a second screen while
recording. Record the demo first — it's the one that proves the product
works, and you can lean on what it actually showed when you record the
pitch right after.

The demo script below is now written against the **exact console output**
from a real dry run on Monad testnet (12 Oct 2026), so what you read on
screen should match what you see almost line for line.

---

## Demo video (≤ 3:00) — "show the product working"

Rule from the submission: no slides, no code walkthrough — screen-record
the real thing running, up to 3 minutes, hosted on YouTube, Loom, Vimeo,
or another video host.

**Before recording, open three things:**
1. A terminal in the repo folder (`cd ~/Downloads/reglo-agent-pipeline`)
2. Your dashboard: `https://edmundjeevan.github.io/reglo-agent-pipeline/`
3. Monadscan, pinned to the contract: `https://testnet.monadscan.com/address/0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4`

**Optional but worth it — get real REGLO data on screen:** in a separate
terminal tab, start REGLO (`cd ~/Downloads/reglo_backend && uvicorn
app.main:app --reload --port 8000`), confirm with `curl
http://localhost:8000/api/health`, then run the demo command with
`REGLO_API_URL=http://127.0.0.1:8000` instead of the default — Node's
`fetch` sometimes can't reach `localhost` over IPv6 even when `curl`
can, and `127.0.0.1` sidesteps that. If you'd rather not deal with this
mid-recording, skip REGLO entirely — the fallback is real, honest, and
documented, and the chain transaction is identical either way.

**0:00–0:20 — What you're about to see**
Voiceover, over the dashboard page:
> "This is REGLO — an AI agent that decides *when* to run compute based on
> real solar-curtailment and tariff data, and gets paid automatically in
> MON, on-chain, only when it proves it actually saved money. Everything
> I'm about to show runs against a contract already deployed and live on
> Monad testnet — nothing here is a slide."

Point at the contract address and balance on the dashboard.

**0:20–1:50 — Run the real flow**
Switch to the terminal. Run:

```
ESCROW_ADDRESS=0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4 npx hardhat run scripts/live-demo.js --no-compile --network monadTestnet
```

(Prefix with `REGLO_API_URL=http://127.0.0.1:8000` first if you got REGLO
running — see above.)

Here's what prints, in order — narrate each block as it appears rather
than reading your own script, so it feels live (because it is):

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

Next block — this is either real REGLO data or the honest fallback,
depending on whether you got `uvicorn` running:
```
[agent/reglo-live.js] REGLO backend unreachable at http://localhost:8000 (fetch failed) -- using agent/reglo-mock.js synthetic fallback...
```
or, if REGLO answered:
```
[agent/reglo-live.js] REGLO backend is up at http://127.0.0.1:8000 -- using real data for this run.
```
> "It's reading curtailment and tariff windows [from my real REGLO
> backend / from the documented synthetic fallback, since REGLO isn't
> running right now] — either way, this next decision is made over that
> data, honestly, not scripted."

Then:
```
Asking the agent to reason over 28 real candidate windows...
Decision source: deterministic fallback
Chosen: Grimsby at hour 11 (CRITICAL, 6p/kWh)
Rationale: (fallback: picked lowest tariff, LLM unavailable)
Transparency check: this IS the deterministic optimum (130p saved on 10kWh).
```
> "It picked the Grimsby site at hour 11 — the highest curtailment risk,
> cheapest tariff window. The 'transparency check' line is the agent
> grading its own homework: it's independently confirming this actually
> was the best available option, not just a plausible-sounding one."

Then the payout:
```
Verified saving (REGLO's real curtailment data, independent of the LLM's wording): 0.013 MON-equivalent
Payout claimed. Tx: 0xdf0f13233cd3c79753f1da8955b89993e642ca49e2734668632b3ddadcfe053d
Check it on https://testnet.monadscan.com/tx/0xdf0f...
```
> "And that's the payout — settled on-chain, right now, in MON."

**1:50–2:30 — Prove it on-chain**
Switch to the Monadscan tab, paste in the tx hash just printed, show
Status: Success. Then switch to your dashboard tab and click **"Rescan
from latest"** — the new `SavingsClaimed` event should appear in the
table within a few seconds, with a working link back to that same
transaction.
> "That event, that balance change — read straight off the chain by this
> page, live, right now. Nothing on this dashboard is mocked."

**2:30–2:50 — One honest caveat, fast**
> "The payment rail, the escrow logic, and — when REGLO's running — the
> curtailment data are all real. What I've simplified for the hackathon
> window is documented plainly in the README. Nothing here is hidden."

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
