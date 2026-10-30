/**
 * Stands in for a future "Focus timer" plugin. It is bundled with its own copy of the core and
 * knows Spaces only through the type-only contract, which proves that one plugin can drive
 * another without importing it.
 */

import { definePlugin, isNoHandlerError, start } from "@nordlys/core";
import type {} from "@nordlys/spaces/api";

declare global {
  interface Window {
    __busClient?: {
      events: string[];
      endFocusSession(space: string): Promise<string>;
    };
  }
}

void start(
  definePlugin({
    id: "bus-client",
    name: "Bus client",
    version: "0.0.0",
    setup(ctx) {
      const events: string[] = [];
      ctx.bus.on("spaces:changed", (e) => events.push(`${e.from?.id ?? "-"}→${e.to.id}`));
      window.__busClient = {
        events,
        async endFocusSession(space) {
          try {
            const result = await ctx.bus.call("spaces.switchTo", space);
            return result.ok ? "switched" : result.reason;
          } catch (error) {
            return isNoHandlerError(error) ? "spaces-not-installed" : "error";
          }
        },
      };
      return () => {
        delete window.__busClient;
      };
    },
  }),
);
