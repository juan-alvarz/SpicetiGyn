import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/log";
import { createStorage, type StorageBackend, type StoreSpec } from "../src/storage";

interface V2 {
  name: string;
  count: number;
}

const spec: StoreSpec<V2> = {
  key: "state",
  version: 2,
  defaults: () => ({ name: "default", count: 0 }),
  legacyKeys: ["old-key"],
  migrations: {
    0: (old) => ({ title: (old as { label: string }).label }),
    1: (v1) => ({ name: (v1 as { title: string }).title, count: 1 }),
  },
  validate: (d): d is V2 =>
    typeof d === "object" &&
    d !== null &&
    typeof (d as V2).name === "string" &&
    typeof (d as V2).count === "number",
};

function setup(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const backend: StorageBackend = {
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
  const notify = vi.fn();
  const log = createLogger("test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  const storage = createStorage("demo", backend, { log, notify, track: () => {} });
  return { data, notify, store: () => storage.define(spec) };
}

const KEY = "nordlys:demo:state";

describe("storage", () => {
  it("uses defaults and writes nothing until something is set", () => {
    const { data, store } = setup();
    const s = store();
    expect(s.get()).toEqual({ name: "default", count: 0 });
    expect(data.has(KEY)).toBe(false);
    s.set({ name: "a", count: 2 });
    expect(JSON.parse(data.get(KEY) ?? "")).toEqual({ v: 2, data: { name: "a", count: 2 } });
  });

  it("migrates step by step and keeps a backup of the old data", () => {
    const raw = JSON.stringify({ v: 1, data: { title: "hello" } });
    const { data, store } = setup({ [KEY]: raw });
    expect(store().get()).toEqual({ name: "hello", count: 1 });
    expect(data.get(`${KEY}:backup.v1`)).toBe(raw);
    expect(JSON.parse(data.get(KEY) ?? "").v).toBe(2);
  });

  it("reads legacy keys as version 0", () => {
    const { data, store } = setup({ "old-key": JSON.stringify({ label: "legacy" }) });
    expect(store().get()).toEqual({ name: "legacy", count: 1 });
    expect(data.get(`${KEY}:backup.v0`)).toBe(JSON.stringify({ label: "legacy" }));
  });

  it("never overwrites data saved by a newer version", () => {
    const raw = JSON.stringify({ v: 9, data: { name: "future", count: 5 } });
    const { data, notify, store } = setup({ [KEY]: raw });
    const s = store();
    expect(s.readOnly).toBe(true);
    expect(s.get()).toEqual({ name: "future", count: 5 });
    s.set({ name: "changed", count: 6 });
    expect(s.get().name).toBe("changed");
    expect(data.get(KEY)).toBe(raw);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("backs up corrupt data and falls back to defaults", () => {
    const { data, notify, store } = setup({ [KEY]: "{not json" });
    expect(store().get()).toEqual({ name: "default", count: 0 });
    expect(data.get(`${KEY}:backup.corrupt`)).toBe("{not json");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("falls back to defaults when a migration throws", () => {
    const { store } = setup({ [KEY]: JSON.stringify({ v: 1, data: null }) });
    expect(store().get()).toEqual({ name: "default", count: 0 });
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const { store } = setup();
    const s = store();
    const seen: number[] = [];
    const off = s.subscribe((v) => seen.push(v.count));
    s.update((v) => ({ ...v, count: v.count + 1 }));
    off();
    s.update((v) => ({ ...v, count: v.count + 1 }));
    expect(seen).toEqual([1]);
  });
});
