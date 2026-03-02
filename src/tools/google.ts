import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { jsonResult, errorResult } from "../utils.js";

const require = createRequire(import.meta.url);

interface GooglePlayApi {
  app: (opts: Record<string, unknown>) => Promise<unknown>;
  list: (opts?: Record<string, unknown>) => Promise<unknown>;
  search: (opts: Record<string, unknown>) => Promise<unknown>;
  searchGlobal: (opts: Record<string, unknown>) => Promise<unknown>;
  suggest: (opts: Record<string, unknown>) => Promise<unknown>;
  developer: (opts: Record<string, unknown>) => Promise<unknown>;
  reviews: (opts: Record<string, unknown>) => Promise<unknown>;
  similar: (opts: Record<string, unknown>) => Promise<unknown>;
  permissions: (opts: Record<string, unknown>) => Promise<unknown>;
  datasafety: (opts: Record<string, unknown>) => Promise<unknown>;
  categories: () => Promise<string[]>;
}

interface GoogleConstants {
  collection: Record<string, string>;
  sort: Record<string, number>;
  age: Record<string, string>;
  category: Record<string, string>;
}

const gplayModule = require("google-play-scraper-ts") as {
  default: GooglePlayApi;
  constants: GoogleConstants;
};
const gplay = gplayModule.default;
const constants = gplayModule.constants;

// --- Constants ---

const GOOGLE_COLLECTIONS = Object.keys(constants.collection) as [string, ...string[]];
const GOOGLE_SORT = Object.keys(constants.sort) as [string, ...string[]];
const GOOGLE_AGE = Object.keys(constants.age) as [string, ...string[]];

const GOOGLE_CATEGORIES_DESC = `Valid Google Play category names (pass the key name, e.g. "GAME_ACTION"):
General: APPLICATION, ANDROID_WEAR, BUSINESS, COMMUNICATION, EDUCATION, ENTERTAINMENT, LIFESTYLE, PRODUCTIVITY, SHOPPING, SOCIAL, TOOLS, WEATHER.
Content: ART_AND_DESIGN, BOOKS_AND_REFERENCE, COMICS, MUSIC_AND_AUDIO, NEWS_AND_MAGAZINES, PHOTOGRAPHY, VIDEO_PLAYERS.
Specialized: AUTO_AND_VEHICLES, BEAUTY, DATING, EVENTS, FINANCE, FOOD_AND_DRINK, HEALTH_AND_FITNESS, HOUSE_AND_HOME, LIBRARIES_AND_DEMO, MAPS_AND_NAVIGATION, MEDICAL, PARENTING, PERSONALIZATION, SPORTS, TRAVEL_AND_LOCAL, WATCH_FACE, FAMILY.
Games: GAME_ACTION, GAME_ADVENTURE, GAME_ARCADE, GAME_BOARD, GAME_CARD, GAME_CASINO, GAME_CASUAL, GAME_EDUCATIONAL, GAME_MUSIC, GAME_PUZZLE, GAME_RACING, GAME_ROLE_PLAYING, GAME_SIMULATION, GAME_SPORTS, GAME_STRATEGY, GAME_TRIVIA, GAME_WORD.
Use the google_categories tool for the full dynamic list.`;

// --- Helpers ---

function lookupCollection(key: string): unknown {
  const val = (constants.collection as Record<string, unknown>)[key];
  if (val === undefined) {
    throw new Error(
      `Invalid collection "${key}". Valid values: ${GOOGLE_COLLECTIONS.join(", ")}`
    );
  }
  return val;
}

function lookupSort(key: string): unknown {
  const val = (constants.sort as Record<string, unknown>)[key];
  if (val === undefined) {
    throw new Error(
      `Invalid sort "${key}". Valid values: ${GOOGLE_SORT.join(", ")}`
    );
  }
  return val;
}

function lookupCategory(key: string): unknown {
  const val = (constants.category as Record<string, unknown>)[key];
  if (val === undefined) {
    const validKeys = Object.keys(constants.category).join(", ");
    throw new Error(
      `Invalid category "${key}". Valid values: ${validKeys}`
    );
  }
  return val;
}

function lookupAge(key: string): unknown {
  const val = (constants.age as Record<string, unknown>)[key];
  if (val === undefined) {
    throw new Error(
      `Invalid age "${key}". Valid values: ${GOOGLE_AGE.join(", ")}`
    );
  }
  return val;
}

// --- Tool registration ---

export function registerGoogleTools(server: McpServer): void {
  // 1. google_app
  server.registerTool(
    "google_app",
    {
      title: "Get Google Play App Details",
      description: `Fetch detailed information for a single app from the Google Play Store.

Returns an AppDetails object with extensive fields including:
- Identification: appId, url, title, summary, description, descriptionHTML
- Ratings: score, scoreText, ratings, reviews, histogram (1-5 distribution)
- Installs: installs, minInstalls, maxInstalls
- Pricing: free, price, currency, priceText, offersIAP, IAPRange, originalPrice, discountEndDate
- Media: icon, headerImage, screenshots[], video, videoImage
- Developer: developer, developerId, developerEmail, developerWebsite, developerAddress
- Platform: version, androidVersion, androidVersionText, contentRating, adSupported
- Release: released, updated, recentChanges
- Categories: genre, genreId, categories[]
- Availability: available, preregister, earlyAccessEnabled, isAvailableInPlayPass`,
      inputSchema: z.object({
        appId: z
          .string()
          .describe(
            "Package identifier (e.g. 'com.spotify.music', 'com.whatsapp')"
          ),
        lang: z
          .string()
          .default("en")
          .describe("Store UI language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Storefront country code (default: 'us')"),
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
        const result = await gplay.app({
          appId: params.appId,
          lang: params.lang,
          country: params.country,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 2. google_list
  server.registerTool(
    "google_list",
    {
      title: "List Google Play Store Apps",
      description: `Retrieve curated app charts from the Google Play Store (top free, top paid, grossing).

Returns an array of AppSummary objects (appId, title, url, icon, developer, price, score). Set fullDetail to true to get full AppDetails for each app (slower, makes additional requests).

${GOOGLE_CATEGORIES_DESC}`,
      inputSchema: z.object({
        collection: z
          .enum(GOOGLE_COLLECTIONS)
          .optional()
          .describe(
            `Chart identifier. Valid values: ${GOOGLE_COLLECTIONS.join(", ")} (default: TOP_FREE)`
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Category filter key name (e.g. 'GAME_ACTION', 'MUSIC_AND_AUDIO'). See tool description for list."
          ),
        age: z
          .enum(GOOGLE_AGE)
          .optional()
          .describe(
            `Age range filter. Valid values: ${GOOGLE_AGE.join(", ")}`
          ),
        lang: z
          .string()
          .default("en")
          .describe("Metadata locale (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Region/storefront (default: 'us')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(60)
          .describe("Maximum entries to return (default: 60, max: 500)"),
        fullDetail: z
          .boolean()
          .default(false)
          .describe(
            "When true, fetches full AppDetails per entry (slower, default: false)"
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
          lang: params.lang,
          country: params.country,
          num: params.num,
          fullDetail: params.fullDetail,
        };
        if (params.collection) opts.collection = lookupCollection(params.collection);
        if (params.category) opts.category = lookupCategory(params.category);
        if (params.age) opts.age = lookupAge(params.age);
        const result = await gplay.list(opts);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 3. google_search
  server.registerTool(
    "google_search",
    {
      title: "Search Google Play Store",
      description: `Search the Google Play Store catalogue by keyword.

Returns an array of AppSummary objects. Set fullDetail to true to hydrate each match with full AppDetails (slower).

Note: Google Play caps search results at approximately 250, and in practice often returns ~60 maximum.`,
      inputSchema: z.object({
        term: z
          .string()
          .min(1)
          .describe("Search query (e.g. 'weather', 'todo list')"),
        lang: z
          .string()
          .default("en")
          .describe("Metadata language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Storefront country (default: 'us')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(250)
          .default(20)
          .describe("Requested results, max ~250 but Google caps at ~60 (default: 20)"),
        fullDetail: z
          .boolean()
          .default(false)
          .describe("Fetch full AppDetails per result (default: false)"),
        price: z
          .enum(["all", "free", "paid"])
          .default("all")
          .describe("Price filter: 'all', 'free', or 'paid' (default: 'all')"),
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
        const result = await gplay.search({
          term: params.term,
          lang: params.lang,
          country: params.country,
          num: params.num,
          fullDetail: params.fullDetail,
          price: params.price,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 4. google_search_global
  server.registerTool(
    "google_search_global",
    {
      title: "Search Google Play Store (Global)",
      description: `Legacy global feed search using Google Play's /work/search endpoint. Returns geo-neutral results unless traffic is routed through a country-specific proxy.

Parameters and return type are identical to google_search. Use google_search for most use cases; use this only if you need geo-neutral results.`,
      inputSchema: z.object({
        term: z
          .string()
          .min(1)
          .describe("Search query"),
        lang: z
          .string()
          .default("en")
          .describe("Metadata language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Storefront country (default: 'us')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(250)
          .default(20)
          .describe("Requested results (default: 20)"),
        fullDetail: z
          .boolean()
          .default(false)
          .describe("Fetch full AppDetails per result (default: false)"),
        price: z
          .enum(["all", "free", "paid"])
          .default("all")
          .describe("Price filter (default: 'all')"),
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
        const result = await gplay.searchGlobal({
          term: params.term,
          lang: params.lang,
          country: params.country,
          num: params.num,
          fullDetail: params.fullDetail,
          price: params.price,
        } as Parameters<typeof gplay.searchGlobal>[0]);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 5. google_suggest
  server.registerTool(
    "google_suggest",
    {
      title: "Get Google Play Search Suggestions",
      description: `Fetch autocomplete suggestions from Google Play Store for a partial search query.

Returns an array of suggestion strings ordered by relevance.

Example: suggest({ term: "wea" }) might return ["weather", "weather channel", "weather bug", ...]`,
      inputSchema: z.object({
        term: z
          .string()
          .min(1)
          .describe("Partial search query to get suggestions for"),
        lang: z
          .string()
          .default("en")
          .describe("Suggestion language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Storefront country (default: 'us')"),
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
        const result = await gplay.suggest({
          term: params.term,
          lang: params.lang,
          country: params.country,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 6. google_developer
  server.registerTool(
    "google_developer",
    {
      title: "List Apps by Google Play Developer",
      description: `List applications published by a specific developer on Google Play Store.

Returns an array of AppSummary objects. Set fullDetail to true to get full AppDetails per app.`,
      inputSchema: z.object({
        devId: z
          .string()
          .describe(
            "Developer identifier (numeric ID or slug name, e.g. 'Spotify AB', '5700313618786177705')"
          ),
        lang: z
          .string()
          .default("en")
          .describe("Metadata locale (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Storefront country (default: 'us')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(250)
          .default(20)
          .describe("Maximum results (default: 20, max: 250)"),
        fullDetail: z
          .boolean()
          .default(false)
          .describe("Fetch full AppDetails per app (default: false)"),
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
        const result = await gplay.developer({
          devId: params.devId,
          lang: params.lang,
          country: params.country,
          num: params.num,
          fullDetail: params.fullDetail,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 7. google_reviews
  server.registerTool(
    "google_reviews",
    {
      title: "Get Google Play App Reviews",
      description: `Retrieve paginated user reviews for a Google Play Store app.

Returns an object with:
- data: Array of Review objects. By default, returns only essential fields: id, userName, date, score, text, version. Set \`fullDetail\` to true to get complete raw Review objects (includes userImage, replyDate, replyText, thumbsUp, url, and all other fields).
- nextPaginationToken: String token for fetching the next page (null if no more pages)

To paginate, pass the nextPaginationToken from a previous call.`,
      inputSchema: z.object({
        appId: z
          .string()
          .describe("Package identifier (e.g. 'com.spotify.music')"),
        lang: z
          .string()
          .default("en")
          .describe("UI language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Store country (default: 'us')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(250)
          .default(20)
          .describe("Results per batch, max 250 (default: 20)"),
        sort: z
          .enum(GOOGLE_SORT)
          .optional()
          .describe(
            `Sort order. Valid values: ${GOOGLE_SORT.join(", ")}`
          ),
        paginate: z
          .boolean()
          .default(false)
          .describe(
            "Enable pagination. When true, the response includes nextPaginationToken (default: false)"
          ),
        nextPaginationToken: z
          .string()
          .optional()
          .describe(
            "Continuation token from a previous reviews call to fetch the next page"
          ),
        fullDetail: z
          .boolean()
          .default(false)
          .describe(
            "When true, returns complete raw Review objects. When false (default), returns only essential fields: id, userName, date, score, text, version."
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
          appId: params.appId,
          lang: params.lang,
          country: params.country,
          num: params.num,
          paginate: params.paginate,
        };
        if (params.sort) opts.sort = lookupSort(params.sort);
        if (params.nextPaginationToken) opts.nextPaginationToken = params.nextPaginationToken;
        const result = await gplay.reviews(opts);
        if (!params.fullDetail && result && typeof result === "object") {
          const res = result as { data?: unknown[]; nextPaginationToken?: string };
          if (Array.isArray(res.data)) {
            const filtered = res.data.map((r: unknown) => {
              const rev = r as Record<string, unknown>;
              return {
              id: rev.id,
              userName: rev.userName,
              date: rev.date,
              score: rev.score,
              text: rev.text,
              version: rev.version,
            };
            });
            return jsonResult({ data: filtered, nextPaginationToken: res.nextPaginationToken });
          }
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 8. google_similar
  server.registerTool(
    "google_similar",
    {
      title: "Get Similar Google Play Apps",
      description: `Retrieve apps similar to a given Google Play Store app (the "Similar apps" section).

Returns an array of AppSummary objects (up to ~60). Set fullDetail to true for full AppDetails per app.`,
      inputSchema: z.object({
        appId: z
          .string()
          .describe("Package identifier (e.g. 'com.spotify.music')"),
        lang: z
          .string()
          .default("en")
          .describe("Metadata language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Storefront region (default: 'us')"),
        num: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum results (default: 20, max: 100)"),
        fullDetail: z
          .boolean()
          .default(false)
          .describe("Fetch full AppDetails per app (default: false)"),
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
        const result = await gplay.similar({
          appId: params.appId,
          lang: params.lang,
          country: params.country,
          num: params.num,
          fullDetail: params.fullDetail,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 9. google_permissions
  server.registerTool(
    "google_permissions",
    {
      title: "Get Google Play App Permissions",
      description: `Inspect runtime permissions requested by a Google Play Store app.

When shortOnly is false (default), returns an array of PermissionItem objects with:
- permission: Permission name string (e.g. "CAMERA", "MICROPHONE")
- type: Section indicator (0 = COMMON, 1 = OTHER)

When shortOnly is true, returns a flat array of permission name strings.`,
      inputSchema: z.object({
        appId: z
          .string()
          .describe("Package identifier (e.g. 'com.spotify.music')"),
        lang: z
          .string()
          .default("en")
          .describe("UI language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Store country (default: 'us')"),
        shortOnly: z
          .boolean()
          .default(false)
          .describe(
            "When true, returns only permission name strings instead of full objects (default: false)"
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
        const result = await gplay.permissions({
          appId: params.appId,
          lang: params.lang,
          country: params.country,
          shortOnly: params.shortOnly,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 10. google_datasafety
  server.registerTool(
    "google_datasafety",
    {
      title: "Get Google Play Data Safety Info",
      description: `Fetch Google Play's Data Safety / privacy disclosures for an app.

Returns an object with:
- sharedData: Array of DataSafetyItem objects (data shared with third parties)
- collectedData: Array of DataSafetyItem objects (data collected by the app)
- securityPractices: Array of { practice, description } objects
- privacyPolicyUrl: URL to the app's privacy policy (if available)

Each DataSafetyItem contains: data (name), optional (boolean), purpose (usage label), type (category).`,
      inputSchema: z.object({
        appId: z
          .string()
          .describe("Package identifier (e.g. 'com.spotify.music')"),
        lang: z
          .string()
          .default("en")
          .describe("UI language (default: 'en')"),
        country: z
          .string()
          .default("us")
          .describe("Store country (default: 'us')"),
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
        const result = await gplay.datasafety({
          appId: params.appId,
          lang: params.lang,
          country: params.country,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // 11. google_categories
  server.registerTool(
    "google_categories",
    {
      title: "List Google Play Store Categories",
      description: `Retrieve the full list of available Google Play Store category identifiers.

Takes no parameters. Returns an array of category identifier strings (e.g. ["APPLICATION", "GAME_ACTION", "GAME_ADVENTURE", ...]).

Useful for discovering valid category values to use with other Google Play tools like google_list and google_search.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const result = await gplay.categories();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
