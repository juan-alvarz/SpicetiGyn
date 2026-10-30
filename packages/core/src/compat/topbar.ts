import type { Logger } from "../log";
import type { ButtonLike, SpicetifyLike } from "./spicetify";

export interface ButtonOptions {
  label: string;
  /** Full `<svg>` markup. */
  icon: string;
  onClick(anchor: HTMLElement | null): void;
}

export interface ButtonHandle {
  readonly element: HTMLElement | null;
  readonly placement: "topbar" | "playbar";
  /** False when Spicetify created the button but couldn't put it on the page (e.g. Spotify 1.3.x). */
  readonly attached: boolean;
  setLabel(label: string): void;
  setIcon(svg: string): void;
  remove(): void;
}

const ATTACH_TIMEOUT_MS = 8_000;

/** Topbar.Button, then Playbar.Button, then nothing (the caller explains that shortcuts still work). */
export function createButton(
  s: SpicetifyLike,
  options: ButtonOptions,
  log: Logger,
): ButtonHandle | null {
  let button: ButtonLike | null = null;
  let placement: ButtonHandle["placement"] = "topbar";
  const onClick = (self: ButtonLike) => options.onClick(self?.element ?? button?.element ?? null);

  const Topbar = s.Topbar?.Button;
  const Playbar = s.Playbar?.Button;
  try {
    if (typeof Topbar === "function") {
      button = new Topbar(options.label, options.icon, onClick, false);
    } else if (typeof Playbar === "function") {
      log.warnOnce("ui.topbar", "Topbar.Button is missing; using a player bar button instead.");
      placement = "playbar";
      button = new Playbar(options.label, options.icon, onClick, false, false, true);
    }
  } catch (error) {
    log.error("Could not create the button", error);
    button = null;
  }
  if (!button) {
    log.warnOnce("ui.button", "No top bar or player bar button API was found.");
    return null;
  }
  const b = button;

  // Spicetify keeps buttons in memory until it finds Spotify's top bar by class name; when a
  // Spotify version renames those classes, the button is never shown. Say so.
  const check = setTimeout(() => {
    if (!b.element?.isConnected) {
      log.warn(
        `Spicetify's ${placement === "topbar" ? "Topbar" : "Playbar"}.Button couldn't attach in this Spotify version, so the button isn't shown.`,
      );
    }
  }, ATTACH_TIMEOUT_MS);

  return {
    get element() {
      return b.element ?? null;
    },
    placement,
    get attached() {
      return b.element?.isConnected ?? false;
    },
    setLabel(label) {
      b.label = label;
    },
    setIcon(svg) {
      b.icon = svg;
    },
    remove() {
      clearTimeout(check);
      if (typeof b.deregister === "function") {
        b.deregister();
        return;
      }
      // Topbar.Button has no deregister(), and Spicetify puts every button it created back
      // into the top bar after each page change, so hide it for good before removing it.
      if (b.element) {
        b.element.style.display = "none";
        b.element.remove();
      }
    },
  };
}
