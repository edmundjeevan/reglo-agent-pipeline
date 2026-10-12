import { describe, it } from "vitest";
import { createTestIndexer, type RegloAgentEscrow_AdviceRequested } from "envio";
import { TestHelpers } from "envio";

describe("RegloAgentEscrow contract AdviceRequested event tests", () => {
  it("RegloAgentEscrow_AdviceRequested is created correctly", async (t) => {
    const indexer = createTestIndexer();

    // Creating mock for RegloAgentEscrow contract AdviceRequested event
    const event = {
      contract: "RegloAgentEscrow" as const,
      event: "AdviceRequested" as const,
      params: {
        user: TestHelpers.Addresses.defaultAddress,
        agent: TestHelpers.Addresses.defaultAddress,
        payer: TestHelpers.Addresses.defaultAddress,
        fee: 0n,
      },
    };

    await indexer.process({
      chains: {
        10143: {
          simulate: [event],
        },
      },
    });

    // Getting the actual entity from the test indexer
    let actualRegloAgentEscrowAdviceRequested = await indexer.RegloAgentEscrow_AdviceRequested.getOrThrow("10143_0_0");

    // Creating the expected entity
    const expectedRegloAgentEscrowAdviceRequested = {
      id: "10143_0_0",
      user: event.params.user,
      agent: event.params.agent,
      payer: event.params.payer,
      fee: event.params.fee,
      chainId: 10143,
    };
    // Asserting that the entity in the mock database is the same as the expected entity
    t.expect(actualRegloAgentEscrowAdviceRequested, "Actual RegloAgentEscrowAdviceRequested should be the same as the expected RegloAgentEscrowAdviceRequested").toEqual(expectedRegloAgentEscrowAdviceRequested);
  });
});

describe("Indexer smoke test", () => {
  it("processes the first block with events on chain 10143", async (t) => {
    const indexer = createTestIndexer();

    const result = await indexer.process({ chains: { 10143: {} } });

    t.expect(result.changes.length, "Should have at least one change").toBeGreaterThan(0);
    const firstChange = result.changes[0]!;
    t.expect(firstChange.chainId).toBe(10143);
    t.expect(firstChange.eventsProcessed).toBeGreaterThan(0);
  }, 60_000);
});
