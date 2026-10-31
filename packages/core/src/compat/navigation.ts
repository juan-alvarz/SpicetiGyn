import type { Logger } from "../log";
import type { SpicetifyLike } from "./spicetify";

export type ItemKind = "playlist" | "album" | "artist";

export interface NavigationAdapter {
  currentPath(): string;
  /** The title of the open page as Spotify shows it (e.g. a playlist's name), if any. */
  pageTitle(): string | null;
  go(path: string): void;
  onChange(fn: (path: string) => void): () => void;
}

const URI_RE = /^spotify:(?:user:[^:]+:)?(playlist|album|artist):([A-Za-z0-9]+)$/;
const PATH_RE = /^\/(playlist|album|artist)\/([A-Za-z0-9]+)\/?$/;

export function parseItemUri(uri: string): { kind: ItemKind; id: string } | null {
  const match = URI_RE.exec(uri);
  return match ? { kind: match[1] as ItemKind, id: match[2] as string } : null;
}

/** spotify:playlist:abc → /playlist/abc */
export function pathForUri(uri: string): string | null {
  const item = parseItemUri(uri);
  return item ? `/${item.kind}/${item.id}` : null;
}

/** /playlist/abc → spotify:playlist:abc */
export function uriForPath(path: string): string | null {
  const match = PATH_RE.exec(path);
  return match ? `spotify:${match[1]}:${match[2]}` : null;
}

export function createNavigationAdapter(
  s: SpicetifyLike,
  log: Logger,
  track: (dispose: () => void) => void,
): NavigationAdapter {
  // Read fresh each time; Spicetify rebuilds some of its objects after Spotify loads.
  const history = () => s.Platform?.History;
  return {
    currentPath: () => history()?.location?.pathname ?? "/",
    pageTitle() {
      // The header title (data-testid is stable across 1.2.x and 1.3.x), then the main
      // landmark's label ("Spotify – Liked Songs").
      const title = document.querySelector('[data-testid="entityTitle"]')?.textContent?.trim();
      if (title) return title;
      const label = document.querySelector("main[aria-label]")?.getAttribute("aria-label") ?? "";
      const name = label.replace(/^Spotify\s*[–-]\s*/, "").trim();
      return name && name !== label ? name : null;
    },
    go(path) {
      if (typeof history()?.push !== "function") {
        log.warnOnce("nav.push", "Platform.History.push is missing; can't open pages.");
        return;
      }
      if (history()?.location?.pathname !== path) history()?.push?.(path);
    },
    onChange(fn) {
      if (typeof history()?.listen !== "function") {
        log.warnOnce(
          "nav.listen",
          "Platform.History.listen is missing; the last open page isn't remembered.",
        );
        return () => {};
      }
      const unlisten = history()?.listen?.((location) => fn(location?.pathname ?? "/"));
      const off = () => {
        if (typeof unlisten === "function") unlisten();
      };
      track(off);
      return off;
    },
  };
}
