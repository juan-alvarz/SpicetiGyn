/**
 * Publishes every shipped package whose current version has no git tag yet:
 *   1. builds everything
 *   2. tags <package name>@<version> and pushes the tag
 *   3. creates a GitHub Release with the built files attached (needs the `gh` CLI)
 *   4. updates the `dist` branch that manifest.json points the Marketplace at
 *
 * Run by .github/workflows/release.yml after the Changesets "Version packages" PR is merged.
 * Safe to re-run: released versions are skipped. Use --dry-run to only print what would happen.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build, DIST, type Pkg, ROOT } from "./build";
import { DIST_BRANCH, distFolder, sourceOf } from "./manifest";

const dryRun = process.argv.includes("--dry-run");

/** Local or read-only commands; they run in a dry run too. */
function run(cmd: string, args: string[], cwd = ROOT): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

/** Commands that publish something (tags, pushes, releases); only printed in a dry run. */
function act(cmd: string, args: string[], cwd = ROOT): void {
  if (dryRun) console.log(`  (dry run) ${cmd} ${args.join(" ")}`);
  else run(cmd, args, cwd);
}

function remoteHasTag(tag: string): boolean {
  return run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]) !== "";
}

/** The CHANGELOG section for one version, used as release notes. */
async function notesFor(pkg: Pkg): Promise<string> {
  try {
    const log = await readFile(path.join(pkg.dir, "CHANGELOG.md"), "utf8");
    const start = log.indexOf(`## ${pkg.version}`);
    if (start < 0) return `${pkg.name} ${pkg.version}`;
    const next = log.indexOf("\n## ", start + 1);
    return log.slice(start, next < 0 ? undefined : next).trim();
  } catch {
    return `${pkg.name} ${pkg.version}`;
  }
}

/** Files that go on the dist branch and into the release, keyed by their name there. */
async function filesOf(pkg: Pkg): Promise<Record<string, string>> {
  const n = pkg.nordlys;
  const files: Record<string, string> = {
    "README.md": path.join(pkg.dir, "README.md"),
    "preview.png": path.join(pkg.dir, "preview.png"),
  };
  if (n.type === "extension" && n.outfile)
    files[n.outfile] = path.join(DIST, "extensions", n.outfile);
  if (n.type === "theme" && n.dir) {
    for (const f of await readdir(path.join(DIST, "themes", n.dir)))
      files[f] = path.join(DIST, "themes", n.dir, f);
  }
  return files;
}

async function release(pkg: Pkg, tag: string) {
  const files = await filesOf(pkg);
  const assets: string[] = [];
  if (pkg.nordlys.type === "extension" && pkg.nordlys.outfile) {
    assets.push(files[pkg.nordlys.outfile] as string);
  } else if (pkg.nordlys.type === "theme" && pkg.nordlys.dir) {
    // One zip with the theme folder, ready to unzip into Themes/.
    const zip = path.join(DIST, `${pkg.nordlys.dir}.zip`);
    run("zip", ["-r", "-q", zip, pkg.nordlys.dir], path.join(DIST, "themes"));
    assets.push(zip);
  }
  const title = `${sourceOf(pkg, "")?.name ?? pkg.name} ${pkg.version}`;
  act("git", ["tag", tag]);
  act("git", ["push", "origin", tag]);
  act("gh", [
    "release",
    "create",
    tag,
    ...assets,
    "--title",
    title,
    "--notes",
    await notesFor(pkg),
  ]);
}

async function updateDistBranch(pkgs: Pkg[]) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "nordlys-dist-"));
  try {
    const hasRemote = run("git", ["ls-remote", "--heads", "origin", DIST_BRANCH]) !== "";
    if (hasRemote) {
      run("git", ["fetch", "origin", DIST_BRANCH]);
      run("git", ["worktree", "add", "-B", DIST_BRANCH, dir, `origin/${DIST_BRANCH}`]);
    } else {
      run("git", ["worktree", "add", "--detach", dir]);
      run("git", ["checkout", "--orphan", DIST_BRANCH], dir);
    }
    for (const entry of await readdir(dir)) {
      if (entry !== ".git") await rm(path.join(dir, entry), { recursive: true, force: true });
    }

    for (const pkg of pkgs) {
      const source = sourceOf(pkg, "");
      if (!source) continue;
      const folder = path.join(dir, distFolder(source));
      await mkdir(folder, { recursive: true });
      for (const [name, from] of Object.entries(await filesOf(pkg)))
        await cp(from, path.join(folder, name));
    }
    await writeFile(
      path.join(dir, "README.md"),
      "# dist\n\nBuilt files for the Spicetify Marketplace, written by `tools/release.ts`. Don't edit by hand; the source is on `main`.\n",
    );

    run("git", ["add", "-A"], dir);
    const changed = run("git", ["status", "--porcelain"], dir) !== "";
    if (!changed) {
      console.log("dist branch is already up to date.");
      return;
    }
    if (dryRun) {
      console.log(
        `  (dry run) would commit and push ${DIST_BRANCH}:\n${run("git", ["status", "--short"], dir)}`,
      );
      return;
    }
    act(
      "git",
      [
        "-c",
        "user.name=github-actions[bot]",
        "-c",
        "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit",
        "-q",
        "-m",
        "Update built files",
      ],
      dir,
    );
    act("git", ["push", "origin", `${DIST_BRANCH}:${DIST_BRANCH}`], dir);
  } finally {
    run("git", ["worktree", "remove", "--force", dir]);
  }
}

const shipped = (await build()).filter(
  (p) => p.nordlys.type === "extension" || p.nordlys.type === "theme",
);
let released = 0;
for (const pkg of shipped) {
  const tag = `${pkg.name}@${pkg.version}`;
  if (remoteHasTag(tag)) {
    console.log(`${tag} is already released.`);
    continue;
  }
  console.log(`Releasing ${tag}…`);
  await release(pkg, tag);
  released++;
}
await updateDistBranch(shipped);
console.log(released ? `Released ${released} package(s).` : "Nothing new to release.");
