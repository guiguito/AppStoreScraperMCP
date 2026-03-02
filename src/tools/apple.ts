import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { jsonResult, errorResult } from "../utils.js";

const require = createRequire(import.meta.url);

interface AppleStore {
  app: (opts: Record<string, unknown>) => Promise<unknown>;
  ratings: (opts: Record<string, unknown>) => Promise<unknown>;
  list: (opts?: Record<string, unknown>) => Promise<unknown>;
  search: (opts: Record<string, unknown>) => Promise<unknown>;
  developer: (opts: Record<string, unknown>) => Promise<unknown>;
  suggest: (opts: Record<string, unknown>) => Promise<unknown>;
  similar: (opts: Record<string, unknown>) => Promise<unknown>;
  reviews: (opts: Record<string, unknown>) => Promise<unknown>;
  privacy: (opts: Record<string, unknown>) => Promise<unknown>;
  versionHistory: (opts: Record<string, unknown>) => Promise<unknown>;
  constants: {
    collection: Record<string, string>;
    sort: Record<string, string>;
    category: Record<string, number>;
  };
}

const appleStore: AppleStore = require("app-store-scraper-ts");
const { app, ratings, list, search, developer, suggest, similar, reviews, privacy, versionHistory } = appleStore;
const appleCollection = appleStore.constants.collection;
const appleSort = appleStore.constants.sort;
const appleCategory = appleStore.constants.category;

// --- Constants ---

const APPLE_COLLECTIONS = Object.keys(appleCollection) as [string, ...string[]];
const APPLE_SORT = Object.keys(appleSort) as [string, ...string[]];

const APPLE_CATEGORIES_DESC = `Valid Apple App Store category names (pass the key name, e.g. "GAMES"):
Top-level: GAMES, BUSINESS, EDUCATION, ENTERTAINMENT, FINANCE, FOOD_AND_DRINK, HEALTH_AND_FITNESS, LIFESTYLE, MEDICAL, MUSIC, NAVIGATION, NEWS, PHOTO_AND_VIDEO, PRODUCTIVITY, REFERENCE, SHOPPING, SOCIAL_NETWORKING, SPORTS, TRAVEL, UTILITIES, WEATHER, BOOKS, CATALOGS.
Game subcategories: GAMES_ACTION, GAMES_ADVENTURE, GAMES_ARCADE, GAMES_BOARD, GAMES_CARD, GAMES_CASINO, GAMES_DICE, GAMES_EDUCATIONAL, GAMES_FAMILY, GAMES_MUSIC, GAMES_PUZZLE, GAMES_RACING, GAMES_ROLE_PLAYING, GAMES_SIMULATION, GAMES_SPORTS, GAMES_STRATEGY, GAMES_TRIVIA, GAMES_WORD.
Magazine subcategories also available (MAGAZINES_*).`;

// --- Helpers ---

function lookupCollection(key: string): string {
  const val = (appleCollection as Record<string, string>)[key];
  if (val === undefined) {
    throw new Error(
      `Invalid collection "${key}". Valid values: ${APPLE_COLLECTIONS.join(", ")}`
    );
  }
  return val;
}

function lookupSort(key: string): string {
  const val = (appleSort as Record<string, string>)[key];
  if (val === undefined) {
    throw new Error(
      `Invalid sort "${key}". Valid values: ${APPLE_SORT.join(", ")}`
    );
  }
  return val;
}

function lookupCategory(key: string): number {
  const val = (appleCategory as Record<string, number>)[key];
  if (val === undefined) {
    const validKeys = Object.keys(appleCategory).join(", ");
    throw new Error(
      `Invalid category "${key}". Valid values: ${validKeys}`
    );
  }
  return val;
}

// --- Tool registration ---

export function registerAppleTools(server: McpServer): void {
  // 1. apple_app
  server.registerTool(
    "apple_app",
    {
      title: "Get Apple App Store App Details",
      description: `Retrieve detailed information for a single app from the Apple App Store.

Provide either \`id\` (numeric App Store ID, e.g. "553834731") or \`appId\` (bundle identifier, e.g. "com.midasplayer.apps.candycrushsaga"). At least one is required.

Returns a detailed App object including: title, description, icon, screenshots, price, currency, score, ratings, reviews count, version, release notes, developer info, genres, content rating, supported devices, and more.

Set \`ratings\` to true to include the star histogram (1-5 distribution) in the response.`,
      inputSchema: z.object({
        id: z
          .string()
          .optional()
          .describe(
            "Numeric App Store ID (e.g. '553834731'). Provide this or appId."
          ),
        appId: z
          .string()
          .optional()
          .describe(
            "Bundle identifier (e.g. 'com.midasplayer.apps.candycrushsaga'). Provide this or id."
          ),
        country: z
          .string()
          .default("us")
          .describe("Two-letter ISO country code (default: 'us')"),
        lang: z
          .string()
          .optional()
          .describe("IETF language tag (e.g. 'en-us', 'fr-fr')"),
        ratings: z
          .boolean()
          .optional()
          .describe(
            "When true, includes total ratings count and star histogram in the result"
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        if (!params.id && !params.appId) {
          return errorResult(
            new Error("Either 'id' or 'appId' must be provided")
          );
        }
        const opts: Record<string, unknown> = { country: params.country };
        if (params.id) opts.id = params.id;
        if (params.appId) opts.appId = params.appId;
        if (params.lang) opts.lang = params.lang;
        if (params.ratings !== undefined) opts.ratings = params.ratings;
        const result = await app(opts);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 2. apple_ratings
  server.registerTool(
    "apple_ratings",
    {
      title: "Get Apple App Store Ratings",
      description: `Fetch the total ratings count and star distribution histogram for an Apple App Store app.

Returns an object with:
- ratings (number): Total number of ratings
- histogram (object): Star distribution, e.g. { "1": 100, "2": 200, "3": 500, "4": 2000, "5": 9545 }`,
      inputSchema: z.object({
        id: z
          .string()
          .describe("Numeric App Store ID (e.g. '553834731')"),
        country: z
          .string()
          .default("us")
          .describe("Two-letter ISO country code (default: 'us')"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await ratings({
          id: params.id,
          country: params.country,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 3. apple_list
  server.registerTool(
    "apple_list",
    {
      title: "List Apple App Store Apps",
      description: `Retrieve ranked app collections from the Apple App Store (top free, top paid, new, grossing, etc.).

Returns an array of app objects. When fullDetail is false (default), returns lightweight AppLite objects (id, title, icon, price, developer). When true, returns full App objects with all details.

${APPLE_CATEGORIES_DESC}`,
      inputSchema: z.object({
        collection: z
          .enum(APPLE_COLLECTIONS)
          .optional()
          .describe(
            `App Store collection to browse. Valid values: ${APPLE_COLLECTIONS.join(", ")}`
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Category filter key name (e.g. 'GAMES', 'BUSINESS'). See tool description for full list."
          ),
        country: z
          .string()
          .default("us")
          .describe("Two-letter ISO country code (default: 'us')"),
        lang: z
          .string()
          .optional()
          .describe("IETF language tag (e.g. 'en-us')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Number of results to return (1-200, default: 50)"),
        fullDetail: z
          .boolean()
          .optional()
          .describe(
            "When true, returns full App objects instead of lightweight AppLite objects"
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const opts: Record<string, unknown> = {
          country: params.country,
          num: params.num,
        };
        if (params.collection) opts.collection = lookupCollection(params.collection);
        if (params.category) opts.category = lookupCategory(params.category);
        if (params.lang) opts.lang = params.lang;
        if (params.fullDetail !== undefined) opts.fullDetail = params.fullDetail;
        const result = await list(opts);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 4. apple_search
  server.registerTool(
    "apple_search",
    {
      title: "Search Apple App Store",
      description: `Search for apps on the Apple App Store by keyword.

Returns an array of App objects matching the search term. Each App includes: id, appId, title, url, icon, description, developer, price, score, and more.

Set idsOnly to true to return only app IDs instead of full objects (faster).`,
      inputSchema: z.object({
        term: z
          .string()
          .min(1)
          .describe("Search query (e.g. 'weather app', 'fitness tracker')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Number of results per page (default: 50)"),
        page: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("Page number, 1-based (default: 1)"),
        country: z
          .string()
          .default("us")
          .describe("Two-letter ISO country code (default: 'us')"),
        lang: z
          .string()
          .default("en-us")
          .describe("Accept-Language header value (default: 'en-us')"),
        idsOnly: z
          .boolean()
          .optional()
          .describe(
            "When true, returns only an array of app IDs instead of full app objects"
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await search({
          term: params.term,
          num: params.num,
          page: params.page,
          country: params.country,
          lang: params.lang,
          ...(params.idsOnly !== undefined ? { idsOnly: params.idsOnly } : {}),
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 5. apple_developer
  server.registerTool(
    "apple_developer",
    {
      title: "List Apps by Apple Developer",
      description: `List all apps published by a specific Apple developer.

Returns an array of App objects for all apps by the given developer ID.`,
      inputSchema: z.object({
        devId: z
          .string()
          .describe(
            "Apple developer ID (numeric string, e.g. '284882218' for Facebook)"
          ),
        country: z
          .string()
          .default("us")
          .describe("Two-letter ISO country code (default: 'us')"),
        lang: z
          .string()
          .optional()
          .describe("IETF language tag"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await developer({
          devId: params.devId,
          country: params.country,
          ...(params.lang ? { lang: params.lang } : {}),
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 6. apple_suggest
  server.registerTool(
    "apple_suggest",
    {
      title: "Get Apple App Store Search Suggestions",
      description: `Get autocomplete search suggestions from the Apple App Store.

Returns an array of suggestion objects, each with a "term" field. Useful for building search UIs or discovering related search terms.

Example: suggest({ term: "pan" }) might return [{ term: "pandora" }, { term: "panda" }, ...]`,
      inputSchema: z.object({
        term: z
          .string()
          .min(1)
          .describe("Partial search query to get suggestions for"),
        country: z
          .string()
          .default("us")
          .describe("Two-letter ISO country code (default: 'us')"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await suggest({
          term: params.term,
          country: params.country,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 7. apple_similar
  server.registerTool(
    "apple_similar",
    {
      title: "Get Similar Apple App Store Apps",
      description: `Retrieve "Customers Also Bought" related apps for a given Apple App Store app.

Provide either \`id\` (numeric) or \`appId\` (bundle identifier). Returns an array of App objects (may be empty if no similar apps are found).`,
      inputSchema: z.object({
        id: z
          .string()
          .optional()
          .describe("Numeric App Store ID. Provide this or appId."),
        appId: z
          .string()
          .optional()
          .describe("Bundle identifier. Provide this or id."),
        country: z
          .string()
          .optional()
          .describe("Two-letter ISO country code"),
        lang: z
          .string()
          .optional()
          .describe("IETF language tag"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        if (!params.id && !params.appId) {
          return errorResult(
            new Error("Either 'id' or 'appId' must be provided")
          );
        }
        const opts: Record<string, unknown> = {};
        if (params.id) opts.id = params.id;
        if (params.appId) opts.appId = params.appId;
        if (params.country) opts.country = params.country;
        if (params.lang) opts.lang = params.lang;
        const result = await similar(opts);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 8. apple_reviews
  server.registerTool(
    "apple_reviews",
    {
      title: "Get Apple App Store Reviews",
      description: `Fetch paginated customer reviews for an Apple App Store app.

Provide either \`id\` (numeric) or \`appId\` (bundle identifier).

By default, returns a filtered array with essential fields only: id, version, userName, score, title, text, updated. Set \`fullDetail\` to true to get the complete raw Review objects (includes userUrl, url, and all other fields).

Note: Apple limits review pages to 1-10.`,
      inputSchema: z.object({
        id: z
          .string()
          .optional()
          .describe("Numeric App Store ID. Provide this or appId."),
        appId: z
          .string()
          .optional()
          .describe("Bundle identifier. Provide this or id."),
        sort: z
          .enum(APPLE_SORT)
          .optional()
          .describe(
            `Sort order for reviews. Valid values: ${APPLE_SORT.join(", ")} (default: RECENT)`
          ),
        page: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(1)
          .describe("Page number, 1-10 (Apple-imposed limit, default: 1)"),
        country: z
          .string()
          .default("us")
          .describe("Two-letter ISO country code (default: 'us')"),
        fullDetail: z
          .boolean()
          .default(false)
          .describe(
            "When true, returns complete raw Review objects. When false (default), returns only essential fields: id, version, userName, score, title, text, updated."
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        if (!params.id && !params.appId) {
          return errorResult(
            new Error("Either 'id' or 'appId' must be provided")
          );
        }
        const opts: Record<string, unknown> = {
          page: params.page,
          country: params.country,
        };
        if (params.id) opts.id = params.id;
        if (params.appId) opts.appId = params.appId;
        if (params.sort) opts.sort = lookupSort(params.sort);
        const result = await reviews(opts);
        if (!params.fullDetail && Array.isArray(result)) {
          const filtered = result.map((r: Record<string, unknown>) => ({
            id: r.id,
            version: r.version,
            userName: r.userName,
            score: r.score,
            title: r.title,
            text: r.text,
            updated: r.updated,
          }));
          return jsonResult(filtered);
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 9. apple_privacy
  server.registerTool(
    "apple_privacy",
    {
      title: "Get Apple App Privacy Details",
      description: `Retrieve App Privacy details (App Tracking Transparency data) for an Apple App Store app.

Returns a PrivacyDetails object containing:
- managePrivacyChoicesUrl: URL to manage privacy choices (or null)
- privacyTypes: Array of privacy type objects, each with:
  - privacyType, identifier, description
  - dataCategories: Array of { dataCategory, identifier, dataTypes[] }
  - purposes: Array of purpose objects`,
      inputSchema: z.object({
        id: z
          .string()
          .describe("Numeric App Store ID (e.g. '324684580')"),
        country: z
          .string()
          .default("US")
          .describe(
            "Upper-case ISO country code (Apple requires uppercase, default: 'US')"
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await privacy({
          id: params.id,
          country: params.country,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 10. apple_version_history
  server.registerTool(
    "apple_version_history",
    {
      title: "Get Apple App Version History",
      description: `Fetch the version release history for an Apple App Store app, including release notes for each version.

Returns an array of VersionHistoryItem objects, each containing:
- versionDisplay: Version string (e.g. "5.2.1")
- releaseNotes: Release notes text for that version
- releaseDate: Human-readable release date
- releaseTimestamp: ISO timestamp of the release`,
      inputSchema: z.object({
        id: z
          .string()
          .describe("Numeric App Store ID (e.g. '324684580')"),
        country: z
          .string()
          .default("US")
          .describe(
            "Upper-case ISO country code (Apple requires uppercase, default: 'US')"
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await versionHistory({
          id: params.id,
          country: params.country,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
