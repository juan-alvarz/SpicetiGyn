import type { Logger } from "./log";

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface StoreSpec<T> {
  /** Saved as "nordlys:<pluginId>:<key>". */
  key: string;
  /** Current schema version, starting at 1. Version 0 means "legacy data from `legacyKeys`". */
  version: number;
  defaults(): T;
  /** `migrations[n]` turns version n data into version n + 1. */
  migrations?: Record<number, (previous: unknown) => unknown>;
  /** Full localStorage keys read as version 0 when the main key is missing. */
  legacyKeys?: string[];
  validate(data: unknown): data is T;
}

export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(fn: (previous: T) => T): void;
  subscribe(fn: (next: T) => void): () => void;
  /** True when the saved data comes from a newer version; changes are then kept in memory only. */
  readonly readOnly: boolean;
}

export interface StorageApi {
  define<T>(spec: StoreSpec<T>): Store<T>;
}

interface Envelope {
  v: number;
  data: unknown;
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Envelope).v === "number" &&
    "data" in value
  );
}

function parse(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export function localStorageBackend(): StorageBackend {
  return {
    get: (k) => globalThis.localStorage.getItem(k),
    set: (k, v) => globalThis.localStorage.setItem(k, v),
    remove: (k) => globalThis.localStorage.removeItem(k),
  };
}

interface StorageDeps {
  log: Logger;
  notify(message: string): void;
  track(dispose: () => void): void;
}

export function createStorage(
  pluginId: string,
  backend: StorageBackend,
  deps: StorageDeps,
): StorageApi {
  return {
    define<T>(spec: StoreSpec<T>): Store<T> {
      const fullKey = `nordlys:${pluginId}:${spec.key}`;
      const listeners = new Set<(next: T) => void>();
      let readOnly = false;

      const write = (data: T) => {
        if (readOnly) {
          deps.log.warnOnce(
            `${fullKey}:readonly`,
            `${fullKey} was saved by a newer version; not overwriting it.`,
          );
          return;
        }
        try {
          backend.set(fullKey, JSON.stringify({ v: spec.version, data } satisfies Envelope));
        } catch (error) {
          deps.log.error(`Could not save ${fullKey}`, error);
        }
      };

      const backup = (raw: string, label: string) => {
        try {
          backend.set(`${fullKey}:backup.${label}`, raw);
        } catch (error) {
          deps.log.error(`Could not back up ${fullKey}`, error);
        }
      };

      const fallBack = (raw: string, label: string, reason: string): T => {
        backup(raw, label);
        deps.log.error(`${fullKey}: ${reason}. A backup was saved to ${fullKey}:backup.${label}.`);
        deps.notify(
          "Saved settings couldn't be read, so defaults are being used. A backup was kept.",
        );
        return spec.defaults();
      };

      const migrate = (from: number, data: unknown, raw: string): T => {
        backup(raw, `v${from}`);
        let current = data;
        try {
          for (let n = from; n < spec.version; n++) {
            const step = spec.migrations?.[n];
            if (!step) throw new Error(`no migration from version ${n}`);
            current = step(current);
          }
        } catch (error) {
          return fallBack(raw, `v${from}`, `migration failed (${String(error)})`);
        }
        if (!spec.validate(current)) return fallBack(raw, `v${from}`, "migrated data is invalid");
        deps.log.info(`Migrated ${fullKey} from version ${from} to ${spec.version}.`);
        write(current);
        return current;
      };

      const load = (): T => {
        const raw = backend.get(fullKey);

        if (raw === null) {
          for (const legacyKey of spec.legacyKeys ?? []) {
            const legacyRaw = backend.get(legacyKey);
            if (legacyRaw === null) continue;
            const legacy = parse(legacyRaw);
            if (!legacy.ok)
              return fallBack(legacyRaw, "legacy", `legacy key ${legacyKey} is not JSON`);
            return migrate(0, legacy.value, legacyRaw);
          }
          return spec.defaults();
        }

        const parsed = parse(raw);
        if (!parsed.ok || !isEnvelope(parsed.value))
          return fallBack(raw, "corrupt", "data is not a valid envelope");
        const { v, data } = parsed.value;

        if (v > spec.version) {
          readOnly = true;
          deps.log.warn(
            `${fullKey} is version ${v}, newer than this plugin understands (${spec.version}).`,
          );
          deps.notify(
            "Settings were saved by a newer version of this plugin. Changes won't be saved until you update.",
          );
          return spec.validate(data) ? data : spec.defaults();
        }
        if (v < spec.version) return migrate(v, data, raw);
        return spec.validate(data) ? data : fallBack(raw, "corrupt", "data failed validation");
      };

      let value = load();

      return {
        get: () => value,
        set(next) {
          value = next;
          write(next);
          for (const fn of [...listeners]) fn(next);
        },
        update(fn) {
          this.set(fn(value));
        },
        subscribe(fn) {
          listeners.add(fn);
          const off = () => {
            listeners.delete(fn);
          };
          deps.track(off);
          return off;
        },
        get readOnly() {
          return readOnly;
        },
      };
    },
  };
}
