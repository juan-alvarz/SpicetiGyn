import type { Logger } from "../log";
import { type ItemKind, parseItemUri } from "./navigation";
import type { SpicetifyLike } from "./spicetify";

export interface ItemInfo {
  kind: ItemKind;
  name: string;
  image: string | null;
}

export interface MetadataAdapter {
  /** Best effort. Resolves null when this Spotify version doesn't expose what we need. */
  getItemInfo(uri: string): Promise<ItemInfo | null>;
}

function pick(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

export function createMetadataAdapter(s: SpicetifyLike, log: Logger): MetadataAdapter {
  // Spotify's GraphQL queries can fail with an empty locale; Spicetify's own extensions pass it.
  const locale = () => {
    try {
      return s.Locale?.getLocale?.() || "en";
    } catch {
      return "en";
    }
  };

  const graphql = async (definition: string, variables: Record<string, unknown>) => {
    const request = s.GraphQL?.Request;
    const def = s.GraphQL?.Definitions?.[definition];
    if (typeof request !== "function" || !def) {
      log.warnOnce(
        `meta.${definition}`,
        `GraphQL.${definition} is missing; names are filled in later.`,
      );
      return null;
    }
    return await request(def, { ...variables, locale: locale() });
  };

  /** PlaylistAPI.getMetadata, then the Cosmos endpoint Spicetify's own Bookmark extension uses. */
  const playlist = async (uri: string): Promise<ItemInfo | null> => {
    const getMetadata = s.Platform?.PlaylistAPI?.getMetadata;
    if (typeof getMetadata === "function") {
      try {
        const meta = await getMetadata(uri);
        const name = str(meta?.name);
        if (name) return { kind: "playlist", name, image: str(meta?.images?.[0]?.url) };
      } catch (error) {
        log.debug("PlaylistAPI.getMetadata failed; trying Cosmos", error);
      }
    }
    const get = s.CosmosAsync?.get;
    if (typeof get !== "function") {
      log.warnOnce(
        "meta.playlist",
        "No playlist metadata API was found; names are filled in later.",
      );
      return null;
    }
    const res = await get(`sp://core-playlist/v1/playlist/${uri}/metadata`, {
      policy: { picture: true, name: true },
    });
    const name = str(pick(res, ["metadata", "name"]));
    return name ? { kind: "playlist", name, image: str(pick(res, ["metadata", "picture"])) } : null;
  };

  return {
    async getItemInfo(uri) {
      const item = parseItemUri(uri);
      if (!item) return null;
      try {
        if (item.kind === "playlist") return await playlist(uri);
        if (item.kind === "album") {
          const res = await graphql("getAlbum", { uri, offset: 0, limit: 1 });
          const name = str(pick(res, ["data", "albumUnion", "name"]));
          const image = str(pick(res, ["data", "albumUnion", "coverArt", "sources", 0, "url"]));
          return name ? { kind: "album", name, image } : null;
        }
        const res = await graphql("queryArtistOverview", { uri, includePrerelease: false });
        const name = str(pick(res, ["data", "artistUnion", "profile", "name"]));
        const image = str(
          pick(res, ["data", "artistUnion", "visuals", "avatarImage", "sources", 0, "url"]),
        );
        return name ? { kind: "artist", name, image } : null;
      } catch (error) {
        log.debug(`Metadata lookup failed for ${uri}`, error);
        return null;
      }
    },
  };
}
