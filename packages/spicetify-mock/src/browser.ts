/**
 * Browser entry for the Playwright harness: draws a bare Spotify-like frame, installs the
 * mock as `window.Spicetify`, and exposes the controls as `window.__mock`.
 * Options can be set before load with `window.__NL_MOCK_OPTIONS`.
 */
import { createSpicetifyMock, type MockOptions } from "./index";

declare global {
  interface Window {
    __NL_MOCK_OPTIONS?: MockOptions;
    __mock?: ReturnType<typeof createSpicetifyMock>["controls"];
    Spicetify?: unknown;
  }
}

const frame = `
  <header class="Root__globalNav" style="display:flex;align-items:center;height:64px;padding:0 140px 0 80px;gap:8px;background:#000">
    <div style="flex:1"></div>
    <div id="nl-mock-topbar" style="display:flex;gap:8px"></div>
  </header>
  <main class="Root__main-view" style="padding:24px;color:#fff">
    <h1 id="nl-mock-path">/</h1>
  </main>
  <footer class="Root__now-playing-bar" style="position:fixed;bottom:0;left:0;right:0;height:72px;background:#111">
    <div id="nl-mock-playbar"></div>
  </footer>`;

document.body.style.cssText = "margin:0;background:#121212;font-family:sans-serif;min-height:100vh";
document.body.insertAdjacentHTML("afterbegin", frame);

const { Spicetify, controls } = createSpicetifyMock(window.__NL_MOCK_OPTIONS ?? {});
window.Spicetify = Spicetify;
window.__mock = controls;

const history = (
  Spicetify.Platform as { History?: { listen(fn: (l: { pathname: string }) => void): void } }
).History;
history?.listen((location) => {
  const el = document.getElementById("nl-mock-path");
  if (el) el.textContent = location.pathname;
});
