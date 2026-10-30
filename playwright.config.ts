import { defineConfig, devices } from "@playwright/test";

// Runs the built bundles (dist/) against the Spicetify mock in Chromium, the engine Spotify's
// desktop app uses. Build first with `pnpm build:test` (`pnpm test:e2e` does both).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "chromium-100%", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } },
    // Windows display scaling: the same window in fewer CSS pixels.
    {
      name: "chromium-125%",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 640 },
        deviceScaleFactor: 1.25,
      },
    },
    {
      name: "chromium-150%",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 853, height: 533 },
        deviceScaleFactor: 1.5,
      },
    },
  ],
});
