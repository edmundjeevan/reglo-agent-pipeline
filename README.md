# REGLO Agent — Metropolis (Monad) Hackathon

An AI agent that gets paid automatically in MON when it verifiably saves
money by scheduling compute around real solar-curtailment data — the
reasoning, the independent verification, and the payout all happen on
Monad, with no human approval step.

**Live links**
- Live on-chain dashboard: https://edmundjeevan.github.io/reglo-agent-pipeline/
- Contract on Monad testnet: [`0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4`](https://testnet.monadscan.com/address/0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4)
- Full writeup (architecture, sequence diagrams, what's real vs. placeholder): [`SUBMISSION.md`](./SUBMISSION.md)

## Bounty integrations

- **Monad** — the escrow/mandate/payout contract is deployed and live on
  Monad testnet; every payout in this repo is a real on-chain transaction.
- **Qwen (Alibaba Cloud DashScope)** — used in [`agent/reason.js`](./agent/reason.js)
  as the agent's reasoning provider (`REASONING_PROVIDER=qwen`). Verified
  end-to-end against real REGLO data, with a real on-chain payout:
  [`0x666c6090caba0282d6b96c148c6206cd0778635eb2f2131e0a063ee77c99b09a`](https://testnet.monadscan.com/tx/0x666c6090caba0282d6b96c148c6206cd0778635eb2f2131e0a063ee77c99b09a)
- **Kimi (Moonshot AI)** — same code path as Qwen (`REASONING_PROVIDER=kimi`),
  sharing the OpenAI-compatible chat-completions call in `agent/reason.js`.
  Verified end-to-end with a real on-chain payout:
  [`0xcc5f99ebfccb2a9128a102984f5ddde4d22d67c9b4268bc9b42201e058b8e438`](https://testnet.monadscan.com/tx/0xcc5f99ebfccb2a9128a102984f5ddde4d22d67c9b4268bc9b42201e058b8e438)
  Writeup: [How Kimi Powers REGLO Agent's On-Chain Decisions](https://dev.to/edmundjeevan/how-kimi-powers-reglo-agents-on-chain-decisions-3cne)

If neither key is configured, or either API is unreachable, the agent
falls back to a deterministic, documented decision rule rather than
failing the job — see `agent/reason.js`.

## Run the real demo

```bash
REASONING_PROVIDER=qwen ESCROW_ADDRESS=0xfDB3B28a35a6E9f4A73166086480f0726E1aB1C4 npx hardhat run scripts/live-demo.js --no-compile --network monadTestnet
```

Requires a `.env` with `DASHSCOPE_API_KEY` set (see `.env.example`). Swap
`REASONING_PROVIDER`/key for `kimi` + `KIMI_API_KEY` to use Kimi instead.
Optionally run the real REGLO backend locally (`REGLO_API_URL`) for live
curtailment data — the agent uses a documented synthetic fallback if it's
not reachable.

## Repo layout

- `contracts/` — the `RegloAgentEscrow` Solidity contract
- `agent/` — decision logic, REGLO integration (+ mock fallback), oracle attestation
- `scripts/` — deploy and live-demo scripts
- `docs/` — the live, self-contained on-chain dashboard (served via GitHub Pages)
- `x402/` — the agent's x402 advisory-payment server/client
- `envio-indexer/` — Envio indexer scaffold (see its own README)

## Tech stack

Solidity (OpenZeppelin), Hardhat 2, ethers.js v6, Node.js, Qwen / Kimi /
local Ollama for agent reasoning, Python/FastAPI for the real REGLO
backend, and a hand-built x402 server/client.
