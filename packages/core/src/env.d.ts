// Replaced at build time by tools/build.ts and in tests by vitest.config.ts.
declare const __NORDLYS_CORE_VERSION__: string;
/** Commit and build time, e.g. "8f8fc58 2026-10-31 14:02". */
declare const __NORDLYS_BUILD__: string;

// CSS and SVG files are imported as plain strings (esbuild "text" loader).
declare module "*.css" {
  const css: string;
  export default css;
}
declare module "*.svg" {
  const svg: string;
  export default svg;
}
