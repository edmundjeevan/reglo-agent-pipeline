/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import { indexer } from "envio";
import type {
  RegloAgentEscrow_AdviceRequested,
  RegloAgentEscrow_MandateFunded,
  RegloAgentEscrow_MandateTopUp,
  RegloAgentEscrow_RemainingWithdrawn,
  RegloAgentEscrow_SavingsClaimed,
} from "envio";

indexer.onEvent({ contract: "RegloAgentEscrow", event: "AdviceRequested" }, async ({ event, context }) => {
  const entity: RegloAgentEscrow_AdviceRequested = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
    agent: event.params.agent,
    payer: event.params.payer,
    fee: event.params.fee,
  };

  context.RegloAgentEscrow_AdviceRequested.set(entity);
});

indexer.onEvent({ contract: "RegloAgentEscrow", event: "MandateFunded" }, async ({ event, context }) => {
  const entity: RegloAgentEscrow_MandateFunded = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
    agent: event.params.agent,
    oracle: event.params.oracle,
    amount: event.params.amount,
    agentShareBps: event.params.agentShareBps,
    maxPerClaim: event.params.maxPerClaim,
    advisoryFee: event.params.advisoryFee,
  };

  context.RegloAgentEscrow_MandateFunded.set(entity);
});

indexer.onEvent({ contract: "RegloAgentEscrow", event: "MandateTopUp" }, async ({ event, context }) => {
  const entity: RegloAgentEscrow_MandateTopUp = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
    amount: event.params.amount,
  };

  context.RegloAgentEscrow_MandateTopUp.set(entity);
});

indexer.onEvent({ contract: "RegloAgentEscrow", event: "RemainingWithdrawn" }, async ({ event, context }) => {
  const entity: RegloAgentEscrow_RemainingWithdrawn = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
    amount: event.params.amount,
  };

  context.RegloAgentEscrow_RemainingWithdrawn.set(entity);
});

indexer.onEvent({ contract: "RegloAgentEscrow", event: "SavingsClaimed" }, async ({ event, context }) => {
  const entity: RegloAgentEscrow_SavingsClaimed = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
    agent: event.params.agent,
    jobId: event.params.jobId,
    baselineCost: event.params.baselineCost,
    actualCost: event.params.actualCost,
    savings: event.params.savings,
    payout: event.params.payout,
  };

  context.RegloAgentEscrow_SavingsClaimed.set(entity);
});
