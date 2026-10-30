/**
 * The public contract of the Spaces plugin. Types only: other plugins use it with
 * `import type {} from "@nordlys/spaces/api"`, which adds nothing to their bundle and
 * creates no runtime dependency. At runtime they talk to Spaces only through the bus.
 */

export interface SpaceInfo {
  id: string;
  name: string;
  icon: string;
  /** Color preset key, e.g. "fjord". */
  color: string;
  /** Hex accent color of the preset, e.g. "#8ed6e3". */
  accent: string;
  /** Position in the list; the shortcut is mod+alt+(index + 1). */
  index: number;
  itemCount: number;
}

export type SwitchResult =
  | { ok: true; resumed: boolean }
  | { ok: false; reason: "unknown-space" | "already-current" | "superseded" | "failed" };

declare module "@nordlys/core" {
  interface NordlysEvents {
    /** After a switch finished (music faded back in, page opened). */
    "spaces:changed": { from: SpaceInfo | null; to: SpaceInfo };
    /** After spaces were created, edited, deleted or their items changed. */
    "spaces:updated": { spaces: SpaceInfo[] };
  }
  interface NordlysCommands {
    "spaces.list": () => SpaceInfo[];
    "spaces.current": () => SpaceInfo | null;
    /** Accepts a space id or (case-insensitive) name. */
    "spaces.switchTo": (idOrName: string) => Promise<SwitchResult>;
  }
}
