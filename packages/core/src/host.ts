import type { LogEntry } from "./log";

/**
 * The handshake object every bundled copy of the core shares through `window.__nordlys`.
 *
 * This is the only part of the core that must stay compatible across releases: plugins built
 * months apart meet here. Changes within one protocol number may only add things. A breaking
 * change bumps HOST_PROTOCOL, and copies with different protocols use separate hosts.
 */
export const HOST_PROTOCOL = 1;
const HOST_KEY = "__nordlys";

export interface HostBus {
  on(type: string, fn: (payload: unknown) => void): () => void;
  emit(type: string, payload: unknown): void;
  handle(name: string, fn: (...args: unknown[]) => unknown): () => void;
  call(name: string, args: unknown[]): Promise<unknown>;
  has(name: string): boolean;
}

export interface HostPluginEntry {
  version: string;
  coreVersion: string;
  stop(): Promise<void>;
}

export interface NordlysHost {
  protocol: typeof HOST_PROTOCOL;
  coreVersions: string[];
  bus: HostBus;
  plugins: Map<string, HostPluginEntry>;
  logs: LogEntry[];
}

export const NO_HANDLER = "NO_HANDLER";

/** Thrown by `bus.call` when nothing handles the command. Check it with `isNoHandlerError`. */
export class NoHandlerError extends Error {
  readonly code = NO_HANDLER;
  constructor(name: string) {
    super(`No handler for command "${name}"`);
    this.name = "NoHandlerError";
  }
}

/** Works across bundles, where `instanceof` would not. */
export function isNoHandlerError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === NO_HANDLER;
}

function createHostBus(logs: LogEntry[]): HostBus {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  const report = (message: string, error: unknown) => {
    logs.push({
      t: Date.now(),
      level: "error",
      source: "bus",
      message: `${message}: ${String(error)}`,
    });
    console.error("[nordlys:bus]", message, error);
  };

  return {
    on(type, fn) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },
    emit(type, payload) {
      for (const fn of [...(listeners.get(type) ?? [])]) {
        try {
          fn(payload);
        } catch (error) {
          report(`listener for "${type}" threw`, error);
        }
      }
    },
    handle(name, fn) {
      if (handlers.has(name)) throw new Error(`Command "${name}" already has a handler`);
      handlers.set(name, fn);
      return () => {
        if (handlers.get(name) === fn) handlers.delete(name);
      };
    },
    async call(name, args) {
      const fn = handlers.get(name);
      if (!fn) throw new NoHandlerError(name);
      return await fn(...args);
    },
    has: (name) => handlers.has(name),
  };
}

function createHost(): NordlysHost {
  const logs: LogEntry[] = [];
  return {
    protocol: HOST_PROTOCOL,
    coreVersions: [],
    bus: createHostBus(logs),
    plugins: new Map(),
    logs,
  };
}

/** Returns the shared host, creating it if this is the first copy of the core to load. */
export function getHost(target: object = globalThis): NordlysHost {
  const slots = target as Record<string, unknown>;
  const existing = slots[HOST_KEY] as { protocol?: unknown } | undefined;
  let host: NordlysHost;

  if (existing === undefined) {
    host = createHost();
    slots[HOST_KEY] = host;
  } else if (existing.protocol === HOST_PROTOCOL) {
    host = existing as NordlysHost;
  } else {
    const key = `${HOST_KEY}_p${HOST_PROTOCOL}`;
    if (!slots[key]) {
      console.warn(
        `[nordlys] Another Nordlys plugin uses host protocol ${String(existing.protocol)}, this one uses ${HOST_PROTOCOL}. ` +
          "They work on their own but can't talk to each other until both are updated.",
      );
      slots[key] = createHost();
    }
    host = slots[key] as NordlysHost;
  }

  if (!host.coreVersions.includes(__NORDLYS_CORE_VERSION__)) {
    host.coreVersions.push(__NORDLYS_CORE_VERSION__);
  }
  return host;
}
