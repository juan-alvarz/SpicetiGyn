import {
  type Child,
  h,
  type PlatformInfo,
  type PopoverHandle,
  svg,
  type UiApi,
} from "@nordlys/core";
import { ICON_IDS, type IconId, SPACE_ICONS, UI_ICONS } from "../icons";
import {
  MAX_CROSSFADE_MS,
  MAX_NAME_LENGTH,
  MAX_SPACES,
  type Settings,
  type Space,
  type SpaceItem,
  type SpacesState,
} from "../model/schema";
import { currentSpace, type SpaceDraft } from "../model/state";
import { COLOR_IDS, COLOR_PRESETS } from "../presets";

export interface PanelActions {
  switchTo(id: string): void;
  openItem(item: SpaceItem): void;
  /** The page that is open now, if it can be added to a space. */
  currentPage(): { uri: string; inSpace: boolean } | null;
  addCurrentPage(): void;
  create(draft: SpaceDraft): void;
  save(id: string, draft: SpaceDraft): void;
  remove(id: string): void;
  moveItem(uri: string, toId: string): void;
  removeItem(uri: string): void;
  updateSettings(patch: Partial<Settings>): void;
}

type View =
  | { kind: "main" }
  | { kind: "edit"; id: string | null; draft: SpaceDraft }
  | { kind: "item"; uri: string };

/** What the panel shows when it opens: the overview, the new-space form, or a space's editor. */
export type PanelStart = "main" | "new" | { edit: string };

export interface Panel {
  /** Opens the panel at `anchor`, or closes it if it is already open there. */
  toggle(anchor: HTMLElement | null): void;
  open(anchor: HTMLElement | null, start?: PanelStart): void;
  close(): void;
  /** Redraws an open panel (state or page changed). Leaves the editor alone while typing. */
  refresh(): void;
  readonly isOpen: boolean;
}

const KIND_LABEL: Record<SpaceItem["kind"], string> = {
  playlist: "Playlist",
  album: "Album",
  artist: "Artist",
};

export const displayName = (item: SpaceItem) => item.name || KIND_LABEL[item.kind];

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const icon = (markup: string) => svg(markup);

export function createPanel(deps: {
  ui: UiApi;
  platform: PlatformInfo;
  getState: () => SpacesState;
  actions: PanelActions;
}): Panel {
  const { ui, platform, getState, actions } = deps;
  let popover: PopoverHandle | null = null;
  let anchor: HTMLElement | null = null;
  let view: View = { kind: "main" };

  const go = (next: View) => {
    view = next;
    popover?.rerender();
    popover?.reposition();
    if (next.kind === "edit") {
      const input = popover?.element.querySelector<HTMLInputElement>(".nl-spaces-editor input");
      input?.focus();
      input?.select();
    }
  };

  const shortcut = (index: number) => platform.formatShortcut(`mod+alt+${index + 1}`);

  // ── main view ────────────────────────────────────────────────────────────
  const switcher = (state: SpacesState) =>
    h(
      "div",
      { class: "nl-spaces-switcher", attrs: { role: "toolbar", "aria-label": "Spaces" } },
      state.spaces.map((space, index) => {
        const active = space.id === state.currentId;
        return h(
          "button",
          {
            class: ["nl-space-btn", active && "nl-space-btn--active"],
            attrs: {
              type: "button",
              "aria-pressed": String(active),
              title: `${space.name} (${shortcut(index)}). Right-click to edit.`,
              "data-space": space.id,
            },
            style: { "--nl-btn-accent": COLOR_PRESETS[space.color].accent },
            on: {
              click: () => (active ? go(editView(space)) : actions.switchTo(space.id)),
              contextmenu: (event) => {
                event.preventDefault();
                go(editView(space));
              },
            },
          },
          icon(SPACE_ICONS[space.icon]),
          h("span", { class: "nl-space-btn__name" }, space.name),
        );
      }),
      state.spaces.length < MAX_SPACES
        ? h(
            "button",
            {
              class: "nl-space-btn nl-space-btn--new",
              attrs: { type: "button", title: "New space", "aria-label": "New space" },
              on: { click: () => go(newView(state)) },
            },
            icon(UI_ICONS.plus),
            h("span", { class: "nl-space-btn__name" }, "New"),
          )
        : null,
    );

  const itemRow = (item: SpaceItem) =>
    h(
      "li",
      { class: "nl-spaces-item" },
      h(
        "button",
        {
          class: "nl-spaces-item__open",
          attrs: {
            type: "button",
            "aria-label": `Open ${displayName(item)}`,
            title: `Open ${displayName(item)}`,
          },
          on: { click: () => actions.openItem(item) },
        },
        item.image
          ? h("img", {
              class: "nl-spaces-item__art",
              attrs: { src: item.image, alt: "", loading: "lazy" },
            })
          : h(
              "span",
              { class: "nl-spaces-item__art nl-spaces-item__art--empty" },
              KIND_LABEL[item.kind][0],
            ),
        h(
          "span",
          { class: "nl-spaces-item__text" },
          h("span", { class: "nl-spaces-item__name" }, displayName(item)),
          h("span", { class: "nl-spaces-item__kind" }, KIND_LABEL[item.kind]),
        ),
      ),
      h(
        "button",
        {
          class: "nl-icon-btn",
          attrs: {
            type: "button",
            title: "Move or remove",
            "aria-label": `Move or remove ${displayName(item)}`,
          },
          on: { click: () => go({ kind: "item", uri: item.uri }) },
        },
        icon(UI_ICONS.more),
      ),
    );

  const currentSection = (state: SpacesState, space: Space) => {
    const index = state.spaces.indexOf(space);
    const page = actions.currentPage();
    return h(
      "section",
      { class: "nl-spaces-current" },
      h(
        "div",
        { class: "nl-spaces-head" },
        h("span", {
          class: "nl-spaces-dot",
          style: { background: COLOR_PRESETS[space.color].accent },
        }),
        h("h2", { class: "nl-spaces-title" }, space.name),
        h("kbd", { class: "nl-kbd" }, shortcut(index)),
        h(
          "button",
          {
            class: "nl-icon-btn",
            attrs: { type: "button", title: "Edit this space", "aria-label": `Edit ${space.name}` },
            on: { click: () => go(editView(space)) },
          },
          icon(UI_ICONS.pencil),
        ),
      ),
      h(
        "button",
        {
          class: "nl-btn nl-btn--wide",
          attrs: {
            type: "button",
            disabled: !page || page.inSpace,
            title: page ? undefined : "Open a playlist, album or artist first",
          },
          on: { click: () => actions.addCurrentPage() },
        },
        icon(UI_ICONS.plus),
        page?.inSpace ? `This page is in ${space.name}` : `Add this page to ${space.name}`,
      ),
      space.items.length > 0
        ? h("ul", { class: "nl-spaces-items nl-scroll" }, space.items.map(itemRow))
        : h(
            "p",
            { class: "nl-spaces-empty" },
            "Nothing here yet. Open a playlist, album or artist and add it, or right-click one and choose “Add to space”.",
          ),
    );
  };

  const statusOf = (state: SpacesState, space: Space): string => {
    if (!state.settings.musicPerSpace && state.playedIn === space.id) return "Playing";
    const snap = space.snapshot;
    if (!snap) return "Nothing played yet";
    return ["Paused", snap.trackName, formatTime(snap.positionMs)].filter(Boolean).join(" · ");
  };

  const othersSection = (state: SpacesState) => {
    const others = state.spaces.filter((s) => s.id !== state.currentId);
    return h(
      "section",
      { class: "nl-spaces-others" },
      h(
        "h3",
        { class: "nl-spaces-subtitle" },
        "Other spaces",
        h("span", null, String(others.length)),
      ),
      others.length === 0
        ? h("p", { class: "nl-spaces-empty" }, "Only one space so far.")
        : h(
            "ul",
            null,
            others.map((space) =>
              h(
                "li",
                null,
                h(
                  "button",
                  {
                    class: "nl-spaces-other",
                    attrs: { type: "button", "data-space": space.id },
                    on: { click: () => actions.switchTo(space.id) },
                  },
                  h(
                    "span",
                    {
                      class: "nl-spaces-other__icon",
                      style: { background: COLOR_PRESETS[space.color].accent },
                    },
                    icon(SPACE_ICONS[space.icon]),
                  ),
                  h(
                    "span",
                    { class: "nl-spaces-item__text" },
                    h("span", { class: "nl-spaces-item__name" }, space.name),
                    h("span", { class: "nl-spaces-item__kind" }, statusOf(state, space)),
                  ),
                ),
              ),
            ),
          ),
    );
  };

  const settingsSection = (settings: Settings) => {
    const radio = (value: boolean, label: string, hint: string) =>
      h(
        "label",
        { class: "nl-choice" },
        h("input", {
          attrs: {
            type: "radio",
            name: "nl-spaces-mode",
            checked: settings.musicPerSpace === value,
          },
          on: { change: () => actions.updateSettings({ musicPerSpace: value }) },
        }),
        h("span", null, label, h("small", null, hint)),
      );
    const seconds = Math.round(settings.crossfadeMs / 1000);
    return h(
      "details",
      { class: "nl-spaces-settings" },
      h("summary", null, "Settings"),
      h(
        "fieldset",
        null,
        h("legend", null, "When you switch spaces"),
        radio(
          true,
          "Each space has its own music",
          "Switching pauses this space and resumes the other where you left it.",
        ),
        radio(false, "Music keeps playing", "Only the space, its items and colors change."),
      ),
      h(
        "label",
        { class: "nl-range" },
        h("span", null, "Crossfade", h("output", null, `${seconds} s`)),
        h("input", {
          attrs: {
            type: "range",
            min: 0,
            max: MAX_CROSSFADE_MS / 1000,
            step: 1,
            value: seconds,
            disabled: !settings.musicPerSpace,
          },
          on: {
            input: (event) => {
              const out = (event.target as HTMLElement).parentElement?.querySelector("output");
              if (out) out.textContent = `${(event.target as HTMLInputElement).value} s`;
            },
            change: (event) =>
              actions.updateSettings({
                crossfadeMs: Number((event.target as HTMLInputElement).value) * 1000,
              }),
          },
        }),
      ),
      h(
        "label",
        { class: "nl-choice" },
        h("input", {
          attrs: { type: "checkbox", checked: settings.tint },
          on: {
            change: (event) =>
              actions.updateSettings({ tint: (event.target as HTMLInputElement).checked }),
          },
        }),
        h(
          "span",
          null,
          "Tint the window",
          h("small", null, "A soft wash of the space color. Works with any theme."),
        ),
      ),
    );
  };

  const mainView = (state: SpacesState): Child => {
    const space = currentSpace(state);
    // Opened from the sidebar dock, the dock already is the switcher.
    const fromDock = anchor?.closest(".nl-spaces-dock-wrap") != null;
    return [
      fromDock ? null : switcher(state),
      currentSection(state, space),
      othersSection(state),
      settingsSection(state.settings),
    ];
  };

  // ── editor ───────────────────────────────────────────────────────────────
  const editView = (space: Space): View => ({
    kind: "edit",
    id: space.id,
    draft: { name: space.name, color: space.color, icon: space.icon },
  });
  const newView = (state: SpacesState): View => ({
    kind: "edit",
    id: null,
    draft: {
      name: "",
      color: COLOR_IDS[state.spaces.length % COLOR_IDS.length] ?? "fjord",
      icon: ICON_IDS[state.spaces.length % ICON_IDS.length] ?? "target",
    },
  });

  const editorView = (state: SpacesState, v: Extract<View, { kind: "edit" }>): Child => {
    const draft = v.draft;
    const isNew = v.id === null;
    const submit = () => {
      if (isNew) actions.create(draft);
      else if (v.id) actions.save(v.id, draft);
      go({ kind: "main" });
    };
    const swatches = h(
      "div",
      { class: "nl-swatches", attrs: { role: "radiogroup", "aria-label": "Color" } },
      COLOR_IDS.map((id) => {
        const c = COLOR_PRESETS[id];
        return h("button", {
          class: ["nl-swatch", draft.color === id && "nl-swatch--active"],
          attrs: {
            type: "button",
            role: "radio",
            "aria-checked": String(draft.color === id),
            title: c.name,
            "aria-label": c.name,
          },
          style: { background: `linear-gradient(135deg, ${c.g1}, ${c.g2})` },
          on: {
            click: () => {
              draft.color = id;
              go(v);
            },
          },
        });
      }),
    );
    const icons = h(
      "div",
      { class: "nl-icons", attrs: { role: "radiogroup", "aria-label": "Icon" } },
      ICON_IDS.map((id: IconId) =>
        h(
          "button",
          {
            class: ["nl-icon-choice", draft.icon === id && "nl-icon-choice--active"],
            attrs: {
              type: "button",
              role: "radio",
              "aria-checked": String(draft.icon === id),
              "aria-label": id,
            },
            on: {
              click: () => {
                draft.icon = id;
                go(v);
              },
            },
          },
          icon(SPACE_ICONS[id]),
        ),
      ),
    );
    return h(
      "form",
      {
        class: "nl-spaces-editor",
        on: {
          submit: (event) => {
            event.preventDefault();
            submit();
          },
        },
      },
      h("h2", { class: "nl-spaces-title" }, isNew ? "New space" : "Edit space"),
      h(
        "label",
        { class: "nl-field" },
        h("span", null, "Name"),
        h("input", {
          attrs: {
            type: "text",
            value: draft.name,
            maxlength: MAX_NAME_LENGTH,
            placeholder: "e.g. Gym",
            autocomplete: "off",
            spellcheck: "false",
          },
          on: { input: (event) => (draft.name = (event.target as HTMLInputElement).value) },
        }),
      ),
      h("div", { class: "nl-field" }, h("span", null, "Color"), swatches),
      h("div", { class: "nl-field" }, h("span", null, "Icon"), icons),
      h(
        "div",
        { class: "nl-row" },
        isNew
          ? null
          : h(
              "button",
              {
                class: "nl-btn nl-btn--danger",
                attrs: {
                  type: "button",
                  disabled: state.spaces.length < 2,
                  title:
                    state.spaces.length < 2
                      ? "You need at least one space"
                      : "Its items move to the space next to it",
                },
                on: {
                  click: () => {
                    if (v.id) actions.remove(v.id);
                    go({ kind: "main" });
                  },
                },
              },
              "Delete",
            ),
        h("span", { class: "nl-row__spacer" }),
        h(
          "button",
          { class: "nl-btn", attrs: { type: "button" }, on: { click: () => go({ kind: "main" }) } },
          "Cancel",
        ),
        h(
          "button",
          { class: "nl-btn nl-btn--primary", attrs: { type: "submit" } },
          isNew ? "Create space" : "Save",
        ),
      ),
    );
  };

  // ── item menu ────────────────────────────────────────────────────────────
  const itemView = (state: SpacesState, uri: string): Child => {
    const space = currentSpace(state);
    const item = space.items.find((i) => i.uri === uri);
    if (!item) return mainView(state);
    const others = state.spaces.filter((s) => s.id !== space.id);
    const back = h(
      "button",
      {
        class: "nl-icon-btn",
        attrs: { type: "button", "aria-label": "Back" },
        on: { click: () => go({ kind: "main" }) },
      },
      icon(UI_ICONS.back),
    );
    return h(
      "div",
      { class: "nl-spaces-menu" },
      h(
        "div",
        { class: "nl-spaces-head" },
        back,
        h("h2", { class: "nl-spaces-title" }, displayName(item)),
      ),
      h("h3", { class: "nl-spaces-subtitle" }, "Move to"),
      others.length === 0
        ? h("p", { class: "nl-spaces-empty" }, "Create another space first.")
        : h(
            "ul",
            null,
            others.map((s) =>
              h(
                "li",
                null,
                h(
                  "button",
                  {
                    class: "nl-spaces-other",
                    attrs: { type: "button", "data-move-to": s.id },
                    on: {
                      click: () => {
                        actions.moveItem(uri, s.id);
                        go({ kind: "main" });
                      },
                    },
                  },
                  h(
                    "span",
                    {
                      class: "nl-spaces-other__icon",
                      style: { background: COLOR_PRESETS[s.color].accent },
                    },
                    icon(SPACE_ICONS[s.icon]),
                  ),
                  h("span", { class: "nl-spaces-item__name" }, s.name),
                ),
              ),
            ),
          ),
      h(
        "button",
        {
          class: "nl-btn nl-btn--danger nl-btn--wide",
          attrs: { type: "button" },
          on: {
            click: () => {
              actions.removeItem(uri);
              go({ kind: "main" });
            },
          },
        },
        `Remove from ${space.name}`,
      ),
    );
  };

  const render = () => {
    const state = getState();
    const content =
      view.kind === "edit"
        ? editorView(state, view)
        : view.kind === "item"
          ? itemView(state, view.uri)
          : mainView(state);
    return h("div", { class: "nl-spaces-panel" }, content);
  };

  const open = (a: HTMLElement | null, start: PanelStart = "main") => {
    popover?.close();
    anchor = a;
    view = { kind: "main" };
    popover = ui.popover(anchor, render, {
      className: "nl-spaces-popover",
      label: "Spaces",
      onClose: () => (popover = null),
    });
    if (start === "main") return;
    const state = getState();
    const space = start === "new" ? null : state.spaces.find((s) => s.id === start.edit);
    if (start === "new") go(newView(state));
    else if (space) go(editView(space));
  };

  return {
    get isOpen() {
      return popover?.isOpen ?? false;
    },
    open,
    toggle(a) {
      if (popover?.isOpen && anchor === a) popover.close();
      else open(a);
    },
    close: () => popover?.close(),
    refresh() {
      if (!popover?.isOpen || view.kind === "edit") return;
      popover.rerender();
      popover.reposition();
    },
  };
}
