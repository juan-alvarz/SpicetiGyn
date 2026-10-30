# @nordlys/core

The small core every Nordlys plugin bundles. It is never installed on its own.

- `definePlugin({ id, name, version, setup(ctx) })` and `start(plugin)`: the lifecycle. Everything created through `ctx` is removed when the plugin stops.
- `ctx.bus`: typed events and commands shared by every Nordlys plugin, even when each bundles its own copy of the core (`window.__nordlys`).
- `ctx.storage.define(spec)`: namespaced, versioned storage with migrations and backups.
- `ctx.ui`: top bar button, popover, right-click submenu, shortcuts, styles and toasts.
- `ctx.player`, `ctx.nav`, `ctx.metadata`: adapters over Spotify/Spicetify internals that differ between versions, each with a logged fallback.
- `ctx.platform`: OS detection and shortcut labels (⌘⌥ vs Ctrl+Alt).

Only `src/compat/` reads the `Spicetify` global; `pnpm check:boundaries` enforces that. See [docs/architecture.md](../../docs/architecture.md).
