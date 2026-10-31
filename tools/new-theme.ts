/**
 * Scaffolds a new theme: npm run new:theme -- <slug> ["Display name"]
 *
 * Creates themes/<slug>/ with color.ini, src/user.css (importing the shared theme kit),
 * README, CHANGELOG and package.json, and adds a Marketplace entry to manifest.json.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./build";
import { manifestEntryFor, readManifest, writeManifest } from "./manifest";

const [slug, displayArg] = process.argv.slice(2);

if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error(
    'Usage: npm run new:theme -- <slug> ["Display name"]   (slug: lowercase letters, digits, dashes)',
  );
  process.exit(1);
}

const title =
  displayArg ?? slug.replace(/(^|-)([a-z])/g, (_, __, c: string) => ` ${c.toUpperCase()}`).trim();
const name = `Nordlys ${title}`;
const dirName = `Nordlys${title.replace(/[^A-Za-z0-9]/g, "")}`;
const dir = path.join(ROOT, "themes", slug);

try {
  await access(dir);
  console.error(`themes/${slug} already exists.`);
  process.exit(1);
} catch {
  // Good: it doesn't exist yet.
}

const files: Record<string, string> = {
  "package.json": `${JSON.stringify(
    {
      name: `@nordlys/theme-${slug}`,
      version: "0.1.0",
      private: true,
      description: `${name} theme for Spicetify.`,
      devDependencies: { "@nordlys/theme-kit": "*" },
      nordlys: { type: "theme", name, dir: dirName },
    },
    null,
    2,
  )}\n`,
  "color.ini": `; ${name}. Values are hex without '#'. Each key becomes --spice-<key> and --spice-rgb-<key>.
; Add more [Schemes] below; users pick one with: spicetify config color_scheme <Scheme>

[Base]
text               = ffffff
subtext            = b3b3b3
main               = 121212
main-elevated      = 242424
highlight          = 1a1a1a
highlight-elevated = 2a2a2a
sidebar            = 000000
player             = 000000
card               = 1f1f1f
shadow             = 000000
selected-row       = ffffff
button             = 1ed760
button-active      = 1ed760
button-disabled    = 535353
tab-active         = 333333
notification       = 4687d6
notification-error = e22134
misc               = 7f7f7f
`,
  "src/user.css": `/*
 * ${name}.
 * The theme kit below adds the macOS/Windows platform rules and maps Spotify's color tokens
 * to color.ini. Keep these rules: never touch -webkit-app-region, never place anything in
 * the top bar corners, and @import every font you use.
 */
@import "@nordlys/theme-kit/base.css";

/* Your styles here. Prefer .Root__* and .main-* class names (Spicetify keeps them stable). */
`,
  "README.md": `# ${name}

<!-- One sentence about the look. -->

![Preview](preview.png)

## Install

See [Installing a theme](https://github.com/juan-alvarz/SpicetiGyn/blob/main/docs/install.md#themes). Folder name: \`${dirName}\`.

## Color schemes

| Scheme | |
|---|---|
| \`Base\` | |
`,
  "CHANGELOG.md": `# @nordlys/theme-${slug}\n`,
};

for (const [file, content] of Object.entries(files)) {
  const target = path.join(dir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

const manifest = await readManifest();
manifest.push(
  manifestEntryFor({ kind: "theme", slug, name, dirName, description: `${name} theme.` }),
);
await writeManifest(manifest);

const readme = await readFile(path.join(ROOT, "README.md"), "utf8");
console.log(`Created themes/${slug}/ and added it to manifest.json.

Next:
  1. npm install            (links the theme kit)
  2. edit themes/${slug}/color.ini and src/user.css
  3. npm run dev -- install ${slug} && npm run dev -- enable ${slug}
  4. add a preview.png (Marketplace requires one)${readme.includes(name) ? "" : `\n  5. list it in README.md`}`);
