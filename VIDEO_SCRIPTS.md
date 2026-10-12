# Video scripts — Metropolis (Monad) hackathon submission

Both scripts are written so you can read them off a second screen while
recording. Record the demo first — it's the one that proves the product
works, and you can lean on what it actually showed when you record the
pitch right after.

---

## Demo video (≤ 3:00) — "show the product working"

Rule from the submission: no slides, no code walkthrough — screen-record
the real thing running. Everything below uses commands and pages you
already have working.

**Before recording:** have three things open and ready to switch between:
1. A terminal in the repo folder (`~/Downloads/reglo-agent-pipeline`)
2. A browser tab on your new dashboard: `https://edmundjeevan.github.io/reglo-agent-pipeline/` (once Pages is enabled — see note below)
3. A browser tab on Monadscan, pinned to the contract: `https://testnet.monadscan.com/address/0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4`

**0:00–0:20 — What you're about to see**
On camera/voiceover, over the dashboard page:
> "This is REGLO — an AI agent that decides *when* to run compute based on
> real solar-curtailment and tariff data, and gets paid automatically in
> MON, on-chain, only when it proves it actually saved money. Everything
> I'm about to show is running against a contract already deployed on
> Monad testnet — nothing here is a slide."

Point at the contract address and balance on the dashboard.

**0:20–1:40 — Run the real flow**
Switch to the terminal. Run your live demo script (the one that talks to
real REGLO data + the LLM reasoning step + the x402 payment):

```
node scripts/live-demo.js
```

As it runs, narrate each stage as it prints:
- "It's pulling real curtailment/tariff windows from REGLO."
- "The reasoning step — right now running on `<ollama/kimi/qwen, whichever you have configured>` — picks the cheapest window to run the job in."
- "Now it submits the job result to the contract and the payout is settled over x402, in MON, on Monad testnet."

Let the transaction hash print on screen — don't cut away from it.

**1:40–2:20 — Prove it on-chain**
Switch to the Monadscan tab, refresh, and show the new transaction
landing in the contract's history. Then switch to your dashboard tab,
hit "Rescan from latest," and show the new `SavingsClaimed` (or whichever
event fired) appear in the live table with the real tx link.
> "That event, that balance change — that's not mocked. It's read straight
> off the chain by this page, live, right now."

**2:20–2:50 — One honest caveat, fast**
> "The curtailment data integration and the payment rail are real. The
> parts I'm upfront about simplifying for the hackathon window are in the
> README — nothing here is hidden."

**2:50–3:00 — Close**
> "REGLO: an agent that gets paid for real, verified, power-aware work —
> built on Monad."

**Hosting:** record with Loom (fastest — auto-generates a shareable link
the second you stop recording, no export/upload wait) or QuickTime
screen recording exported and uploaded to YouTube (set to Unlisted) if
you'd rather keep it off Loom's branding. Either satisfies the submission
requirement; Loom is the lowest-friction choice with ~2 days left.

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
It'll only resolve once GitHub Pages is switched on for the repo:
**Settings → Pages → Source: "Deploy from a branch" → Branch: `main`,
folder `/docs` → Save.** Takes 1–2 minutes to go live after saving.
