import type { SpicetifyLike } from "./compat/spicetify";

export type OS = "mac" | "windows" | "linux";

export interface PlatformInfo {
  readonly os: OS;
  /** "mod+alt+1" → "⌘⌥1" on macOS, "Ctrl+Alt+1" on Windows and Linux. */
  formatShortcut(combo: string): string;
}

export function detectOS(
  spicetify?: SpicetifyLike,
  userAgent = globalThis.navigator?.userAgent ?? "",
): OS {
  const name = (spicetify?.Platform?.PlatformData?.os_name ?? "").toLowerCase();
  const source = name || userAgent.toLowerCase();
  if (/osx|mac|darwin/.test(source)) return "mac";
  if (/win/.test(source)) return "windows";
  return "linux";
}

const MAC_KEYS: Record<string, string> = { mod: "⌘", meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" };
const PC_KEYS: Record<string, string> = {
  mod: "Ctrl",
  meta: "Win",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

export function formatShortcut(combo: string, os: OS): string {
  const parts = combo.split("+").map((p) => p.trim().toLowerCase());
  const names = os === "mac" ? MAC_KEYS : PC_KEYS;
  const labels = parts.map(
    (p) => names[p] ?? (p.length === 1 ? p.toUpperCase() : p[0]?.toUpperCase() + p.slice(1)),
  );
  return os === "mac" ? labels.join("") : labels.join("+");
}

export function createPlatform(spicetify?: SpicetifyLike): PlatformInfo {
  const os = detectOS(spicetify);
  return { os, formatShortcut: (combo) => formatShortcut(combo, os) };
}
