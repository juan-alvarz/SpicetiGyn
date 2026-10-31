import { getHost, type RunningPlugin, start } from "@nordlys/core";
import { createSpicetifyMock, type MockOptions } from "@nordlys/spicetify-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceInfo } from "../src/api";
import { updateSettings } from "../src/model/state";
import spaces from "../src/plugin";
import { twoSpaces } from "./fixtures";

const KEY = "nordlys:spaces:state";
let running: RunningPlugin | null = null;

async function waitFor(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function boot(options: MockOptions = {}, seed?: Record<string, string>) {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const storage = new Map(Object.entries(seed ?? {}));
  if (!seed) {
    // A short crossfade keeps the tests fast while still exercising the fade.
    storage.set(
      KEY,
      JSON.stringify({ v: 1, data: updateSettings(twoSpaces(), { crossfadeMs: 100 }) }),
    );
  }
  const mock = createSpicetifyMock({ storage, ...options });
  const global = {};
  running = await start(spaces, { spicetify: mock.Spicetify, global });
  if (!running) throw new Error("did not start");
  const host = getHost(global);
  return { ...mock, host, saved: () => JSON.parse(storage.get(KEY) ?? "null")?.data };
}

const root = document.documentElement;

beforeEach(() => {
  const sidebar = document.createElement("div");
  sidebar.id = "Desktop_LeftSidebar_Id";
  document.body.appendChild(sidebar);
});

afterEach(async () => {
  await running?.stop();
  running = null;
  document.getElementById("Desktop_LeftSidebar_Id")?.remove();
});

describe("Spaces plugin", () => {
  it("publishes the styling contract and its UI on start", async () => {
    const { controls } = await boot();
    expect(root.dataset.nlSpace).toBe("focus");
    expect(root.dataset.nlSpaceColor).toBe("fjord");
    expect(root.style.getPropertyValue("--nl-space-accent")).toBe("#8ed6e3");
    expect(root.style.getPropertyValue("--nl-space-accent-rgb")).toBe("142, 214, 227");
    expect(controls.topbarButtons()[0]?.getAttribute("aria-label")).toBe("Spaces: Focus");
    expect(controls.bindings()).toEqual(Array.from({ length: 9 }, (_, i) => `mod+alt+${i + 1}`));
  });

  it("starts while Spotify's player isn't ready yet (Spicetify's getProgress throws)", async () => {
    const { controls } = await boot({ originLate: true });
    expect(document.querySelector("#Desktop_LeftSidebar_Id .nl-spaces-dock")).not.toBeNull();
    controls.load("spotify:playlist:deepwork", "spotify:track:grid");
    document.querySelector<HTMLButtonElement>('.nl-dock-btn[data-space="focus"]')?.click();
    expect(document.querySelector(".nl-spaces-now")?.textContent).toBe(
      "Playing in Focus: Grid Lines",
    );
  });

  it("keeps reading the player after Spicetify replaces Spicetify.Player", async () => {
    // Without PlayerAPI, so its state can't stand in for the replaced Player's data.
    const { controls, saved } = await boot({ playerApi: false });
    controls.rebindPlayer();
    controls.load("spotify:playlist:deepwork", "spotify:track:index", { positionMs: 12_000 });
    await waitFor(() => saved().spaces[0].snapshot?.trackUri === "spotify:track:index");
    document.querySelector<HTMLButtonElement>('.nl-dock-btn[data-space="focus"]')?.click();
    expect(document.querySelector(".nl-spaces-now")?.textContent).toBe(
      "Playing in Focus: Northern Index",
    );
  });

  it("records songs even when Spotify sends no player events (Spotify 1.3.x)", async () => {
    const { controls, saved } = await boot({ playerEvents: false });
    controls.load("spotify:playlist:deepwork", "spotify:track:machinery", { positionMs: 30_000 });
    await waitFor(() => saved().spaces[0].snapshot?.trackUri === "spotify:track:machinery", 5_000);
    expect(saved().playedIn).toBe("focus");

    controls.press("mod+alt+2");
    await waitFor(() => root.dataset.nlSpace === "chill" && !("nlSwitching" in root.dataset));
    controls.load("spotify:playlist:slowevening", "spotify:track:tea");
    await waitFor(() => saved().spaces[1].snapshot?.trackUri === "spotify:track:tea", 5_000);
    // Focus kept its own song.
    expect(saved().spaces[0].snapshot).toMatchObject({
      trackUri: "spotify:track:machinery",
      positionMs: 30_000,
    });
  }, 15_000);

  it("starts with one space named Spotify on a fresh install", async () => {
    await boot({}, {});
    expect(root.dataset.nlSpace).toBe("spotify");
    const names = [...document.querySelectorAll(".nl-dock-btn[data-space]")].map(
      (b) => b.textContent,
    );
    expect(names).toEqual(["Spotify"]);
  });

  it("shows what the current space is playing, and can forget another space's song", async () => {
    const { controls } = await boot();
    const now = () => document.querySelector(".nl-spaces-now")?.textContent;
    controls.load("spotify:playlist:deepwork", "spotify:track:grid");
    document.querySelector<HTMLButtonElement>('.nl-dock-btn[data-space="focus"]')?.click();
    expect(now()).toBe("Playing in Focus: Grid Lines");

    controls.press("mod+alt+2");
    await waitFor(() => root.dataset.nlSpace === "chill" && !("nlSwitching" in root.dataset));
    expect(now()).toBe("Nothing played in Chill yet. Whatever you play now stays with this space.");

    controls.load("spotify:playlist:slowevening", "spotify:track:tea");
    await waitFor(() => now() === "Playing in Chill: Tea at Four");
    const focus = document.querySelector('.nl-spaces-other[data-space="focus"]');
    expect(focus?.textContent).toContain("Paused · Grid Lines");

    document
      .querySelector<HTMLButtonElement>('[aria-label="Forget the song saved in Focus"]')
      ?.click();
    await waitFor(() =>
      Boolean(
        document
          .querySelector('.nl-spaces-other[data-space="focus"]')
          ?.textContent?.includes("Nothing played yet"),
      ),
    );
  });

  it("adopts music that was already playing when Spaces started", async () => {
    const storage = new Map<string, string>([[KEY, JSON.stringify({ v: 1, data: twoSpaces() })]]);
    const mock = createSpicetifyMock({ storage });
    mock.controls.load("spotify:playlist:deepwork", "spotify:track:index", { positionMs: 9_000 });
    vi.spyOn(console, "info").mockImplementation(() => {});
    running = await start(spaces, { spicetify: mock.Spicetify, global: {} });
    const saved = JSON.parse(storage.get(KEY) ?? "null").data;
    expect(saved.playedIn).toBe("focus");
    expect(saved.spaces[0].snapshot).toMatchObject({
      trackUri: "spotify:track:index",
      positionMs: 9_000,
    });
    document.querySelector<HTMLButtonElement>('.nl-dock-btn[data-space="focus"]')?.click();
    expect(document.querySelector(".nl-spaces-now")?.textContent).toBe(
      "Playing in Focus: Northern Index",
    );
  });

  it("names an added page after its title when the lookup finds nothing", async () => {
    const { saved, controls } = await boot();
    const title = document.createElement("div");
    title.dataset.testid = "entityTitle";
    title.innerHTML = "<h1>Late Night Mix</h1>";
    document.body.appendChild(title);
    controls.navigate("/playlist/unknownmix");
    document.querySelector<HTMLButtonElement>('.nl-dock-btn[data-space="focus"]')?.click();
    [...document.querySelectorAll<HTMLButtonElement>(".nl-spaces-panel .nl-btn")]
      .find((b) => b.textContent?.startsWith("Add this page"))
      ?.click();
    await waitFor(() => saved().spaces[0].items.length === 1);
    expect(saved().spaces[0].items[0]).toMatchObject({
      uri: "spotify:playlist:unknownmix",
      name: "Late Night Mix",
    });
    title.remove();
  });

  it("finds playlist names through Cosmos when PlaylistAPI is missing", async () => {
    const { controls, saved } = await boot({ metadata: false });
    controls.contextMenu(["spotify:playlist:codingflow"])[0]?.items?.[0]?.click?.();
    await waitFor(() => saved().spaces[0].items[0]?.name === "Coding Flow");
    expect(controls.callsTo("CosmosAsync.get")).toEqual([
      ["sp://core-playlist/v1/playlist/spotify:playlist:codingflow/metadata"],
    ]);
  });

  it("pins a space switcher to the bottom of the library sidebar", async () => {
    const { controls } = await boot({ topbarAttaches: false });
    const dock = document.querySelector("#Desktop_LeftSidebar_Id .nl-spaces-dock");
    expect(dock?.getAttribute("role")).toBe("toolbar");
    const buttons = [
      ...(dock?.querySelectorAll<HTMLButtonElement>(".nl-dock-btn[data-space]") ?? []),
    ];
    expect(buttons.map((b) => b.textContent)).toEqual(["Focus", "Chill"]);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");

    buttons[1]?.click();
    await waitFor(() => root.dataset.nlSpace === "chill" && !("nlSwitching" in root.dataset));
    expect(
      document.querySelector('.nl-dock-btn[data-space="chill"]')?.getAttribute("aria-pressed"),
    ).toBe("true");

    // Clicking the current space opens the panel; "+" opens the new-space form.
    document.querySelector<HTMLButtonElement>('.nl-dock-btn[data-space="chill"]')?.click();
    expect(document.querySelector(".nl-spaces-panel .nl-spaces-title")?.textContent).toBe("Chill");
    document.querySelector<HTMLButtonElement>(".nl-dock-btn--new")?.click();
    expect(document.querySelector(".nl-spaces-editor .nl-spaces-title")?.textContent).toBe(
      "New space",
    );
    expect(controls.topbarButtons()).toHaveLength(0);
  });

  it("remembers what each space played and picks it back up", async () => {
    const { controls, saved } = await boot();
    controls.load("spotify:playlist:deepwork", "spotify:track:machinery", { positionMs: 47_000 });
    expect(saved().playedIn).toBe("focus");

    controls.press("mod+alt+2");
    await waitFor(() => root.dataset.nlSpace === "chill" && root.dataset.nlSwitching === undefined);
    expect(controls.callsTo("PlayerAPI.play")).toHaveLength(0); // Chill never played anything
    expect(controls.callsTo("PlayerAPI.pause")).toHaveLength(1);

    controls.load("spotify:playlist:slowevening", "spotify:track:tea", { positionMs: 5_000 });
    controls.press("mod+alt+1");
    await waitFor(() => root.dataset.nlSpace === "focus" && root.dataset.nlSwitching === undefined);

    expect(controls.callsTo("PlayerAPI.play").at(-1)).toEqual([
      { uri: "spotify:playlist:deepwork" },
      { skipTo: { uri: "spotify:track:machinery" } },
    ]);
    expect(controls.callsTo("Player.seek").at(-1)).toEqual([47_000]);
    expect(controls.volume).toBe(0.8);
    const state = saved();
    expect(state.spaces[1].snapshot).toMatchObject({
      trackUri: "spotify:track:tea",
      positionMs: 5_000,
    });
    expect(state.playedIn).toBe("focus");
  });

  it("opens each space's last page", async () => {
    const { controls } = await boot();
    controls.navigate("/playlist/deepwork");
    controls.press("mod+alt+2");
    await waitFor(() => root.dataset.nlSpace === "chill" && !("nlSwitching" in root.dataset));
    controls.navigate("/album/northbound");
    controls.press("mod+alt+1");
    await waitFor(() => controls.path === "/playlist/deepwork");
    controls.press("mod+alt+2");
    await waitFor(() => controls.path === "/album/northbound");
  });

  it("adds items from the right-click menu with their names", async () => {
    const { controls, saved } = await boot();
    const menu = controls.contextMenu(["spotify:playlist:codingflow"]);
    expect(menu.map((m) => m.label)).toEqual(["Add to space"]);
    expect(menu[0]?.items?.map((i) => i.label)).toEqual(["Focus", "Chill"]);
    expect(controls.contextMenu(["spotify:track:grid"])).toHaveLength(0);

    menu[0]?.items?.[1]?.click?.();
    await waitFor(() => controls.notifications.length > 0);
    expect(saved().spaces[1].items).toMatchObject([
      { uri: "spotify:playlist:codingflow", name: "Coding Flow" },
    ]);
    expect(controls.notifications.at(-1)?.text).toBe("Added Coding Flow to Chill.");
  });

  it("exposes list, current and switchTo on the bus", async () => {
    const { host } = await boot();
    const events: Array<{ from: SpaceInfo | null; to: SpaceInfo }> = [];
    host.bus.on("spaces:changed", (e) => events.push(e as (typeof events)[0]));

    const list = (await host.bus.call("spaces.list", [])) as SpaceInfo[];
    expect(list.map((s) => s.name)).toEqual(["Focus", "Chill"]);
    expect(await host.bus.call("spaces.switchTo", ["chill"])).toEqual({ ok: true, resumed: false });
    expect(((await host.bus.call("spaces.current", [])) as SpaceInfo).id).toBe("chill");
    expect(await host.bus.call("spaces.switchTo", ["nope"])).toEqual({
      ok: false,
      reason: "unknown-space",
    });
    expect(events.map((e) => `${e.from?.id}→${e.to.id}`)).toEqual(["focus→chill"]);
  });

  it("creates a space from the panel and switches to it", async () => {
    const { controls, saved } = await boot();
    controls.topbarButtons()[0]?.click();
    const panel = document.querySelector(".nl-spaces-panel");
    expect(panel?.querySelectorAll(".nl-space-btn[data-space]")).toHaveLength(2);

    document.querySelector<HTMLButtonElement>(".nl-space-btn--new")?.click();
    const input = document.querySelector<HTMLInputElement>(".nl-spaces-editor input");
    if (!input) throw new Error("no editor");
    input.value = "Gym";
    input.dispatchEvent(new Event("input"));
    document.querySelector<HTMLButtonElement>(".nl-spaces-editor .nl-btn--primary")?.click();

    await waitFor(() => root.dataset.nlSpace === "gym");
    expect(saved().spaces.map((s: { name: string }) => s.name)).toEqual(["Focus", "Chill", "Gym"]);
    // The context menu picks up the new space.
    expect(
      controls.contextMenu(["spotify:album:northbound"])[0]?.items?.map((i) => i.label),
    ).toContain("Gym");
  });

  it("toggles the optional tint", async () => {
    await boot(
      {},
      { [KEY]: JSON.stringify({ v: 1, data: updateSettings(twoSpaces(), { tint: true }) }) },
    );
    expect(root.dataset.nlTint).toBe("");
    expect(document.querySelectorAll(".nl-tint")).toHaveLength(1);
  });

  it("loads the v0.1 prototype's data", async () => {
    const legacy = {
      current: "work",
      musicPerSpace: true,
      crossfade: 0,
      spaces: {
        work: {
          name: "Work",
          colors: { g1: "#1f6a80" },
          playlists: ["spotify:playlist:deepwork"],
          last: null,
        },
      },
    };
    const { saved } = await boot({}, { "nordlys:spaces": JSON.stringify(legacy) });
    expect(root.dataset.nlSpace).toBe("work");
    expect(saved().spaces[0]).toMatchObject({ id: "work", name: "Work" });
    await waitFor(() => saved().spaces[0].items.length === 1);
  });

  it("leaves nothing behind when stopped", async () => {
    const { controls, host } = await boot(
      {},
      { [KEY]: JSON.stringify({ v: 1, data: updateSettings(twoSpaces(), { tint: true }) }) },
    );
    controls.topbarButtons()[0]?.click();
    await running?.stop();
    running = null;

    expect(controls.topbarButtons()).toHaveLength(0);
    // Spicetify re-attaches top bar buttons after a page change; ours must stay gone.
    controls.navigate("/album/northbound");
    expect(controls.topbarButtons()).toHaveLength(0);
    expect(controls.contextMenu(["spotify:playlist:x"])).toHaveLength(0);
    expect(controls.bindings()).toEqual([]);
    expect(controls.listenerCount()).toBe(0);
    expect(document.querySelectorAll('[data-nl-plugin="spaces"]')).toHaveLength(0);
    expect(document.querySelectorAll(".nl-popover, .nl-tint, .nl-spaces-dock")).toHaveLength(0);
    expect(document.getElementById("Desktop_LeftSidebar_Id")?.getAttribute("style") ?? "").toBe("");
    expect(root.dataset.nlSpace).toBeUndefined();
    expect(root.dataset.nlTint).toBeUndefined();
    expect(root.style.getPropertyValue("--nl-space-accent")).toBe("");
    expect(host.bus.has("spaces.switchTo")).toBe(false);
  });
});
