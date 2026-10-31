/**
 * Builds every package that has a "nordlys" field in its package.json:
 *
 *   extension       → dist/extensions/<outfile>          one IIFE, core bundled in
 *   theme           → dist/themes/<dir>/{user.css,color.ini}
 *   test-extension  → dist/test/<outfile>                 only with --with-test-assets
 *   testAsset       → dist/test/<outfile>                 (the Spicetify mock harness)
 *
 * Usage: tsx tools/build.ts [--with-test-assets] [--watch] [name ...]
 */

import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = path.join(ROOT, "dist");
const WORKSPACE_DIRS = ["packages", "plugins", "themes", "tests/fixtures"];
const REPO_URL = "https://github.com/juan-alvarz/SpicetiGyn";

interface NordlysField {
  type?: "extension" | "theme" | "test-extension";
  name?: string;
  entry?: string;
  outfile?: string;
  dir?: string;
  testAsset?: { entry: string; outfile: string };
}

export interface Pkg {
  /** Folder name, e.g. "spaces" or "codex". */
  slug: string;
  dir: string;
  name: string;
  version: string;
  nordlys: NordlysField;
}

export async function listPackages(): Promise<Pkg[]> {
  const result: Pkg[] = [];
  for (const group of WORKSPACE_DIRS) {
    const base = path.join(ROOT, group);
    let entries: string[] = [];
    try {
      entries = await readdir(base);
    } catch {
      continue;
    }
    for (const slug of entries.sort()) {
      const dir = path.join(base, slug);
      try {
        const json = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
        if (json.nordlys)
          result.push({ slug, dir, name: json.name, version: json.version, nordlys: json.nordlys });
      } catch {
        // Not a package (e.g. a README-only folder).
      }
    }
  }
  return result;
}

/** "<commit>[+changes] <date>", so a log line tells which build is running. */
function buildId(): string {
  const git = (args: string[]) => {
    try {
      return execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  };
  const commit = git(["rev-parse", "--short", "HEAD"]) || "unknown";
  const dirty = git(["status", "--porcelain"]) ? "+changes" : "";
  return `${commit}${dirty} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
}

async function coreVersion(): Promise<string> {
  const json = JSON.parse(await readFile(path.join(ROOT, "packages/core/package.json"), "utf8"));
  return json.version;
}

/** Output path of a package, relative to dist/. */
export function outputOf(pkg: Pkg): string | null {
  const n = pkg.nordlys;
  if (n.type === "extension" && n.outfile) return path.join("extensions", n.outfile);
  if (n.type === "theme" && n.dir) return path.join("themes", n.dir);
  if (n.type === "test-extension" && n.outfile) return path.join("test", n.outfile);
  if (n.testAsset) return path.join("test", n.testAsset.outfile);
  return null;
}

function labelOf(pkg: Pkg): string {
  const name = pkg.nordlys.name ?? pkg.name;
  return name.startsWith("Nordlys") ? name : `Nordlys ${name}`;
}

function scriptOptions(
  pkg: Pkg,
  entry: string,
  outfile: string,
  core: string,
): esbuild.BuildOptions {
  const label = labelOf(pkg);
  return {
    entryPoints: [path.join(pkg.dir, entry)],
    outfile,
    bundle: true,
    format: "iife",
    platform: "browser",
    // Spotify's desktop app runs a recent Chromium (CEF); this keeps a safety margin.
    target: ["chrome108"],
    // Readable on purpose: people audit extensions before installing them.
    minify: false,
    charset: "utf8",
    legalComments: "inline",
    loader: { ".css": "text", ".svg": "text" },
    define: {
      __NORDLYS_VERSION__: JSON.stringify(pkg.version),
      __NORDLYS_CORE_VERSION__: JSON.stringify(core),
      __NORDLYS_BUILD__: JSON.stringify(buildId()),
    },
    banner: { js: `// ${label} v${pkg.version} (core ${core}) · ${REPO_URL}` },
    logLevel: "warning",
  };
}

async function buildTheme(pkg: Pkg): Promise<void> {
  const n = pkg.nordlys;
  if (!n.dir) throw new Error(`${pkg.name}: "nordlys.dir" is required for themes`);
  const out = path.join(DIST, "themes", n.dir);
  await mkdir(out, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(pkg.dir, "src/user.css")],
    outfile: path.join(out, "user.css"),
    bundle: true,
    // Spotify's Chromium supports nesting and modern color syntax, so nothing is lowered.
    target: ["chrome108"],
    // Google Fonts @imports stay as-is.
    external: ["https://*"],
    charset: "utf8",
    banner: { css: `/* ${labelOf(pkg)} v${pkg.version} · ${REPO_URL} */` },
    logLevel: "warning",
  });
  await copyFile(path.join(pkg.dir, "color.ini"), path.join(out, "color.ini"));
}

export interface BuildOptions {
  withTestAssets?: boolean;
  only?: string[];
  watch?: boolean;
  onRebuild?(pkg: Pkg, output: string): void | Promise<void>;
}

export async function build(options: BuildOptions = {}): Promise<Pkg[]> {
  const core = await coreVersion();
  const all = await listPackages();
  const selected = all.filter((pkg) => {
    const isTest = pkg.nordlys.type === "test-extension" || pkg.nordlys.testAsset !== undefined;
    if (isTest && !options.withTestAssets) return false;
    if (!outputOf(pkg)) return false;
    return !options.only?.length || options.only.includes(pkg.slug);
  });
  if (options.only?.length && selected.length === 0) {
    throw new Error(
      `Nothing to build for: ${options.only.join(", ")}. Known: ${all.map((p) => p.slug).join(", ")}`,
    );
  }

  if (!options.only?.length && !options.watch) await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const pkg of selected) {
    const rel = outputOf(pkg) as string;
    const n = pkg.nordlys;
    if (n.type === "theme") {
      await buildTheme(pkg);
      console.log(`  theme      dist/${rel.replaceAll("\\", "/")}/`);
      continue;
    }
    const entry = n.testAsset?.entry ?? n.entry;
    if (!entry) throw new Error(`${pkg.name}: "nordlys.entry" is required`);
    const opts = scriptOptions(pkg, entry, path.join(DIST, rel), core);
    if (options.watch) {
      const ctx = await esbuild.context({
        ...opts,
        plugins: [
          {
            name: "nordlys-on-rebuild",
            setup(b) {
              b.onEnd(async (result) => {
                if (result.errors.length === 0)
                  await options.onRebuild?.(pkg, path.join(DIST, rel));
              });
            },
          },
        ],
      });
      await ctx.watch();
    } else {
      await esbuild.build(opts);
    }
    console.log(`  ${(n.type ?? "test").padEnd(10)} dist/${rel.replaceAll("\\", "/")}`);
  }

  if (options.withTestAssets) {
    await copyFile(
      path.join(ROOT, "packages/spicetify-mock/harness/index.html"),
      path.join(DIST, "test/index.html"),
    );
  }
  return selected;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.filter((a) => !a.startsWith("--"));
  console.log("Building…");
  await build({
    withTestAssets: args.includes("--with-test-assets"),
    only,
    watch: args.includes("--watch"),
  });
  if (args.includes("--watch")) console.log("Watching for changes. Press Ctrl+C to stop.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
