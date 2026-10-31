# Installing Nordlys

This guide installs the **Spaces** extension and, if you want, one of the **Nordlys themes** into the Spicetify you already have. Each one works on its own.

There are two ways:

- **[Quick way](#quick-way-from-the-source-code)**: two commands do everything for you. You need Node.js.
- **[By hand](#by-hand)**: you copy the files into Spicetify's folder yourself. No Node.js needed if you already have the files.

> Not released yet? Until the first release, the only way to get the files is to build them (the quick way, or [Get the files](#2-get-the-files) → option C).

---

## Before you start

Spicetify must already be installed and working. Check it in a terminal (**Terminal** on macOS, **PowerShell** on Windows):

```bash
spicetify -v
```

It should print a version number. If it says the command isn't found, install Spicetify first: <https://spicetify.app/docs/getting-started>.

---

## Quick way (from the source code)

You need [Node.js](https://nodejs.org) 22.11 or newer (the current LTS is fine). npm comes with it; nothing else to install.

1. Download the code and go into its folder:

   ```bash
   git clone https://github.com/juan-alvarz/SpicetiGyn.git
   ```

   ```bash
   cd SpicetiGyn
   ```

   Until the first version is merged into `main`, switch to the development branch:

   ```bash
   git checkout claude/dazzling-wozniak-5bbos9
   ```

2. Download the build tools into the folder (once):

   ```bash
   npm install
   ```

3. Build everything and copy it into your Spicetify folder:

   ```bash
   npm run dev -- install
   ```

4. Turn on Spaces. Spotify restarts.

   ```bash
   npm run dev -- enable spaces
   ```

5. Optional: turn on a theme (pick one).

   ```bash
   npm run dev -- enable codex Bone
   ```

   ```bash
   npm run dev -- enable spaces-theme FjordDusk
   ```

Done. Jump to [Check that it worked](#check-that-it-worked).

To look at the files yourself, `npm run dev -- open` opens your Spicetify folder and `npm run dev -- open dist` opens the built files.

---

## By hand

### 1. Open your Spicetify folder

Spicetify keeps extensions and themes in its **userdata folder**. Inside it you'll find (or will create) two folders:

```
spicetify/
├─ Extensions/   ← extensions go here (.js files)
├─ Themes/       ← themes go here (one folder per theme)
└─ config-xpui.ini
```

**macOS.** In Terminal, this opens the folder in Finder:

```bash
open "$(spicetify path userdata)"
```

Or in Finder: **Go → Go to Folder…** (⇧⌘G), type `~/.config/spicetify`, and press Return. The `.config` folder is hidden; press ⇧⌘. (Shift-Command-period) in Finder to show hidden folders.

**Windows.** In PowerShell, this opens the folder in File Explorer:

```powershell
explorer "$(spicetify path userdata)"
```

Or press **Win+R**, type `%APPDATA%\spicetify`, and press Enter.

**Linux:**

```bash
xdg-open "$(spicetify path userdata)"
```

Usually `~/.config/spicetify`.

If there is no `Extensions` or `Themes` folder inside, create it. The names are case-sensitive.

### 2. Get the files

Pick one:

- **A. Spicetify Marketplace** (once released): open **Marketplace** in Spotify, search for **Nordlys**, click **Install**. That's all; skip the rest of this guide.
- **B. A release download** (once released): from the [releases page](https://github.com/juan-alvarz/SpicetiGyn/releases), download `nordlys-spaces.js` and, for a theme, `NordlysCodex.zip` or `NordlysSpaces.zip`. Unzip the theme to get a folder.
- **C. Build them yourself:** follow steps 1–2 of the [quick way](#quick-way-from-the-source-code), then run `npm run build`. The files appear in the code folder:

  ```
  SpicetiGyn/dist/
  ├─ extensions/nordlys-spaces.js
  └─ themes/
     ├─ NordlysCodex/      (user.css, color.ini)
     └─ NordlysSpaces/     (user.css, color.ini)
  ```

You should end up with:

| What                 | File or folder                                                      |
| -------------------- | ------------------------------------------------------------------- |
| Spaces extension     | `nordlys-spaces.js`                                                 |
| Nordlys Codex theme  | the folder `NordlysCodex` (with `user.css` and `color.ini` inside)  |
| Nordlys Spaces theme | the folder `NordlysSpaces` (with `user.css` and `color.ini` inside) |

### 3. Install the Spaces extension

1. Copy `nordlys-spaces.js` into the **`Extensions`** folder you opened in step 1. Drag and drop is fine.
2. Tell Spicetify to load it:

   ```bash
   spicetify config extensions nordlys-spaces.js
   ```

3. Apply. Spotify restarts.

   ```bash
   spicetify apply
   ```

### 4. Install a theme (optional)

1. Copy the **whole theme folder** (for example `NordlysCodex`) into the **`Themes`** folder. Keep the folder name exactly as it is; it's the theme's name.

   ```
   spicetify/Themes/NordlysCodex/user.css
   spicetify/Themes/NordlysCodex/color.ini
   ```

2. Choose the theme and a color scheme:

   ```bash
   spicetify config current_theme NordlysCodex color_scheme Bone
   ```

3. Make sure theme colors and CSS are turned on (they usually already are):

   ```bash
   spicetify config inject_css 1 replace_colors 1
   ```

4. Apply:

   ```bash
   spicetify apply
   ```

| Theme                | Folder name     | Color schemes                             |
| -------------------- | --------------- | ----------------------------------------- |
| Nordlys Codex        | `NordlysCodex`  | `Bone`, `Frost`, `Lichen`                 |
| Nordlys Spaces theme | `NordlysSpaces` | `FjordDusk`, `Lingonberry`, `MidnightSun` |

To change the scheme later, run only `spicetify config color_scheme Frost`, then `spicetify apply`.

---

## Check that it worked

- A **Spaces** button (four squares, or the current space's icon) appears in Spotify's top bar. Click it to open the panel.
- **⌘⌥2** on macOS or **Ctrl+Alt+2** on Windows switches to your second space.
- Right-click a playlist: **Add to space** is in the menu.
- With a theme: the fonts and colors change.

---

## Updating

Replace the files from step 3 or 4 with the new ones, then run `spicetify apply`. With the quick way, run `git pull`, then `npm run dev -- install`, then `spicetify apply`.

---

## Removing everything

**Spaces extension:**

```bash
spicetify config extensions nordlys-spaces.js-
```

```bash
spicetify apply
```

Then you can delete `nordlys-spaces.js` from the `Extensions` folder. Your spaces stay saved inside Spotify, in case you reinstall.

**A theme:** go back to stock Spotify with `spicetify config current_theme " "` (an empty name means no theme), run `spicetify apply`, and then delete the theme's folder from `Themes`.

**The tools (quick way only):** delete the `SpicetiGyn` folder. Everything `npm install` downloaded lives inside it.

---

## Troubleshooting

### "Spotify version and backup version are mismatched"

If `spicetify apply` (or `npm run dev -- enable …`) ends with:

```
warning  Spotify version and backup version are mismatched.
info  Spotify cannot be backed up at this state. Please re-install Spotify then run "spicetify backup apply"
```

then **nothing was applied**: no extensions and no theme. Spotify updated itself after Spicetify last backed it up, and Spicetify won't patch it until the backup is redone. It happens after most Spotify updates. To fix it:

1. Quit Spotify completely (⌘Q on macOS; on Windows, also from the tray icon).
2. Update Spicetify, so it supports the newest Spotify:

   ```bash
   spicetify update
   ```

3. Reinstall Spotify from <https://www.spotify.com/download>. If you installed it with Homebrew on macOS:

   ```bash
   brew reinstall --cask spotify
   ```

4. Open Spotify once, log in, then quit it again.
5. Back up the fresh Spotify and apply everything:

   ```bash
   spicetify backup apply
   ```

Your Nordlys settings (extensions, theme, color scheme) are already saved in Spicetify's config, so step 5 applies them. You don't need to run the Nordlys commands again.

### Other problems

| Problem                                   | Fix                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spicetify: command not found`            | Spicetify isn't installed, or the terminal can't find it. Reinstall it, then open a new terminal window.                                                                                                                  |
| `spicetify path userdata` prints an error | Use the usual folder: `~/.config/spicetify` on macOS and Linux, `%APPDATA%\spicetify` on Windows.                                                                                                                         |
| No Spaces button after `apply`            | Run `spicetify config extensions` and check that `nordlys-spaces.js` is in the list. Then check that the file is in `Extensions` (not in a subfolder) and run `spicetify apply` again.                                    |
| The theme doesn't change anything         | Check that the folder is `Themes/NordlysCodex/user.css` (not `Themes/NordlysCodex/NordlysCodex/…`), and run the `inject_css` command in step 4.                                                                           |
| Spotify updated and everything is gone    | See [the section above](#spotify-version-and-backup-version-are-mismatched).                                                                                                                                              |
| Something else is wrong                   | Run `spicetify enable-devtools`, open Spotify's console (right-click → Inspect, or ⌥⌘I / Ctrl+Shift+I), run `localStorage.setItem("nordlys:debug","1")`, restart Spotify, and look for lines that start with `[nordlys:`. |
