import { createSpicetifyMock, type MockOptions } from "@nordlys/spicetify-mock";
import { definePlugin, type PluginContext, start } from "../src";

/** Starts a throwaway plugin against a fresh mock and a private host, and returns its context. */
export async function withContext(options: MockOptions = {}) {
  const mock = createSpicetifyMock(options);
  const global = {};
  let ctx: PluginContext | undefined;
  const running = await start(
    definePlugin({
      id: "test",
      name: "Test",
      version: "1.0.0",
      setup(c) {
        ctx = c;
      },
    }),
    { spicetify: mock.Spicetify, global },
  );
  if (!running || !ctx) throw new Error("plugin did not start");
  return { ...mock, ctx, running, global };
}
