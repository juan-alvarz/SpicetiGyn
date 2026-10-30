import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

const TEXT_PREFIX = "\0nl-text:";

/** Imports .css and .svg files as strings, like esbuild's "text" loader in tools/build.ts. */
function textImports(): Plugin {
  return {
    name: "nordlys-text-imports",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!/\.(css|svg)$/.test(source) || !importer) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      // The ".js" suffix keeps Vite's own CSS pipeline away from these ids.
      return resolved ? `${TEXT_PREFIX}${resolved.id}.js` : null;
    },
    load(id) {
      if (!id.startsWith(TEXT_PREFIX)) return null;
      const file = id.slice(TEXT_PREFIX.length, -".js".length);
      return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
    },
  };
}

export default defineConfig({
  plugins: [textImports()],
  define: {
    __NORDLYS_VERSION__: JSON.stringify("0.0.0-test"),
    __NORDLYS_CORE_VERSION__: JSON.stringify("0.0.0-test"),
  },
  test: {
    environment: "happy-dom",
    include: ["packages/*/test/**/*.test.ts", "plugins/*/test/**/*.test.ts", "tools/**/*.test.ts"],
    restoreMocks: true,
  },
});
