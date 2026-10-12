// A real x402 client: plays the role of ANOTHER agent that wants REGLO's
// agent's advice and is willing to pay for it per-question.
//
// Usage:
//   ESCROW_ADDRESS=0x... MANDATE_USER=0x... PAYER_PRIVATE_KEY=0x... \
//     RPC_URL=http://127.0.0.1:8545 X402_SERVER=http://localhost:4021 \
//     node x402/client.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const MANDATE_USER = process.env.MANDATE_USER;
const X402_SERVER = process.env.X402_SERVER || "http://localhost:4021";
const PAYER_PRIVATE_KEY = process.env.PAYER_PRIVATE_KEY;

if (!ESCROW_ADDRESS || !MANDATE_USER || !PAYER_PRIVATE_KEY) {
  throw new Error("Set ESCROW_ADDRESS, MANDATE_USER, and PAYER_PRIVATE_KEY");
}

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "RegloAgentEscrow.sol", "RegloAgentEscrow.json");
const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const payer = new ethers.Wallet(PAYER_PRIVATE_KEY, provider);
  const escrow = new ethers.Contract(ESCROW_ADDRESS, abi, payer);

  const requestUrl = `${X402_SERVER}/advice?user=${MANDATE_USER}`;

  console.log(`Paying agent (${payer.address}): GET ${requestUrl} (no payment yet)`);
  const first = await fetch(requestUrl);
  if (first.status !== 402) {
    console.log(`Expected 402, got ${first.status}:`, await first.text());
    return;
  }
  const { accepts } = await first.json();
  const requirement = accepts[0];
  console.log(
    `Got 402. Resource wants ${requirement.maxAmountRequired} wei MON to ${requirement.payTo} ` +
      `(${requirement.description})`
  );

  console.log(`Paying on-chain via ${requirement.extra.method}...`);
  const tx = await escrow.askForAdvice(requirement.extra.methodParam, {
    value: BigInt(requirement.maxAmountRequired),
  });
  const receipt = await tx.wait();
  console.log(`Payment tx confirmed: ${receipt.hash}`);

  const xPayment = Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: requirement.scheme,
      network: requirement.network,
      payload: { txHash: receipt.hash, payer: payer.address },
    })
  ).toString("base64");

  console.log(`Retrying with X-PAYMENT header...`);
  const second = await fetch(requestUrl, { headers: { "X-PAYMENT": xPayment } });
  if (second.status !== 200) {
    console.log(`Payment was not accepted (${second.status}):`, await second.text());
    return;
  }
  const advice = await second.json();
  console.log("\nAdvice received (paid for via x402, settled on Monad):");
  console.log(advice);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
