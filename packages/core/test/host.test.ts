import { describe, expect, it, vi } from "vitest";
import { getHost, HOST_PROTOCOL, isNoHandlerError } from "../src/host";

describe("host handshake", () => {
  it("is created once and shared by later copies of the core", async () => {
    const global = {};
    const first = getHost(global);

    // A second, separately loaded copy of the core module (as in a second plugin bundle).
    vi.resetModules();
    const again = await import("../src/host");
    const second = again.getHost(global);

    expect(second).toBe(first);
    expect((global as Record<string, unknown>).__nordlys).toBe(first);
  });

  it("keeps copies with another protocol apart, with a warning", () => {
    const global: Record<string, unknown> = { __nordlys: { protocol: HOST_PROTOCOL + 1 } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = getHost(global);
    expect(host).not.toBe(global.__nordlys);
    expect(global[`__nordlys_p${HOST_PROTOCOL}`]).toBe(host);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("host bus", () => {
  it("delivers events and keeps going when a listener throws", () => {
    const { bus } = getHost({});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: unknown[] = [];
    bus.on("x", () => {
      throw new Error("boom");
    });
    const off = bus.on("x", (p) => seen.push(p));
    bus.emit("x", 1);
    off();
    bus.emit("x", 2);
    expect(seen).toEqual([1]);
    expect(error).toHaveBeenCalled();
  });

  it("routes commands to their single handler", async () => {
    const { bus } = getHost({});
    const off = bus.handle("add", (a, b) => (a as number) + (b as number));
    expect(bus.has("add")).toBe(true);
    await expect(bus.call("add", [2, 3])).resolves.toBe(5);
    expect(() => bus.handle("add", () => 0)).toThrow(/already has a handler/);
    off();
    expect(bus.has("add")).toBe(false);
  });

  it("rejects with a recognizable error when nothing handles a command", async () => {
    const { bus } = getHost({});
    const error = await bus.call("missing", []).catch((e: unknown) => e);
    expect(isNoHandlerError(error)).toBe(true);
  });
});
