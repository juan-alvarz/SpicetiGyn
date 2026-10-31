// 24×24 line icons from the Nordlys design studies. Trusted, bundled markup only.
const icon = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">${body}</svg>`;
const stroke =
  'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

export const SPACE_ICONS = {
  target: icon(
    `<g ${stroke}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></g><circle cx="12" cy="12" r="1" fill="currentColor"/>`,
  ),
  cup: icon(
    `<path ${stroke} d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c0 1.2 1 1.3 1 2.5M12 3.5c0 1.2 1 1.3 1 2.5"/>`,
  ),
  moon: icon(`<path ${stroke} d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>`),
  bolt: icon(`<path ${stroke} d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>`),
  book: icon(
    `<path ${stroke} d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13"/>`,
  ),
  leaf: icon(`<path ${stroke} d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7"/>`),
  home: icon(`<path ${stroke} d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>`),
  heart: icon(
    `<path ${stroke} d="M12 19.5s-7-4.3-8.8-8.5C1.9 7.8 3.8 4.8 7 4.8c1.9 0 3.3 1 5 2.8 1.7-1.8 3.1-2.8 5-2.8 3.2 0 5.1 3 3.8 6.2-1.8 4.2-8.8 8.5-8.8 8.5z"/>`,
  ),
  disc: icon(`<g ${stroke}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/></g>`),
} as const;

export type IconId = keyof typeof SPACE_ICONS;
export const ICON_IDS = Object.keys(SPACE_ICONS) as IconId[];

export const UI_ICONS = {
  spaces: icon(
    `<g ${stroke}><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></g>`,
  ),
  plus: icon(`<path ${stroke} stroke-width="2" d="M12 5v14M5 12h14"/>`),
  pencil: icon(`<path ${stroke} d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4"/>`),
  more: icon(
    `<g fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></g>`,
  ),
  back: icon(`<path ${stroke} d="M15 5l-7 7 7 7"/>`),
  close: icon(`<path ${stroke} d="M7 7l10 10M17 7 7 17"/>`),
} as const;
