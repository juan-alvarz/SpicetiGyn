/**
 * The Spicetify Marketplace manifest and the `dist` branch layout it points to.
 *
 * The Marketplace finds the repo by its GitHub topics, reads manifest.json from the default
 * branch, and fetches each entry's files from `branch`. Built files live on the `dist` branch
 * (written by tools/release.ts) so `main` stays free of build output:
 *
 *   dist branch
 *   ├─ spaces/            nordlys-spaces.js, README.md, preview.png
 *   └─ NordlysCodex/      user.css, color.ini, README.md, preview.png
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Pkg, ROOT } from "./build";

export const DIST_BRANCH = "dist";
const AUTHORS = [{ name: "juan-alvarz", url: "https://github.com/juan-alvarz" }];

export interface ManifestEntry {
  name: string;
  description: string;
  preview: string;
  readme: string;
  branch: string;
  main?: string;
  usercss?: string;
  schemes?: string;
  authors: Array<{ name: string; url: string }>;
  tags: string[];
}

export type EntrySource =
  | { kind: "extension"; slug: string; name: string; outfile: string; description: string }
  | { kind: "theme"; slug: string; name: string; dirName: string; description: string };

/** Folder of a package on the dist branch. */
export function distFolder(source: EntrySource): string {
  return source.kind === "extension" ? source.slug : source.dirName;
}

export function manifestEntryFor(source: EntrySource): ManifestEntry {
  const folder = distFolder(source);
  const common = {
    name: source.name,
    description: source.description,
    preview: `${folder}/preview.png`,
    readme: `${folder}/README.md`,
    branch: DIST_BRANCH,
    authors: AUTHORS,
  };
  return source.kind === "extension"
    ? { ...common, main: `${folder}/${source.outfile}`, tags: ["nordlys", "productivity"] }
    : {
        ...common,
        usercss: `${folder}/user.css`,
        schemes: `${folder}/color.ini`,
        tags: ["nordlys", "dark"],
      };
}

export function sourceOf(pkg: Pkg, description: string): EntrySource | null {
  const n = pkg.nordlys;
  const name = (n.name ?? pkg.name).startsWith("Nordlys")
    ? (n.name ?? pkg.name)
    : `Nordlys ${n.name}`;
  if (n.type === "extension" && n.outfile)
    return { kind: "extension", slug: pkg.slug, name, outfile: n.outfile, description };
  if (n.type === "theme" && n.dir)
    return { kind: "theme", slug: pkg.slug, name, dirName: n.dir, description };
  return null;
}

const MANIFEST = path.join(ROOT, "manifest.json");

export async function readManifest(): Promise<ManifestEntry[]> {
  return JSON.parse(await readFile(MANIFEST, "utf8"));
}

export async function writeManifest(entries: ManifestEntry[]): Promise<void> {
  await writeFile(MANIFEST, `${JSON.stringify(entries, null, 2)}\n`);
}
