import {
  getContract,
  WalletClient,
  HttpTransport,
  GetContractReturnType,
  Chain,
  Log,
  publicActions,
  PublicActions,
  decodeEventLog,
  decodeAbiParameters,
} from "viem";

import { Account } from "viem/accounts";
import type { ExtractAbiEvent } from "abitype";
import { WatchContractEventOnLogsFn } from "viem/_types/actions/public/watchContractEvent";

import { OnEvent, EventProvider, Stop } from ".";
import { LZMessageEvent } from "../zexecutor";
import { abi as endpointABI } from "../abis/EndpointV2";
import { ChainConfig } from "../config";
import { PacketSerializer, Packet } from "../encoding";

const EXECUTOR_PAID_SIG: `0x${string}` =
  "0x61ed099e74a97a1d7f8bb0952a88ca8b7b8ebd00c126ea04671f92a81213318a";

import { abi as sendUln302Abi } from "../abis/SendUln302";
/**
 * The ViemProvider is a EventProvider that watches for send events on the LayerZero endpoint contract.
 * Any events it received are validated to have their fee paid to the executor's contract and then
 * forwarded to the provided `onEvents` function.
 */
export class ViemProvider implements EventProvider {
  client: WalletClient<HttpTransport, Chain, Account> & PublicActions;
  endpointContract: GetContractReturnType<
    typeof endpointABI,
    WalletClient<HttpTransport, Chain, Account>,
    WalletClient<HttpTransport, Chain, Account>
  >;

  constructor(
    public config: ChainConfig,
    client: WalletClient<HttpTransport, Chain, Account>,
  ) {
    this.client = client.extend(publicActions);
    this.endpointContract = getContract({
      address: config.endpoint,
      abi: endpointABI,
      publicClient: this.client,
      walletClient: this.client,
    });
  }

  /**
   * This function starts the ViemProvider, which will watch for events on the LayerZero endpoint contract.
   *
   * @remarks
   * This function works by watching for the `PacketSent` event.
   * Whenever such an event is received, the transaction is fetched and validated.
   * Validation occurs by fetching the ordered events from the transaction and ensuring the PacketSent is
   * followed by an ExecutorPaid event, with our executor as the target.
   * @param onEvent - Function that processes new message events and adds them to the recipient executor's queue
   * @returns A function that can be called to terminate the watcher, useful for graceful shutdown.
   */
  start(onEvent: OnEvent): Stop {
    // Listen to PacketSent events on chain
    const onLogs: WatchContractEventOnLogsFn<
      typeof endpointABI,
      "PacketSent",
      undefined
    > = (logs) => {
      logs.forEach((log) => {
        console.log(`Log received for tx: ${log.transactionHash}`);
        try {
          this.processLog(log).then((event) => {
            if (!event) return;
            onEvent(event);
          });
        } catch (e) {
          console.error(e);
        }
      });
    };

    return this.endpointContract.watchEvent.PacketSent({ onLogs });
  }

  /**
   * Validates that a PacketSent event was actually sent to our executor. We need to be careful as a transaction may contain
   * multiple PacketSent events, and we want to specifically figure out whether our log in question was followed by an
   * ExecutorPaid event to our executor contract.
   *
   * Note that we don't really store any details about the gas requirements of the transaction as this is a simple example.
   * Typically, you'd have your on-chain executor quote its fee based on the requested gas in the message options, and then
   * use that as the gas setting when actually executing. This means that you wouldn't have to check the gas here, as you
   * would already know that the executor was paid enough.
   */
  async processLog(
    log: Log<
      bigint,
      number,
      boolean,
      ExtractAbiEvent<typeof endpointABI, "PacketSent">,
      undefined
    >,
  ): Promise<LZMessageEvent | undefined> {
    console.log(`Log received for tx: ${log.transactionHash}`);
    if (!log.transactionHash || !log.logIndex) return;
    if (log.topics.length == 0 || log.topics[0] == undefined) return; // Unnecessary but explicitly safeguard for type safety

    // Fetch the transaction details, which includes an ordered array of all logs in the transaction
    let tx = await this.client.getTransactionReceipt({
      hash: log.transactionHash,
    });

    // Filter on all logs after our actual PacketSent
    let previousLogs = tx.logs
      .filter((txLog) => log.logIndex && txLog.logIndex < log.logIndex)
      .sort((a, b) => b.logIndex - a.logIndex);
    for (let txLog of previousLogs) {
      if (txLog.topics.length == 0) continue; // Ignore LOG0.
      let logSig = txLog.topics[0];
      if (logSig == undefined) continue; // Ignore undefined logs. Unsure whether this is possible or just means out of range, which is already checked.

      // If we reached a new PacketSent, we can stop looking as we did not find an executor payment in time. A new PacketSent would indicate a new message
      // and the next executor getting paid would be for that new event, and not the event we are processing here.
      if (logSig === log.topics[0]) return;

      // If the log is not an executor paid signature, we can continue.
      if (logSig !== EXECUTOR_PAID_SIG) continue;

      if (
        txLog.address.toLowerCase() !== this.config.trustedSendLib.toLowerCase()
      )
        continue; // Someone tried to inject a fake event
      // @todo Improvement: use Viem abitypes for this.
      let txLogParams = decodeAbiParameters(
        [
          { name: "executor", type: "address" },
          { name: "fee", type: "uint256" },
        ],
        txLog.data,
      );
      let executor = txLogParams[0];

      // If the log is not emitted by our executor, we can continue.
      if (executor.toLowerCase() !== this.config.executor.toLowerCase()) {
        console.log(
          `Executor did not match (${executor.toLowerCase()} != ${this.config.executor.toLowerCase()})`,
        );
        continue;
      }

      // As we've found a PacketSent followed by an ExecutorPaid, we can stop looking for more logs and return the decoded log.
      const payLoad = log.args.encodedPayload;
      // This should never occur
      if (!payLoad) continue;

      const packet = PacketSerializer.deserialize(payLoad);
      const packetHeader = PacketSerializer.getHeader(payLoad);
      const payloadHash = PacketSerializer.getPayloadHash(payLoad);

      if (packet.srcEid != this.config.eid) continue; // This should not be possible.

      console.log(`Log valid for tx: ${log.transactionHash}!`);
      const event: LZMessageEvent = {
        packet: packet,
        packetHeader: packetHeader,
        payloadHash: payloadHash,
        rawPayload: payLoad,
        transactionHash: log.transactionHash,
      };

      return event;
    }
  }
}
