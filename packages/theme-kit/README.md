# @nordlys/theme-kit

CSS every Nordlys theme imports with `@import "@nordlys/theme-kit/base.css";`. The build inlines it into the theme's `user.css`.

It maps Spotify's color tokens to the theme's `color.ini`, styles scrollbars the same on macOS and Windows, keeps long text from clipping at 125%/150% scaling, and respects reduced motion. It deliberately never touches `-webkit-app-region` or the top bar layout.
