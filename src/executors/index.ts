import { LZMessageEvent } from "../zexecutor";
import { ViemExecutor } from "./viemexecutor";

/**
 * Once this function is called, the related watcher will stop watching for events.
 * This is useful for graceful termination of the application.
 */
export type Stop = () => void;

/**
 * Event executors are responsible for executing events that are received from the event provider.
 * The main implementation of this is the ViemExecutor, which executes events using Viem.
 *
 * The executor is responsible for checking that the event has been verified and then executing it.
 */
export interface EventExecutor {
  /**
   * Adds the provided event to the executor's event queue, which schedules it for execution.
   * Execution only occurs if the event has been verified. Unverified events are rescheduled
   * to the back of the queue for later retrial.
   */
  addEvent(event: LZMessageEvent): void;
  /**
   * Starts the executor, which will begin executing events from the queue as they come in,
   * until the executor is stopped. The executor can be stopped by calling the returned function.
   * This is useful for graceful shutdown.
   */
  start(): Stop;
}

export { ViemExecutor };
