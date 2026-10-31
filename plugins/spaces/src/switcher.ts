import type { Logger, PlayerAdapter, PlayerState, Store } from "@nordlys/core";
import type { SwitchResult } from "./api";
import type { Snapshot, Space, SpacesState } from "./model/schema";
import { currentSpace, setCurrent, setPlayedIn, setSnapshot } from "./model/state";

export interface SwitcherDeps {
  player: PlayerAdapter;
  store: Store<SpacesState>;
  log: Logger;
  /** Applies what you see for `to`: CSS variables, data attributes, its last page. */
  apply(to: Space, from: Space): void;
  setSwitching(on: boolean): void;
  onSwitched(from: Space, to: Space): void;
  now?(): number;
}

export interface Switcher {
  switchTo(id: string): Promise<SwitchResult>;
  /** True while a switch runs. Playback events are ignored then, because we cause them. */
  readonly busy: boolean;
}

export function snapshotOf(state: PlayerState, now: number): Snapshot | null {
  if (!state.contextUri || !state.trackUri) return null;
  return {
    contextUri: state.contextUri,
    trackUri: state.trackUri,
    trackName: state.trackName,
    positionMs: state.positionMs,
    savedAt: now,
  };
}

export function createSwitcher(deps: SwitcherDeps): Switcher {
  const { player, store, log } = deps;
  const now = deps.now ?? Date.now;
  let busy = false;
  let pending: { id: string; resolve: (result: SwitchResult) => void } | null = null;

  const commit = (from: Space, to: Space) => {
    store.update((s) => setCurrent(s, to.id));
    deps.apply(to, from);
  };

  async function run(id: string): Promise<SwitchResult> {
    const state = store.get();
    const to = state.spaces.find((s) => s.id === id);
    if (!to) return { ok: false, reason: "unknown-space" };
    if (id === state.currentId) return { ok: false, reason: "already-current" };
    const from = currentSpace(state);

    deps.setSwitching(true);
    try {
      if (!state.settings.musicPerSpace) {
        commit(from, to);
        deps.onSwitched(from, to);
        return { ok: true, resumed: false };
      }

      // 1. Remember what this space was playing, but only if it was played in this space.
      const before = player.getState();
      const wasPlaying = !before.isPaused && before.trackUri !== null;
      const snapshot = snapshotOf(before, now());
      if (state.playedIn === from.id && snapshot)
        store.update((s) => setSnapshot(s, from.id, snapshot));

      const volume = player.getVolume();
      const half = state.settings.crossfadeMs / 2;
      let resumed = false;
      try {
        // 2. Fade out.
        if (wasPlaying && half > 0) await player.fadeVolume(0, half);

        // 3. Switch what you see at the midpoint, like the prototype.
        commit(from, to);

        // 4. Pick the target space back up where it was.
        const target = store.get().spaces.find((s) => s.id === to.id)?.snapshot ?? null;
        if (target) {
          // When nothing was playing, load the target silently and leave it paused.
          if (!wasPlaying) await player.setVolume(0);
          resumed = await player.play(target);
          if (resumed) {
            store.update((s) => setPlayedIn(s, to.id));
            if (!wasPlaying) await player.pause();
          } else {
            log.warn(`Could not resume "${to.name}".`);
          }
        } else if (wasPlaying) {
          await player.pause();
        }

        // 5. Fade back in.
        if (wasPlaying && resumed && half > 0) await player.fadeVolume(volume, half);
      } finally {
        // Always put the volume back, even if playback failed half way.
        await player.setVolume(volume);
      }

      deps.onSwitched(from, to);
      return { ok: true, resumed };
    } finally {
      deps.setSwitching(false);
    }
  }

  async function safeRun(id: string): Promise<SwitchResult> {
    try {
      return await run(id);
    } catch (error) {
      log.error("Switch failed", error);
      return { ok: false, reason: "failed" };
    }
  }

  return {
    get busy() {
      return busy;
    },
    async switchTo(id) {
      if (busy) {
        // The newest request wins; the one it replaces resolves as superseded.
        pending?.resolve({ ok: false, reason: "superseded" });
        return new Promise<SwitchResult>((resolve) => {
          pending = { id, resolve };
        });
      }
      busy = true;
      try {
        const result = await safeRun(id);
        while (pending) {
          const next: { id: string; resolve: (result: SwitchResult) => void } = pending;
          pending = null;
          next.resolve(await safeRun(next.id));
        }
        return result;
      } finally {
        busy = false;
      }
    },
  };
}
