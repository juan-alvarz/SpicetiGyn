// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyProblem, defaultUserdata } from "./dev";

describe("dev loop", () => {
  it("recognizes a Spotify/backup mismatch even when spicetify exits 0", () => {
    const out = ` warning  Spotify version and backup version are mismatched.
 info  Spotify cannot be backed up at this state. Please re-install Spotify then run "spicetify backup apply"`;
    expect(applyProblem(true, out)).toBe("backup");
    expect(applyProblem(false, " error  Cannot find Spotify")).toBe("other");
    expect(applyProblem(true, " success  Spicetify applied!")).toBeNull();
  });

  it("knows the usual userdata folders", () => {
    expect(defaultUserdata("darwin", {}, "/Users/j")).toBe("/Users/j/.config/spicetify");
    expect(defaultUserdata("win32", { APPDATA: "C:\\\\AppData" }, "C:\\\\Users\\\\j")).toMatch(
      /spicetify$/,
    );
  });
});
