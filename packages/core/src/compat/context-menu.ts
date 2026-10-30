import type { Logger } from "../log";
import type { MenuEntryLike, SpicetifyLike } from "./spicetify";

export interface MenuItemSpec {
  label: string;
  onClick(uris: string[]): void;
}

export interface SubmenuOptions {
  label: string;
  /** Whether the menu shows for these URIs (e.g. only playlists, albums and artists). */
  when(uris: string[]): boolean;
  /** Called again on every `refresh()`; Spicetify menus can't compute items lazily. */
  items(): MenuItemSpec[];
}

export interface SubmenuHandle {
  readonly mode: "submenu" | "flat" | "none";
  refresh(): void;
  remove(): void;
}

/** ContextMenu.SubMenu, then one flat item per entry ("Add to space: Focus"), then nothing. */
export function createSubmenu(
  s: SpicetifyLike,
  options: SubmenuOptions,
  log: Logger,
): SubmenuHandle {
  const Item = s.ContextMenu?.Item;
  const SubMenu = s.ContextMenu?.SubMenu;
  const mode: SubmenuHandle["mode"] =
    typeof Item !== "function" ? "none" : typeof SubMenu === "function" ? "submenu" : "flat";
  let registered: MenuEntryLike[] = [];

  if (mode === "none")
    log.warnOnce("ui.contextmenu", "ContextMenu is missing; the right-click menu is disabled.");
  if (mode === "flat")
    log.warnOnce("ui.submenu", "ContextMenu.SubMenu is missing; using flat menu items.");

  const remove = () => {
    for (const entry of registered) {
      try {
        entry.deregister?.();
      } catch (error) {
        log.warn("Could not remove a context menu entry", error);
      }
    }
    registered = [];
  };

  const build = () => {
    if (!Item) return;
    const items = options.items();
    try {
      if (mode === "submenu" && SubMenu) {
        const children = items.map((i) => new Item(i.label, i.onClick, () => true));
        const sub = new SubMenu(options.label, children, options.when);
        sub.register?.();
        registered = [sub];
      } else {
        registered = items.map((i) => {
          const entry = new Item(`${options.label}: ${i.label}`, i.onClick, options.when);
          entry.register?.();
          return entry;
        });
      }
    } catch (error) {
      log.error("Could not register the context menu", error);
    }
  };

  build();
  return {
    mode,
    refresh() {
      remove();
      build();
    },
    remove,
  };
}
