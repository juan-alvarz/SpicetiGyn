import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const DIST = path.resolve(import.meta.dirname, "../../dist");

async function load(
  page: Page,
  options: Record<string, unknown> = {},
  bundles = ["extensions/nordlys-spaces.js"],
) {
  await page.addInitScript((o) => {
    (window as unknown as { __NL_MOCK_OPTIONS: unknown }).__NL_MOCK_OPTIONS = o;
  }, options);
  await page.goto(`file://${path.join(DIST, "test/index.html")}`);
  await page.addScriptTag({ path: path.join(DIST, "test/mock.js") });
  for (const bundle of bundles) await page.addScriptTag({ path: path.join(DIST, bundle) });
  // Spaces is up once its button exists (in the top bar, or the player bar on old versions).
  if (bundles.some((b) => b.includes("spaces"))) {
    await expect(page.locator("#nl-mock-topbar button, #nl-mock-playbar button")).toHaveCount(1);
  }
}

const html = (page: Page) => page.locator("html");

test("switches spaces from the panel and resumes what each one played", async ({ page }) => {
  await load(page);
  await expect(html(page)).toHaveAttribute("data-nl-space", "focus");

  await page.evaluate(() =>
    window.__mock?.load("spotify:playlist:deepwork", "spotify:track:index", { positionMs: 61_000 }),
  );
  await page.getByRole("button", { name: "Spaces: Focus" }).click();
  const panel = page.getByRole("dialog", { name: "Spaces" });
  await expect(panel).toBeVisible();
  await expect(panel.locator(".nl-spaces-title")).toHaveText("Focus");

  await panel.locator('.nl-space-btn[data-space="chill"]').click();
  await expect(html(page)).toHaveAttribute("data-nl-space", "chill");
  await expect(html(page)).not.toHaveAttribute("data-nl-switching", "");
  await expect(page.getByRole("button", { name: "Spaces: Chill" })).toBeVisible();

  // Focus now shows its paused snapshot in "Other spaces".
  await expect(panel.locator('.nl-spaces-other[data-space="focus"]')).toContainText(
    "Paused · Northern Index · 1:01",
  );

  await panel.locator('.nl-spaces-other[data-space="focus"]').click();
  await expect(html(page)).toHaveAttribute("data-nl-space", "focus");
  const seek = await page.evaluate(() => window.__mock?.callsTo("Player.seek").at(-1));
  expect(seek).toEqual([61_000]);
});

test("creates and edits a space", async ({ page }) => {
  await load(page);
  await page.getByRole("button", { name: "Spaces: Focus" }).click();
  const panel = page.getByRole("dialog", { name: "Spaces" });

  await panel.getByRole("button", { name: "New space" }).click();
  await panel.getByRole("textbox").fill("Gym");
  await panel.getByRole("radio", { name: "Moss" }).click();
  await panel.getByRole("radio", { name: "bolt" }).click();
  await panel.getByRole("button", { name: "Create space" }).click();

  await expect(html(page)).toHaveAttribute("data-nl-space", "gym");
  await expect(html(page)).toHaveAttribute("data-nl-space-color", "moss");

  await panel.getByRole("button", { name: "Edit Gym" }).click();
  await panel.getByRole("textbox").fill("Workout");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.locator(".nl-spaces-title")).toHaveText("Workout");
  await expect(page.getByRole("button", { name: "Spaces: Workout" })).toBeVisible();
});

test("adds the open page and opens it again from the panel", async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__mock?.navigate("/playlist/codingflow"));
  await page.getByRole("button", { name: "Spaces: Focus" }).click();
  const panel = page.getByRole("dialog", { name: "Spaces" });
  await panel.getByRole("button", { name: "Add this page to Focus" }).click();
  await expect(panel.locator(".nl-spaces-items .nl-spaces-item__name")).toHaveText("Coding Flow");

  await page.evaluate(() => window.__mock?.navigate("/"));
  await panel.getByRole("button", { name: "Open Coding Flow" }).click();
  await expect(page.locator("#nl-mock-path")).toHaveText("/playlist/codingflow");
});

test("the panel stays inside the window and clear of the window controls", async ({ page }) => {
  await load(page);
  await page.getByRole("button", { name: "Spaces: Focus" }).click();
  const box = await page.getByRole("dialog", { name: "Spaces" }).boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("no layout");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  // Below the 64px top bar, where macOS draws the traffic lights and Windows its caption buttons.
  expect(box.y).toBeGreaterThanOrEqual(64);
});

test("shows ⌘⌥ hints on macOS and Ctrl+Alt on Windows", async ({ page }) => {
  await load(page, { os: "windows" });
  await page.getByRole("button", { name: "Spaces: Focus" }).click();
  await expect(page.locator(".nl-spaces-current .nl-kbd")).toHaveText("Ctrl+Alt+1");

  await load(page, { os: "osx" });
  await page.getByRole("button", { name: "Spaces: Focus" }).click();
  await expect(page.locator(".nl-spaces-current .nl-kbd")).toHaveText("⌘⌥1");
});

test("another plugin, bundled with its own core, switches spaces over the bus", async ({
  page,
}) => {
  await load(page, {}, ["extensions/nordlys-spaces.js", "test/bus-client.js"]);
  await page.waitForFunction(() => window.__busClient !== undefined);
  const result = await page.evaluate(() => window.__busClient?.endFocusSession("Chill"));
  expect(result).toBe("switched");
  await expect(html(page)).toHaveAttribute("data-nl-space", "chill");
  expect(await page.evaluate(() => window.__busClient?.events)).toEqual(["focus→chill"]);
  // Two copies of the core, one shared host.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __nordlys: { plugins: Map<string, unknown> } }).__nordlys.plugins
          .size,
    ),
  ).toBe(2);
});

test("the other plugin degrades gracefully when Spaces is not installed", async ({ page }) => {
  await load(page, {}, ["test/bus-client.js"]);
  await page.waitForFunction(() => window.__busClient !== undefined);
  expect(await page.evaluate(() => window.__busClient?.endFocusSession("Chill"))).toBe(
    "spaces-not-installed",
  );
});

test("still works on old Spotify versions without Topbar, SubMenu or PlayerAPI", async ({
  page,
}) => {
  await load(page, { topbar: false, subMenu: false, playerApi: false, playerDataShape: "track" });
  await expect(page.locator("#nl-mock-playbar button")).toHaveCount(1);
  await page.evaluate(() =>
    window.__mock?.load("spotify:playlist:deepwork", "spotify:track:grid", { positionMs: 3_000 }),
  );
  await page.evaluate(() => window.__mock?.press("mod+alt+2"));
  await expect(html(page)).toHaveAttribute("data-nl-space", "chill");
  await page.evaluate(() => window.__mock?.press("mod+alt+1"));
  await expect(html(page)).toHaveAttribute("data-nl-space", "focus");
  await expect
    .poll(() => page.evaluate(() => window.__mock?.callsTo("Player.playUri").length))
    .toBe(1);
  const labels = await page.evaluate(() =>
    window.__mock?.contextMenu(["spotify:album:northbound"]).map((m) => m.label),
  );
  expect(labels).toEqual(["Add to space: Focus", "Add to space: Chill"]);
});
