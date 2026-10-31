// @vitest-environment node
import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listPackages, ROOT } from "./build";
import { DIST_BRANCH, manifestEntryFor, readManifest, sourceOf } from "./manifest";

describe("manifest.json", () => {
  it("has a Marketplace entry for every extension and theme, with the right paths", async () => {
    const manifest = await readManifest();
    const shipped = (await listPackages()).filter(
      (p) => p.nordlys.type === "extension" || p.nordlys.type === "theme",
    );
    expect(manifest).toHaveLength(shipped.length);

    for (const pkg of shipped) {
      const entry = manifest.find((e) => e.name === sourceOf(pkg, "")?.name);
      expect(entry, `missing entry for ${pkg.name}`).toBeDefined();
      const source = sourceOf(pkg, entry?.description ?? "");
      expect(source).not.toBeNull();
      if (!entry || !source) continue;
      expect(entry).toEqual({
        ...manifestEntryFor(source),
        tags: entry.tags,
        authors: entry.authors,
      });
      expect(entry.branch).toBe(DIST_BRANCH);
      expect(entry.description.length).toBeGreaterThan(20);
      // The files the release copies to the dist branch must exist.
      await access(path.join(pkg.dir, "README.md"));
      await access(path.join(pkg.dir, "preview.png"));
    }
  });

  it("is valid for the Marketplace", async () => {
    for (const entry of await readManifest()) {
      for (const field of ["name", "description", "preview", "readme"] as const)
        expect(entry[field]).toBeTruthy();
      expect(Boolean(entry.main) !== Boolean(entry.usercss && entry.schemes)).toBe(true);
    }
    await access(path.join(ROOT, "manifest.json"));
  });
});
