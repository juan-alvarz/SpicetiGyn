import type { PlayerAdapter, PlayerState, Store } from "@nordlys/core";
import { describe, expect, it, vi } from "vitest";
import type { SpacesState } from "../src/model/schema";
import { setSnapshot, updateSettings } from "../src/model/state";
import { createSwitcher } from "../src/switcher";
import { twoSpaces } from "./fixtures";

function memoryStore(initial: SpacesState): Store<SpacesState> {
  let value = initial;
  return {
    get: () => value,
    set: (v) => {
      value = v;
    },
    update(fn) {
      value = fn(value);
    },
    subscribe: () => () => {},
    readOnly: false,
  };
}

/** A scripted player that records every call in order. */
function fakePlayer(initial: Partial<PlayerState> = {}) {
  const log: string[] = [];
  let state: PlayerState = {
    contextUri: null,
    trackUri: null,
    trackName: null,
    positionMs: 0,
    isPaused: true,
    ...initial,
  };
  let volume = 0.7;
  let playResult = true;
  let playThrows = false;
  const player: PlayerAdapter = {
    getState: () => state,
    async play(t) {
      log.push(`play ${t.contextUri} ${t.trackUri} @${t.positionMs}`);
      if (playThrows) throw new Error("boom");
      if (playResult)
        state = {
          ...state,
          contextUri: t.contextUri,
          trackUri: t.trackUri ?? null,
          isPaused: false,
        };
      return playResult;
    },
    async pause() {
      log.push("pause");
      state = { ...state, isPaused: true };
    },
    getVolume: () => volume,
    async setVolume(v) {
      log.push(`volume ${v}`);
      volume = v;
    },
    async fadeVolume(to, ms) {
      log.push(`fade ${to} ${ms}`);
      volume = to;
    },
    onSongChange: () => () => {},
    onPlayPause: () => () => {},
  };
  return {
    player,
    log,
    get volume() {
      return volume;
    },
    failPlay: () => (playResult = false),
    throwOnPlay: () => (playThrows = true),
  };
}

const playing: Partial<PlayerState> = {
  contextUri: "spotify:playlist:deep",
  trackUri: "spotify:track:a",
  trackName: "A",
  positionMs: 47_000,
  isPaused: false,
};

const chillSnapshot = {
  contextUri: "spotify:playlist:slow",
  trackUri: "spotify:track:b",
  trackName: "B",
  positionMs: 72_000,
  savedAt: 0,
};

function setup(state: SpacesState, player = fakePlayer(playing)) {
  const store = memoryStore(state);
  const applied: string[] = [];
  const switched: string[] = [];
  const switcher = createSwitcher({
    player: player.player,
    store,
    log: { debug() {}, info() {}, warn() {}, error() {}, warnOnce() {} },
    apply: (to) => {
      applied.push(to.id);
      player.log.push(`apply ${to.id}`);
    },
    setSwitching: () => {},
    onSwitched: (from, to) => switched.push(`${from.id}→${to.id}`),
    now: () => 99,
  });
  return { store, switcher, applied, switched, ...player };
}

describe("switching spaces", () => {
  it("saves this space, fades out, resumes the other, fades in, restores the volume", async () => {
    const base = setSnapshot({ ...twoSpaces(), playedIn: "focus" }, "chill", chillSnapshot);
    const t = setup(base);
    const result = await t.switcher.switchTo("chill");

    expect(result).toEqual({ ok: true, resumed: true });
    expect(t.log).toEqual([
      "fade 0 1500",
      "apply chill",
      "play spotify:playlist:slow spotify:track:b @72000",
      "fade 0.7 1500",
      "volume 0.7",
    ]);
    const state = t.store.get();
    expect(state.currentId).toBe("chill");
    expect(state.playedIn).toBe("chill");
    expect(state.spaces[0]?.snapshot).toMatchObject({
      trackUri: "spotify:track:a",
      positionMs: 47_000,
      savedAt: 99,
    });
    expect(t.switched).toEqual(["focus→chill"]);
  });

  it("does not save a snapshot when the music was not played in this space", async () => {
    const t = setup({ ...twoSpaces(), playedIn: "chill" });
    await t.switcher.switchTo("chill");
    expect(t.store.get().spaces[0]?.snapshot).toBeNull();
  });

  it("pauses when the target space has never played anything", async () => {
    const t = setup({ ...twoSpaces(), playedIn: "focus" });
    const result = await t.switcher.switchTo("chill");
    expect(result).toEqual({ ok: true, resumed: false });
    expect(t.log).toEqual(["fade 0 1500", "apply chill", "pause", "volume 0.7"]);
    expect(t.store.get().playedIn).toBe("focus");
  });

  it("loads the target silently and leaves it paused when nothing was playing", async () => {
    const base = setSnapshot(twoSpaces(), "chill", chillSnapshot);
    const t = setup(base, fakePlayer({ ...playing, isPaused: true }));
    await t.switcher.switchTo("chill");
    expect(t.log).toEqual([
      "apply chill",
      "volume 0",
      "play spotify:playlist:slow spotify:track:b @72000",
      "pause",
      "volume 0.7",
    ]);
  });

  it("restores the volume even when playback throws", async () => {
    const base = setSnapshot(twoSpaces(), "chill", chillSnapshot);
    const player = fakePlayer(playing);
    player.throwOnPlay();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup(base, player);
    const result = await t.switcher.switchTo("chill");
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(t.log.at(-1)).toBe("volume 0.7");
    expect(t.volume).toBe(0.7);
    expect(t.switcher.busy).toBe(false);
  });

  it("switches without touching the music when 'music keeps playing' is on", async () => {
    const t = setup(updateSettings(twoSpaces(), { musicPerSpace: false }));
    expect(await t.switcher.switchTo("chill")).toEqual({ ok: true, resumed: false });
    expect(t.log).toEqual(["apply chill"]);
  });

  it("skips the fade when the crossfade is 0", async () => {
    const base = setSnapshot(
      updateSettings(twoSpaces(), { crossfadeMs: 0 }),
      "chill",
      chillSnapshot,
    );
    const t = setup(base);
    await t.switcher.switchTo("chill");
    expect(t.log.some((l) => l.startsWith("fade"))).toBe(false);
  });

  it("rejects unknown and current spaces", async () => {
    const t = setup(twoSpaces());
    expect(await t.switcher.switchTo("nope")).toEqual({ ok: false, reason: "unknown-space" });
    expect(await t.switcher.switchTo("focus")).toEqual({ ok: false, reason: "already-current" });
  });

  it("lets the newest request win while a switch is running", async () => {
    let s = twoSpaces();
    s = {
      ...s,
      spaces: [
        ...s.spaces,
        { ...s.spaces[1], id: "night", name: "Night" } as SpacesState["spaces"][0],
      ],
    };
    const t = setup(s);
    const first = t.switcher.switchTo("chill");
    const second = t.switcher.switchTo("focus");
    const third = t.switcher.switchTo("night");
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toEqual({ ok: false, reason: "superseded" });
    expect(await third).toMatchObject({ ok: true });
    expect(t.applied).toEqual(["chill", "night"]);
    expect(t.store.get().currentId).toBe("night");
  });
});
