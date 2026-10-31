import { parseItemUri } from "@nordlys/core";
import { ICON_IDS } from "../icons";
import { COLOR_IDS, COLOR_PRESETS, type ColorId } from "../presets";
import { MAX_SPACES, type Space, type SpaceItem, type SpacesState } from "./schema";
import { cleanName, DEFAULT_SETTINGS, defaultState, slugify, updateSettings } from "./state";

/**
 * The v0.1 prototype stored everything under one key. Its shape (from the prototype sketch):
 *
 *   { current, musicPerSpace, crossfade (seconds),
 *     spaces: { [id]: { name, colors: { g1, g2, g3 }, playlists: string[],
 *                       last: { context, track, position } | null } } }
 *
 * TODO(reference): check this against reference/nordlys-spaces.js once it is in the repo.
 */
export const LEGACY_KEYS = ["nordlys:spaces"];

interface LegacySpace {
  name?: unknown;
  colors?: { g1?: unknown };
  playlists?: unknown;
  last?: { context?: unknown; track?: unknown; position?: unknown } | null;
}

const asObj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

function legacyColor(g1: unknown, index: number): ColorId {
  const match = COLOR_IDS.find(
    (id) => typeof g1 === "string" && COLOR_PRESETS[id].g1.toLowerCase() === g1.toLowerCase(),
  );
  return match ?? (COLOR_IDS[index % COLOR_IDS.length] as ColorId);
}

/** Version 0 (the v0.1 prototype) → version 1. */
export function migrateV0toV1(input: unknown, now = Date.now()): SpacesState {
  const legacy = asObj(input);
  const entries = Object.entries(asObj(legacy.spaces)).slice(0, MAX_SPACES);
  if (entries.length === 0) return defaultState();

  const taken = new Set<string>();
  const idMap = new Map<string, string>();
  const spaces: Space[] = entries.map(([key, raw], index) => {
    const s = raw as LegacySpace;
    let id = slugify(key);
    for (let n = 2; taken.has(id); n++) id = `${slugify(key)}-${n}`;
    taken.add(id);
    idMap.set(key, id);

    const items: SpaceItem[] = [];
    for (const uri of Array.isArray(s.playlists) ? s.playlists : []) {
      const parsed = typeof uri === "string" ? parseItemUri(uri) : null;
      if (parsed && !items.some((i) => i.uri === uri)) {
        items.push({ uri: uri as string, kind: parsed.kind, name: "", image: null, addedAt: now });
      }
    }

    const last = s.last;
    const snapshot =
      last && typeof last.context === "string" && typeof last.track === "string"
        ? {
            contextUri: last.context,
            trackUri: last.track,
            trackName: null,
            positionMs:
              typeof last.position === "number" ? Math.max(0, Math.round(last.position)) : 0,
            savedAt: now,
          }
        : null;

    return {
      id,
      name: cleanName(typeof s.name === "string" ? s.name : key, "Space"),
      icon: ICON_IDS[index % ICON_IDS.length] as Space["icon"],
      color: legacyColor(s.colors?.g1, index),
      items,
      lastPath: null,
      snapshot,
    };
  });

  const current = typeof legacy.current === "string" ? idMap.get(legacy.current) : undefined;
  const state: SpacesState = {
    currentId: current ?? (spaces[0] as Space).id,
    playedIn: null,
    settings: { ...DEFAULT_SETTINGS },
    spaces,
  };
  return updateSettings(state, {
    musicPerSpace: typeof legacy.musicPerSpace === "boolean" ? legacy.musicPerSpace : true,
    crossfadeMs:
      typeof legacy.crossfade === "number" ? legacy.crossfade * 1000 : DEFAULT_SETTINGS.crossfadeMs,
  });
}

export const MIGRATIONS: Record<number, (previous: unknown) => unknown> = {
  0: (previous) => migrateV0toV1(previous),
};
