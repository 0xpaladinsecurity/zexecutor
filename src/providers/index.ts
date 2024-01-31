import { LZMessageEvent } from "../zexecutor";
import { ViemProvider } from "./viemprovider";

/**
 * Function that processes new message events and adds them to the recipient executor's queue.
 */
export type OnEvent = (events: LZMessageEvent) => void;

/**
 * Once this function is called, the related watcher will stop watching for events.
 * This is useful for graceful termination of the application.
 */
export type Stop = () => void;

/**
 * Event providers are responsible for watching the source chain for generated events.
 * They will forward these events to the provided `onEvent` function, whenever they come in.
 *
 * @param onEvent - Function that processes new message events and adds them to the recipient executor's queue
 *
 * @returns A function that can be called to terminate the watcher, useful for graceful shutdown.
 */
export interface EventProvider {
  /**
   * This function starts the event provider, which will watch for events on the source chain.
   * @param onEvent - Function that processes new message events and adds them to the recipient executor's queue
   */
  start(onEvent: OnEvent): Stop;
}

export { ViemProvider };
