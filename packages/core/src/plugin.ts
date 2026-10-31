import { type Bus, createBus } from "./bus";
import { createSubmenu, type SubmenuHandle, type SubmenuOptions } from "./compat/context-menu";
import { createMetadataAdapter, type MetadataAdapter } from "./compat/metadata";
import { createNavigationAdapter, type NavigationAdapter } from "./compat/navigation";
import { createPlayerAdapter, type PlayerAdapter } from "./compat/player";
import { detectFeatures, type FeatureReport, waitForSpicetify } from "./compat/ready";
import { bindShortcut } from "./compat/shortcuts";
import { mountInSlot, type SlotHandle, type SlotName } from "./compat/slots";
import type { SpicetifyLike } from "./compat/spicetify";
import { type ButtonHandle, type ButtonOptions, createButton } from "./compat/topbar";
import { getHost } from "./host";
import { createLogger, type Logger } from "./log";
import { createPlatform, type PlatformInfo } from "./platform";
import {
  createStorage,
  localStorageBackend,
  type StorageApi,
  type StorageBackend,
} from "./storage";
import { openPopover, type PopoverHandle } from "./ui/popover";
import { addStyle } from "./ui/styles";

export type Teardown = () => void | Promise<void>;

export interface PluginDefinition {
  /** Lowercase id used for storage keys, CSS and logs, e.g. "spaces". */
  id: string;
  name: string;
  version: string;
  setup(ctx: PluginContext): Teardown | undefined | Promise<Teardown | undefined>;
}

export interface UiApi {
  /** Injects CSS for this plugin; removed on stop. */
  addStyle(css: string): void;
  /** A top bar button (or a player bar button on versions without Topbar.Button). */
  button(options: ButtonOptions): ButtonHandle | null;
  popover(
    anchor: HTMLElement | null,
    render: (close: () => void) => HTMLElement,
    options?: { className?: string; label?: string; onClose?(): void },
  ): PopoverHandle;
  /** A right-click submenu (or flat items on versions without ContextMenu.SubMenu). */
  contextSubmenu(options: SubmenuOptions): SubmenuHandle;
  /**
   * Pins your own element to a named place in Spotify's layout, e.g. "left-sidebar-bottom",
   * and keeps it there when Spotify re-renders. Removed on stop.
   */
  slot(name: SlotName, element: HTMLElement): SlotHandle;
  /** "mod+alt+1": ⌘⌥1 on macOS, Ctrl+Alt+1 elsewhere. */
  shortcut(combo: string, fn: () => void): void;
  toast(message: string, options?: { error?: boolean }): void;
}

export interface PluginContext {
  readonly id: string;
  readonly log: Logger;
  /** Aborted when the plugin stops. Pass it to addEventListener to have listeners removed. */
  readonly signal: AbortSignal;
  onDispose(fn: Teardown): void;
  readonly bus: Bus;
  readonly storage: StorageApi;
  readonly ui: UiApi;
  readonly player: PlayerAdapter;
  readonly nav: NavigationAdapter;
  readonly metadata: MetadataAdapter;
  readonly platform: PlatformInfo;
  readonly features: FeatureReport;
}

export interface RunningPlugin {
  readonly id: string;
  readonly version: string;
  stop(): Promise<void>;
}

export interface StartOptions {
  /** Defaults to waiting for the real global. Tests pass the mock here. */
  spicetify?: SpicetifyLike;
  /** Where the shared host lives. Defaults to globalThis. */
  global?: object;
  storage?: StorageBackend;
}

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  if (!/^[a-z][a-z0-9-]*$/.test(definition.id)) {
    throw new Error(`Plugin id "${definition.id}" must be lowercase letters, digits and dashes.`);
  }
  return definition;
}

function storageBackendFor(s: SpicetifyLike): StorageBackend {
  const ls = s.LocalStorage;
  if (typeof ls?.get === "function" && typeof ls.set === "function") {
    return {
      get: (k) => ls.get?.(k) ?? null,
      set: (k, v) => ls.set?.(k, v),
      remove: (k) => (ls.remove ? ls.remove(k) : globalThis.localStorage?.removeItem(k)),
    };
  }
  return localStorageBackend();
}

/**
 * Boots a plugin: waits for Spicetify, joins the shared host, runs `setup`, and returns a
 * handle whose `stop()` undoes everything. Resolves null when the plugin could not start
 * or is already running from another copy.
 */
export async function start(
  definition: PluginDefinition,
  options: StartOptions = {},
): Promise<RunningPlugin | null> {
  let s = options.spicetify;
  if (!s) {
    try {
      s = await waitForSpicetify();
    } catch (error) {
      console.error(`[nordlys:${definition.id}]`, error);
      return null;
    }
  }

  const host = getHost(options.global);
  const log = createLogger(definition.id, host);
  const existing = host.plugins.get(definition.id);
  if (existing) {
    log.warn(
      `v${existing.version} is already running, so this copy (v${definition.version}) won't start.`,
    );
    return null;
  }

  const disposers: Teardown[] = [];
  const track = (fn: Teardown) => {
    disposers.push(fn);
  };
  const controller = new AbortController();
  let teardown: Teardown | undefined;
  let stopped = false;

  const platform = createPlatform(s);
  const spicetify = s;
  const toast = (message: string, o?: { error?: boolean }) => {
    if (typeof spicetify.showNotification === "function")
      spicetify.showNotification(message, o?.error ?? false);
    else log.info(`(notification) ${message}`);
  };
  const openPopovers = new Set<PopoverHandle>();
  track(() => {
    for (const p of [...openPopovers]) p.close();
  });

  const ctx: PluginContext = {
    id: definition.id,
    log,
    signal: controller.signal,
    onDispose: track,
    bus: createBus(host.bus, track),
    storage: createStorage(definition.id, options.storage ?? storageBackendFor(s), {
      log,
      notify: (m) => toast(m, { error: true }),
      track,
    }),
    player: createPlayerAdapter(s, log, track),
    nav: createNavigationAdapter(s, log, track),
    metadata: createMetadataAdapter(s, log),
    platform,
    features: detectFeatures(s),
    ui: {
      addStyle: (css) => track(addStyle(definition.id, css)),
      button(o) {
        const handle = createButton(spicetify, o, log);
        if (handle) track(() => handle.remove());
        return handle;
      },
      popover(anchor, render, o = {}) {
        const handle = openPopover(anchor, render, {
          ...o,
          pluginId: definition.id,
          onClose: () => {
            openPopovers.delete(handle);
            o.onClose?.();
          },
        });
        openPopovers.add(handle);
        return handle;
      },
      contextSubmenu(o) {
        const handle = createSubmenu(spicetify, o, log);
        track(() => handle.remove());
        return handle;
      },
      slot(name, element) {
        const handle = mountInSlot(name, element, log);
        track(() => handle.remove());
        return handle;
      },
      shortcut: (combo, fn) => track(bindShortcut(spicetify, combo, fn, platform.os, log)),
      toast,
    },
  };

  const root = document.documentElement;
  if (!root.dataset.nlOs) root.dataset.nlOs = platform.os;

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      if (typeof teardown === "function") await teardown();
    } catch (error) {
      log.error("Teardown failed", error);
    }
    for (const dispose of disposers.reverse()) {
      try {
        await dispose();
      } catch (error) {
        log.error("Cleanup failed", error);
      }
    }
    disposers.length = 0;
    controller.abort();
    host.plugins.delete(definition.id);
    if (host.plugins.size === 0) delete root.dataset.nlOs;
    host.bus.emit("nordlys:plugin-stopped", { id: definition.id });
  };

  // Registered before setup runs, so a second copy loading at the same moment backs off.
  host.plugins.set(definition.id, {
    version: definition.version,
    coreVersion: __NORDLYS_CORE_VERSION__,
    stop,
  });

  try {
    teardown = await definition.setup(ctx);
  } catch (error) {
    log.error("Setup failed; cleaning up.", error);
    await stop();
    return null;
  }

  log.info(
    `v${definition.version} started (core ${__NORDLYS_CORE_VERSION__}, build ${__NORDLYS_BUILD__}, ${platform.os}).`,
  );
  host.bus.emit("nordlys:plugin-ready", { id: definition.id, version: definition.version });
  return { id: definition.id, version: definition.version, stop };
}
