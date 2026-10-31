import type { Logger } from "../log";
import type { OS } from "../platform";
import type { SpicetifyLike } from "./spicetify";

interface ParsedCombo {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    meta: parts.includes("meta"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    key,
  };
}

/** Compares physical keys (event.code) so Alt/⌥ combinations work on every keyboard layout. */
export function matchesCombo(event: KeyboardEvent, combo: string, os: OS): boolean {
  const c = parseCombo(combo);
  const wantMeta = c.meta || (c.mod && os === "mac");
  const wantCtrl = c.ctrl || (c.mod && os !== "mac");
  if (event.metaKey !== wantMeta || event.ctrlKey !== wantCtrl) return false;
  if (event.altKey !== c.alt || event.shiftKey !== c.shift) return false;
  if (/^[0-9]$/.test(c.key))
    return event.code === `Digit${c.key}` || event.code === `Numpad${c.key}`;
  if (/^[a-z]$/.test(c.key)) return event.code === `Key${c.key.toUpperCase()}`;
  return event.key.toLowerCase() === c.key;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** How long to keep looking for Mousetrap, which Spicetify finds inside Spotify's code lazily. */
const MOUSETRAP_WAIT_MS = 20_000;
const MOUSETRAP_POLL_MS = 250;

/**
 * Mousetrap, then a plain keydown listener. Spicetify sets `Spicetify.Mousetrap` only once it
 * finds it in Spotify's code, which can be after plugins start, so the keydown listener is a
 * bridge: it hands over to Mousetrap as soon as that appears. Returns the unbind function.
 */
export function bindShortcut(
  s: SpicetifyLike,
  combo: string,
  fn: () => void,
  os: OS,
  log: Logger,
): () => void {
  const viaMousetrap = (): (() => void) | null => {
    const mousetrap = s.Mousetrap;
    if (typeof mousetrap?.bind !== "function") return null;
    mousetrap.bind(combo, (event) => {
      event?.preventDefault?.();
      fn();
      return false;
    });
    return () => mousetrap.unbind?.(combo);
  };

  const direct = viaMousetrap();
  if (direct) return direct;

  const handler = (event: KeyboardEvent) => {
    if (isTyping(event.target) || !matchesCombo(event, combo, os)) return;
    event.preventDefault();
    fn();
  };
  window.addEventListener("keydown", handler);
  let unbind = () => window.removeEventListener("keydown", handler);

  const started = Date.now();
  const timer = setInterval(() => {
    const viaTrap = viaMousetrap();
    if (viaTrap) {
      clearInterval(timer);
      window.removeEventListener("keydown", handler);
      unbind = viaTrap;
      log.debug(`Shortcut ${combo} moved to Mousetrap.`);
    } else if (Date.now() - started > MOUSETRAP_WAIT_MS) {
      clearInterval(timer);
      log.warnOnce("ui.mousetrap", "Mousetrap never appeared; shortcuts use a keydown listener.");
    }
  }, MOUSETRAP_POLL_MS);

  return () => {
    clearInterval(timer);
    unbind();
  };
}
