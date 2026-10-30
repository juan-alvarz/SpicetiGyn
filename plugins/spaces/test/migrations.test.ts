import { describe, expect, it } from "vitest";
import { migrateV0toV1 } from "../src/model/migrations";
import { isSpacesState } from "../src/model/schema";

// The shape the v0.1 prototype saved under "nordlys:spaces".
const V0 = {
  current: "chill",
  musicPerSpace: false,
  crossfade: 2,
  spaces: {
    focus: {
      name: "Focus",
      colors: { g1: "#1f6a80", g2: "#33409a", g3: "#123e4e" },
      playlists: [
        "spotify:playlist:deep",
        "spotify:album:alb",
        "not-a-uri",
        "spotify:playlist:deep",
      ],
      last: { context: "spotify:playlist:deep", track: "spotify:track:t1", position: 47_000.6 },
    },
    chill: {
      name: "Chill",
      colors: { g1: "#d9853f", g2: "#b4466b", g3: "#6b3a8c" },
      playlists: [],
      last: null,
    },
  },
};

describe("migration v0 → v1", () => {
  it("keeps spaces, items, snapshots and settings", () => {
    const s = migrateV0toV1(V0, 123);
    expect(isSpacesState(s)).toBe(true);
    expect(s.currentId).toBe("chill");
    expect(s.settings).toEqual({ musicPerSpace: false, crossfadeMs: 2000, tint: false });
    const [focus, chill] = s.spaces;
    expect(focus).toMatchObject({ id: "focus", name: "Focus", color: "fjord" });
    expect(chill).toMatchObject({ id: "chill", name: "Chill", color: "ember", snapshot: null });
    expect(focus?.items.map((i) => [i.uri, i.kind])).toEqual([
      ["spotify:playlist:deep", "playlist"],
      ["spotify:album:alb", "album"],
    ]);
    expect(focus?.snapshot).toEqual({
      contextUri: "spotify:playlist:deep",
      trackUri: "spotify:track:t1",
      trackName: null,
      positionMs: 47_001,
      savedAt: 123,
    });
  });

  it("gives odd ids safe slugs and picks colors by position when unknown", () => {
    const s = migrateV0toV1({ spaces: { "My Space!": { colors: { g1: "#000" } } } });
    expect(s.spaces[0]).toMatchObject({ id: "my-space", name: "My Space!", color: "fjord" });
    expect(s.currentId).toBe("my-space");
    expect(isSpacesState(s)).toBe(true);
  });

  it("falls back to the defaults when there is nothing to migrate", () => {
    expect(migrateV0toV1(null).spaces.map((x) => x.id)).toEqual(["focus", "chill"]);
    expect(migrateV0toV1({ spaces: {} }).spaces).toHaveLength(2);
  });
});
