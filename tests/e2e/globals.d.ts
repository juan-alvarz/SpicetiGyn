import type { MockControls } from "@nordlys/spicetify-mock";

declare global {
  interface Window {
    __mock?: MockControls;
    __busClient?: { events: string[]; endFocusSession(space: string): Promise<string> };
  }
}
