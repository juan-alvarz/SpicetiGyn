import type { HostBus } from "./host";

/**
 * Event registry. Plugins add their events through declaration merging:
 *
 *   declare module "@nordlys/core" {
 *     interface NordlysEvents { "spaces:changed": { ... } }
 *   }
 *
 * Payloads must be plain JSON data: the sender and receiver may be built from different
 * versions of the core.
 */
export interface NordlysEvents {
  "nordlys:plugin-ready": { id: string; version: string };
  "nordlys:plugin-stopped": { id: string };
}

/** Command registry, extended the same way. Each command has exactly one handler. */
// biome-ignore lint/suspicious/noEmptyInterface: extended by plugins through declaration merging
export interface NordlysCommands {}

export type CommandName = keyof NordlysCommands;
export type CommandArgs<K extends CommandName> = NordlysCommands[K] extends (
  ...args: infer A
) => unknown
  ? A
  : never;
export type CommandResult<K extends CommandName> = NordlysCommands[K] extends (
  ...args: never[]
) => infer R
  ? Awaited<R>
  : never;

export interface Bus {
  emit<K extends keyof NordlysEvents>(type: K, payload: NordlysEvents[K]): void;
  on<K extends keyof NordlysEvents>(type: K, fn: (payload: NordlysEvents[K]) => void): () => void;
  handle<K extends CommandName>(
    name: K,
    fn: (...args: CommandArgs<K>) => CommandResult<K> | Promise<CommandResult<K>>,
  ): () => void;
  /** Rejects with a NoHandlerError (see `isNoHandlerError`) when no plugin handles `name`. */
  call<K extends CommandName>(name: K, ...args: CommandArgs<K>): Promise<CommandResult<K>>;
  has(name: CommandName): boolean;
}

/** A typed view of the shared host bus whose subscriptions are removed when the plugin stops. */
export function createBus(host: HostBus, track: (dispose: () => void) => void): Bus {
  return {
    emit: (type, payload) => host.emit(type, payload),
    on(type, fn) {
      const off = host.on(type, fn as (payload: unknown) => void);
      track(off);
      return off;
    },
    handle(name, fn) {
      const off = host.handle(name, fn as (...args: unknown[]) => unknown);
      track(off);
      return off;
    },
    call: (name, ...args) => host.call(name, args) as never,
    has: (name) => host.has(name),
  };
}
