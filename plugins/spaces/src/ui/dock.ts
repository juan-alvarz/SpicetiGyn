// The space switcher pinned to the bottom of Spotify's library sidebar, like the prototype.
import { h, type PlatformInfo, svg } from "@nordlys/core";
import { SPACE_ICONS, UI_ICONS } from "../icons";
import { MAX_SPACES, type SpacesState } from "../model/schema";
import { COLOR_PRESETS } from "../presets";
import type { PanelStart } from "./panel";

export interface DockActions {
  switchTo(id: string): void;
  /** Opens the panel anchored to the dock; toggles it when `start` is omitted. */
  openPanel(anchor: HTMLElement, start?: PanelStart): void;
}

export interface Dock {
  readonly element: HTMLElement;
  render(state: SpacesState): void;
}

export function createDock(platform: PlatformInfo, actions: DockActions): Dock {
  const toolbar = h("div", {
    class: "nl-spaces-dock",
    attrs: { role: "toolbar", "aria-label": "Spaces" },
  });
  // The wrapper is the size container, so the toolbar can adapt to a collapsed sidebar.
  const element = h(
    "div",
    { class: "nl-spaces-dock-wrap", attrs: { "data-nl-plugin": "spaces" } },
    toolbar,
  );

  return {
    element,
    render(state) {
      const buttons = state.spaces.map((space, index) => {
        const active = space.id === state.currentId;
        const shortcut = platform.formatShortcut(`mod+alt+${index + 1}`);
        return h(
          "button",
          {
            class: ["nl-dock-btn", active && "nl-dock-btn--active"],
            attrs: {
              type: "button",
              "data-space": space.id,
              "aria-pressed": String(active),
              title: active
                ? `${space.name}: open the Spaces panel. Right-click to edit.`
                : `Switch to ${space.name} (${shortcut}). Right-click to edit.`,
            },
            style: { "--nl-btn-accent": COLOR_PRESETS[space.color].accent },
            on: {
              click: () => (active ? actions.openPanel(element) : actions.switchTo(space.id)),
              contextmenu: (event) => {
                event.preventDefault();
                actions.openPanel(element, { edit: space.id });
              },
            },
          },
          svg(SPACE_ICONS[space.icon]),
          h("span", { class: "nl-dock-btn__name" }, space.name),
        );
      });
      const add =
        state.spaces.length < MAX_SPACES
          ? h(
              "button",
              {
                class: "nl-dock-btn nl-dock-btn--new",
                attrs: { type: "button", title: "New space", "aria-label": "New space" },
                on: { click: () => actions.openPanel(element, "new") },
              },
              svg(UI_ICONS.plus),
            )
          : null;
      toolbar.replaceChildren(...buttons, ...(add ? [add] : []));
    },
  };
}
