/** Adds a `<style data-nl-plugin="<id>">` to <head> and returns a function that removes it. */
export function addStyle(pluginId: string, css: string): () => void {
  const style = document.createElement("style");
  style.dataset.nlPlugin = pluginId;
  style.textContent = css;
  document.head.appendChild(style);
  return () => style.remove();
}
