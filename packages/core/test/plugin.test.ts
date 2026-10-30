import { createSpicetifyMock } from "@nordlys/spicetify-mock";
import { describe, expect, it, vi } from "vitest";
import { definePlugin, getHost, h, start } from "../src";

const quiet = () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
};

describe("plugin lifecycle", () => {
  it("removes everything it created through ctx when stopped", async () => {
    quiet();
    const { Spicetify, controls } = createSpicetifyMock();
    const teardown = vi.fn();
    const global = {};
    const running = await start(
      definePlugin({
        id: "tidy",
        name: "Tidy",
        version: "1.0.0",
        setup(ctx) {
          ctx.ui.addStyle(".x{}");
          ctx.ui.button({ label: "Tidy", icon: "<svg></svg>", onClick: () => {} });
          ctx.ui.contextSubmenu({
            label: "Menu",
            when: () => true,
            items: () => [{ label: "a", onClick() {} }],
          });
          ctx.ui.shortcut("mod+alt+1", () => {});
          ctx.ui.popover(null, () => h("div", null, "hi"));
          ctx.player.onSongChange(() => {});
          ctx.nav.onChange(() => {});
          ctx.bus.on("nordlys:plugin-ready", () => {});
          ctx.bus.handle("spaces.list", () => []);
          return teardown;
        },
      }),
      { spicetify: Spicetify, global },
    );

    expect(running).not.toBeNull();
    expect(document.querySelectorAll('style[data-nl-plugin="tidy"]')).toHaveLength(1);
    expect(controls.topbarButtons()).toHaveLength(1);
    expect(controls.contextMenu(["spotify:playlist:x"])).toHaveLength(1);
    expect(controls.bindings()).toEqual(["mod+alt+1"]);
    expect(document.querySelectorAll(".nl-popover")).toHaveLength(1);
    expect(document.documentElement.dataset.nlOs).toBe("mac");

    await running?.stop();

    expect(teardown).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('style[data-nl-plugin="tidy"]')).toHaveLength(0);
    expect(controls.topbarButtons()).toHaveLength(0);
    expect(controls.contextMenu(["spotify:playlist:x"])).toHaveLength(0);
    expect(controls.bindings()).toEqual([]);
    expect(document.querySelectorAll(".nl-popover")).toHaveLength(0);
    expect(controls.listenerCount()).toBe(0);
    expect(getHost(global).bus.has("spaces.list")).toBe(false);
    expect(getHost(global).plugins.has("tidy")).toBe(false);
    expect(document.documentElement.dataset.nlOs).toBeUndefined();
  });

  it("does not start a second copy of the same plugin", async () => {
    quiet();
    const { Spicetify } = createSpicetifyMock();
    const global = {};
    const def = definePlugin({ id: "once", name: "Once", version: "1.0.0", setup: vi.fn() });
    const first = await start(def, { spicetify: Spicetify, global });
    const second = await start({ ...def, version: "1.0.1" }, { spicetify: Spicetify, global });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(def.setup).toHaveBeenCalledOnce();
    await first?.stop();
  });

  it("cleans up and returns null when setup throws", async () => {
    quiet();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { Spicetify } = createSpicetifyMock();
    const global = {};
    const running = await start(
      definePlugin({
        id: "broken",
        name: "Broken",
        version: "1.0.0",
        setup(ctx) {
          ctx.ui.addStyle(".broken{}");
          throw new Error("nope");
        },
      }),
      { spicetify: Spicetify, global },
    );
    expect(running).toBeNull();
    expect(document.querySelectorAll('style[data-nl-plugin="broken"]')).toHaveLength(0);
    expect(getHost(global).plugins.has("broken")).toBe(false);
  });

  it("rejects invalid ids", () => {
    expect(() => definePlugin({ id: "Bad Id", name: "", version: "", setup() {} })).toThrow();
  });
});
