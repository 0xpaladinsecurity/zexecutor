import { ChainId, ChainConfig, getViemClient } from "./config";
import { Packet } from "./encoding";
import { EventExecutor, Stop, ViemExecutor } from "./executors/index";
import { EventProvider, ViemProvider } from "./providers/index";
import { privateKeyToAccount } from "viem/accounts";

/**
 * A message event that has been received from an event provider.
 */
export type LZMessageEvent = {
  // The decoded LayerZero packet that was received.
  packet: Packet;
  packetHeader: `0x${string}`;
  payloadHash: `0x${string}`;
  // The raw packet in encoded form.
  rawPayload: `0x${string}`;
  // The transaction hash of the transaction that generated this event.
  transactionHash: string;
};

/**
 * The ZExecutor is the main class of the LayerZero executor.
 * It is responsible for starting the event providers and executors for each chain.
 * It also forwards events from the event providers to the correct executor.
 *
 * The ZExecutor is deployed by the index, which is responsible for reading and
 * processing the configuration.
 */
export class ZExecutor {
  // Maps chain endpoint ids to their respective event providers.
  providerByEid = new Map<number, EventProvider>();
  // Maps chain endpoint ids to their respective event executors.
  executorsByEid = new Map<number, EventExecutor>();

  /**
   * Start the event listener and executor for the provided chain.
   *
   * @param chainId - The id of the chain to listen to
   * @param config - The configuration for the ZExecutor
   * @param privateKey - The private key of the account to use for the executor
   * @returns A function that can be called to terminate the listener and executor,
   * useful for graceful shutdown.
   */
  addChainAndListen(
    chainId: ChainId,
    config: ChainConfig,
    privateKey: `0x${string}`,
  ): Stop {
    // Generate the Viem client and account for the chain
    const account = privateKeyToAccount(privateKey);
    const client = getViemClient(config, chainId, account);

    // Create the event provider and executor for the chain
    const executor = new ViemExecutor(config, client);
    const provider = new ViemProvider(config, client);

    // Store the provider and executor, the executor is stored as its used within the onEvent function
    console.log(
      `Registering executor for ${config.name} with eid ${config.eid}.`,
    );
    this.providerByEid.set(config.eid, provider);
    this.executorsByEid.set(config.eid, executor);

    // Start the event provider and executor, these keep running until the returned function is called
    let stopProvider = provider.start((e: LZMessageEvent) => this.onEvent(e));
    let stopExecutor = executor.start();

    // Return a function that can be called to stop the provider and executor
    return () => {
      stopProvider();
      stopExecutor();
    };
  }

  /**
   * This function is called whenever a new event is received from an event provider.
   * It forwards the event to the executor responsible for the event's destination chain.
   * To keep things simple, we simply print a warning if the destination chain is unknown
   * or not yet registered.
   * @param event The event that was received
   */
  onEvent(event: LZMessageEvent) {
    const chainExecutor = this.executorsByEid.get(event.packet.dstEid);
    if (!chainExecutor) {
      console.warn(
        `Received event for unknown chain endpoint id: ${event.packet.dstEid}.`,
      );
      return;
    }

    console.log(
      `Received event for chain ${event.packet.dstEid}, sorting to the chain's executor...`,
    );
    chainExecutor.addEvent(event);
  }
}
