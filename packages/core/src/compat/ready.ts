import { getSpicetify, type SpicetifyLike } from "./spicetify";

export type Feature =
  | "playerApiPlay"
  | "playUri"
  | "seek"
  | "volume"
  | "history"
  | "topbar"
  | "playbarButton"
  | "contextMenu"
  | "contextSubmenu"
  | "mousetrap"
  | "notifications"
  | "playlistMetadata"
  | "graphql"
  | "panel";

export type FeatureReport = Readonly<Record<Feature, boolean>>;

const fn = (value: unknown) => typeof value === "function";

export function detectFeatures(s: SpicetifyLike): FeatureReport {
  return {
    playerApiPlay: fn(s.Platform?.PlayerAPI?.play),
    playUri: fn(s.Player?.playUri),
    seek: fn(s.Player?.seek),
    volume: fn(s.Player?.getVolume) && fn(s.Player?.setVolume),
    history: fn(s.Platform?.History?.push),
    topbar: fn(s.Topbar?.Button),
    playbarButton: fn(s.Playbar?.Button),
    contextMenu: fn(s.ContextMenu?.Item),
    contextSubmenu: fn(s.ContextMenu?.Item) && fn(s.ContextMenu?.SubMenu),
    mousetrap: fn(s.Mousetrap?.bind),
    notifications: fn(s.showNotification),
    playlistMetadata: fn(s.Platform?.PlaylistAPI?.getMetadata),
    graphql: fn(s.GraphQL?.Request),
    panel: fn(s.Panel?.registerPanel),
  };
}

/** What a plugin can't start without. Everything else degrades with a logged fallback. */
const REQUIRED: Array<[string, (s: SpicetifyLike) => boolean]> = [
  ["Player.addEventListener", (s) => fn(s.Player?.addEventListener)],
  ["Platform", (s) => typeof s.Platform === "object" && s.Platform !== null],
  ["LocalStorage", (s) => fn(s.LocalStorage?.get)],
];

/** Optional parts that sometimes load a moment after the required ones. */
const LATE: Array<(s: SpicetifyLike) => boolean> = [
  (s) => fn(s.Topbar?.Button),
  (s) => fn(s.ContextMenu?.Item),
  (s) => fn(s.Platform?.History?.push),
];

export function missingRequirements(s: SpicetifyLike | undefined): string[] {
  if (!s) return ["Spicetify"];
  return REQUIRED.filter(([, ok]) => !ok(s)).map(([name]) => name);
}

export interface ReadyOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** Extra time to wait for optional parts once the required ones are there. */
  graceMs?: number;
  get?: () => SpicetifyLike | undefined;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForSpicetify(options: ReadyOptions = {}): Promise<SpicetifyLike> {
  const { timeoutMs = 30_000, intervalMs = 100, graceMs = 2_000, get = getSpicetify } = options;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const s = get();
    if (s && missingRequirements(s).length === 0) {
      const graceEnd = Date.now() + graceMs;
      while (!LATE.every((ok) => ok(s)) && Date.now() < graceEnd) await sleep(intervalMs);
      return s;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Spicetify was not ready after ${timeoutMs} ms. Missing: ${missingRequirements(s).join(", ")}`,
      );
    }
    await sleep(intervalMs);
  }
}
