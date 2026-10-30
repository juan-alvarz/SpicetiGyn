# Installing Nordlys

Everything here needs [Spicetify](https://spicetify.app) installed and applied first. Each plugin and theme installs on its own; none of them needs another.

Spicetify keeps its files in a **userdata** folder. Find yours with `spicetify path userdata`:

|              | Usual location        |
| ------------ | --------------------- |
| macOS, Linux | `~/.config/spicetify` |
| Windows      | `%APPDATA%\spicetify` |

## From the Spicetify Marketplace

1. Install the [Marketplace](https://github.com/spicetify/marketplace/wiki/Installation) if you haven't.
2. Open **Marketplace** in Spotify's sidebar and search for **Nordlys**.
3. Click **Install** on an extension, or on a theme under **Themes**.

## Extensions

Download the `.js` file (for example `nordlys-spaces.js`) from the [releases page](https://github.com/juan-alvarz/SpicetiGyn/releases).

macOS and Linux:

```bash
cp nordlys-spaces.js "$(spicetify path userdata)/Extensions/"
```

```bash
spicetify config extensions nordlys-spaces.js
```

```bash
spicetify apply
```

Windows (PowerShell):

```powershell
Copy-Item nordlys-spaces.js "$(spicetify path userdata)\Extensions\"
```

```powershell
spicetify config extensions nordlys-spaces.js
```

```powershell
spicetify apply
```

To remove one, add `-` after the file name and apply again:

```bash
spicetify config extensions nordlys-spaces.js-
```

```bash
spicetify apply
```

## Themes

Download the theme's `.zip` (for example `NordlysCodex.zip`) from the [releases page](https://github.com/juan-alvarz/SpicetiGyn/releases). It contains one folder with `user.css` and `color.ini`.

macOS and Linux:

```bash
unzip NordlysCodex.zip -d "$(spicetify path userdata)/Themes/"
```

```bash
spicetify config current_theme NordlysCodex color_scheme Bone
```

```bash
spicetify apply
```

Windows (PowerShell):

```powershell
Expand-Archive NordlysCodex.zip -DestinationPath "$(spicetify path userdata)\Themes\"
```

```powershell
spicetify config current_theme NordlysCodex color_scheme Bone
```

```powershell
spicetify apply
```

| Theme                | Folder          | Schemes                                   |
| -------------------- | --------------- | ----------------------------------------- |
| Nordlys Codex        | `NordlysCodex`  | `Bone`, `Frost`, `Lichen`                 |
| Nordlys Spaces theme | `NordlysSpaces` | `FjordDusk`, `Lingonberry`, `MidnightSun` |

If colors don't change, make sure color injection is on: `spicetify config inject_css 1 replace_colors 1`, then `spicetify apply`.
