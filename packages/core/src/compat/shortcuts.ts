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

/** Mousetrap, then a plain keydown listener. Returns the unbind function. */
export function bindShortcut(
  s: SpicetifyLike,
  combo: string,
  fn: () => void,
  os: OS,
  log: Logger,
): () => void {
  const mousetrap = s.Mousetrap;
  if (typeof mousetrap?.bind === "function") {
    mousetrap.bind(combo, (event) => {
      event?.preventDefault?.();
      fn();
      return false;
    });
    return () => mousetrap.unbind?.(combo);
  }
  log.warnOnce("ui.mousetrap", "Mousetrap is missing; using a keydown listener for shortcuts.");
  const handler = (event: KeyboardEvent) => {
    if (isTyping(event.target) || !matchesCombo(event, combo, os)) return;
    event.preventDefault();
    fn();
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
