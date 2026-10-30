# Nordlys: architecture proposal

Status: **approved and implemented in v0.1**. The proposal is kept below as written; the section right after this one lists every place where the implementation differs from it.

This document covers the repo structure, package boundaries, the core API, the plugin lifecycle, standalone vs shared builds, the event bus, the styling contract, storage and migrations, and tooling. Section 10 lists where the original idea was trimmed for a first version.

## Implementation notes (v0.1)

Decisions on the open questions (section 14):

- **Items can be in several spaces.** "Add to space" adds; the panel's **⋯** menu moves or removes.
- **The window tint is off by default.**
- **Naming:** packages are `@nordlys/*`, files `nordlys-*.js`, CSS prefix `nl-`.
- **The v0.1 prototype file wasn't in the repo,** so the port follows this document, the "Your spaces" prototype and the sketch in the design study. The version 0 → 1 migration reads the sketch's shape from `nordlys:spaces`; check it against `reference/nordlys-spaces.js` once that file is added (`plugins/spaces/src/model/migrations.ts`, marked TODO).

Where the code differs from the proposal:

- **Metadata adapter added** (`ctx.metadata`). The right-click menu only gives URIs, so names and covers are looked up once when an item is added (`PlaylistAPI.getMetadata`, GraphQL `getAlbum` / `queryArtistOverview`), never while drawing. If the lookup fails, the item shows "Playlist"/"Album"/"Artist" and the name is retried the next time the panel opens.
- **`SwitchResult`** has `reason: "failed"` instead of `"playback-failed"`. When playback can't resume, the switch still succeeds with `resumed: false`; `"failed"` means the switch itself threw.
- **`ui.button`** instead of `ui.topbarButton`, because it falls back to a player bar button. **`ui.contextSubmenu`** takes `items()` and returns a handle with `refresh()`, because Spicetify menus can't compute items lazily.
- **Snapshots are also saved every 15 s while playing,** so a crash or force-quit loses little. `beforeunload` isn't reliable in Spotify.
- **The popover opens below the whole top bar** (found with `.Root__globalNav` or a `header`), not just below the button.
- **Bundle size:** `nordlys-spaces.js` is about 86 KB unminified. The core is about 34 KB of that, well over the 10–15 KB estimate, mostly because every adapter carries its fallbacks and log messages. The rest is Spaces itself (about 21 KB), its panel (17 KB), CSS (10 KB) and icons (2 KB). It is left readable on purpose; a second plugin adds another copy of the core, which is still small for a local file.
- **Themes arrived in v0.1:** Nordlys Codex and the Nordlys Spaces theme (`themes/`), plus `packages/theme-kit` (shared platform rules) and `npm run new:theme --`. The theme for the Spaces look lives in `themes/spaces-theme` so it doesn't share a name with the plugin.
- **npm instead of pnpm.** Pinning a pnpm version made an already-installed pnpm try to switch versions and fail, and pnpm wasn't needed for anything npm can't do.
- **The Spicetify Panel API (right sidebar) is still planned for v1.1** and not built.

---

## 0. Summary

- **Every plugin bundles the core.** There is no separate "core extension" that users must install first. The Marketplace has no way to say "this extension needs that one", so a required core file would break installs. Section 4 covers this.
- When several Nordlys plugins are installed, their copies of the core **find each other through one global handshake object** (`window.__nordlys`). They share only two things: the event bus and the plugin registry. Everything else in the core holds no shared state, so having two copies of it costs only bytes.
- **Plugins cannot touch `Spicetify`.** The type checker and a boundary check both enforce this. All version-dependent calls go through core adapters that detect what is available and log a fallback once.
- **Every plugin is cleaned up by construction.** Each listener, DOM node, style, shortcut, menu item and bus subscription created through `ctx` is tracked and removed on teardown. The `setup` function only returns a teardown for anything extra it did by hand.
- **Plain DOM, not Spotify's React,** for plugin UI. React would tie us to whichever React version Spotify ships. Plain DOM is easy to test in happy-dom and simple to clean up.
- **Spaces v1:** top bar button and popover panel, "Add to space" context submenu, ⌘⌥/Ctrl+Alt 1–9, versioned storage, and the public commands `spaces.list`, `spaces.current` and `spaces.switchTo`.
- **Tooling:** npm workspaces, esbuild driven by our own small build script, TypeScript strict, Vitest with happy-dom, Playwright, Biome, Changesets.

---

## 1. Folder tree

```
.
├─ packages/
│  ├─ core/                     @nordlys/core: the core API. Never shipped on its own.
│  │  ├─ src/
│  │  │  ├─ index.ts            public exports: definePlugin, start, types
│  │  │  ├─ plugin.ts           definePlugin, start, PluginContext, disposables
│  │  │  ├─ host.ts             window.__nordlys handshake, registry, protocol version
│  │  │  ├─ bus.ts              typed events and commands
│  │  │  ├─ storage.ts          namespaced, versioned store with migrations
│  │  │  ├─ log.ts              prefixed logger, warnOnce, ring buffer
│  │  │  ├─ platform.ts         OS detection, shortcut labels (⌘⌥ vs Ctrl+Alt)
│  │  │  ├─ ui/                 topbar, popover, context-menu, shortcuts, styles, toast, h()
│  │  │  └─ compat/             the ONLY code that reads the Spicetify global
│  │  │     ├─ spicetify.ts     narrow, all-optional types and the getSpicetify() accessor
│  │  │     ├─ ready.ts         waitForSpicetify() with timeout and feature report
│  │  │     ├─ player.ts        state, play/resume, seek, volume, events
│  │  │     ├─ navigation.ts    History push/listen, uri → path
│  │  │     ├─ topbar.ts        Topbar.Button → Playbar.Button → none
│  │  │     ├─ context-menu.ts  SubMenu → flat Items → none
│  │  │     ├─ shortcuts.ts     Mousetrap → keydown listener
│  │  │     └─ panel.ts         Spicetify.Panel (right sidebar), optional, phase 2
│  │  └─ test/
│  └─ spicetify-mock/           @nordlys/spicetify-mock: reusable fake Spicetify (dev only)
│     ├─ src/                   createSpicetifyMock(options) → { Spicetify, controls }
│     └─ harness/               harness.html and mock.iife.js for Playwright
├─ plugins/
│  └─ spaces/                   @nordlys/spaces → nordlys-spaces.js
│     ├─ src/
│     │  ├─ entry.ts            bundle entry: start(spaces)
│     │  ├─ plugin.ts           definePlugin({...}), wiring only
│     │  ├─ api.ts              public, type-only contract (events, commands, SpaceInfo)
│     │  ├─ model/              schema.ts, state.ts (pure reducers), migrations.ts
│     │  ├─ switcher.ts         the switching algorithm, depends only on adapter interfaces
│     │  ├─ snapshot.ts         "played in this space" tracking
│     │  ├─ presets.ts          the 6 colors from the prototype and the icon set
│     │  ├─ ui/                 panel.ts, space-editor.ts, context-menu.ts, tint.ts
│     │  ├─ icons/              bundled SVGs (target, cup, moon, bolt, book, leaf…)
│     │  └─ styles.css
│     ├─ test/                  unit tests and the Playwright smoke spec
│     ├─ preview.png            Marketplace card image
│     ├─ README.md              install steps for macOS and Windows
│     └─ CHANGELOG.md           written by Changesets
├─ themes/                      empty for now (README only), see section 10
├─ reference/
│  └─ nordlys-spaces.js         your v0.1 prototype (you add it), behavior reference only
├─ tools/
│  ├─ build.ts                  esbuild driver: one IIFE per plugin, watch mode
│  ├─ dev.ts                    find userdata, copy/link, enable/disable, watch
│  └─ check-boundaries.ts       no cross-plugin runtime imports, no Spicetify in plugins
├─ docs/                        architecture.md, styling-contract.md, dev-loop.md
├─ .changeset/
├─ .github/workflows/           ci.yml, release.yml
├─ manifest.json                Marketplace manifest, an array with one entry per plugin/theme
├─ biome.json
├─ tsconfig.base.json
├─ package-lock.json
└─ package.json
```

Later, not now: `apps/hub/` (custom app) and `themes/<name>/`.

## 2. Package boundaries

| Package                   | May import                                                 | Never imports                              | Ships as                   |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------ | -------------------------- |
| `@nordlys/core`           | nothing at runtime                                         | plugins                                    | bundled inside each plugin |
| `@nordlys/spicetify-mock` | core types                                                 | plugins                                    | dev only                   |
| `@nordlys/<plugin>`       | `@nordlys/core`; `import type` from `@nordlys/<other>/api` | another plugin's runtime code, `Spicetify` | `nordlys-<plugin>.js`      |
| themes                    | nothing (CSS + `color.ini`)                                | —                                          | `user.css`, `color.ini`    |

How each rule is enforced:

- **No `Spicetify` in plugins.** The core reads the global through `getSpicetify()` and never declares it with `declare global`. A plugin that writes `Spicetify.Player` gets a type error. `check-boundaries.ts` also catches `window.Spicetify` and `globalThis.Spicetify`.
- **No runtime imports across plugins.** `check-boundaries.ts` fails CI if one plugin imports another unless the import is `import type … from "@nordlys/<x>/api"`. A type-only import disappears when compiled, so it creates no runtime coupling.

## 3. Core API surface

```ts
// ── lifecycle ────────────────────────────────────────────────────────────────
export type Teardown = () => void | Promise<void>;

export interface PluginDefinition {
  id: string; // "spaces": used for storage keys, CSS, logs
  name: string; // "Spaces"
  version: string; // injected at build time
  setup(ctx: PluginContext): void | Teardown | Promise<void | Teardown>;
}
export function definePlugin(def: PluginDefinition): PluginDefinition;
export function start(
  def: PluginDefinition,
  opts?: { spicetify?: SpicetifyLike },
): Promise<RunningPlugin>;

export interface RunningPlugin {
  readonly id: string;
  readonly version: string;
  stop(): Promise<void>; // runs the teardown, then every tracked disposable (in reverse order)
}

// ── context ──────────────────────────────────────────────────────────────────
export interface PluginContext {
  readonly id: string;
  readonly log: Logger;
  readonly signal: AbortSignal; // aborted on stop; pass it to addEventListener
  onDispose(fn: Teardown): void;

  readonly bus: Bus;
  readonly storage: StorageApi;
  readonly ui: UiApi;
  readonly player: PlayerAdapter;
  readonly nav: NavigationAdapter;
  readonly platform: PlatformInfo;
  readonly features: FeatureReport;
}

// ── logger ───────────────────────────────────────────────────────────────────
export interface Logger {
  debug(...a: unknown[]): void; // printed only when localStorage "nordlys:debug" = "1"
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
  warnOnce(key: string, ...a: unknown[]): void; // used for "feature X missing, using fallback Y"
}

// ── platform ─────────────────────────────────────────────────────────────────
export interface PlatformInfo {
  os: "mac" | "windows" | "linux"; // PlatformData.os_name, falling back to userAgent
  formatShortcut(combo: string): string; // "mod+alt+1" → "⌘⌥1" | "Ctrl+Alt+1"
}

// ── storage ──────────────────────────────────────────────────────────────────
export interface StoreSpec<T> {
  key: string; // saved as "nordlys:<pluginId>:<key>"
  version: number; // current schema version
  defaults(): T;
  migrations?: Record<number, (prev: unknown) => unknown>; // n → n+1, applied in order
  legacyKeys?: string[]; // read as version 0 if the main key is missing
  validate(data: unknown): data is T;
}
export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(fn: (prev: T) => T): void;
  subscribe(fn: (next: T) => void): () => void; // tracked by ctx
}
export interface StorageApi {
  define<T>(spec: StoreSpec<T>): Store<T>;
}

// ── ui (only what Spaces needs) ──────────────────────────────────────────────
export interface UiApi {
  addStyle(css: string): void; // <style data-nl-plugin="<id>">
  topbarButton(o: {
    label: string;
    icon: string;
    onClick(anchor: HTMLElement): void;
  }): ButtonHandle | null;
  popover(anchor: HTMLElement, render: (close: () => void) => HTMLElement): PopoverHandle; // flips and clamps to the viewport
  contextSubmenu(o: {
    label: string;
    when(uris: string[]): boolean; // e.g. only playlist/album/artist
    items(uris: string[]): Array<{ label: string; onClick(): void }>;
  }): void;
  shortcut(combo: string, fn: () => void): void; // "mod+alt+1"
  toast(message: string, o?: { error?: boolean }): void; // Spicetify.showNotification
}

// ── adapters ─────────────────────────────────────────────────────────────────
export interface PlayerState {
  contextUri: string | null;
  trackUri: string | null;
  positionMs: number;
  isPaused: boolean;
}
export interface PlayerAdapter {
  getState(): PlayerState; // reads data.item ?? data.track, and so on
  play(target: { contextUri: string; trackUri?: string; positionMs?: number }): Promise<boolean>;
  pause(): Promise<void>;
  getVolume(): number; // 0..1
  setVolume(v: number): Promise<void>;
  fadeVolume(to: number, ms: number, signal?: AbortSignal): Promise<void>;
  onSongChange(fn: (s: PlayerState) => void): () => void;
  onPlayPause(fn: (s: PlayerState) => void): () => void;
}
export interface NavigationAdapter {
  currentPath(): string;
  go(path: string): void;
  pathForUri(uri: string): string | null; // spotify:playlist:x → /playlist/x
  onChange(fn: (path: string) => void): () => void;
}
export type FeatureReport = Readonly<
  Record<
    | "playerApiPlay"
    | "playUri"
    | "topbar"
    | "playbarButton"
    | "contextSubmenu"
    | "mousetrap"
    | "panel",
    boolean
  >
>;
```

What each adapter tries, in order (the fallback is logged once):

| Need            | First choice                                                                          | Fallback                                           | Last resort                                 |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| Current track   | `Player.data.item`                                                                    | `Player.data.track`                                | `null`                                      |
| Play at a track | `Platform.PlayerAPI.play({uri}, {}, {skipTo:{uri}})`                                  | `Player.playUri(ctx, {}, {skipTo})`                | `Player.playUri(ctx)` then seek             |
| Seek after load | wait for a `songchange` with the matching track URI (2 s timeout), then `Player.seek` | fixed 300 ms delay                                 | skip the seek                               |
| Top bar entry   | `Topbar.Button`                                                                       | `Playbar.Button`                                   | shortcuts only, with a toast explaining why |
| Context menu    | `ContextMenu.SubMenu`                                                                 | flat `ContextMenu.Item` per space ("Add to Focus") | none                                        |
| Shortcuts       | `Mousetrap.bind`                                                                      | `keydown` on `window`                              | —                                           |
| Navigation      | `Platform.History`                                                                    | —                                                  | —                                           |

## 4. Standalone vs shared core

**Decision: every plugin bundle is standalone.** The core is compiled into each `nordlys-<plugin>.js`. I expect the core to be about 10–15 KB unminified, so shipping it more than once doesn't matter.

**The handshake.** On boot, each copy of the core does this:

```ts
interface NordlysHost {
  protocol: 1; // bumped only for breaking changes to this object
  coreVersions: string[]; // every core version that joined (for diagnostics)
  bus: HostBus; // the one shared bus
  plugins: Map<string, { version: string; stop(): Promise<void> }>;
  logs: LogEntry[]; // shared ring buffer, last 200 entries
}
// window.__nordlys ??= createHost();  (the first copy wins)
```

**What happens when two plugins each bundle the core:**

| Case                                                       | Result                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spaces and Timer, same protocol                            | The second copy finds `window.__nordlys` and joins it. Both plugins use one bus, so `spaces.switchTo` from Timer works.                             |
| Same protocol, different core versions                     | Works. The shared object is frozen per protocol, so changes inside a protocol are only additions.                                                   |
| Different protocol                                         | The newer copy creates `window.__nordlys_p2` and logs a warning that the two can't talk until both are updated. Each plugin still works on its own. |
| The same plugin loaded twice (Marketplace and manual copy) | The second `start()` sees the id in `plugins`, logs "already running v…", and does nothing.                                                         |
| Load order                                                 | Doesn't matter. Commands that aren't registered yet fail with `NoHandlerError`, and callers can wait for the `nordlys:plugin-ready` event.          |

The only code that must stay stable for a long time is the host object and the bus protocol. Everything else can change in any release.

A separate shared `nordlys-core.js` (plugins with the core marked external) could be added later if there are ever enough plugins for the bytes to matter. It isn't needed now. See section 10.

## 5. Event bus contract

```ts
// In core: empty registries that plugins extend through declaration merging.
export interface NordlysEvents {
  "nordlys:plugin-ready": { id: string; version: string };
  "nordlys:plugin-stopped": { id: string };
}
export interface NordlysCommands {}

export interface Bus {
  emit<K extends keyof NordlysEvents>(type: K, payload: NordlysEvents[K]): void;
  on<K extends keyof NordlysEvents>(type: K, fn: (p: NordlysEvents[K]) => void): () => void;
  handle<K extends keyof NordlysCommands>(name: K, fn: NordlysCommands[K]): () => void;
  call<K extends keyof NordlysCommands>(
    name: K,
    ...args: Parameters<NordlysCommands[K]>
  ): Promise<Awaited<ReturnType<NordlysCommands[K]>>>; // throws NoHandlerError if none
  has(name: keyof NordlysCommands): boolean;
}
```

Rules:

1. **Names.** Events are `<plugin>:<past-tense>` (`spaces:changed`). Commands are `<plugin>.<verb>` (`spaces.switchTo`). Each command has exactly one handler, and a second `handle` throws.
2. **Payloads are plain JSON data:** no functions, DOM nodes or class instances. The sender and receiver may be built from different core versions.
3. **Changes are additive within a major version.** For a breaking change, add a new name (`spaces:changed.v2`) and keep sending the old one for at least one release.
4. **Errors stay contained.** A listener that throws is logged and doesn't stop the other listeners. `call` always returns a promise.
5. **Subscriptions are tracked by `ctx`** and removed on stop.

Spaces' public contract lives in `plugins/spaces/src/api.ts`, which contains types only:

```ts
export interface SpaceInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  accent: string;
  index: number;
}
export type SwitchResult =
  | { ok: true; resumed: boolean }
  | { ok: false; reason: "unknown-space" | "already-current" | "superseded" | "failed" };

declare module "@nordlys/core" {
  interface NordlysEvents {
    "spaces:changed": { from: SpaceInfo | null; to: SpaceInfo };
    "spaces:updated": { spaces: SpaceInfo[] }; // after create, edit, delete or reorder
  }
  interface NordlysCommands {
    "spaces.list": () => SpaceInfo[];
    "spaces.current": () => SpaceInfo | null;
    "spaces.switchTo": (idOrName: string) => Promise<SwitchResult>;
  }
}
```

**The Focus timer test.** A future timer plugin does `import type {} from "@nordlys/spaces/api"`, lets the user pick a space from `await ctx.bus.call("spaces.list")`, and at the end of a session calls `ctx.bus.call("spaces.switchTo", id)` inside `if (ctx.bus.has("spaces.switchTo"))`. Spaces never learns the timer exists. To prove this works now without building the timer, step 2 adds an integration test and a Playwright check with a **test-only fixture plugin**, built as its own IIFE, that switches spaces over the bus. It runs against two separately bundled copies of the core.

## 6. Styling contract (what themes MAY use)

Plugins never require a theme. The plugin's own CSS uses Spicetify's standard color variables (`--spice-main`, `--spice-card`, `--spice-text`, `--spice-subtext`, `--spice-button`), which exist with stock Spotify and with every Marketplace theme. This is why the UI fits whatever theme is installed.

**On `<html>`** (set by Spaces, removed on teardown):

| Attribute             | Example                           | Meaning                                                                  |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `data-nl-space`       | `"focus"`                         | id of the current space                                                  |
| `data-nl-space-color` | `"fjord"`                         | color preset key. More useful to themes than the id, which users create. |
| `data-nl-switching`   | present while a switch runs       | lets themes animate the change                                           |
| `data-nl-tint`        | present when tinting is on        | lets themes switch off or replace the built-in tint                      |
| `data-nl-os`          | `"mac"` / `"windows"` / `"linux"` | set by the core                                                          |

**CSS custom properties on `:root`:**

| Property                        | Example                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `--nl-space-accent`             | `#8ed6e3`                                                    |
| `--nl-space-accent-rgb`         | `142, 214, 227` (for `rgba(var(--nl-space-accent-rgb), .2)`) |
| `--nl-space-on-accent`          | `#111` (readable text on the accent)                         |
| `--nl-space-g1` / `-g2` / `-g3` | the three glow colors from the preset                        |
| `--nl-space-base`               | the darkest preset color (`g0` in the prototype)             |

**Stable class names** (BEM-ish, prefixed): `.nl-spaces-panel`, `.nl-spaces-switcher`, `.nl-space-btn`, `.nl-space-btn--active`, `.nl-spaces-item`, `.nl-spaces-editor`, `.nl-popover`, `.nl-scroll`. Anything not listed in `docs/styling-contract.md` is internal and may change.

**The optional window tint** (Spaces setting, theme-independent) is one `position: fixed; inset: 0; pointer-events: none` layer. It uses a radial gradient of `--nl-space-g1/g2` at low opacity with `mix-blend-mode: soft-light`. It doesn't depend on any Spotify class name, so a Spotify update can't break it, and themes can turn it off with `html[data-nl-tint] .nl-tint { display: none }`.

**Platform rules that apply to plugin UI:**

- Nothing is ever placed in the top corners. The button is placed by Spotify through `Topbar.Button`, and popovers open below their anchor and are clamped to the viewport.
- No `-webkit-app-region` anywhere.
- The UI uses Spotify's own font (`font-family: inherit`), which Spotify ships on both OSes. Plugins don't load fonts; themes do.
- Scrollbars are styled explicitly on `.nl-scroll`.
- Shortcut hints go through `platform.formatShortcut`.

## 7. Storage and migrations

- **Key:** `nordlys:<pluginId>:<key>` in `Spicetify.LocalStorage`, for example `nordlys:spaces:state`.
- **Envelope:** `{ "v": 1, "data": { … } }`.
- **Load:**
  1. Read the key. If it's missing, try `legacyKeys` (the v0.1 prototype's key) and treat that as version 0.
  2. If `v < current`, save a **backup** to `…:backup.v<n>`, apply `migrations[v]`, `migrations[v+1]`, and so on, then validate and save.
  3. If `v > current` (a downgrade), **don't overwrite**. Use the data read-only if it validates, otherwise use defaults, and show one toast.
  4. If the JSON is corrupt or validation fails, back up the raw string, use defaults and show one toast.
- Migrations are pure functions and are unit-tested one by one with fixture JSON.
- **When Spaces saves:** on any state change, on `songchange` and `onplaypause` (snapshot), and on `beforeunload`. It never saves on every progress tick.

The Spaces v1 schema:

```ts
interface SpacesStateV1 {
  currentId: string;
  playedIn: string | null; // the space whose music is loaded in the player
  settings: { musicPerSpace: boolean; crossfadeMs: number; tint: boolean };
  spaces: Array<{
    id: string;
    name: string;
    icon: IconId;
    color: ColorPresetId;
    items: Array<{
      uri: string;
      kind: "playlist" | "album" | "artist";
      name: string;
      image: string | null;
    }>;
    lastPath: string | null;
    snapshot: { contextUri: string; trackUri: string; positionMs: number; savedAt: number } | null;
  }>;
}
```

Item names and images are **captured when the item is added** (from the context menu or the current page) and refreshed best-effort later. The panel never depends on `PlaylistAPI.getMetadata` or GraphQL at render time.

## 8. Spaces: switching behavior

```
switchTo(id):
  if a switch is running → remember id as "pending" and return "superseded" for the older one
  set data-nl-switching
  if musicPerSpace:
     if playedIn === current → save snapshot (context, track, position)
     vol = getVolume()
     try:
        if playing → fadeVolume(0, crossfade/2)
        apply UI (current, CSS vars, data attributes, navigate to lastPath)   ← at the fade midpoint, like the prototype
        if target.snapshot:
            play(snapshot) → wait for songchange → seek
            if the user was paused before the switch → pause again (load at volume 0, so you don't hear a blip)
            playedIn = target
        else → pause (prototype: "Nothing has played here yet")
        if it was playing → fadeVolume(vol, crossfade/2)
     finally: setVolume(vol)                                                  ← always restore
  else:
     apply UI only
  clear data-nl-switching, emit spaces:changed, run any pending switch
```

`playedIn` updates whenever playback starts or the track changes while a space is current. That covers rule 1 ("only save if the music was actually played in that space") and survives restarts.

## 9. Tooling

| Tool                                      | Why                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **npm** workspaces                        | Comes with Node, so contributors install nothing else. (v0.1 started on pnpm, whose version pinning clashed with an existing pnpm install; the boundary check covers what pnpm's stricter `node_modules` added.) |
| **esbuild** with our own `tools/build.ts` | One IIFE per plugin with CSS imported as text, `define` for version and debug flags, and watch mode, all in about 80 lines we fully control.                                                                     |
| `spicetify-creator`: **not used**         | It brings its own templates and config, assumes one extension per project, doesn't support our standalone-plus-handshake layout, and is only lightly maintained. Nothing it does is hard to do with esbuild.     |
| **TypeScript strict**                     | Also `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`. `tsc -b` with project references, used for type checking only.                                                         |
| **Vitest + happy-dom**                    | Fast, uses esbuild under the hood like our build, and has fake timers for fade and crossfade tests.                                                                                                              |
| **Playwright** (Chromium)                 | Spotify's desktop app runs on Chromium (CEF), so this is the closest browser we can test in. It runs the built `.js` against the mock harness at 100%, 125% and 150% `deviceScaleFactor`.                        |
| **Biome**                                 | One fast tool for lint and format, with no ESLint plus Prettier setup to maintain.                                                                                                                               |
| **Changesets**                            | Per-package versions and CHANGELOGs. It also handles private (not on npm) packages and tags each release.                                                                                                        |
| Release output                            | **Readable, not minified** bundles with a version banner. People audit extensions before installing them, and the bundles are small.                                                                             |

## 10. Pushback: what I'd cut or change for v1

1. **No separate core extension.** A shared `nordlys-core.js` that users install first can't be expressed on the Marketplace, and it fails silently when it's missing. Bundling the core plus the `window.__nordlys` handshake gives you plugins that work alone and still talk to each other when installed together.
2. **The UI helpers are only what Spaces uses:** top bar button, popover, context submenu, shortcuts, styles and toast. There's no generic component library until a second plugin needs one.
3. **No metadata adapters in the render path.** `PlaylistAPI.getMetadata` and GraphQL are the APIs that change most between versions. Spaces stores the name and image when an item is added, and refreshing them later is best-effort.
4. **Themes: no tooling yet.** The `themes/` folder and the styling contract doc are enough until the first theme. Theme build tooling is easy to add later because themes are just `user.css` and `color.ini`.
5. **The hub custom app waits.** Until it exists, settings live in the Spaces panel, and `window.__nordlys.plugins` already gives the hub what it will need later.
6. **The dev script copies files by default** and only links with `--link`. File symlinks on Windows need Developer Mode or admin rights. Copying on every rebuild works everywhere, and `spicetify watch -e` notices the change either way.
7. **Feature detection runs once at boot** and produces one `FeatureReport`, rather than probing on every call.
8. **Max 9 spaces**, so every space has a shortcut. The prototype allows 6.

## 11. A closer match to the prototype's sidebar

Spotify's left library column has **no official Spicetify API**. Adding a switcher strip there means guessing Spotify's DOM, and that's the fragility you already avoided. The robust option is on the right:

- **`Spicetify.Panel.registerPanel`** (an official Spicetify API for the right sidebar, the same place as Now Playing View and Queue). It renders our own content inside Spotify's panel frame, which Spotify sizes, resizes and keeps open. A "Spaces" panel there could hold the switcher, the current space's items, and the "Other spaces" card, which is close to the prototype but on the right. The trade-off is that only one right-sidebar panel shows at a time, so it competes with Now Playing View.
- **Plan:** v1 ships the top bar popover, which works on every version. v1.1 adds "Open as sidebar panel" when `features.panel` is true. The panel API expects React children, so the adapter gives it a tiny React wrapper element that mounts our plain-DOM panel. React stays inside that one adapter.
- **Left-sidebar strip** (only if you really want it): an opt-in "experimental" setting with a list of known selectors per version. It turns itself off after it fails to mount and falls back to the top bar. I wouldn't build it for v1.

I couldn't open the Spicetify docs from this environment (`spicetify.app` is blocked by the network policy). The Panel API details above come from search results that quote those docs, so I haven't confirmed which Spicetify version introduced it.

## 12. Distribution

- **Marketplace (current rules):** the repo must be **public**, have the topic `spicetify-extensions` (and later `spicetify-themes`), and have a root `manifest.json`. The manifest may be an **array** with one object per extension or theme. Extensions need `name`, `description`, `preview`, `main` and `readme`, plus optional `branch`, `authors` and `tags`. Themes need `usercss` and `schemes` instead of `main`.
- **Built files must be in git** for the Marketplace to fetch them. I propose a **`dist` branch** that the release workflow updates with the built `.js`, its README and its preview, and each manifest entry sets `"branch": "dist"`. This keeps build output out of `main`. _To verify:_ I believe the Marketplace reads `readme` and `preview` from that same branch, which is why they get copied there. I'll confirm this against the Marketplace source before relying on it.
- **Manual install:** download `nordlys-spaces.js` from the GitHub Release, copy it into `Extensions/`, then run `spicetify config extensions nordlys-spaces.js` and `spicetify apply`.
- **CI** (`ci.yml`, every push and PR): Biome check, typecheck, Vitest, build and boundary check on **Ubuntu, macOS and Windows**, so the build and dev tooling are tested on both target OSes. Playwright smoke runs on Ubuntu.
- **Release** (`release.yml`): the Changesets action opens a "Version packages" PR. When it's merged, the workflow builds, tags `spaces@x.y.z`, creates a GitHub Release with the `.js` attached, and updates the `dist` branch.

## 13. What can and can't be verified

- **Mock only:** all playback behavior (resume, seek timing, fades, Premium vs Free limits), Topbar/ContextMenu/Panel rendering, and every compatibility fallback. The mock models the API differences I know about, but it can't prove that Spotify behaves the same way.
- **Not verifiable here:** real Spotify on macOS and Windows, real 125%/150% Windows scaling (Playwright's `deviceScaleFactor` approximates it), and how the tint looks on top of other Marketplace themes. I'll write a short manual QA checklist for you to run on both OSes before each release.
- **Known risk:** on Windows layouts with AltGr (Norwegian, German and others), Ctrl+Alt+digit is how you type `{ [ ] }`. Mousetrap ignores text fields, so typing is safe, but the shortcut may still fire outside inputs. I'd keep mod+alt+1–9 for v1 and make the shortcuts configurable later if needed.

## 14. Questions for you

1. **Can an item belong to more than one space?** My suggestion is yes: "Add to space" adds it, and the panel has "Move to…" and "Remove". The prototype only had move.
2. **Should the window tint default to on or off?** I suggest **off**, because it's the one feature that touches the look of other themes.
3. **Naming:** the repo is `SpicetiGyn`, while the kickoff uses "Nordlys". I'll use Nordlys for packages (`@nordlys/*`), files (`nordlys-spaces.js`) and the `nl-` CSS prefix unless you say otherwise.
4. **Please add `reference/nordlys-spaces.js`.** It isn't in the repo yet. I need it in step 2 for the behavior port and to find its LocalStorage key for the version-0 migration.
5. **The repo must be public** (with topics) before it shows up on the Marketplace. You can do that whenever you're ready. It doesn't block development.
