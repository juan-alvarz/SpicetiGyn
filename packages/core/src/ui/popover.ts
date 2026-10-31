export interface PopoverHandle {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  /** Replaces the content by calling `render` again. */
  rerender(): void;
  /** Recomputes the position, e.g. after the content changed size. */
  reposition(): void;
  close(): void;
}

export interface PopoverOptions {
  pluginId: string;
  className?: string;
  label?: string;
  onClose?(): void;
}

const GAP = 8;
const MARGIN = 12;
/** Spotify's top bar across versions, then generic landmarks. Only used for placement. */
const TOP_BAR =
  "#global-nav-bar, [data-testid='topbar'], .Root__globalNav, .Root__top-bar, [role='banner']";

/**
 * Opens a fixed-position popover under `anchor` (or above it when there is more room).
 * It is clamped to the viewport so it never slides under the macOS traffic lights or the
 * Windows caption buttons, which sit in the top bar corners above any anchor we use.
 */
export function openPopover(
  anchor: HTMLElement | null,
  render: (close: () => void) => HTMLElement,
  options: PopoverOptions,
): PopoverHandle {
  const root = document.createElement("div");
  root.className = ["nl-popover", options.className].filter(Boolean).join(" ");
  root.dataset.nlPlugin = options.pluginId;
  root.setAttribute("role", "dialog");
  if (options.label) root.setAttribute("aria-label", options.label);
  let open = true;

  const close = () => {
    if (!open) return;
    open = false;
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", reposition);
    root.remove();
    options.onClose?.();
  };

  function reposition() {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const rect = anchor?.getBoundingClientRect() ?? { left: vw / 2, width: 0, top: 64, bottom: 64 };
    // Never overlap Spotify's top bar, where macOS draws the traffic lights and Windows its
    // window buttons: open below all of it, and when opening upwards, stop under it.
    const bar = document.querySelector(TOP_BAR)?.getBoundingClientRect();
    const barBottom = bar && bar.height > 0 ? bar.bottom : 0;
    const inBar = anchor ? anchor.closest(TOP_BAR) !== null : false;
    const bottom = inBar ? Math.max(rect.bottom, barBottom) : rect.bottom;
    const ceiling = Math.max(MARGIN, barBottom + GAP);
    const width = Math.min(root.offsetWidth || 340, vw - MARGIN * 2);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, MARGIN),
      vw - width - MARGIN,
    );
    const below = vh - bottom - GAP - MARGIN;
    const above = rect.top - GAP - ceiling;
    root.style.left = `${Math.round(left)}px`;
    if (below >= 240 || below >= above) {
      root.style.top = `${Math.round(bottom + GAP)}px`;
      root.style.bottom = "";
      root.style.maxHeight = `${Math.max(160, Math.round(below))}px`;
    } else {
      root.style.top = "";
      root.style.bottom = `${Math.round(vh - rect.top + GAP)}px`;
      root.style.maxHeight = `${Math.max(160, Math.round(above))}px`;
    }
  }

  function onPointerDown(event: Event) {
    const target = event.target as Node | null;
    if (target && (root.contains(target) || anchor?.contains(target))) return;
    close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      anchor?.focus?.();
    }
  }

  const rerender = () => {
    root.replaceChildren(render(close));
  };

  rerender();
  document.body.appendChild(root);
  reposition();
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", reposition);

  return {
    element: root,
    get isOpen() {
      return open;
    },
    rerender,
    reposition,
    close,
  };
}
