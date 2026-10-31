/**
 * Developer loop for macOS, Windows and Linux.
 *
 *   npm run dev -- path                     print the Spicetify userdata folder
 *   npm run dev -- open [dist]              open the userdata folder (or dist/) in Finder / Explorer
 *   npm run dev -- install [name…] [--link] build, then copy (or link) into Extensions/ and Themes/
 *   npm run dev -- watch [name…]            rebuild on change and copy into userdata each time
 *   npm run dev -- enable <name> [scheme]   extension: spicetify config extensions <file>; theme: current_theme
 *   npm run dev -- disable <name>           extension: config extensions <file>-; theme: back to stock
 *
 * Names are package folder names: spaces, codex, … Set NORDLYS_SPICETIFY_USERDATA to override
 * the userdata folder. Add --no-apply to skip `spicetify apply` after enable/disable.
 */
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, DIST, listPackages, outputOf, type Pkg } from "./build";

const isWindows = process.platform === "win32";

function spicetify(
  args: string[],
  options: { quiet?: boolean } = {},
): { ok: boolean; out: string } {
  // spicetify is a .exe on Windows (PowerShell installer) and a binary elsewhere; a shell
  // also finds .cmd/.ps1 shims on Windows.
  const result = spawnSync("spicetify", args, { encoding: "utf8", shell: isWindows });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (!options.quiet && out) console.log(out);
  return { ok: result.status === 0, out };
}

export function defaultUserdata(
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
): string {
  if (platform === "win32")
    return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), "spicetify");
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "spicetify");
}

function userdata(): string {
  if (process.env.NORDLYS_SPICETIFY_USERDATA) return process.env.NORDLYS_SPICETIFY_USERDATA;
  const { ok, out } = spicetify(["path", "userdata"], { quiet: true });
  const line = out.split(/\r?\n/).find((l) => l.trim() && !/error|warn/i.test(l));
  if (ok && line) return line.trim();
  const fallback = defaultUserdata();
  console.warn(
    `Couldn't run "spicetify path userdata"; using ${fallback}. Is Spicetify installed and on PATH?`,
  );
  return fallback;
}

async function select(names: string[]): Promise<Pkg[]> {
  const all = (await listPackages()).filter(
    (p) => p.nordlys.type === "extension" || p.nordlys.type === "theme",
  );
  const slugs = all.map((p) => p.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupes.length)
    throw new Error(`Two packages share the folder name "${dupes[0]}"; rename one.`);
  if (names.length === 0) return all;
  const picked = all.filter((p) => names.includes(p.slug));
  const unknown = names.filter((n) => !picked.some((p) => p.slug === n));
  if (unknown.length)
    throw new Error(`Unknown: ${unknown.join(", ")}. Known: ${all.map((p) => p.slug).join(", ")}`);
  return picked;
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** Copies (or links) one built package into the userdata folder. */
async function place(pkg: Pkg, root: string, link: boolean): Promise<string> {
  const rel = outputOf(pkg) as string;
  const source = path.join(DIST, rel);
  const isTheme = pkg.nordlys.type === "theme";
  const target = isTheme
    ? path.join(root, "Themes", pkg.nordlys.dir as string)
    : path.join(root, "Extensions", pkg.nordlys.outfile as string);
  await mkdir(path.dirname(target), { recursive: true });

  if (link) {
    if (await exists(target)) await rm(target, { recursive: true, force: true });
    try {
      // Junctions need no special rights on Windows; file symlinks need Developer Mode.
      await symlink(source, target, isTheme ? (isWindows ? "junction" : "dir") : "file");
      return `${target} → ${source}`;
    } catch (error) {
      console.warn(
        `Couldn't link (${(error as Error).message}); copying instead. On Windows, file links need Developer Mode.`,
      );
    }
  }
  if ((await exists(target)) && (await lstat(target)).isSymbolicLink())
    await rm(target, { force: true });
  if (isTheme) {
    await mkdir(target, { recursive: true });
    for (const file of await readdir(source))
      await cp(path.join(source, file), path.join(target, file));
  } else {
    await cp(source, target);
  }
  return target;
}

/** Why `spicetify apply` didn't finish, judged from its output (it can exit 0 on these). */
export function applyProblem(ok: boolean, out: string): "backup" | "other" | null {
  if (/mismatch|cannot be backed up|backup apply/i.test(out)) return "backup";
  if (!ok || /\berror\b/i.test(out)) return "other";
  return null;
}

function applyUnless(flags: string[]) {
  if (flags.includes("--no-apply")) return;
  console.log("Running spicetify apply…");
  const { ok, out } = spicetify(["apply"]);
  const problem = applyProblem(ok, out);
  if (!problem) return;
  process.exitCode = 1;
  console.error("\n✗ spicetify apply didn't finish, so nothing was applied to Spotify.");
  if (problem === "backup") {
    console.error(`  Spotify updated itself since Spicetify last backed it up. To fix it:
    1. Quit Spotify.
    2. spicetify update
    3. Reinstall Spotify from https://www.spotify.com/download (or: brew reinstall --cask spotify).
    4. Open Spotify once, log in, then quit it.
    5. spicetify backup apply
  Your Nordlys settings are already saved in Spicetify's config; step 5 applies them.
  See docs/install.md → Troubleshooting.`);
  } else {
    console.error("  Read Spicetify's messages above, fix that, then run: spicetify apply");
  }
}

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const flags = rest.filter((a) => a.startsWith("--"));
  const names = rest.filter((a) => !a.startsWith("--"));

  switch (command) {
    case "path": {
      console.log(userdata());
      break;
    }

    case "open": {
      const folder = names[0] === "dist" ? DIST : userdata();
      await mkdir(folder, { recursive: true });
      console.log(folder);
      const opener = isWindows ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
      // Explorer exits with 1 even when it opens the folder, so only a failed spawn counts.
      const result = spawnSync(opener, [folder], { stdio: "ignore" });
      if (result.error)
        console.log(`Couldn't open a file browser; open the folder above yourself.`);
      break;
    }

    case "install": {
      const pkgs = await select(names);
      await build({ only: pkgs.map((p) => p.slug) });
      const root = userdata();
      for (const pkg of pkgs)
        console.log(`  ${pkg.slug.padEnd(10)} ${await place(pkg, root, flags.includes("--link"))}`);
      console.log(`\nInstalled. Turn one on with: npm run dev -- enable <name>`);
      break;
    }

    case "watch": {
      const pkgs = await select(names);
      const root = userdata();
      console.log(`Watching ${pkgs.map((p) => p.slug).join(", ")}; copies go to ${root}`);
      await build({
        only: pkgs.map((p) => p.slug),
        watch: true,
        async onRebuild(pkg) {
          if (pkgs.some((p) => p.slug === pkg.slug)) {
            await place(pkg, root, false);
            console.log(`  ${new Date().toLocaleTimeString()} ${pkg.slug} updated`);
          }
        },
      });
      for (const pkg of pkgs.filter((p) => p.nordlys.type === "theme"))
        await place(pkg, root, false);
      console.log("\nIn another terminal, run:  spicetify watch -e    (add -s for themes)");
      console.log(
        "Spotify reloads each time a file changes. Theme CSS is rebuilt when you run npm run dev -- install.",
      );
      break;
    }

    case "enable":
    case "disable": {
      const [pkg] = await select(names.slice(0, 1));
      if (!pkg || names.length === 0) throw new Error(`Usage: npm run dev -- ${command} <name>`);
      if (pkg.nordlys.type === "extension") {
        const file = pkg.nordlys.outfile as string;
        spicetify(["config", "extensions", command === "enable" ? file : `${file}-`]);
      } else if (command === "enable") {
        const scheme = names[1];
        spicetify([
          "config",
          "current_theme",
          pkg.nordlys.dir as string,
          ...(scheme ? ["color_scheme", scheme] : []),
        ]);
        spicetify(["config", "inject_css", "1", "replace_colors", "1"]);
      } else {
        // An empty current_theme means stock Spotify. Spicetify clears a value ending in "-",
        // but parses a bare "-" as a flag unless "--" comes first.
        spicetify(["--", "config", "current_theme", "-"]);
      }
      applyUnless(flags);
      break;
    }

    default:
      console.log(`Usage:
  npm run dev -- path
  npm run dev -- open [dist]
  npm run dev -- install [name…] [--link]
  npm run dev -- watch [name…]
  npm run dev -- enable <name> [scheme] [--no-apply]
  npm run dev -- disable <name> [--no-apply]

Names: ${(await select([])).map((p) => p.slug).join(", ")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
