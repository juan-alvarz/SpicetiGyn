// Replaced at build time by tools/build.ts and in tests by vitest.config.ts.
declare const __NORDLYS_CORE_VERSION__: string;

// CSS and SVG files are imported as plain strings (esbuild "text" loader).
declare module "*.css" {
  const css: string;
  export default css;
}
declare module "*.svg" {
  const svg: string;
  export default svg;
}
