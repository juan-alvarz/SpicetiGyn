import { afterEach, describe, expect, it, vi } from "vitest";
import { mountInSlot } from "../src/compat/slots";
import { createLogger } from "../src/log";

const log = createLogger("test");
const tick = () => new Promise((r) => setTimeout(r, 0));

function sidebar() {
  const el = document.createElement("div");
  el.id = "Desktop_LeftSidebar_Id";
  el.style.paddingBottom = "4px";
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("slots", () => {
  it("pins an element to the bottom of the left sidebar and reserves room for it", () => {
    const target = sidebar();
    const el = document.createElement("div");
    const handle = mountInSlot("left-sidebar-bottom", el, log);
    expect(handle.attached).toBe(true);
    expect(el.parentElement).toBe(target);
    expect(el.style.position).toBe("absolute");
    expect(target.style.position).toBe("relative");
    expect(target.style.boxSizing).toBe("border-box");
    handle.remove();
    expect(el.isConnected).toBe(false);
    expect(target.style.position).toBe("");
    expect(target.style.paddingBottom).toBe("4px");
  });

  it("waits for the sidebar, and follows it when Spotify replaces it", async () => {
    const el = document.createElement("div");
    const handle = mountInSlot("left-sidebar-bottom", el, log);
    expect(handle.attached).toBe(false);

    const first = sidebar();
    await tick();
    expect(el.parentElement).toBe(first);

    first.remove();
    const second = sidebar();
    await tick();
    expect(el.parentElement).toBe(second);
    handle.remove();
  });

  it("warns once when it can't find the place", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const handle = mountInSlot("left-sidebar-bottom", document.createElement("div"), log);
      vi.advanceTimersByTime(20_000);
      expect(warn).toHaveBeenCalledOnce();
      handle.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
