import type { ItemKind } from "@nordlys/core";
import { ICON_IDS, type IconId } from "../icons";
import { COLOR_IDS, type ColorId } from "../presets";

export const STORE_VERSION = 1;
export const MAX_SPACES = 9; // one per shortcut, mod+alt+1–9
export const MAX_NAME_LENGTH = 24;
export const MAX_CROSSFADE_MS = 8_000;

export interface SpaceItem {
  uri: string;
  kind: ItemKind;
  /** Captured when added; "" until the metadata lookup fills it in. */
  name: string;
  image: string | null;
  addedAt: number;
}

export interface Snapshot {
  contextUri: string;
  trackUri: string;
  trackName: string | null;
  positionMs: number;
  savedAt: number;
}

export interface Space {
  id: string;
  name: string;
  icon: IconId;
  color: ColorId;
  items: SpaceItem[];
  lastPath: string | null;
  snapshot: Snapshot | null;
}

export interface Settings {
  /** true: each space has its own music. false: music keeps playing when you switch. */
  musicPerSpace: boolean;
  crossfadeMs: number;
  /** Tint the window with the space color. Off by default; works without any theme. */
  tint: boolean;
}

export interface SpacesState {
  currentId: string;
  /** The space whose music is loaded in the player, or null if unknown. */
  playedIn: string | null;
  settings: Settings;
  spaces: Space[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNullable = <T>(v: unknown, check: (x: unknown) => x is T): v is T | null =>
  v === null || check(v);

export const isSpaceId = (v: unknown): v is string =>
  isStr(v) && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v);

function isItem(v: unknown): v is SpaceItem {
  return (
    isObj(v) &&
    isStr(v.uri) &&
    (v.kind === "playlist" || v.kind === "album" || v.kind === "artist") &&
    isStr(v.name) &&
    isNullable(v.image, isStr) &&
    isNum(v.addedAt)
  );
}

function isSnapshot(v: unknown): v is Snapshot {
  return (
    isObj(v) &&
    isStr(v.contextUri) &&
    isStr(v.trackUri) &&
    isNullable(v.trackName, isStr) &&
    isNum(v.positionMs) &&
    isNum(v.savedAt)
  );
}

function isSpace(v: unknown): v is Space {
  return (
    isObj(v) &&
    isSpaceId(v.id) &&
    isStr(v.name) &&
    ICON_IDS.includes(v.icon as IconId) &&
    COLOR_IDS.includes(v.color as ColorId) &&
    Array.isArray(v.items) &&
    v.items.every(isItem) &&
    isNullable(v.lastPath, isStr) &&
    isNullable(v.snapshot, isSnapshot)
  );
}

export function isSpacesState(v: unknown): v is SpacesState {
  if (!isObj(v) || !isObj(v.settings) || !Array.isArray(v.spaces)) return false;
  const s = v.settings;
  const spaces = v.spaces;
  return (
    typeof s.musicPerSpace === "boolean" &&
    isNum(s.crossfadeMs) &&
    typeof s.tint === "boolean" &&
    spaces.length >= 1 &&
    spaces.length <= MAX_SPACES &&
    spaces.every(isSpace) &&
    new Set(spaces.map((x) => (x as Space).id)).size === spaces.length &&
    isStr(v.currentId) &&
    spaces.some((x) => (x as Space).id === v.currentId) &&
    isNullable(v.playedIn, isStr)
  );
}
