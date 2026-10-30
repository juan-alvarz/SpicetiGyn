# Nordlys

Spicetify extensions and themes for Spotify, built on a small shared core. Every extension and theme installs on its own, works on macOS and Windows, and none of them needs another.

|                                                         | What                                                                                                                   | Install             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| [**Nordlys Spaces**](plugins/spaces) (extension)        | Arc-style spaces: each space keeps its own playlists, colors, last page and what it was playing. Works with any theme. | `nordlys-spaces.js` |
| [**Nordlys Codex**](themes/codex) (theme)               | A terminal with a classical streak: monospace, hairlines, an italic serif, grayscale art.                              | `NordlysCodex`      |
| [**Nordlys Spaces theme**](themes/spaces-theme) (theme) | A grainy gradient window with the main view as a floating card. Follows your space's colors with the Spaces extension. | `NordlysSpaces`     |

Install them from the Spicetify Marketplace (search **Nordlys**) or by hand: see [docs/install.md](docs/install.md).

## Repository

```
packages/core            the core every plugin bundles (lifecycle, bus, storage, UI helpers, Spicetify adapters)
packages/spicetify-mock  a fake Spicetify for unit and browser tests
packages/theme-kit       shared CSS for themes (macOS/Windows rules)
plugins/spaces           the Spaces extension
themes/codex             Nordlys Codex
themes/spaces-theme      Nordlys Spaces theme
tests/                   Playwright smoke test and a test-only plugin that drives Spaces over the bus
tools/                   build, dev loop, boundary check, release, theme scaffold
docs/                    architecture, install, dev loop, styling contract, manual QA
```

- [Architecture](docs/architecture.md): how plugins, the core and themes fit together.
- [Developer loop](docs/dev-loop.md): build, test, and try changes in Spotify on macOS, Windows or Linux.
- [Styling contract](docs/styling-contract.md): the CSS variables, attributes and classes themes may use.
- [Manual QA](docs/manual-qa.md): what to check in real Spotify before a release.

## Quick start

```bash
pnpm install
```

```bash
pnpm check
```

```bash
pnpm dev install spaces && pnpm dev enable spaces
```

## What is tested where

Unit tests (Vitest) and a Playwright smoke test run in CI on every push, against a **mock** of Spicetify. They cover the state, migrations, the switching algorithm, every compatibility fallback, cleanup, and the panel at 100%, 125% and 150% scaling. Real Spotify can't run in CI, so playback timing, how Spotify's own UI hosts our button and menus, and how the themes look are checked by hand with [docs/manual-qa.md](docs/manual-qa.md).
