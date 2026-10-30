import type { NordlysHost } from "./host";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  t: number;
  level: LogLevel;
  source: string;
  message: string;
}

export interface Logger {
  /** Printed only when localStorage "nordlys:debug" is "1". Always kept in the ring buffer. */
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Logs a warning the first time `key` is seen, then stays quiet. Used for fallbacks. */
  warnOnce(key: string, ...args: unknown[]): void;
}

const MAX_ENTRIES = 200;

function debugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("nordlys:debug") === "1";
  } catch {
    return false;
  }
}

function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function createLogger(source: string, host?: Pick<NordlysHost, "logs">): Logger {
  const prefix = `[nordlys:${source}]`;
  const seen = new Set<string>();

  const write = (level: LogLevel, args: unknown[]) => {
    if (host) {
      host.logs.push({ t: Date.now(), level, source, message: stringify(args) });
      if (host.logs.length > MAX_ENTRIES) host.logs.splice(0, host.logs.length - MAX_ENTRIES);
    }
    if (level === "debug" && !debugEnabled()) return;
    console[level](prefix, ...args);
  };

  return {
    debug: (...a) => write("debug", a),
    info: (...a) => write("info", a),
    warn: (...a) => write("warn", a),
    error: (...a) => write("error", a),
    warnOnce(key, ...a) {
      if (seen.has(key)) return;
      seen.add(key);
      write("warn", a);
    },
  };
}
