const { expect } = require("chai");
const { ethers } = require("hardhat");
const { attestJobResult } = require("../agent/oracle");
const { chooseBestWindow } = require("../agent/decide");

describe("RegloAgentEscrow — end-to-end pipeline", function () {
  let escrow, user, agent, oracle, stranger;
  const AGENT_SHARE_BPS = 2000; // 20% of verified savings to the agent
  const MAX_PER_CLAIM = ethers.parseEther("1");
  const ADVISORY_FEE = ethers.parseEther("0.001");
  const DEPOSIT = ethers.parseEther("1");

  beforeEach(async function () {
    [, user, agent, oracle, stranger] = await ethers.getSigners();

    const Escrow = await ethers.getContractFactory("RegloAgentEscrow");
    escrow = await Escrow.deploy();
    await escrow.waitForDeployment();

    await escrow
      .connect(user)
      .fundAndSetMandate(agent.address, oracle.address, AGENT_SHARE_BPS, MAX_PER_CLAIM, ADVISORY_FEE, {
        value: DEPOSIT,
      });
  });

  it("sets up the mandate with the funded balance", async function () {
    const mandate = await escrow.mandates(user.address);
    expect(mandate.agent).to.equal(agent.address);
    expect(mandate.oracle).to.equal(oracle.address);
    expect(mandate.balance).to.equal(DEPOSIT);
  });

  it("pays the agent its share when REGLO's data shows a real saving (happy path)", async function () {
    // Agent decides: deferring from hour 8 (morning, expensive) to a
    // cheaper window within the next 6 hours, using REGLO's mocked feed.
    const requestHour = 8;
    const chosen = chooseBestWindow(requestHour, 6);
    const jobId = ethers.id("job-1");

    const attestation = await attestJobResult(oracle, {
      jobId,
      user: user.address,
      agent: agent.address,
      siteId: chosen.siteId,
      requestHour,
      chosenHour: chosen.hour,
      jobEnergyKwh: 10,
    });

    const expectedSavings = attestation.baselineCost - attestation.actualCost;
    expect(expectedSavings).to.be.gt(0n); // sanity: the scenario actually saves money

    const expectedPayout = (expectedSavings * BigInt(AGENT_SHARE_BPS)) / 10000n;

    const agentBalanceBefore = await ethers.provider.getBalance(agent.address);

    const tx = await escrow
      .connect(agent)
      .submitJobResult(
        user.address,
        attestation.jobId,
        attestation.baselineCost,
        attestation.actualCost,
        attestation.timestamp,
        attestation.signature
      );
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    const agentBalanceAfter = await ethers.provider.getBalance(agent.address);
    expect(agentBalanceAfter - agentBalanceBefore + gasCost).to.equal(expectedPayout);

    const mandate = await escrow.mandates(user.address);
    expect(mandate.balance).to.equal(DEPOSIT - expectedPayout);

    await expect(tx).to.emit(escrow, "SavingsClaimed");
  });

  it("rejects a claim signed by anyone other than the registered oracle", async function () {
    const jobId = ethers.id("job-2");
    const attestation = await attestJobResult(stranger, {
      jobId,
      user: user.address,
      agent: agent.address,
      siteId: "aura-rayleigh",
      requestHour: 8,
      chosenHour: 13,
      jobEnergyKwh: 10,
    });

    await expect(
      escrow
        .connect(agent)
        .submitJobResult(
          user.address,
          attestation.jobId,
          attestation.baselineCost,
          attestation.actualCost,
          attestation.timestamp,
          attestation.signature
        )
    ).to.be.revertedWithCustomError(escrow, "BadSignature");
  });

  it("rejects a claim where the attested numbers show no actual saving", async function () {
    const jobId = ethers.id("job-3");
    // Same hour for request and execution -> no saving possible.
    const attestation = await attestJobResult(oracle, {
      jobId,
      user: user.address,
      agent: agent.address,
      siteId: "aura-rayleigh",
      requestHour: 3,
      chosenHour: 3,
      jobEnergyKwh: 10,
    });

    await expect(
      escrow
        .connect(agent)
        .submitJobResult(
          user.address,
          attestation.jobId,
          attestation.baselineCost,
          attestation.actualCost,
          attestation.timestamp,
          attestation.signature
        )
    ).to.be.revertedWithCustomError(escrow, "NoSavings");
  });

  it("rejects the same jobId being claimed twice", async function () {
    const requestHour = 8;
    const chosen = chooseBestWindow(requestHour, 6);
    const jobId = ethers.id("job-4");
    const attestation = await attestJobResult(oracle, {
      jobId,
      user: user.address,
      agent: agent.address,
      siteId: chosen.siteId,
      requestHour,
      chosenHour: chosen.hour,
      jobEnergyKwh: 10,
    });

    await escrow
      .connect(agent)
      .submitJobResult(
        user.address,
        attestation.jobId,
        attestation.baselineCost,
        attestation.actualCost,
        attestation.timestamp,
        attestation.signature
      );

    await expect(
      escrow
        .connect(agent)
        .submitJobResult(
          user.address,
          attestation.jobId,
          attestation.baselineCost,
          attestation.actualCost,
          attestation.timestamp,
          attestation.signature
        )
    ).to.be.revertedWithCustomError(escrow, "JobAlreadyClaimed");
  });

  it("pays the advisory fee straight to the agent (x402 stand-in)", async function () {
    const agentBalanceBefore = await ethers.provider.getBalance(agent.address);

    await escrow.connect(stranger).askForAdvice(user.address, { value: ADVISORY_FEE });

    const agentBalanceAfter = await ethers.provider.getBalance(agent.address);
    expect(agentBalanceAfter - agentBalanceBefore).to.equal(ADVISORY_FEE);
  });

  it("rejects an advisory call that underpays the fee", async function () {
    await expect(
      escrow.connect(stranger).askForAdvice(user.address, { value: ADVISORY_FEE / 2n })
    ).to.be.revertedWithCustomError(escrow, "InsufficientFee");
  });

  it("lets the user withdraw whatever is left", async function () {
    const userBalanceBefore = await ethers.provider.getBalance(user.address);
    const tx = await escrow.connect(user).withdrawRemaining();
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const userBalanceAfter = await ethers.provider.getBalance(user.address);

    expect(userBalanceAfter - userBalanceBefore + gasCost).to.equal(DEPOSIT);
  });
});
