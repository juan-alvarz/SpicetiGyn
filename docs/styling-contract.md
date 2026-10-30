# Styling contract

Plugins never require a theme, and themes never contain logic that plugins depend on. Instead, plugins publish a small, stable set of hooks that any theme **may** use. Everything listed here is covered by semver: removing or renaming something is a major version.

Plugin UI uses Spicetify's standard color variables (`--spice-text`, `--spice-subtext`, `--spice-main`, `--spice-main-elevated`, `--spice-card`, `--spice-button` and their `--spice-rgb-*` versions). Those exist with stock Spotify and with every Marketplace theme, so plugin UI matches whatever theme is installed without the theme doing anything.

## Core

| Hook         | Where    | Values                                                       |
| ------------ | -------- | ------------------------------------------------------------ |
| `data-nl-os` | `<html>` | `mac`, `windows`, `linux`; set while any Nordlys plugin runs |

## Spaces

### Data attributes on `<html>`

| Attribute             | Example     | Meaning                                                                                   |
| --------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `data-nl-space`       | `focus`     | id of the current space (lowercase letters, digits, dashes)                               |
| `data-nl-space-color` | `fjord`     | color preset of the current space: `fjord`, `ember`, `aurora`, `moss`, `berry`, `glacier` |
| `data-nl-switching`   | _(present)_ | while a switch runs, for theme transitions                                                |
| `data-nl-tint`        | _(present)_ | when the user turned on **Tint the window**                                               |

Space ids are created by users, so prefer `data-nl-space-color` when styling.

### CSS custom properties on `:root`

| Property                                          | Example         |                                            |
| ------------------------------------------------- | --------------- | ------------------------------------------ |
| `--nl-space-accent`                               | `#8ed6e3`       | highlight color                            |
| `--nl-space-accent-rgb`                           | `142, 214, 227` | for `rgba(var(--nl-space-accent-rgb), .2)` |
| `--nl-space-on-accent`                            | `#111111`       | readable text on the accent                |
| `--nl-space-g1`, `--nl-space-g2`, `--nl-space-g3` | `#1f6a80`       | the three glow colors                      |
| `--nl-space-base`                                 | `#0c1724`       | the darkest color, for a window base       |

Always give a fallback, so the theme works without the plugin:

```css
:root {
  --my-glow: var(--nl-space-g1, var(--spice-button));
}
```

### Class names

| Class                                    | What                                              |
| ---------------------------------------- | ------------------------------------------------- |
| `.nl-popover`                            | any Nordlys popover (fixed, appended to `<body>`) |
| `.nl-spaces-popover`                     | the Spaces popover                                |
| `.nl-spaces-panel`                       | the panel content                                 |
| `.nl-spaces-switcher`                    | row of space buttons                              |
| `.nl-space-btn`, `.nl-space-btn--active` | one space button                                  |
| `.nl-spaces-current`                     | the current space's section                       |
| `.nl-spaces-items`, `.nl-spaces-item`    | the current space's items                         |
| `.nl-spaces-others`                      | the "Other spaces" card                           |
| `.nl-spaces-editor`                      | create/edit form                                  |
| `.nl-spaces-settings`                    | settings section                                  |
| `.nl-scroll`                             | scroll containers (scrollbars are styled)         |
| `.nl-tint`                               | the optional window tint layer                    |

Every Nordlys `<style>` and top-level element also carries `data-nl-plugin="<id>"`.

### Replacing the tint

A theme that paints the window itself can hide the plugin's tint:

```css
html[data-nl-tint] .nl-tint {
  display: none;
}
```

The Nordlys Spaces theme does exactly this, and follows the space colors through the variables above.

## Rules for Nordlys themes

These come from the "Both systems" study. The theme kit (`packages/theme-kit/base.css`) implements the shared parts, and `npm run check:boundaries` enforces the first one.

1. Never override `-webkit-app-region`.
2. Never place anything in the top bar corners: macOS draws the traffic lights at the left, Windows its window buttons at the right.
3. `@import` every font and end every stack in a generic family. SF Pro is macOS-only and Segoe UI is Windows-only.
4. Style scrollbars explicitly (Windows shows classic scrollbars, macOS usually hides them).
5. Use flexible layouts and relative sizes so nothing clips at 125% or 150% display scaling.
