// Publishes the styling contract (docs/styling-contract.md) that any theme MAY use.
import { h } from "@nordlys/core";
import type { Settings, Space } from "../model/schema";
import { COLOR_PRESETS, hexToRgb, onColor } from "../presets";

const VARS = [
  "--nl-space-accent",
  "--nl-space-accent-rgb",
  "--nl-space-on-accent",
  "--nl-space-g1",
  "--nl-space-g2",
  "--nl-space-g3",
  "--nl-space-base",
] as const;

export interface StyleBridge {
  apply(space: Space, settings: Settings): void;
  setSwitching(on: boolean): void;
  clear(): void;
}

export function createStyleBridge(root: HTMLElement = document.documentElement): StyleBridge {
  let tint: HTMLElement | null = null;

  const setTint = (on: boolean) => {
    if (on) {
      root.dataset.nlTint = "";
      if (!tint) {
        tint = h("div", {
          class: "nl-tint",
          attrs: { "aria-hidden": "true", "data-nl-plugin": "spaces" },
        });
        document.body.appendChild(tint);
      }
    } else {
      delete root.dataset.nlTint;
      tint?.remove();
      tint = null;
    }
  };

  return {
    apply(space, settings) {
      const c = COLOR_PRESETS[space.color];
      const values: Record<(typeof VARS)[number], string> = {
        "--nl-space-accent": c.accent,
        "--nl-space-accent-rgb": hexToRgb(c.accent),
        "--nl-space-on-accent": onColor(c.accent),
        "--nl-space-g1": c.g1,
        "--nl-space-g2": c.g2,
        "--nl-space-g3": c.g3,
        "--nl-space-base": c.g0,
      };
      for (const name of VARS) root.style.setProperty(name, values[name]);
      root.dataset.nlSpace = space.id;
      root.dataset.nlSpaceColor = space.color;
      setTint(settings.tint);
    },
    setSwitching(on) {
      if (on) root.dataset.nlSwitching = "";
      else delete root.dataset.nlSwitching;
    },
    clear() {
      for (const name of VARS) root.style.removeProperty(name);
      delete root.dataset.nlSpace;
      delete root.dataset.nlSpaceColor;
      delete root.dataset.nlSwitching;
      setTint(false);
    },
  };
}
