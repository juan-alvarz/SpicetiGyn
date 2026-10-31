import type { Logger } from "../log";
import type { PlayerDataLike, SpicetifyLike, TrackLike } from "./spicetify";

export interface PlayerState {
  contextUri: string | null;
  trackUri: string | null;
  trackName: string | null;
  positionMs: number;
  isPaused: boolean;
}

export interface PlayTarget {
  contextUri: string;
  trackUri?: string | null;
  positionMs?: number;
}

export interface PlayerAdapter {
  getState(): PlayerState;
  /** Starts `contextUri` at `trackUri`, then seeks to `positionMs`. Resolves false if nothing could play. */
  play(target: PlayTarget): Promise<boolean>;
  pause(): Promise<void>;
  /** 0..1 */
  getVolume(): number;
  setVolume(volume: number): Promise<void>;
  fadeVolume(to: number, durationMs: number, signal?: AbortSignal): Promise<void>;
  onSongChange(fn: (state: PlayerState) => void): () => void;
  onPlayPause(fn: (state: PlayerState) => void): () => void;
}

const SONG_CHANGE_TIMEOUT_MS = 2_000;
const FADE_STEP_MS = 50;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createPlayerAdapter(
  s: SpicetifyLike,
  log: Logger,
  track: (dispose: () => void) => void,
): PlayerAdapter {
  const player = s.Player;

  /**
   * Spicetify's getProgress() and isPlaying() read Player.origin._state, which doesn't exist
   * until Spotify's player has started, a moment after extensions load. They throw until then.
   */
  const safely = <T>(read: () => T | undefined, fallback: T): T => {
    try {
      return read() ?? fallback;
    } catch {
      return fallback;
    }
  };

  /**
   * Player.data is filled by Spicetify from Spotify's player events. When those don't arrive
   * (seen on Spotify 1.3.x), fall back to PlayerAPI's own state, which other extensions use.
   */
  const playerData = (): PlayerDataLike | null => {
    const fromPlayer = player?.data ?? null;
    if (fromPlayer?.item || fromPlayer?.track) return fromPlayer;
    const api = s.Platform?.PlayerAPI;
    const fromApi = safely<unknown>(() => api?._state ?? api?.getState?.(), null);
    const usable =
      fromApi !== null &&
      typeof fromApi === "object" &&
      typeof (fromApi as { then?: unknown }).then !== "function" &&
      Boolean((fromApi as PlayerDataLike).item ?? (fromApi as PlayerDataLike).track);
    if (usable) {
      log.warnOnce(
        "player.data",
        "Player.data is empty; reading Platform.PlayerAPI's state instead.",
      );
      return fromApi as PlayerDataLike;
    }
    return fromPlayer;
  };

  const currentItem = (data: PlayerDataLike): TrackLike | null => {
    if (data.item) return data.item;
    if (data.track) {
      log.warnOnce(
        "player.track",
        "Player.data.item is missing; using Player.data.track (older Spotify).",
      );
      return data.track;
    }
    return null;
  };

  /** Player.getProgress(), or the same sum Spicetify does, from the state's own timestamps. */
  const progress = (data: PlayerDataLike, paused: boolean): number => {
    const fromPlayer = safely<number | null>(() => player?.getProgress?.(), null);
    if (typeof fromPlayer === "number" && Number.isFinite(fromPlayer)) return fromPlayer;
    const base = data.positionAsOfTimestamp;
    if (typeof base !== "number") return 0;
    return base + (paused || typeof data.timestamp !== "number" ? 0 : Date.now() - data.timestamp);
  };

  const getState = (): PlayerState => {
    const data = playerData();
    if (!data) {
      return { contextUri: null, trackUri: null, trackName: null, positionMs: 0, isPaused: true };
    }
    const item = currentItem(data);
    const paused = data.isPaused ?? data.is_paused ?? !safely(() => player?.isPlaying?.(), false);
    return {
      contextUri: data.context?.uri ?? data.context_uri ?? null,
      trackUri: item?.uri ?? null,
      trackName: item?.name ?? item?.metadata?.title ?? null,
      positionMs: Math.max(0, Math.round(progress(data, paused))),
      isPaused: paused,
    };
  };

  const listen = (type: string, fn: (state: PlayerState) => void) => {
    const handler = () => fn(getState());
    player?.addEventListener?.(type, handler);
    const off = () => player?.removeEventListener?.(type, handler);
    track(off);
    return off;
  };

  /** Resolves true once the player reports `trackUri` (or any new song when it is null). */
  const waitForTrack = (trackUri: string | null | undefined) => {
    let done: (ok: boolean) => void = () => {};
    const promise = new Promise<boolean>((resolve) => {
      done = resolve;
    });
    const matches = () => !trackUri || getState().trackUri === trackUri;
    const handler = () => {
      if (matches()) finish(true);
    };
    const timer = setTimeout(() => finish(false), SONG_CHANGE_TIMEOUT_MS);
    function finish(ok: boolean) {
      clearTimeout(timer);
      player?.removeEventListener?.("songchange", handler);
      done(ok);
    }
    player?.addEventListener?.("songchange", handler);
    return {
      promise,
      checkNow: () => {
        if (trackUri && matches()) finish(true);
      },
      cancel: () => finish(false),
    };
  };

  const startContext = async (target: PlayTarget): Promise<boolean> => {
    const options = target.trackUri ? { skipTo: { uri: target.trackUri } } : {};
    const playerApi = s.Platform?.PlayerAPI;
    if (typeof playerApi?.play === "function") {
      try {
        await playerApi.play({ uri: target.contextUri }, {}, options);
        return true;
      } catch (error) {
        log.warn("PlayerAPI.play failed, trying Player.playUri", error);
      }
    } else {
      log.warnOnce("player.playerApi", "Platform.PlayerAPI.play is missing; using Player.playUri.");
    }
    if (typeof player?.playUri === "function") {
      try {
        await player.playUri(target.contextUri, {}, options);
        return true;
      } catch (error) {
        log.error("Player.playUri failed", error);
      }
    }
    log.warnOnce("player.none", "No way to start playback was found in this Spotify version.");
    return false;
  };

  return {
    getState,

    async play(target) {
      const loaded = waitForTrack(target.trackUri);
      const started = await startContext(target);
      if (!started) {
        loaded.cancel();
        return false;
      }
      loaded.checkNow();
      const ok = await loaded.promise;
      if (!ok) log.debug("No matching songchange after play; seeking anyway.");
      if (target.positionMs && target.positionMs > 0) {
        if (typeof player?.seek === "function") player.seek(target.positionMs);
        else
          log.warnOnce(
            "player.seek",
            "Player.seek is missing; resuming from the start of the track.",
          );
      }
      return true;
    },

    async pause() {
      const playerApi = s.Platform?.PlayerAPI;
      try {
        if (typeof playerApi?.pause === "function") await playerApi.pause();
        else player?.pause?.();
      } catch (error) {
        log.warn("Pause failed", error);
      }
    },

    getVolume: () => clamp01(player?.getVolume?.() ?? 1),

    async setVolume(volume) {
      if (typeof player?.setVolume !== "function") {
        log.warnOnce("player.volume", "Player.setVolume is missing; crossfade is disabled.");
        return;
      }
      player.setVolume(clamp01(volume));
    },

    async fadeVolume(to, durationMs, signal) {
      if (typeof player?.setVolume !== "function" || durationMs <= 0) return;
      const from = clamp01(player.getVolume?.() ?? 1);
      const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
      for (let i = 1; i <= steps; i++) {
        if (signal?.aborted) return;
        player.setVolume(clamp01(from + ((to - from) * i) / steps));
        await sleep(durationMs / steps);
      }
    },

    onSongChange: (fn) => listen("songchange", fn),
    onPlayPause: (fn) => listen("onplaypause", fn),
  };
}
