import {
  definePlugin,
  type PlayerState,
  parseItemUri,
  pathForUri,
  type StoreSpec,
  uriForPath,
} from "@nordlys/core";
import type { SpaceInfo } from "./api";
import { SPACE_ICONS, UI_ICONS } from "./icons";
import { LEGACY_KEYS, MIGRATIONS } from "./model/migrations";
import { isSpacesState, type SpacesState, STORE_VERSION } from "./model/schema";
import {
  addItem,
  createSpace,
  currentSpace,
  defaultState,
  deleteSpace,
  findSpace,
  hasItem,
  moveItem,
  removeItem,
  setLastPath,
  setPlayedIn,
  setSnapshot,
  toInfo,
  updateItemInfo,
  updateSettings,
  updateSpace,
} from "./model/state";
import css from "./styles.css";
import { createSwitcher, snapshotOf } from "./switcher";
import { createDock } from "./ui/dock";
import { createPanel, displayName } from "./ui/panel";
import { createStyleBridge } from "./ui/style-bridge";

declare const __NORDLYS_VERSION__: string;

export const SPACES_STORE: StoreSpec<SpacesState> = {
  key: "state",
  version: STORE_VERSION,
  defaults: defaultState,
  migrations: MIGRATIONS,
  legacyKeys: LEGACY_KEYS,
  validate: isSpacesState,
};

/** How often the playing space's position is saved, so a crash loses at most this much. */
const SNAPSHOT_INTERVAL_MS = 15_000;

export default definePlugin({
  id: "spaces",
  name: "Spaces",
  version: __NORDLYS_VERSION__,

  setup(ctx) {
    const store = ctx.storage.define(SPACES_STORE);
    const bridge = createStyleBridge();
    ctx.onDispose(() => bridge.clear());
    ctx.ui.addStyle(css);

    const infoOf = (state: SpacesState, id: string): SpaceInfo | null =>
      toInfo(state).find((s) => s.id === id) ?? null;

    const switcher = createSwitcher({
      player: ctx.player,
      store,
      log: ctx.log,
      apply(to) {
        bridge.apply(to, store.get().settings);
        if (to.lastPath) ctx.nav.go(to.lastPath);
        updateButton();
        panel.refresh();
      },
      setSwitching: (on) => bridge.setSwitching(on),
      onSwitched(from, to) {
        const state = store.get();
        const info = infoOf(state, to.id);
        if (info) ctx.bus.emit("spaces:changed", { from: infoOf(state, from.id), to: info });
      },
    });

    const switchTo = async (idOrName: string) => {
      const space = findSpace(store.get(), idOrName);
      if (!space) return { ok: false, reason: "unknown-space" } as const;
      const result = await switcher.switchTo(space.id);
      if (result.ok && store.get().settings.musicPerSpace && !result.resumed && !space.snapshot) {
        ctx.ui.toast(`Switched to ${space.name}. Nothing has played here yet.`);
      }
      return result;
    };

    // ── items ──────────────────────────────────────────────────────────────
    const fillInfo = async (uri: string) => {
      const info = await ctx.metadata.getItemInfo(uri);
      if (info) store.update((s) => updateItemInfo(s, uri, { name: info.name, image: info.image }));
    };

    const addToSpace = (spaceId: string, uri: string) => {
      const parsed = parseItemUri(uri);
      const space = store.get().spaces.find((s) => s.id === spaceId);
      if (!parsed || !space) return;
      if (hasItem(space, uri)) {
        ctx.ui.toast(`Already in ${space.name}.`);
        return;
      }
      store.update((s) =>
        addItem(s, spaceId, { uri, kind: parsed.kind, name: "", image: null, addedAt: Date.now() }),
      );
      void fillInfo(uri).then(() => {
        const item = store
          .get()
          .spaces.find((s) => s.id === spaceId)
          ?.items.find((i) => i.uri === uri);
        ctx.ui.toast(`Added ${item ? displayName(item) : "it"} to ${space.name}.`);
      });
    };

    // Fill in names that are missing (migrated data, or a lookup that failed earlier), once per session.
    const refreshMissingInfo = (() => {
      const tried = new Set<string>();
      return () => {
        for (const space of store.get().spaces) {
          for (const item of space.items) {
            if (item.name || tried.has(item.uri)) continue;
            tried.add(item.uri);
            void fillInfo(item.uri);
          }
        }
      };
    })();

    const currentPage = () => {
      const uri = uriForPath(ctx.nav.currentPath());
      return uri ? { uri, inSpace: hasItem(currentSpace(store.get()), uri) } : null;
    };

    // ── panel and button ───────────────────────────────────────────────────
    const panel = createPanel({
      ui: ctx.ui,
      platform: ctx.platform,
      getState: () => store.get(),
      actions: {
        switchTo: (id) => void switchTo(id),
        openItem(item) {
          const path = pathForUri(item.uri);
          if (path) ctx.nav.go(path);
          panel.close();
        },
        currentPage,
        addCurrentPage() {
          const page = currentPage();
          if (page) addToSpace(store.get().currentId, page.uri);
        },
        create(draft) {
          const { state, id } = createSpace(store.get(), draft);
          if (!id) {
            ctx.ui.toast("You already have 9 spaces, one for each shortcut.");
            return;
          }
          store.set(state);
          void switchTo(id);
        },
        save: (id, draft) => {
          store.update((s) => updateSpace(s, id, draft));
          const state = store.get();
          if (id === state.currentId) bridge.apply(currentSpace(state), state.settings);
          updateButton();
        },
        remove(id) {
          const before = store.get();
          const index = before.spaces.findIndex((s) => s.id === id);
          const removed = before.spaces[index];
          const heir = before.spaces[index === 0 ? 1 : index - 1];
          const after = deleteSpace(before, id);
          if (after === before || !removed || !heir) return;
          store.set(after);
          bridge.apply(currentSpace(after), after.settings);
          updateButton();
          ctx.ui.toast(`Deleted ${removed.name}. Its items moved to ${heir.name}.`);
        },
        moveItem: (uri, toId) => store.update((s) => moveItem(s, s.currentId, toId, uri)),
        removeItem: (uri) => store.update((s) => removeItem(s, s.currentId, uri)),
        updateSettings(patch) {
          store.update((s) => updateSettings(s, patch));
          const state = store.get();
          bridge.apply(currentSpace(state), state.settings);
        },
      },
    });

    const button = ctx.ui.button({
      label: "Spaces",
      icon: UI_ICONS.spaces,
      onClick(anchor) {
        refreshMissingInfo();
        panel.toggle(anchor);
      },
    });
    function updateButton() {
      const space = currentSpace(store.get());
      button?.setLabel(`Spaces: ${space.name}`);
      button?.setIcon(SPACE_ICONS[space.icon]);
    }

    // The switcher pinned to the bottom of the library sidebar. This is the main way in: on
    // Spotify 1.3.x Spicetify can't attach top bar buttons at all.
    const dock = createDock(ctx.platform, {
      switchTo: (id) => void switchTo(id),
      openPanel(anchor, start) {
        refreshMissingInfo();
        if (start) panel.open(anchor, start);
        else panel.toggle(anchor);
      },
    });
    dock.render(store.get());
    const dockSlot = ctx.ui.slot("left-sidebar-bottom", dock.element);

    const placementCheck = setTimeout(() => {
      if (button?.attached || dockSlot.attached) return;
      ctx.ui.toast(
        `Spaces couldn't add its switcher in this Spotify version. Switch with ${ctx.platform.formatShortcut("mod+alt+1")}–9.`,
      );
    }, 10_000);
    ctx.onDispose(() => clearTimeout(placementCheck));

    // ── context menu and shortcuts ─────────────────────────────────────────
    const menu = ctx.ui.contextSubmenu({
      label: "Add to space",
      when: (uris) => uris.length === 1 && parseItemUri(uris[0] ?? "") !== null,
      items: () =>
        store.get().spaces.map((space) => ({
          label: space.name,
          onClick: (uris: string[]) => {
            if (uris[0]) addToSpace(space.id, uris[0]);
          },
        })),
    });

    for (let n = 1; n <= 9; n++) {
      ctx.ui.shortcut(`mod+alt+${n}`, () => {
        const space = store.get().spaces[n - 1];
        if (space) void switchTo(space.id);
      });
    }

    // ── playback tracking ──────────────────────────────────────────────────
    // Music counts as "played in" a space when it starts or changes while that space is open.
    const onPlayback = (state: PlayerState) => {
      if (switcher.busy) return;
      let s = store.get();
      if (!state.isPaused && state.trackUri) s = setPlayedIn(s, s.currentId);
      const snapshot = snapshotOf(state, Date.now());
      if (s.playedIn === s.currentId && snapshot) s = setSnapshot(s, s.currentId, snapshot);
      if (s !== store.get()) store.set(s);
    };
    ctx.player.onSongChange(onPlayback);
    ctx.player.onPlayPause(onPlayback);
    const timer = setInterval(() => {
      const state = ctx.player.getState();
      if (!state.isPaused) onPlayback(state);
    }, SNAPSHOT_INTERVAL_MS);
    ctx.onDispose(() => clearInterval(timer));
    window.addEventListener("beforeunload", () => onPlayback(ctx.player.getState()), {
      signal: ctx.signal,
    });

    ctx.nav.onChange((path) => {
      store.update((s) => setLastPath(s, s.currentId, path));
      // "Add this page" depends on the page even when the state didn't change.
      panel.refresh();
    });

    // ── public API on the bus ──────────────────────────────────────────────
    ctx.bus.handle("spaces.list", () => toInfo(store.get()));
    ctx.bus.handle("spaces.current", () => infoOf(store.get(), store.get().currentId));
    ctx.bus.handle("spaces.switchTo", (idOrName) => switchTo(idOrName));

    // Tell other plugins when the list changes, and rebuild the context menu when names do.
    const signature = (state: SpacesState) => JSON.stringify(toInfo(state));
    const menuSignature = (state: SpacesState) =>
      state.spaces.map((s) => `${s.id}:${s.name}`).join("|");
    let lastSignature = signature(store.get());
    let lastMenuSignature = menuSignature(store.get());
    let lastDock = "";
    store.subscribe((state) => {
      panel.refresh();
      const next = signature(state);
      const nextDock = `${state.currentId}|${next}`;
      if (nextDock !== lastDock) {
        lastDock = nextDock;
        dock.render(state);
      }
      if (next === lastSignature) return;
      lastSignature = next;
      const nextMenu = menuSignature(state);
      if (nextMenu !== lastMenuSignature) {
        lastMenuSignature = nextMenu;
        menu.refresh();
      }
      ctx.bus.emit("spaces:updated", { spaces: toInfo(state) });
    });

    // ── start ──────────────────────────────────────────────────────────────
    const initial = store.get();
    bridge.apply(currentSpace(initial), initial.settings);
    updateButton();
  },
});
