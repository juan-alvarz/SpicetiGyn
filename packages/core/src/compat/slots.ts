import type { Logger } from "../log";

/**
 * Named places in Spotify's layout where a plugin can put its own UI. The core keeps the
 * selectors for each Spotify version here, so plugins never depend on Spotify's DOM.
 *
 * Selectors are tried in order. Prefer ids, data-testid and landmarks: Spotify 1.3.x no longer
 * has the readable .Root__* / .main-* names that Spicetify used to provide.
 */
const SLOTS = {
  /** Pinned to the bottom of the left sidebar (Your Library). */
  "left-sidebar-bottom": ["#Desktop_LeftSidebar_Id", ".Root__nav-bar"],
} as const;

export type SlotName = keyof typeof SLOTS;

export interface SlotHandle {
  readonly element: HTMLElement;
  /** True while the element is in the page. */
  readonly attached: boolean;
  remove(): void;
}

const GAP = 8;
const GIVE_UP_MS = 15_000;

/**
 * Pins `element` to a slot and keeps it there: Spotify re-renders its layout (and replaces
 * the sidebar when you resize or collapse it), so a MutationObserver re-attaches it. The slot
 * gets bottom padding so its own content isn't hidden behind the element. Every style change
 * on Spotify's element is undone by `remove()`.
 */
export function mountInSlot(name: SlotName, element: HTMLElement, log: Logger): SlotHandle {
  let target: HTMLElement | null = null;
  let saved: { position: string; paddingBottom: string; boxSizing: string } | null = null;
  let removed = false;
  let scheduled = false;

  element.dataset.nlSlot = name;
  Object.assign(element.style, {
    position: "absolute",
    left: `${GAP}px`,
    right: `${GAP}px`,
    bottom: `${GAP}px`,
    zIndex: "2",
  });

  const release = () => {
    if (target && saved) {
      target.style.position = saved.position;
      target.style.paddingBottom = saved.paddingBottom;
      target.style.boxSizing = saved.boxSizing;
    }
    target = null;
    saved = null;
  };

  const reserve = () => {
    if (target && saved) target.style.paddingBottom = `${element.offsetHeight + GAP * 2}px`;
  };

  const find = () => {
    for (const selector of SLOTS[name]) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    }
    return null;
  };

  const attach = () => {
    scheduled = false;
    if (removed) return;
    const next = find();
    if (!next) return;
    if (next === target && element.parentElement === next) return;
    release();
    target = next;
    saved = {
      position: next.style.position,
      paddingBottom: next.style.paddingBottom,
      boxSizing: next.style.boxSizing,
    };
    const position = getComputedStyle(next).position;
    if (!position || position === "static") next.style.position = "relative";
    next.style.boxSizing = "border-box";
    next.appendChild(element);
    reserve();
  };

  const observer = new MutationObserver(() => {
    if (scheduled || removed) return;
    if (element.isConnected && element.parentElement === target && target?.isConnected) return;
    scheduled = true;
    queueMicrotask(attach);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(reserve) : null;
  resize?.observe(element);

  attach();
  const giveUp = setTimeout(() => {
    if (!element.isConnected) {
      log.warnOnce(`slot.${name}`, `Couldn't find a place for "${name}" in this Spotify version.`);
    }
  }, GIVE_UP_MS);

  return {
    element,
    get attached() {
      return element.isConnected;
    },
    remove() {
      removed = true;
      clearTimeout(giveUp);
      observer.disconnect();
      resize?.disconnect();
      element.remove();
      release();
    },
  };
}
