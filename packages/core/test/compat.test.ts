import { describe, expect, it, vi } from "vitest";
import { pathForUri, uriForPath } from "../src/compat/navigation";
import { matchesCombo } from "../src/compat/shortcuts";
import { formatShortcut } from "../src/platform";
import { withContext } from "./helpers";

const quiet = () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

describe("player adapter", () => {
  it("reads Player.data.item, and Player.data.track on older versions", async () => {
    quiet();
    for (const shape of ["item", "track"] as const) {
      const { ctx, controls } = await withContext({ playerDataShape: shape });
      controls.load("spotify:playlist:deepwork", "spotify:track:grid", { positionMs: 1200 });
      expect(ctx.player.getState()).toEqual({
        contextUri: "spotify:playlist:deepwork",
        trackUri: "spotify:track:grid",
        trackName: "Grid Lines",
        positionMs: 1200,
        isPaused: false,
      });
    }
  });

  it("plays through PlayerAPI, waits for the song to change, then seeks", async () => {
    quiet();
    const { ctx, controls } = await withContext();
    const ok = await ctx.player.play({
      contextUri: "spotify:playlist:slowevening",
      trackUri: "spotify:track:tea",
      positionMs: 42_000,
    });
    expect(ok).toBe(true);
    expect(controls.callsTo("PlayerAPI.play")).toEqual([
      [{ uri: "spotify:playlist:slowevening" }, { skipTo: { uri: "spotify:track:tea" } }],
    ]);
    expect(controls.callsTo("Player.seek")).toEqual([[42_000]]);
    expect(ctx.player.getState().trackUri).toBe("spotify:track:tea");
  });

  it("falls back to Player.playUri when PlayerAPI is missing or fails", async () => {
    quiet();
    const missing = await withContext({ playerApi: false });
    expect(await missing.ctx.player.play({ contextUri: "spotify:album:northbound" })).toBe(true);
    expect(missing.controls.callsTo("Player.playUri")).toHaveLength(1);

    const failing = await withContext();
    failing.controls.failNextPlay();
    expect(await failing.ctx.player.play({ contextUri: "spotify:album:northbound" })).toBe(true);
    expect(failing.controls.callsTo("PlayerAPI.play")).toHaveLength(1);
    expect(failing.controls.callsTo("Player.playUri")).toHaveLength(1);
  });

  it("reports false when nothing can play", async () => {
    quiet();
    const { ctx } = await withContext({ playerApi: false, playUri: false });
    expect(await ctx.player.play({ contextUri: "spotify:album:northbound" })).toBe(false);
  });

  it("fades the volume in steps", async () => {
    quiet();
    vi.useFakeTimers();
    try {
      const { ctx, controls } = await withContext();
      controls.setVolume(0.6);
      const done = ctx.player.fadeVolume(0, 500);
      await vi.advanceTimersByTimeAsync(600);
      await done;
      const steps = controls.callsTo("Player.setVolume").map(([v]) => v as number);
      expect(steps.length).toBe(10);
      expect(steps.at(-1)).toBe(0);
      expect(steps[0]).toBeCloseTo(0.54);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ui adapters", () => {
  it("uses a player bar button when Topbar.Button is missing", async () => {
    quiet();
    const { ctx, controls } = await withContext({ topbar: false });
    const button = ctx.ui.button({ label: "X", icon: "<svg></svg>", onClick: () => {} });
    expect(button?.placement).toBe("playbar");
    expect(controls.callsTo("Playbar.Button")).toHaveLength(1);
  });

  it("returns null when there is no button API at all", async () => {
    quiet();
    const { ctx } = await withContext({ topbar: false, playbar: false });
    expect(ctx.ui.button({ label: "X", icon: "", onClick: () => {} })).toBeNull();
  });

  it("flattens the submenu when ContextMenu.SubMenu is missing", async () => {
    quiet();
    const { ctx, controls } = await withContext({ subMenu: false });
    const clicked: string[][] = [];
    const handle = ctx.ui.contextSubmenu({
      label: "Add to space",
      when: () => true,
      items: () => [
        { label: "Focus", onClick: (u) => clicked.push(u) },
        { label: "Chill", onClick: () => {} },
      ],
    });
    expect(handle.mode).toBe("flat");
    const menu = controls.contextMenu(["spotify:playlist:x"]);
    expect(menu.map((m) => m.label)).toEqual(["Add to space: Focus", "Add to space: Chill"]);
    menu[0]?.click?.();
    expect(clicked).toEqual([["spotify:playlist:x"]]);
  });

  it("uses a keydown listener when Mousetrap is missing", async () => {
    quiet();
    for (const os of ["osx", "windows"] as const) {
      const { ctx, controls } = await withContext({ mousetrap: false, os });
      const fn = vi.fn();
      ctx.ui.shortcut("mod+alt+2", fn);
      controls.press("mod+alt+2");
      controls.press("mod+alt+3");
      expect(fn).toHaveBeenCalledOnce();
    }
  });
});

describe("helpers", () => {
  it("formats shortcuts per OS", () => {
    expect(formatShortcut("mod+alt+1", "mac")).toBe("⌘⌥1");
    expect(formatShortcut("mod+alt+1", "windows")).toBe("Ctrl+Alt+1");
    expect(formatShortcut("mod+shift+k", "linux")).toBe("Ctrl+Shift+K");
  });

  it("matches physical keys, so ⌥ and AltGr layouts still work", () => {
    const event = new KeyboardEvent("keydown", {
      key: "¡",
      code: "Digit1",
      metaKey: true,
      altKey: true,
    });
    expect(matchesCombo(event, "mod+alt+1", "mac")).toBe(true);
    expect(matchesCombo(event, "mod+alt+1", "windows")).toBe(false);
  });

  it("maps URIs and paths both ways", () => {
    expect(pathForUri("spotify:playlist:abc123")).toBe("/playlist/abc123");
    expect(pathForUri("spotify:user:me:playlist:abc")).toBe("/playlist/abc");
    expect(pathForUri("spotify:track:abc")).toBeNull();
    expect(uriForPath("/album/xyz")).toBe("spotify:album:xyz");
    expect(uriForPath("/search/xyz")).toBeNull();
  });
});
