// The six space colors from the "Your spaces" prototype. g0 is the darkest (window base),
// g1–g3 are the glows, card is a dark surface, accent is for highlights.
export interface ColorPreset {
  name: string;
  g0: string;
  g1: string;
  g2: string;
  g3: string;
  card: string;
  accent: string;
}

export const COLOR_PRESETS = {
  fjord: {
    name: "Fjord",
    g0: "#0c1724",
    g1: "#1f6a80",
    g2: "#33409a",
    g3: "#123e4e",
    card: "#0f141a",
    accent: "#8ed6e3",
  },
  ember: {
    name: "Ember",
    g0: "#22141f",
    g1: "#d9853f",
    g2: "#b4466b",
    g3: "#6b3a8c",
    card: "#17121a",
    accent: "#f6c27a",
  },
  aurora: {
    name: "Aurora",
    g0: "#0b0b19",
    g1: "#3b2f8f",
    g2: "#1b2a5a",
    g3: "#5a2f6e",
    card: "#111120",
    accent: "#b9a6ff",
  },
  moss: {
    name: "Moss",
    g0: "#0d1810",
    g1: "#2e6b3f",
    g2: "#5f7a2a",
    g3: "#1b3a28",
    card: "#101511",
    accent: "#a6d47a",
  },
  berry: {
    name: "Berry",
    g0: "#1e0c16",
    g1: "#b33a56",
    g2: "#6a2c7a",
    g3: "#e06a55",
    card: "#161015",
    accent: "#f29aae",
  },
  glacier: {
    name: "Glacier",
    g0: "#0e1620",
    g1: "#5c8fb0",
    g2: "#2b4d6e",
    g3: "#8fb8c8",
    card: "#11161c",
    accent: "#cfe8f5",
  },
} as const satisfies Record<string, ColorPreset>;

export type ColorId = keyof typeof COLOR_PRESETS;
export const COLOR_IDS = Object.keys(COLOR_PRESETS) as ColorId[];

/** "#8ed6e3" → "142, 214, 227" */
export function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Near-black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function onColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
    .split(", ")
    .map((c) => {
      const v = Number(c) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#111111" : "#ffffff";
}
