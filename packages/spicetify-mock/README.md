# @nordlys/spicetify-mock

A fake `Spicetify` global for tests: Player, Platform (PlayerAPI, History, PlaylistAPI), GraphQL, Topbar, Playbar, ContextMenu, LocalStorage, Mousetrap and showNotification.

```ts
const { Spicetify, controls } = createSpicetifyMock({ playerDataShape: "track", subMenu: false });
controls.load("spotify:playlist:x", "spotify:track:y", { positionMs: 1000 });
controls.press("mod+alt+2");
controls.contextMenu(["spotify:album:z"]);
controls.callsTo("PlayerAPI.play");
```

Options switch parts off or change their shape to simulate older Spotify versions, so every fallback in the core can be tested. `src/browser.ts` is the same mock as a browser script (`dist/test/mock.js`) for the Playwright smoke test.

It models the API differences we know about. Passing tests against it does not prove that real Spotify behaves the same way.
