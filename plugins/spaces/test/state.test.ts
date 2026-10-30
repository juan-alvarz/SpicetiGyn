import { describe, expect, it } from "vitest";
import { isSpacesState, MAX_SPACES, type SpaceItem } from "../src/model/schema";
import {
  addItem,
  cleanName,
  createSpace,
  defaultState,
  deleteSpace,
  findSpace,
  moveItem,
  removeItem,
  toInfo,
  uniqueId,
  updateItemInfo,
  updateSettings,
  updateSpace,
} from "../src/model/state";

const item = (uri: string): SpaceItem => ({
  uri,
  kind: "playlist",
  name: "",
  image: null,
  addedAt: 1,
});

describe("spaces state", () => {
  it("starts valid", () => {
    expect(isSpacesState(defaultState())).toBe(true);
  });

  it("creates spaces with unique, attribute-safe ids", () => {
    let s = defaultState();
    const a = createSpace(s, { name: "  Gym   time ", color: "moss", icon: "bolt" });
    s = a.state;
    expect(a.id).toBe("gym-time");
    expect(findSpace(s, "gym-time")?.name).toBe("Gym time");
    expect(uniqueId(s, "Gym Time")).toBe("gym-time-2");
    expect(uniqueId(s, "Ålesund ☕")).toBe("alesund");
    expect(isSpacesState(s)).toBe(true);
  });

  it("stops at nine spaces", () => {
    let s = defaultState();
    for (let i = 0; i < 20; i++)
      s = createSpace(s, { name: `S${i}`, color: "fjord", icon: "moon" }).state;
    expect(s.spaces).toHaveLength(MAX_SPACES);
    expect(createSpace(s, { name: "one more", color: "fjord", icon: "moon" }).id).toBeNull();
  });

  it("finds spaces by id or case-insensitive name", () => {
    const s = defaultState();
    expect(findSpace(s, "chill")?.id).toBe("chill");
    expect(findSpace(s, "FOCUS")?.id).toBe("focus");
    expect(findSpace(s, "nope")).toBeUndefined();
  });

  it("edits names, colors and icons, keeping the old name when the new one is blank", () => {
    const s = updateSpace(defaultState(), "focus", { name: "   ", color: "berry", icon: "book" });
    expect(findSpace(s, "focus")).toMatchObject({ name: "Focus", color: "berry", icon: "book" });
    expect(cleanName("x".repeat(40))).toHaveLength(24);
  });

  it("deletes a space by moving its items to its neighbor", () => {
    let s = addItem(defaultState(), "chill", item("spotify:playlist:a"));
    s = addItem(s, "focus", item("spotify:playlist:a"));
    s = addItem(s, "chill", item("spotify:playlist:b"));
    s = { ...s, currentId: "chill", playedIn: "chill" };
    const after = deleteSpace(s, "chill");
    expect(after.spaces.map((x) => x.id)).toEqual(["focus"]);
    expect(after.currentId).toBe("focus");
    expect(after.playedIn).toBeNull();
    expect(findSpace(after, "focus")?.items.map((i) => i.uri)).toEqual([
      "spotify:playlist:a",
      "spotify:playlist:b",
    ]);
    expect(deleteSpace(after, "focus")).toBe(after);
  });

  it("adds, moves and removes items without duplicates", () => {
    let s = addItem(defaultState(), "focus", item("spotify:playlist:a"));
    s = addItem(s, "focus", item("spotify:playlist:a"));
    expect(findSpace(s, "focus")?.items).toHaveLength(1);
    s = moveItem(s, "focus", "chill", "spotify:playlist:a");
    expect(findSpace(s, "focus")?.items).toHaveLength(0);
    expect(findSpace(s, "chill")?.items).toHaveLength(1);
    s = removeItem(s, "chill", "spotify:playlist:a");
    expect(findSpace(s, "chill")?.items).toHaveLength(0);
  });

  it("fills item info in every space that has the item", () => {
    let s = addItem(defaultState(), "focus", item("spotify:playlist:a"));
    s = addItem(s, "chill", item("spotify:playlist:a"));
    s = updateItemInfo(s, "spotify:playlist:a", { name: "Deep Work", image: "img" });
    expect(s.spaces.flatMap((x) => x.items.map((i) => i.name))).toEqual(["Deep Work", "Deep Work"]);
  });

  it("clamps the crossfade", () => {
    expect(updateSettings(defaultState(), { crossfadeMs: 99_999 }).settings.crossfadeMs).toBe(
      8_000,
    );
    expect(updateSettings(defaultState(), { crossfadeMs: -5 }).settings.crossfadeMs).toBe(0);
  });

  it("describes spaces for other plugins", () => {
    expect(toInfo(defaultState())[1]).toEqual({
      id: "chill",
      name: "Chill",
      icon: "cup",
      color: "ember",
      accent: "#f6c27a",
      index: 1,
      itemCount: 0,
    });
  });

  it("rejects broken state", () => {
    const s = defaultState();
    expect(isSpacesState({ ...s, currentId: "missing" })).toBe(false);
    expect(isSpacesState({ ...s, spaces: [] })).toBe(false);
    expect(isSpacesState({ ...s, spaces: [s.spaces[0], s.spaces[0]] })).toBe(false);
    expect(isSpacesState({ ...s, spaces: [{ ...s.spaces[0], color: "neon" }] })).toBe(false);
  });
});
