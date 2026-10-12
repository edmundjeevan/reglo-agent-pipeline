// A real x402 resource server: the REGLO agent sells its scheduling advice
// over HTTP, gated by the actual x402 flow (RFC-shaped 402 response with an
// `accepts` array, client retries with an `X-PAYMENT` header) -- this is
// the "agent lists itself and gets paid per-question" piece from the
// original research thread, built for real instead of described.
//
// Adaptation, stated plainly: x402's reference implementations (Coinbase's
// x402, the facilitator ecosystem) settle in USDC on Base. Monad testnet
// has no x402 facilitator today, so payment here settles as a real MON
// transaction calling RegloAgentEscrow.askForAdvice(user) -- the same
// payable function the test suite already covers ("x402 stand-in"),
// now actually gated behind the real HTTP 402 handshake instead of being
// called directly. The protocol shape (402 -> accepts[] -> X-PAYMENT ->
// 200) is followed exactly; the settlement rail is MON/Monad, not
// USDC/Base, because that's what's confirmed to work today.
//
// Verification is real: this server reads the paying transaction straight
// off-chain via ethers, checks it actually called askForAdvice() for the
// requested user with at least the required fee, and refuses to serve the
// same txHash twice (replay protection). It does not trust the client's
// word for any of this.
//
// Usage:
//   ESCROW_ADDRESS=0x... RPC_URL=http://127.0.0.1:8545 node x402/server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { listCandidatesLive } = require("../agent/decide-live");
const { reasonAboutWindows } = require("../agent/reason");

const PORT = Number(process.env.X402_PORT || 4021);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const NETWORK_NAME = process.env.X402_NETWORK || "monad-testnet";

if (!ESCROW_ADDRESS) {
  throw new Error("Set ESCROW_ADDRESS (the deployed RegloAgentEscrow address)");
}

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "RegloAgentEscrow.sol", "RegloAgentEscrow.json");
const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

const provider = new ethers.JsonRpcProvider(RPC_URL);
const escrow = new ethers.Contract(ESCROW_ADDRESS, abi, provider);

// Replay protection: a txHash can only be redeemed for advice once.
const redeemedTxHashes = new Set();

function send(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
    ...extraHeaders,
  });
  res.end(json);
}

async function paymentRequirements(userAddress) {
  const mandate = await escrow.mandates(userAddress);
  if (mandate.agent === ethers.ZeroAddress) {
    return null; // no mandate for this user -- nothing to sell advice against
  }
  return {
    scheme: "exact",
    network: NETWORK_NAME,
    maxAmountRequired: mandate.advisoryFee.toString(), // wei
    resource: "/advice",
    description: "REGLO compute-scheduling agent: best window to run a deferrable job right now",
    payTo: mandate.agent,
    asset: "MON",
    maxTimeoutSeconds: 120,
    extra: {
      contract: ESCROW_ADDRESS,
      method: "askForAdvice(address)",
      methodParam: userAddress,
    },
  };
}

async function verifyPayment(userAddress, requirement, xPaymentHeader) {
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(xPaymentHeader, "base64").toString("utf8"));
  } catch {
    return { ok: false, reason: "X-PAYMENT header is not valid base64 JSON" };
  }

  const txHash = decoded?.payload?.txHash;
  if (!txHash) return { ok: false, reason: "payload.txHash missing" };
  if (redeemedTxHashes.has(txHash)) return { ok: false, reason: "txHash already redeemed" };

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { ok: false, reason: "transaction not found (or not yet mined)" };
  if (receipt.status !== 1) return { ok: false, reason: "transaction reverted" };
  if (receipt.to?.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
    return { ok: false, reason: "transaction was not sent to the escrow contract" };
  }

  const iface = new ethers.Interface(abi);
  let matched = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "AdviceRequested") {
        if (
          parsed.args.user.toLowerCase() === userAddress.toLowerCase() &&
          BigInt(parsed.args.fee) >= BigInt(requirement.maxAmountRequired)
        ) {
          matched = parsed;
          break;
        }
      }
    } catch {
      // not our event, skip
    }
  }
  if (!matched) {
    return { ok: false, reason: "no matching AdviceRequested event for this user/fee in that transaction" };
  }

  redeemedTxHashes.add(txHash);
  return { ok: true, payer: matched.args.payer, fee: matched.args.fee.toString(), txHash };
}

async function buildAdvice() {
  const nowHour = new Date().getUTCHours();
  const candidates = await listCandidatesLive(nowHour, 6);
  const { chosen, rationale, usedLLM } = await reasonAboutWindows(candidates);
  return {
    requestHour: nowHour,
    recommendedSite: chosen.siteId,
    recommendedHour: chosen.hour,
    curtailmentRisk: chosen.curtailmentRisk,
    tariffPencePerKwh: chosen.tariffPencePerKwh,
    rationale,
    reasoningSource: usedLLM ? "llm" : "deterministic_fallback",
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== "/advice") return send(res, 404, { error: "not found" });

    const userAddress = url.searchParams.get("user");
    if (!userAddress) return send(res, 400, { error: "missing ?user=<mandate owner address>" });

    const requirement = await paymentRequirements(userAddress);
    if (!requirement) return send(res, 404, { error: `no mandate found for user ${userAddress}` });

    const xPayment = req.headers["x-payment"];
    if (!xPayment) {
      console.log(`[x402] 402 issued for user=${userAddress} fee=${requirement.maxAmountRequired} wei`);
      return send(res, 402, { x402Version: 1, accepts: [requirement] });
    }

    const result = await verifyPayment(userAddress, requirement, xPayment);
    if (!result.ok) {
      console.log(`[x402] payment rejected: ${result.reason}`);
      return send(res, 402, { x402Version: 1, accepts: [requirement], error: result.reason });
    }

    console.log(`[x402] payment verified on-chain (tx ${result.txHash}) -- serving advice`);
    const advice = await buildAdvice();
    return send(res, 200, advice, {
      "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify({ settled: true, txHash: result.txHash })).toString("base64"),
    });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`x402 advice server listening on :${PORT}`);
  console.log(`Escrow: ${ESCROW_ADDRESS}  RPC: ${RPC_URL}  network: ${NETWORK_NAME}`);
  console.log(`Try: curl "http://localhost:${PORT}/advice?user=<mandate owner address>"`);
});
