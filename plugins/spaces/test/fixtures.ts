import type { SpacesState } from "../src/model/schema";
import { DEFAULT_SETTINGS } from "../src/model/state";

/** Two spaces, Focus (current) and Chill, for tests that switch between spaces. */
export function twoSpaces(): SpacesState {
  const space = (id: string, name: string, color: "fjord" | "ember", icon: "target" | "cup") => ({
    id,
    name,
    color,
    icon,
    items: [],
    lastPath: null,
    snapshot: null,
  });
  return {
    currentId: "focus",
    playedIn: null,
    settings: { ...DEFAULT_SETTINGS },
    spaces: [space("focus", "Focus", "fjord", "target"), space("chill", "Chill", "ember", "cup")],
  };
}
