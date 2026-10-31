/**
 * Package boundary rules that the type checker can't express on its own:
 *
 *   1. Plugins never mention `Spicetify`; only packages/core/src/compat/ may.
 *   2. A plugin imports another plugin only as `import type … from "@nordlys/<x>/api"`.
 *   3. Plugin source never imports the mock, and relative imports stay inside the package.
 *   4. Themes never touch -webkit-app-region (it can make the window unmovable on macOS).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./build";

const problems: string[] = [];
const rel = (file: string) => path.relative(ROOT, file).replaceAll("\\", "/");

async function walk(dir: string, ext: RegExp): Promise<string[]> {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full, ext)));
    else if (ext.test(e.name)) files.push(full);
  }
  return files;
}

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const IMPORT_RE = /\bimport\s+(type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;

async function checkPluginSources() {
  const roots = [
    ...(await readdir(path.join(ROOT, "plugins"))).map((d) => path.join(ROOT, "plugins", d)),
    ...(await readdir(path.join(ROOT, "tests/fixtures"))).map((d) =>
      path.join(ROOT, "tests/fixtures", d),
    ),
  ];
  for (const pkgDir of roots) {
    for (const file of await walk(path.join(pkgDir, "src"), /\.tsx?$/)) {
      const code = stripComments(await readFile(file, "utf8"));
      if (/\bSpicetify\b/.test(code)) {
        problems.push(
          `${rel(file)}: plugins must not use Spicetify directly; use the core adapters (ctx.*).`,
        );
      }
      for (const match of code.matchAll(IMPORT_RE)) {
        const isType = Boolean(match[1]);
        const spec = match[2] as string;
        if (spec.startsWith(".")) {
          const target = path.resolve(path.dirname(file), spec);
          if (!target.startsWith(pkgDir + path.sep))
            problems.push(`${rel(file)}: "${spec}" reaches outside its package.`);
        } else if (spec === "@nordlys/spicetify-mock") {
          problems.push(`${rel(file)}: the mock is for tests only.`);
        } else if (spec.startsWith("@nordlys/") && spec !== "@nordlys/core") {
          if (!spec.endsWith("/api") || !isType) {
            problems.push(
              `${rel(file)}: "${spec}": other plugins may only be used as \`import type … from "@nordlys/<plugin>/api"\`.`,
            );
          }
        }
      }
    }
  }
}

async function checkCore() {
  const src = path.join(ROOT, "packages/core/src");
  for (const file of await walk(src, /\.ts$/)) {
    if (file.startsWith(path.join(src, "compat") + path.sep)) continue;
    if (/\bSpicetify\b/.test(stripComments(await readFile(file, "utf8")))) {
      problems.push(`${rel(file)}: only packages/core/src/compat/ may read Spicetify.`);
    }
  }
}

async function checkThemes() {
  const files = [
    ...(await walk(path.join(ROOT, "themes"), /\.css$/)),
    ...(await walk(path.join(ROOT, "packages/theme-kit"), /\.css$/)),
  ];
  for (const file of files) {
    const css = (await readFile(file, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    if (/app-region/.test(css)) problems.push(`${rel(file)}: don't override -webkit-app-region.`);
  }
}

await Promise.all([checkPluginSources(), checkCore(), checkThemes()]);

if (problems.length) {
  console.error(`Boundary check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("Boundary check passed.");
