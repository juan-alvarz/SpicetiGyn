# Manual QA before a release

Nobody can run real Spotify in CI. Everything below is only covered by the mock in automated tests, so check it by hand on **both macOS and Windows** before tagging a release. Use a test Spotify account if you can. Premium makes playback checks reliable.

Note the Spotify and Spicetify versions you tested in the release PR.

## Spaces extension

- [ ] The Spaces button appears in the top bar, not under the traffic lights (macOS) or the window buttons (Windows).
- [ ] The panel opens below the top bar, fits the window, and scrolls when you have many items.
- [ ] Shortcut hints show ⌘⌥1 on macOS and Ctrl+Alt+1 on Windows, and the shortcuts work.
- [ ] Play a song in Focus, switch to Chill: music fades out and pauses ("Nothing has played here yet").
- [ ] Play something in Chill, switch back to Focus: Focus resumes the same song within about a second of where it stopped, and the volume comes back to where it was.
- [ ] Switch while paused: the other space's song loads paused, without an audible blip.
- [ ] Press shortcuts quickly in a row (⌘⌥1, 2, 3): it ends on the last one, and the volume is right afterwards.
- [ ] "Music keeps playing" mode: switching changes only the space and colors.
- [ ] Right-click a playlist, an album and an artist: **Add to space** lists every space; adding shows the item's name and cover in the panel.
- [ ] **Add this page** works on a playlist, album and artist page, and is disabled elsewhere.
- [ ] Each space reopens its last page when you switch to it.
- [ ] Create, edit (name, color, icon) and delete a space. Deleting moves the items to the neighbor.
- [ ] **Tint the window** looks reasonable with stock Spotify and with one popular Marketplace theme, and turns off cleanly.
- [ ] Restart Spotify: spaces, items, settings and each space's position survive.
- [ ] Disable the extension (`spicetify config extensions nordlys-spaces.js-` + apply): no leftover button, menu entry or colors.

## Themes (for each theme and each color scheme)

- [ ] The window can still be dragged by the top bar on macOS, and the window buttons work on Windows.
- [ ] Fonts load (not Times New Roman or the system font).
- [ ] Scrollbars look the same on macOS and Windows.
- [ ] At 125% and 150% Windows display scaling, the track list, player bar and library don't clip.
- [ ] Home, a playlist, an album, an artist, search, the queue, lyrics and settings are all readable.
- [ ] Nordlys Spaces theme with the Spaces extension: the gradient follows the space and fades on switch; without the extension it uses the scheme colors.
