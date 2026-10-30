/**
 * The narrow, all-optional view of the Spicetify global that the core relies on.
 *
 * Everything is optional on purpose: Spotify and Spicetify versions differ, so every
 * access has to be feature-detected. This module never declares a global, which is
 * what stops plugins from reaching `Spicetify` directly: they get a type error.
 */

export type Listener = (event?: unknown) => void;

export interface TrackLike {
  uri?: string;
  name?: string;
  duration?: { milliseconds?: number } | number;
  metadata?: Record<string, string | undefined>;
}

export interface PlayerDataLike {
  item?: TrackLike | null;
  track?: TrackLike | null;
  context?: { uri?: string } | null;
  context_uri?: string;
  isPaused?: boolean;
  is_paused?: boolean;
}

export interface PlayerLike {
  data?: PlayerDataLike | null;
  getProgress?(): number;
  seek?(ms: number): void;
  getVolume?(): number;
  setVolume?(volume: number): void;
  isPlaying?(): boolean;
  pause?(): void;
  play?(): void;
  playUri?(uri: string, context?: unknown, options?: unknown): Promise<unknown>;
  addEventListener?(type: string, fn: Listener): void;
  removeEventListener?(type: string, fn: Listener): void;
}

export interface HistoryLike {
  push?(path: string | { pathname: string }): void;
  location?: { pathname?: string };
  listen?(fn: (location: { pathname?: string }) => void): (() => void) | undefined;
}

export interface PlatformLike {
  PlayerAPI?: {
    play?(context: { uri: string }, origins: object, options: object): Promise<unknown>;
    pause?(): Promise<unknown>;
  };
  History?: HistoryLike;
  PlatformData?: { os_name?: string };
  PlaylistAPI?: {
    getMetadata?(uri: string): Promise<{ name?: string; images?: Array<{ url?: string }> }>;
  };
}

export interface ButtonLike {
  element?: HTMLElement;
  label?: string;
  icon?: string;
  register?(): void;
  deregister?(): void;
}

export interface MenuEntryLike {
  register?(): void;
  deregister?(): void;
}

export type ShouldAdd = (uris: string[]) => boolean;

export interface ContextMenuLike {
  Item?: new (
    name: string,
    onClick: (uris: string[]) => void,
    shouldAdd?: ShouldAdd,
    icon?: string,
    disabled?: boolean,
  ) => MenuEntryLike;
  SubMenu?: new (
    name: string,
    items: Iterable<MenuEntryLike>,
    shouldAdd?: ShouldAdd,
    disabled?: boolean,
    icon?: string,
  ) => MenuEntryLike;
}

export interface MousetrapLike {
  bind?(keys: string | string[], fn: (event: KeyboardEvent) => unknown, action?: string): unknown;
  unbind?(keys: string | string[], action?: string): unknown;
}

export interface GraphQLLike {
  Request?(definition: unknown, variables: Record<string, unknown>): Promise<unknown>;
  Definitions?: Record<string, unknown>;
}

export interface SpicetifyLike {
  Player?: PlayerLike;
  Platform?: PlatformLike;
  Topbar?: {
    Button?: new (
      label: string,
      icon: string,
      onClick: (self: ButtonLike) => void,
      disabled?: boolean,
      isRight?: boolean,
    ) => ButtonLike;
  };
  Playbar?: {
    Button?: new (
      label: string,
      icon: string,
      onClick: (self: ButtonLike) => void,
      disabled?: boolean,
      active?: boolean,
      registerOnCreate?: boolean,
    ) => ButtonLike;
  };
  ContextMenu?: ContextMenuLike;
  Mousetrap?: MousetrapLike;
  LocalStorage?: {
    get?(key: string): string | null;
    set?(key: string, value: string): void;
    remove?(key: string): void;
  };
  GraphQL?: GraphQLLike;
  CosmosAsync?: { get?(url: string, body?: unknown): Promise<unknown> };
  Locale?: { getLocale?(): string };
  Panel?: { registerPanel?: unknown };
  showNotification?(text: string, isError?: boolean, msTimeout?: number): void;
}

/** The only place in the repository that reads the Spicetify global. */
export function getSpicetify(): SpicetifyLike | undefined {
  return (globalThis as { Spicetify?: SpicetifyLike }).Spicetify;
}
