export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string | Array<string | false | null | undefined>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  style?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
}

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
    return;
  }
  parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

/**
 * Tiny element builder. Strings always become text nodes, so user data (space names,
 * playlist names) can never inject markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props?.class) {
    el.className = Array.isArray(props.class) ? props.class.filter(Boolean).join(" ") : props.class;
  }
  for (const [name, value] of Object.entries(props?.attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const [name, value] of Object.entries(props?.style ?? {})) el.style.setProperty(name, value);
  for (const [type, handler] of Object.entries(props?.on ?? {})) {
    el.addEventListener(type, handler as EventListener);
  }
  append(el, children);
  return el;
}

/** Parses trusted, bundled SVG markup (never user input) into an element. */
export function svg(markup: string): Element {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const el = template.content.firstElementChild;
  if (!el) throw new Error("Invalid SVG markup");
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
  return el;
}
