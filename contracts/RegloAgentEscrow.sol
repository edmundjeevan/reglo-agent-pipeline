// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// Note: pinned to OpenZeppelin 4.9.x deliberately. OZ 5.x's utils pull in
// the Cancun-only MCOPY opcode, and Monad's exact supported EVM fork isn't
// confirmed in its public docs as of this build -- staying on 4.9.x (whose
// ECDSA library has toEthSignedMessageHash()+recover() in one place, no
// separate MessageHashUtils) avoids betting the deploy on an unconfirmed
// opcode. Worth revisiting once Monad's fork support is confirmed.

/// @title RegloAgentEscrow
/// @notice Minimal, honest-scope v0 for the Metropolis hackathon submission.
///
/// What this contract actually does today:
///   1. A user deposits MON and sets a "mandate": which agent is allowed to
///      claim, which oracle address is trusted to attest results, the
///      agent's revenue share of any verified savings, and a per-claim cap.
///   2. An off-chain oracle (today: a script standing in for REGLO's
///      curtailment/GHI/tariff feed; tomorrow: REGLO's real backend)
///      signs a message attesting what a job would have cost at request
///      time ("baseline") versus what it actually cost once the agent
///      timed/placed it ("actual"). This is the same signed-attestation
///      pattern most production price oracles use (e.g. Pyth, API3) --
///      it is a real pattern, not a hack, but it does mean the system's
///      honesty currently rests on that one oracle key, which a production
///      version would replace with multiple independent attestors or an
///      on-chain data feed.
///   3. The agent submits that signed attestation. The contract verifies
///      the signature, checks the job hasn't been claimed before, computes
///      the savings, and pays the agent its agreed share -- automatically,
///      with no human approval step.
///   4. A separate, simpler payable function stands in for the x402
///      "advisory fee" flow: anyone can pay a flat fee to get the agent's
///      recommendation. The real version of this is an off-chain HTTP 402
///      request/response settled via an x402 facilitator; this function
///      reproduces the same economic effect (payment gates the resource,
///      agent gets paid immediately) without the HTTP layer, so it is
///      demoable entirely on-chain today.
///
/// What this contract deliberately does NOT do yet (see README):
///   - It does not call REGLO's API itself, or any oracle network -- the
///     oracle is a single trusted address for this milestone.
///   - It does not implement the real x402 HTTP flow.
///   - It is not gas-optimized or audited. It is a working skeleton meant
///     to prove the payment/verification loop end to end, not a mainnet
///     contract.
contract RegloAgentEscrow {
    using ECDSA for bytes32;

    struct Mandate {
        address agent;          // the agent wallet allowed to claim savings payouts
        address oracle;         // the address trusted to sign job-result attestations
        uint16 agentShareBps;   // agent's share of verified savings, in basis points (e.g. 2000 = 20%)
        uint256 maxPerClaim;    // cap on any single payout, in wei
        uint256 advisoryFee;    // flat fee (wei) for the paid-advice function
        uint256 balance;        // remaining MON available for payouts
    }

    mapping(address => Mandate) public mandates;          // user => their mandate
    mapping(bytes32 => bool) public claimedJobs;           // jobId => already paid out

    event MandateFunded(address indexed user, address indexed agent, address indexed oracle, uint256 amount, uint16 agentShareBps, uint256 maxPerClaim, uint256 advisoryFee);
    event MandateTopUp(address indexed user, uint256 amount);
    event SavingsClaimed(address indexed user, address indexed agent, bytes32 indexed jobId, uint256 baselineCost, uint256 actualCost, uint256 savings, uint256 payout);
    event AdviceRequested(address indexed user, address indexed agent, address indexed payer, uint256 fee);
    event RemainingWithdrawn(address indexed user, uint256 amount);

    error MandateAlreadyExists();
    error NoMandate();
    error NotAgent();
    error JobAlreadyClaimed();
    error BadSignature();
    error NoSavings();
    error InsufficientBalance();
    error InsufficientFee();
    error ZeroAddress();
    error InvalidShare();

    /// @notice Create a mandate and fund it in one transaction.
    /// @param agent The agent wallet allowed to claim savings payouts.
    /// @param oracle The address trusted to sign job-result attestations (REGLO stand-in today).
    /// @param agentShareBps Agent's share of verified savings, basis points, max 10000 (100%).
    /// @param maxPerClaim Cap on any single payout, in wei.
    /// @param advisoryFee Flat fee (wei) required to call askForAdvice().
    function fundAndSetMandate(
        address agent,
        address oracle,
        uint16 agentShareBps,
        uint256 maxPerClaim,
        uint256 advisoryFee
    ) external payable {
        if (agent == address(0) || oracle == address(0)) revert ZeroAddress();
        if (agentShareBps > 10_000) revert InvalidShare();
        if (mandates[msg.sender].agent != address(0)) revert MandateAlreadyExists();

        mandates[msg.sender] = Mandate({
            agent: agent,
            oracle: oracle,
            agentShareBps: agentShareBps,
            maxPerClaim: maxPerClaim,
            advisoryFee: advisoryFee,
            balance: msg.value
        });

        emit MandateFunded(msg.sender, agent, oracle, msg.value, agentShareBps, maxPerClaim, advisoryFee);
    }

    /// @notice Add more MON to an existing mandate's payable balance.
    function topUp() external payable {
        Mandate storage m = mandates[msg.sender];
        if (m.agent == address(0)) revert NoMandate();
        m.balance += msg.value;
        emit MandateTopUp(msg.sender, msg.value);
    }

    /// @notice Agent claims its share of a verified saving, backed by an oracle signature.
    /// @param user The user whose mandate this claim is against.
    /// @param jobId Unique id for this job (prevents double-claiming the same result).
    /// @param baselineCost What the job would have cost if run immediately (oracle-attested units, e.g. wei-equivalent cost).
    /// @param actualCost What the job actually cost once the agent timed/placed it.
    /// @param timestamp Oracle's attestation timestamp (included in the signed message, not separately checked on-chain in this v0).
    /// @param signature Oracle's signature over (jobId, user, agent, baselineCost, actualCost, timestamp).
    function submitJobResult(
        address user,
        bytes32 jobId,
        uint256 baselineCost,
        uint256 actualCost,
        uint256 timestamp,
        bytes calldata signature
    ) external {
        Mandate storage m = mandates[user];
        if (m.agent == address(0)) revert NoMandate();
        if (msg.sender != m.agent) revert NotAgent();
        if (claimedJobs[jobId]) revert JobAlreadyClaimed();

        bytes32 messageHash = keccak256(
            abi.encodePacked(jobId, user, m.agent, baselineCost, actualCost, timestamp)
        ).toEthSignedMessageHash();

        address recovered = messageHash.recover(signature);
        if (recovered != m.oracle) revert BadSignature();

        if (actualCost >= baselineCost) revert NoSavings();
        uint256 savings = baselineCost - actualCost;

        uint256 payout = (savings * m.agentShareBps) / 10_000;
        if (payout > m.maxPerClaim) payout = m.maxPerClaim;
        if (payout > m.balance) revert InsufficientBalance();

        claimedJobs[jobId] = true;
        m.balance -= payout;

        emit SavingsClaimed(user, m.agent, jobId, baselineCost, actualCost, savings, payout);

        (bool ok, ) = m.agent.call{value: payout}("");
        require(ok, "payout transfer failed");
    }

    /// @notice Stand-in for the x402 advisory-fee flow: pay a flat fee, agent gets paid immediately.
    /// The real version is an off-chain HTTP 402 request settled by an x402 facilitator;
    /// this reproduces the same "pay to get the resource" economics on-chain for the demo.
    function askForAdvice(address user) external payable {
        Mandate storage m = mandates[user];
        if (m.agent == address(0)) revert NoMandate();
        if (msg.value < m.advisoryFee) revert InsufficientFee();

        emit AdviceRequested(user, m.agent, msg.sender, msg.value);

        (bool ok, ) = m.agent.call{value: msg.value}("");
        require(ok, "advisory fee transfer failed");
    }

    /// @notice User withdraws whatever is left in their mandate's balance.
    function withdrawRemaining() external {
        Mandate storage m = mandates[msg.sender];
        if (m.agent == address(0)) revert NoMandate();
        uint256 amount = m.balance;
        m.balance = 0;
        emit RemainingWithdrawn(msg.sender, amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "withdraw transfer failed");
    }
}
