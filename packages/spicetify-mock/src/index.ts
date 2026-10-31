/**
 * A fake `Spicetify` global, close enough to the real one for our adapters.
 *
 * Options switch parts off or change their shape to simulate older Spotify/Spicetify
 * versions, so every compat fallback can be tested. Nothing here proves real Spotify
 * behaves the same way; it only models the API differences we know about.
 */

type Fn = (...args: never[]) => unknown;

export interface CatalogEntry {
  name: string;
  image?: string;
  tracks?: Array<{ uri: string; name: string; durationMs?: number }>;
}

export interface MockOptions {
  os?: "osx" | "windows" | "linux";
  /** "track" simulates Spotify versions where Player.data.item was still Player.data.track. */
  playerDataShape?: "item" | "track";
  playerApi?: boolean;
  playUri?: boolean;
  seek?: boolean;
  topbar?: boolean;
  playbar?: boolean;
  contextMenu?: boolean;
  subMenu?: boolean;
  mousetrap?: boolean;
  history?: boolean;
  metadata?: boolean;
  /**
   * false simulates Spotify 1.3.x, where Spicetify creates Topbar.Button elements but can't
   * find the top bar to put them in.
   */
  topbarAttaches?: boolean;
  /**
   * Like Spicetify, make getProgress() and isPlaying() throw until the first track loads
   * (they read Player.origin._state, which Spotify creates a moment after extensions start).
   */
  originLate?: boolean;
  /** How long a play() call takes before "songchange" fires. */
  latencyMs?: number;
  catalog?: Record<string, CatalogEntry>;
  storage?: Map<string, string>;
  /** Initial LocalStorage contents (plain object, so it can cross into the browser harness). */
  seed?: Record<string, string>;
  /** Where Topbar/Playbar buttons are rendered. Created in document.body when missing. */
  document?: Document;
}

export interface MenuView {
  label: string;
  click?: () => void;
  items?: MenuView[];
}

export interface MockControls {
  readonly calls: Array<{ api: string; args: unknown[] }>;
  callsTo(api: string): unknown[][];
  clearCalls(): void;
  readonly notifications: Array<{ text: string; isError: boolean }>;
  readonly storage: Map<string, string>;
  readonly volume: number;
  readonly path: string;
  /** Loads a track as if the user started it, then fires songchange and onplaypause. */
  load(
    contextUri: string,
    trackUri: string,
    options?: { paused?: boolean; positionMs?: number },
  ): void;
  setPaused(paused: boolean): void;
  setPosition(ms: number): void;
  setVolume(volume: number): void;
  /** Makes the next play request reject. */
  failNextPlay(): void;
  /** Runs a Mousetrap binding, or dispatches a keydown when Mousetrap is disabled. */
  press(combo: string): boolean;
  bindings(): string[];
  /** The right-click menu as it would show for these URIs. */
  contextMenu(uris: string[]): MenuView[];
  /** Simulates the user opening a page. */
  navigate(path: string): void;
  topbarButtons(): HTMLElement[];
  listenerCount(type?: string): number;
}

export interface SpicetifyMock {
  Spicetify: Record<string, unknown>;
  controls: MockControls;
}

export const DEMO_CATALOG: Record<string, CatalogEntry> = {
  "spotify:playlist:deepwork": {
    name: "Deep Work",
    tracks: [
      { uri: "spotify:track:grid", name: "Grid Lines" },
      { uri: "spotify:track:machinery", name: "Quiet Machinery" },
      { uri: "spotify:track:index", name: "Northern Index" },
    ],
  },
  "spotify:playlist:codingflow": {
    name: "Coding Flow",
    tracks: [
      { uri: "spotify:track:exposure", name: "Long Exposure" },
      { uri: "spotify:track:static", name: "Warm Static" },
    ],
  },
  "spotify:playlist:slowevening": {
    name: "Slow Evening",
    tracks: [
      { uri: "spotify:track:ferry", name: "Sunday Ferry" },
      { uri: "spotify:track:tea", name: "Tea at Four" },
      { uri: "spotify:track:harbour", name: "Soft Harbour" },
    ],
  },
  "spotify:album:northbound": {
    name: "Northbound Freight",
    tracks: [{ uri: "spotify:track:rails", name: "Ice on the Rails" }],
  },
  "spotify:artist:mira": { name: "Mira Solberg" },
};

export function createSpicetifyMock(options: MockOptions = {}): SpicetifyMock {
  const o = {
    os: "osx",
    playerDataShape: "item",
    playerApi: true,
    playUri: true,
    seek: true,
    topbar: true,
    topbarAttaches: true,
    playbar: true,
    contextMenu: true,
    subMenu: true,
    mousetrap: true,
    history: true,
    metadata: true,
    latencyMs: 5,
    ...options,
  } as Required<Omit<MockOptions, "catalog" | "storage" | "document">> & MockOptions;
  const doc = options.document ?? globalThis.document;
  const catalog = options.catalog ?? DEMO_CATALOG;
  const storage = options.storage ?? new Map<string, string>(Object.entries(options.seed ?? {}));
  const calls: MockControls["calls"] = [];
  const notifications: MockControls["notifications"] = [];
  const listeners = new Map<string, Set<Fn>>();
  const record = (api: string, args: unknown[]) => calls.push({ api, args });

  // ── player ───────────────────────────────────────────────────────────────
  const player = {
    contextUri: null as string | null,
    trackUri: null as string | null,
    paused: true,
    positionMs: 0,
    volume: 0.8,
    failNext: false,
  };
  const trackName = (uri: string | null) => {
    if (!uri) return undefined;
    for (const entry of Object.values(catalog)) {
      const t = entry.tracks?.find((x) => x.uri === uri);
      if (t) return t.name;
    }
    return undefined;
  };
  const emit = (type: string) => {
    for (const fn of [...(listeners.get(type) ?? [])]) (fn as (e: unknown) => void)({ type });
  };
  const loadTrack = (
    contextUri: string,
    trackUri: string | null,
    paused = false,
    positionMs = 0,
  ) => {
    player.contextUri = contextUri;
    player.trackUri = trackUri ?? catalog[contextUri]?.tracks?.[0]?.uri ?? `${contextUri}:first`;
    player.positionMs = positionMs;
    player.paused = paused;
    emit("songchange");
    emit("onplaypause");
  };
  const playRequest = (api: string, contextUri: string, opts: unknown) => {
    const skipTo = (opts as { skipTo?: { uri?: string } } | undefined)?.skipTo?.uri ?? null;
    if (player.failNext) {
      player.failNext = false;
      return Promise.reject(new Error(`${api} failed (mock)`));
    }
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        loadTrack(contextUri, skipTo);
        resolve();
      }, o.latencyMs);
    });
  };
  const pause = () => {
    if (player.paused) return;
    player.paused = true;
    emit("onplaypause");
  };

  const Player: Record<string, unknown> = {
    get data() {
      if (!player.trackUri) return null;
      const item = { uri: player.trackUri, name: trackName(player.trackUri) };
      return o.playerDataShape === "track"
        ? { track: item, context_uri: player.contextUri, is_paused: player.paused }
        : { item, context: { uri: player.contextUri }, isPaused: player.paused };
    },
    getProgress: () => {
      if (o.originLate && !player.trackUri)
        throw new TypeError("Cannot read properties of undefined (reading '_state')");
      return player.positionMs;
    },
    getVolume: () => player.volume,
    setVolume(v: number) {
      record("Player.setVolume", [v]);
      player.volume = v;
    },
    isPlaying: () => {
      if (o.originLate && !player.trackUri)
        throw new TypeError("Cannot read properties of undefined (reading '_state')");
      return !player.paused;
    },
    pause() {
      record("Player.pause", []);
      pause();
    },
    play() {
      record("Player.play", []);
      player.paused = false;
      emit("onplaypause");
    },
    addEventListener(type: string, fn: Fn) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
    },
    removeEventListener(type: string, fn: Fn) {
      listeners.get(type)?.delete(fn);
    },
  };
  if (o.seek) {
    Player.seek = (ms: number) => {
      record("Player.seek", [ms]);
      player.positionMs = ms;
    };
  }
  if (o.playUri) {
    Player.playUri = (uri: string, _ctx: unknown, opts: unknown) => {
      record("Player.playUri", [uri, opts]);
      return playRequest("Player.playUri", uri, opts);
    };
  }

  // ── platform ─────────────────────────────────────────────────────────────
  const historyListeners = new Set<(loc: { pathname: string }) => void>();
  const location = { pathname: "/" };
  const History = {
    location,
    push(path: string | { pathname: string }) {
      const pathname = typeof path === "string" ? path : path.pathname;
      record("History.push", [pathname]);
      location.pathname = pathname;
      for (const fn of [...historyListeners]) fn({ pathname });
      // Like Spicetify, re-attach every top bar button it ever created after a page change.
      if (o.topbarAttaches) doc.getElementById("nl-mock-topbar")?.append(...topbarStash);
    },
    listen(fn: (loc: { pathname: string }) => void) {
      historyListeners.add(fn);
      return () => historyListeners.delete(fn);
    },
  };
  const Platform: Record<string, unknown> = { PlatformData: { os_name: o.os } };
  if (o.history) Platform.History = History;
  if (o.playerApi) {
    Platform.PlayerAPI = {
      play(ctx: { uri: string }, _origins: unknown, opts: unknown) {
        record("PlayerAPI.play", [ctx, opts]);
        return playRequest("PlayerAPI.play", ctx.uri, opts);
      },
      async pause() {
        record("PlayerAPI.pause", []);
        pause();
      },
    };
  }
  if (o.metadata) {
    Platform.PlaylistAPI = {
      async getMetadata(uri: string) {
        const entry = catalog[uri];
        if (!entry) throw new Error("not found");
        return { name: entry.name, images: entry.image ? [{ url: entry.image }] : [] };
      },
    };
  }

  const Definitions = {
    getAlbum: { name: "getAlbum" },
    queryArtistOverview: { name: "queryArtistOverview" },
  };
  const GraphQL = {
    Definitions,
    async Request(def: unknown, vars: { uri: string; locale?: string }) {
      record("GraphQL.Request", [vars]);
      const entry = catalog[vars.uri];
      if (!entry) throw new Error("not found");
      const sources = entry.image ? [{ url: entry.image }] : [];
      if (def === Definitions.getAlbum)
        return { data: { albumUnion: { name: entry.name, coverArt: { sources } } } };
      return {
        data: {
          artistUnion: { profile: { name: entry.name }, visuals: { avatarImage: { sources } } },
        },
      };
    },
  };

  // ── buttons ──────────────────────────────────────────────────────────────
  const container = (id: string) => {
    let el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement("div");
      el.id = id;
      doc.body.appendChild(el);
    }
    return el;
  };
  // Like Spicetify's Topbar.Button: a wrapper <div> with a <button>, no register/deregister,
  // and kept in a stash that is re-attached after every page change.
  const topbarStash = new Set<HTMLElement>();
  class MockTopbarButton {
    element: HTMLDivElement;
    button: HTMLButtonElement;
    constructor(label: string, icon: string, onClick: (self: unknown) => void, disabled = false) {
      record("Topbar.Button", [label]);
      this.element = doc.createElement("div");
      this.element.className = "spicetify-topbar-button";
      this.button = doc.createElement("button");
      this.button.type = "button";
      this.button.disabled = disabled;
      this.button.addEventListener("click", () => onClick(this));
      this.element.appendChild(this.button);
      this.label = label;
      this.icon = icon;
      topbarStash.add(this.element);
      if (o.topbarAttaches) container("nl-mock-topbar").appendChild(this.element);
    }
    set label(value: string) {
      this.button.setAttribute("aria-label", value);
      this.button.title = value;
    }
    get label() {
      return this.button.getAttribute("aria-label") ?? "";
    }
    set icon(value: string) {
      this.button.innerHTML = value;
    }
    get icon() {
      return this.button.innerHTML;
    }
  }

  // Like Spicetify's Playbar.Button, which does have register/deregister.
  const makeButtonClass = (containerId: string, api: string) =>
    class MockButton {
      element: HTMLButtonElement;
      constructor(label: string, icon: string, onClick: (self: unknown) => void, disabled = false) {
        record(api, [label]);
        this.element = doc.createElement("button");
        this.element.type = "button";
        this.element.className = "nl-mock-button";
        this.element.disabled = disabled;
        this.element.addEventListener("click", () => onClick(this));
        this.label = label;
        this.icon = icon;
        this.register();
      }
      set label(value: string) {
        this.element.setAttribute("aria-label", value);
        this.element.title = value;
      }
      get label() {
        return this.element.getAttribute("aria-label") ?? "";
      }
      set icon(value: string) {
        this.element.innerHTML = value;
      }
      get icon() {
        return this.element.innerHTML;
      }
      register() {
        container(containerId).appendChild(this.element);
      }
      deregister() {
        this.element.remove();
      }
    };

  // ── context menu ─────────────────────────────────────────────────────────
  type Entry = {
    kind: "item" | "sub";
    name: string;
    onClick?: Fn;
    items?: Entry[];
    shouldAdd?: (u: string[]) => boolean;
  };
  const menu = new Set<Entry>();
  class Item implements Entry {
    kind = "item" as const;
    constructor(
      public name: string,
      public onClick: Fn,
      public shouldAdd: (u: string[]) => boolean = () => true,
    ) {}
    register() {
      menu.add(this);
    }
    deregister() {
      menu.delete(this);
    }
  }
  class SubMenu implements Entry {
    kind = "sub" as const;
    items: Entry[];
    constructor(
      public name: string,
      items: Iterable<Entry>,
      public shouldAdd: (u: string[]) => boolean = () => true,
    ) {
      this.items = [...items];
    }
    register() {
      menu.add(this);
    }
    deregister() {
      menu.delete(this);
    }
  }

  // ── shortcuts ────────────────────────────────────────────────────────────
  const bindings = new Map<string, (e: KeyboardEvent) => unknown>();
  const Mousetrap = {
    bind(keys: string | string[], fn: (e: KeyboardEvent) => unknown) {
      for (const k of [keys].flat()) bindings.set(k, fn);
    },
    unbind(keys: string | string[]) {
      for (const k of [keys].flat()) bindings.delete(k);
    },
  };

  // The Cosmos endpoint Spicetify's own Bookmark extension uses for playlist names.
  const CosmosAsync = {
    async get(url: string) {
      record("CosmosAsync.get", [url]);
      const match = /^sp:\/\/core-playlist\/v1\/playlist\/(.+)\/metadata$/.exec(url);
      const entry = match ? catalog[match[1] as string] : undefined;
      if (!entry) throw new Error("not found");
      return { metadata: { name: entry.name, picture: entry.image ?? "" } };
    },
  };

  const Spicetify: Record<string, unknown> = {
    Player,
    Platform,
    GraphQL,
    CosmosAsync,
    Locale: { getLocale: () => "en" },
    LocalStorage: {
      get: (k: string) => storage.get(k) ?? null,
      set: (k: string, v: string) => void storage.set(k, v),
      remove: (k: string) => void storage.delete(k),
    },
    showNotification(text: string, isError = false) {
      notifications.push({ text, isError });
    },
  };
  if (o.topbar) Spicetify.Topbar = { Button: MockTopbarButton };
  if (o.playbar)
    Spicetify.Playbar = { Button: makeButtonClass("nl-mock-playbar", "Playbar.Button") };
  if (o.contextMenu) Spicetify.ContextMenu = o.subMenu ? { Item, SubMenu } : { Item };
  if (o.mousetrap) Spicetify.Mousetrap = Mousetrap;

  const view = (e: Entry, uris: string[]): MenuView =>
    e.kind === "sub"
      ? { label: e.name, items: (e.items ?? []).map((i) => view(i, uris)) }
      : { label: e.name, click: () => (e.onClick as (u: string[]) => void)?.(uris) };

  const controls: MockControls = {
    calls,
    callsTo: (api) => calls.filter((c) => c.api === api).map((c) => c.args),
    clearCalls: () => void calls.splice(0),
    notifications,
    storage,
    get volume() {
      return player.volume;
    },
    get path() {
      return location.pathname;
    },
    load: (ctx, track, opts = {}) =>
      loadTrack(ctx, track, opts.paused ?? false, opts.positionMs ?? 0),
    setPaused(paused) {
      if (player.paused === paused) return;
      player.paused = paused;
      emit("onplaypause");
    },
    setPosition(ms) {
      player.positionMs = ms;
    },
    setVolume(v) {
      player.volume = v;
    },
    failNextPlay() {
      player.failNext = true;
    },
    press(combo) {
      const fn = bindings.get(combo);
      if (fn) {
        fn({ preventDefault() {} } as KeyboardEvent);
        return true;
      }
      if (o.mousetrap) return false;
      const parts = combo.split("+");
      const key = parts.pop() ?? "";
      const mac = o.os === "osx";
      const event = new KeyboardEvent("keydown", {
        key,
        code: /^\d$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
        metaKey: mac && parts.includes("mod"),
        ctrlKey: !mac && parts.includes("mod"),
        altKey: parts.includes("alt"),
        shiftKey: parts.includes("shift"),
        bubbles: true,
        cancelable: true,
      });
      return !doc.defaultView?.dispatchEvent(event);
    },
    bindings: () => [...bindings.keys()],
    contextMenu: (uris) =>
      [...menu].filter((e) => e.shouldAdd?.(uris) ?? true).map((e) => view(e, uris)),
    navigate: (path) => History.push(path),
    // Visible buttons only: a removed Topbar.Button may be re-attached, hidden.
    topbarButtons: () =>
      [
        ...doc.querySelectorAll<HTMLElement>("#nl-mock-topbar button, #nl-mock-playbar button"),
      ].filter((b) => b.closest<HTMLElement>(".spicetify-topbar-button")?.style.display !== "none"),
    listenerCount: (type) =>
      type
        ? (listeners.get(type)?.size ?? 0)
        : [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };

  return { Spicetify, controls };
}
