// Pure state transitions. Every function returns a new state and never mutates its input.
import type { SpaceInfo } from "../api";
import type { IconId } from "../icons";
import { COLOR_PRESETS, type ColorId } from "../presets";
import {
  MAX_CROSSFADE_MS,
  MAX_NAME_LENGTH,
  MAX_SPACES,
  type Settings,
  type Snapshot,
  type Space,
  type SpaceItem,
  type SpacesState,
} from "./schema";

export const DEFAULT_SETTINGS: Settings = { musicPerSpace: true, crossfadeMs: 3_000, tint: false };

const emptySpace = (id: string, name: string, color: ColorId, icon: IconId): Space => ({
  id,
  name,
  color,
  icon,
  items: [],
  lastPath: null,
  snapshot: null,
});

export function defaultState(): SpacesState {
  return {
    currentId: "spotify",
    playedIn: null,
    settings: { ...DEFAULT_SETTINGS },
    spaces: [emptySpace("spotify", "Spotify", "fjord", "disc")],
  };
}

export function cleanName(name: string, fallback = "New space"): string {
  const trimmed = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || fallback;
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "space"
  );
}

export function uniqueId(state: SpacesState, name: string): string {
  const base = slugify(name);
  const taken = new Set(state.spaces.map((s) => s.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function findSpace(state: SpacesState, idOrName: string): Space | undefined {
  const wanted = idOrName.trim().toLowerCase();
  return (
    state.spaces.find((s) => s.id === idOrName) ??
    state.spaces.find((s) => s.name.toLowerCase() === wanted)
  );
}

export function currentSpace(state: SpacesState): Space {
  return state.spaces.find((s) => s.id === state.currentId) ?? (state.spaces[0] as Space);
}

const mapSpace = (state: SpacesState, id: string, fn: (s: Space) => Space): SpacesState => ({
  ...state,
  spaces: state.spaces.map((s) => (s.id === id ? fn(s) : s)),
});

export interface SpaceDraft {
  name: string;
  color: ColorId;
  icon: IconId;
}

export function createSpace(
  state: SpacesState,
  draft: SpaceDraft,
): { state: SpacesState; id: string | null } {
  if (state.spaces.length >= MAX_SPACES) return { state, id: null };
  const name = cleanName(draft.name);
  const id = uniqueId(state, name);
  return {
    state: { ...state, spaces: [...state.spaces, emptySpace(id, name, draft.color, draft.icon)] },
    id,
  };
}

export function updateSpace(
  state: SpacesState,
  id: string,
  patch: Partial<SpaceDraft>,
): SpacesState {
  return mapSpace(state, id, (s) => ({
    ...s,
    ...(patch.name !== undefined && { name: cleanName(patch.name, s.name) }),
    ...(patch.color !== undefined && { color: patch.color }),
    ...(patch.icon !== undefined && { icon: patch.icon }),
  }));
}

/** Deletes a space and moves its items to the neighbor before it (or after it, for the first). */
export function deleteSpace(state: SpacesState, id: string): SpacesState {
  const index = state.spaces.findIndex((s) => s.id === id);
  if (index < 0 || state.spaces.length < 2) return state;
  const removed = state.spaces[index] as Space;
  const heir = state.spaces[index === 0 ? 1 : index - 1] as Space;
  const spaces = state.spaces
    .filter((s) => s.id !== id)
    .map((s) => (s.id === heir.id ? { ...s, items: mergeItems(s.items, removed.items) } : s));
  return {
    ...state,
    spaces,
    currentId: state.currentId === id ? heir.id : state.currentId,
    playedIn: state.playedIn === id ? null : state.playedIn,
  };
}

function mergeItems(into: SpaceItem[], extra: SpaceItem[]): SpaceItem[] {
  const uris = new Set(into.map((i) => i.uri));
  return [...into, ...extra.filter((i) => !uris.has(i.uri))];
}

export function hasItem(space: Space, uri: string): boolean {
  return space.items.some((i) => i.uri === uri);
}

export function addItem(state: SpacesState, spaceId: string, item: SpaceItem): SpacesState {
  return mapSpace(state, spaceId, (s) =>
    hasItem(s, item.uri) ? s : { ...s, items: [...s.items, item] },
  );
}

export function removeItem(state: SpacesState, spaceId: string, uri: string): SpacesState {
  return mapSpace(state, spaceId, (s) => ({ ...s, items: s.items.filter((i) => i.uri !== uri) }));
}

export function moveItem(
  state: SpacesState,
  fromId: string,
  toId: string,
  uri: string,
): SpacesState {
  const from = state.spaces.find((s) => s.id === fromId);
  const item = from?.items.find((i) => i.uri === uri);
  if (!item || fromId === toId || !state.spaces.some((s) => s.id === toId)) return state;
  return addItem(removeItem(state, fromId, uri), toId, item);
}

/** Fills in names and images found by a metadata lookup, in every space that has the item. */
export function updateItemInfo(
  state: SpacesState,
  uri: string,
  info: { name: string; image: string | null },
): SpacesState {
  return {
    ...state,
    spaces: state.spaces.map((s) =>
      hasItem(s, uri)
        ? { ...s, items: s.items.map((i) => (i.uri === uri ? { ...i, ...info } : i)) }
        : s,
    ),
  };
}

export function setLastPath(state: SpacesState, spaceId: string, path: string): SpacesState {
  return mapSpace(state, spaceId, (s) => (s.lastPath === path ? s : { ...s, lastPath: path }));
}

export function setSnapshot(
  state: SpacesState,
  spaceId: string,
  snapshot: Snapshot | null,
): SpacesState {
  return mapSpace(state, spaceId, (s) => ({ ...s, snapshot }));
}

export function setCurrent(state: SpacesState, id: string): SpacesState {
  return state.spaces.some((s) => s.id === id) ? { ...state, currentId: id } : state;
}

export function setPlayedIn(state: SpacesState, id: string | null): SpacesState {
  return state.playedIn === id ? state : { ...state, playedIn: id };
}

export function updateSettings(state: SpacesState, patch: Partial<Settings>): SpacesState {
  const next = { ...state.settings, ...patch };
  next.crossfadeMs = Math.round(Math.min(MAX_CROSSFADE_MS, Math.max(0, next.crossfadeMs)));
  return { ...state, settings: next };
}

export function toInfo(state: SpacesState): SpaceInfo[] {
  return state.spaces.map((s, index) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    color: s.color,
    accent: COLOR_PRESETS[s.color].accent,
    index,
    itemCount: s.items.length,
  }));
}
