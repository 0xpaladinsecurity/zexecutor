import {
  Account,
  getContract,
  WalletClient,
  HttpTransport,
  GetContractReturnType,
  Chain,
  padHex,
} from "viem";
import { abi as endpointABI } from "../abis/EndpointV2";
import { abi as executorABI } from "../abis/SimpleExecutor";
import { abi as endpointViewABI } from "../abis/EndpointV2View";
import { abi as receiveLibViewABI } from "../abis/ReceiveUln302View";
import { abi as receiveLibABI } from "../abis/ReceiveUln302";

import { ChainConfig } from "../config";
import { EventExecutor, Stop } from ".";
import { LZMessageEvent } from "../zexecutor";

/**
 * The ExecutionState is an enum defined by the EndpointV2View contract.
 * It is used to determine whether an event is executable and is
 * represented by the following number values:
 */
enum ExecutionState {
  NotExecutable = 0,
  VerifiedButNotExecutable = 1,
  Executable = 2,
  Executed = 3,
}

// Part of the receiveLib
enum VerificationState {
  Verifying = 0,
  Verifiable = 1,
  Verified = 2,
  NotInitializable = 3,
}

const DEFAULT_GAS_LIMIT = 1_000_000;

/**
 * The ViemExecutor is a EventExecutor that executes events using Viem.
 * It is responsible for checking that the event has been verified and then executing it.
 * Events from providers are added to the executor's queue, which is processed in order.
 * When an event is executed, it is removed from the queue. However, if an event is not yet
 * executable, it is moved to the back of the queue for later retrial.
 */
export class ViemExecutor implements EventExecutor {
  // @todo try-catch
  // Whether the executor is currently active.
  active: boolean = false;
  // The queue of events to be executed.
  pendingEvents: LZMessageEvent[] = [];
  // The Viem endpoint contract for the executor.
  endpointContract: GetContractReturnType<
    typeof endpointABI,
    WalletClient<HttpTransport, Chain>,
    WalletClient<HttpTransport, Chain, Account>
  >;

  endpointViewContract: GetContractReturnType<
    typeof endpointViewABI,
    WalletClient<HttpTransport, Chain>,
    WalletClient<HttpTransport, Chain, Account>
  >;

  executorContract: GetContractReturnType<
    typeof executorABI,
    WalletClient<HttpTransport, Chain>,
    WalletClient<HttpTransport, Chain, Account>
  >;

  receiveLibViewContract: GetContractReturnType<
    typeof receiveLibViewABI,
    WalletClient<HttpTransport, Chain>,
    WalletClient<HttpTransport, Chain, Account>
  >;

  receiveLibContract: GetContractReturnType<
    typeof receiveLibABI,
    WalletClient<HttpTransport, Chain>,
    WalletClient<HttpTransport, Chain, Account>
  >;

  constructor(
    public config: ChainConfig,
    public client: WalletClient<HttpTransport, Chain, Account>,
  ) {
    this.endpointContract = getContract({
      address: config.endpoint,
      abi: endpointABI,
      publicClient: client,
      walletClient: client,
    });

    this.endpointViewContract = getContract({
      address: config.endpointView,
      abi: endpointViewABI,
      publicClient: client,
      walletClient: client,
    });

    this.executorContract = getContract({
      address: config.executor,
      abi: executorABI,
      publicClient: client,
      walletClient: client,
    });

    this.receiveLibViewContract = getContract({
      address: config.trustedReceiveLibView,
      abi: receiveLibViewABI,
      publicClient: client,
      walletClient: client,
    });

    this.receiveLibContract = getContract({
      address: config.trustedReceiveLib,
      abi: receiveLibABI,
      publicClient: client,
      walletClient: client,
    });
  }

  // Adds the provided event to the executor's event queue, which schedules it for execution.
  addEvent(event: LZMessageEvent) {
    console.log(`Adding event ${event.transactionHash} to executor.`);
    this.pendingEvents.push(event);
  }

  start(): Stop {
    if (this.active) throw new Error("Executor active");
    this.active = true;

    this.startAsync().then(() => {
      console.log("Executor finished.");
    });

    return () => {
      this.active = false;
    };
  }

  async startAsync() {
    while (true) {
      // Early return to prevent infinite loop if the executor is stopped.
      if (!this.active) {
        console.log("Executor stopped, closing executor processing loop.");
        return;
      }

      // Take the first event from the queue. This removes it from the array.
      const event = this.pendingEvents.shift();
      let wait = this.pendingEvents.length == 0 ? 5000 : 500;
      if (event) {
        try {
          await this.executeOrRequeueEvent(event);
        } catch (e) {
          this.pendingEvents.push(event);
          console.error(
            `Error in executor loop: ${e}, waiting 30 seconds in case its rate-limit related.`,
          );
          wait = 30000;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  async executeOrRequeueEvent(event: LZMessageEvent) {
    const executionState = await this.getExecutionState(event);
    console.log(
      `Event ${event.transactionHash} execution state: ${executionState}`,
    );

    // If the event has already been executed, we don't need to do anything.
    if (executionState == ExecutionState.Executed) {
      console.log(`Event ${event.transactionHash} already executed.`);
      return;
    }

    // If executable, we execute and drop the event by not requeuing it.
    if (executionState == ExecutionState.Executable) {
      await this.executeEvent(event);
      return;
    }

    // If the event isn't yet executable, we move it to the back of our queue for a later retry.
    // Note that one of the reasons it may not be executable is that we haven't committed the
    // event yet (which can be done after the DVNs submitted). So we try to commit the event
    // before we requeue it in case the verificationState indicates that commitment is needed.
    const verificationState = await this.getVerificationState(event);
    if (verificationState == VerificationState.Verifiable) {
      await this.commitEvent(event);
      this.pendingEvents.push(event);
      return;
    }

    if (executionState == ExecutionState.VerifiedButNotExecutable) {
      console.log(
        `Event ${event.transactionHash} verified but not executable, requeuing. This often means the a historical event was not committed. The zexecutor example cannot handle this.`,
      );
      this.pendingEvents.push(event);
      return;
    }

    console.log(
      `Event ${event.transactionHash} not commitable yet (State: ${verificationState}), requeuing.`,
    );
    this.pendingEvents.push(event);
  }

  async executeEvent(event: LZMessageEvent) {
    console.log(`Executing event ${event.transactionHash}`);
    let res = await this.endpointContract.write.lzReceive(
      [
        {
          srcEid: event.packet.srcEid, //srcEid
          sender: padHex(event.packet.sender), // sender
          nonce: event.packet.nonce, // nonce
        },
        event.packet.receiver,
        event.packet.guid, // guid
        event.packet.message, // message
        "0x", // extra data
      ],
      {}, // options
    );

    console.log(`Executed event: ${res}`);
  }

  async commitEvent(event: LZMessageEvent) {
    console.log(`Committing event ${event.transactionHash}`);
    let res = await this.receiveLibContract.write.commitVerification(
      [event.packetHeader, event.payloadHash],
      {}, // options
    );

    console.log(`Committed event: ${res}`);
  }

  async getExecutionState(event: LZMessageEvent): Promise<ExecutionState> {
    const executionState: number =
      await this.endpointViewContract.read.executable([
        {
          srcEid: event.packet.srcEid, //srcEid
          sender: padHex(event.packet.sender), // sender
          nonce: event.packet.nonce, // nonce
        },
        event.packet.receiver as `0x${string}`, // receiver
      ]);
    return executionState;
  }

  async getVerificationState(
    event: LZMessageEvent,
  ): Promise<VerificationState> {
    const executionState: number =
      (await this.receiveLibViewContract.read.verifiable([
        event.packetHeader,
        event.payloadHash,
      ])) as number;

    return executionState;
  }
}
