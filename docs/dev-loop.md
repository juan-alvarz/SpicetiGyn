# Developer loop

Works the same on macOS, Windows and Linux. You need Node 22.11+ (npm comes with it) and Spicetify on your PATH.

```bash
npm install
```

## Everyday commands

| Command                           | What it does                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run build`                   | Builds every plugin to `dist/extensions/` and every theme to `dist/themes/`.                 |
| `npm test`                        | Unit tests (Vitest, against the Spicetify mock).                                             |
| `npm run test:e2e`                | Builds, then runs the Playwright smoke test against the mock at 100%, 125% and 150% scaling. |
| `npm run lint` / `npm run format` | Biome lint and format check / fix.                                                           |
| `npm run typecheck`               | TypeScript, strict.                                                                          |
| `npm run check:boundaries`        | Package boundary rules (see below).                                                          |
| `npm run check`                   | All of the above except e2e, the same as CI.                                                 |

## Trying changes in Spotify

`tools/dev.ts` finds your Spicetify userdata folder with `spicetify path userdata` (falling back to the usual location for your OS), and copies built files into `Extensions/` and `Themes/`. Names are package folder names: `spaces`, `codex`, `spaces-theme`.

Install and turn on the Spaces extension:

```bash
npm run dev -- install spaces
```

```bash
npm run dev -- enable spaces
```

Then rebuild on every save and let Spicetify reload Spotify:

```bash
npm run dev -- watch spaces
```

In a second terminal:

```bash
spicetify watch -e
```

Themes work the same way. `npm run dev -- enable codex Frost` sets `current_theme` and `color_scheme` and applies. Watch themes with `spicetify watch -s`, and re-run `npm run dev -- install codex` after editing theme CSS.

Other commands:

| Command                                            | What it does                                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev -- path`                              | Prints the userdata folder it will use.                                                                                                                                          |
| `npm run dev -- open` / `npm run dev -- open dist` | Opens the userdata folder, or the built files, in Finder / File Explorer.                                                                                                        |
| `npm run dev -- install [name…] --link`            | Links instead of copying. Themes use a junction on Windows (no admin needed); extension files need Windows Developer Mode for links, and it falls back to copying if that's off. |
| `npm run dev -- disable spaces`                    | `spicetify config extensions nordlys-spaces.js-` and apply.                                                                                                                      |
| `--no-apply`                                       | Skip `spicetify apply` after enable/disable.                                                                                                                                     |

Set `NORDLYS_SPICETIFY_USERDATA` to use a different folder (handy for a test profile).

To turn a theme off and go back to stock Spotify colors, run `npm run dev -- disable codex` (any theme name works; it clears `current_theme`).

## Debug logging

In Spotify's devtools (`spicetify enable-devtools`), run `localStorage.setItem("nordlys:debug", "1")` and reload to see debug logs. Every Nordlys plugin also keeps its last 200 log lines in `window.__nordlys.logs`, which is useful for bug reports.

## Adding things

- **A theme:** `npm run new:theme -- <slug> "Display name"` creates `themes/<slug>/` with `color.ini`, `src/user.css` (already importing the theme kit), a README, a CHANGELOG, and a Marketplace entry in `manifest.json`.
- **A plugin:** copy the shape of `plugins/spaces`: a `package.json` with a `nordlys` field (`type: "extension"`, `entry`, `outfile`), `src/entry.ts` calling `start(plugin)`, and a manifest entry. `tools/manifest.test.ts` fails until the manifest, README and preview exist.

## Boundary rules

`npm run check:boundaries` fails when:

1. a plugin mentions `Spicetify` (use the core adapters on `ctx` instead), or core code outside `packages/core/src/compat/` does;
2. a plugin imports another plugin other than `import type … from "@nordlys/<plugin>/api"`;
3. plugin source imports the mock, or a relative import leaves the package;
4. a theme sets `-webkit-app-region`.

## Releasing

1. After a change users will notice, run `npm run changeset`, pick the packages and the bump, and write one line.
2. Merge to `main`. The release workflow opens a **Version packages** PR that bumps versions and writes CHANGELOGs.
3. Merge that PR. The workflow tags each new version (`@nordlys/spaces@0.2.0`), creates a GitHub Release with the `.js` or the theme `.zip` attached, and updates the `dist` branch that `manifest.json` points the Marketplace at.

`npm run release -- --dry-run` shows what would be published without tagging, pushing or creating releases.
