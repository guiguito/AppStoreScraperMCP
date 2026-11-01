import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { memoized, constants, type App } from "app-store-scraper-ts";
import { jsonResult, keysOf, READ_ONLY } from "../utils.js";

// Module-level, so the cache outlives the per-request McpServer: identical calls within 5 min hit memory, failures aren't cached.
// ponytail: library defaults (5 min, 1000 entries per method); pass { maxAge, max } if memory or freshness matters.
const { app, ratings, list, search, developer, suggest, similar, reviews, privacy, versionHistory, inAppPurchases } =
  memoized();
const { collection, sort, category } = constants;

const country = z.string().default("us").describe("Two-letter ISO country code (default: 'us')");
const subtitle = z
  .boolean()
  .optional()
  .describe("When true, adds each app's App Store subtitle (its short tagline): one extra request per 99 apps");
const fullDetail = z
  .boolean()
  .default(false)
  .describe("When true, returns full App objects (~12 KB each: description, screenshots, release notes…). Default false: compact cards");

// A full App is ~12 KB, mostly description and screenshot URLs; a card is enough to pick one, then call apple_app.
// Partial<App> also takes list's AppLite, which has no score/reviews/subtitle (Apple's charts feed doesn't carry them).
function appCard({ id, appId, title, subtitle, url, icon, developer, developerId, genre, price, currency, free, score, reviews }: Partial<App>) {
  return { id, appId, title, subtitle, url, icon, developer, developerId, genre, price, currency, free, score, reviews };
}
const CARD_FIELDS = "id, appId, title, subtitle, url, icon, developer, developerId, genre, price, currency, free, score, reviews";

function requireIdOrAppId(params: { id?: string; appId?: string }): void {
  if (!params.id && !params.appId) throw new Error("Either 'id' or 'appId' must be provided");
}

export function registerAppleTools(server: McpServer): void {
  server.registerTool(
    "apple_app",
    {
      title: "Get Apple App Store App Details",
      description: `Retrieve detailed information for a single app from the Apple App Store.

Provide either \`id\` (numeric App Store ID, e.g. "553834731") or \`appId\` (bundle identifier, e.g. "com.midasplayer.apps.candycrushsaga"). At least one is required.

Returns a detailed App object including: title, description, icon, screenshots, price, currency, score, ratings, reviews count, version, release notes, developer info, genres, content rating, supported devices, and more.

Set \`ratings\` to true to include the star histogram (1-5 distribution), \`subtitle\` to add the App Store tagline, and \`inAppPurchases\` to add the top in-app purchases (same data as apple_in_app_purchases).`,
      inputSchema: z.object({
        id: z.string().optional().describe("Numeric App Store ID (e.g. '553834731'). Provide this or appId."),
        appId: z
          .string()
          .optional()
          .describe("Bundle identifier (e.g. 'com.midasplayer.apps.candycrushsaga'). Provide this or id."),
        country,
        lang: z.string().optional().describe("IETF language tag (e.g. 'en-us', 'fr-fr')"),
        ratings: z
          .boolean()
          .optional()
          .describe("When true, includes total ratings count and star histogram in the result"),
        subtitle,
        inAppPurchases: z
          .boolean()
          .optional()
          .describe("When true, adds the app's top in-app purchases (one extra request; the call fails if it fails)"),
      }),
      annotations: READ_ONLY,
    },
    async (params) => {
      requireIdOrAppId(params);
      return jsonResult(await app(params));
    }
  );

  server.registerTool(
    "apple_ratings",
    {
      title: "Get Apple App Store Ratings",
      description: `Fetch the total ratings count and star distribution histogram for an Apple App Store app.

Returns an object with:
- ratings (number): Total number of ratings
- histogram (object): Star distribution, e.g. { "1": 100, "2": 200, "3": 500, "4": 2000, "5": 9545 }`,
      inputSchema: z.object({
        id: z.string().describe("Numeric App Store ID (e.g. '553834731')"),
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await ratings(params))
  );

  server.registerTool(
    "apple_list",
    {
      title: "List Apple App Store Apps",
      description: `Retrieve ranked app collections from the Apple App Store (top free, top paid, new, grossing, etc.).

Returns an array of compact app cards (${CARD_FIELDS}; score and reviews only with fullDetail, as the charts feed lacks them). Set fullDetail to true for full App objects.`,
      inputSchema: z.object({
        collection: z.enum(keysOf(collection)).optional().describe("App Store collection to browse (default: TOP_FREE_IOS)"),
        category: z.enum(keysOf(category)).optional().describe("Category filter (e.g. 'GAMES', 'BUSINESS')"),
        country,
        lang: z.string().optional().describe("IETF language tag (e.g. 'en-us')"),
        num: z.number().int().min(1).max(200).default(50).describe("Number of results to return (1-200, default: 50)"),
        fullDetail,
        subtitle: subtitle.describe("With fullDetail only: adds each app's App Store subtitle (one extra request per 99 apps)"),
      }),
      annotations: READ_ONLY,
    },
    async (params) => {
      const result = await list({
        ...params,
        collection: params.collection && collection[params.collection],
        category: params.category && category[params.category],
      });
      return jsonResult(params.fullDetail ? result : result.map(appCard));
    }
  );

  server.registerTool(
    "apple_search",
    {
      title: "Search Apple App Store",
      description: `Search for apps on the Apple App Store by keyword.

Returns an array of compact app cards (${CARD_FIELDS}). Set fullDetail to true for full App objects, or idsOnly to true for just the app IDs.`,
      inputSchema: z.object({
        term: z.string().min(1).describe("Search query (e.g. 'weather app', 'fitness tracker')"),
        num: z.number().int().min(1).max(200).default(50).describe("Number of results per page (default: 50)"),
        page: z.number().int().min(1).default(1).describe("Page number, 1-based (default: 1)"),
        country,
        lang: z.string().default("en-us").describe("Accept-Language header value (default: 'en-us')"),
        idsOnly: z
          .boolean()
          .optional()
          .describe("When true, returns only an array of app IDs instead of app objects"),
        fullDetail,
        subtitle,
      }),
      annotations: READ_ONLY,
    },
    async ({ fullDetail, ...params }) => {
      const result = await search(params);
      if (fullDetail || params.idsOnly) return jsonResult(result);
      return jsonResult((result as App[]).map(appCard));
    }
  );

  server.registerTool(
    "apple_developer",
    {
      title: "List Apps by Apple Developer",
      description: `List all apps published by a specific Apple developer.

Returns an array of compact app cards (${CARD_FIELDS}) for all apps by the given developer ID. Set fullDetail to true for full App objects.`,
      inputSchema: z.object({
        devId: z.string().describe("Apple developer ID (numeric string, e.g. '284882218' for Facebook)"),
        country,
        lang: z.string().optional().describe("IETF language tag"),
        fullDetail,
        subtitle,
      }),
      annotations: READ_ONLY,
    },
    async ({ fullDetail, ...params }) => {
      const result = await developer(params);
      return jsonResult(fullDetail ? result : result.map(appCard));
    }
  );

  server.registerTool(
    "apple_suggest",
    {
      title: "Get Apple App Store Search Suggestions",
      description: `Get autocomplete search suggestions from the Apple App Store.

Returns an array of suggestion objects, each with a "term" field. Useful for building search UIs or discovering related search terms.

Example: suggest({ term: "pan" }) might return [{ term: "pandora" }, { term: "panda" }, ...]`,
      inputSchema: z.object({
        term: z.string().min(1).describe("Partial search query to get suggestions for"),
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await suggest(params))
  );

  server.registerTool(
    "apple_similar",
    {
      title: "Get Similar Apple App Store Apps",
      description: `Retrieve "Customers Also Bought" related apps for a given Apple App Store app.

Provide either \`id\` (numeric) or \`appId\` (bundle identifier). Returns an array of compact app cards (${CARD_FIELDS}), possibly empty. Set fullDetail to true for full App objects.`,
      inputSchema: z.object({
        id: z.string().optional().describe("Numeric App Store ID. Provide this or appId."),
        appId: z.string().optional().describe("Bundle identifier. Provide this or id."),
        country,
        lang: z.string().optional().describe("IETF language tag"),
        fullDetail,
        subtitle,
      }),
      annotations: READ_ONLY,
    },
    async ({ fullDetail, ...params }) => {
      requireIdOrAppId(params);
      const result = await similar(params);
      return jsonResult(fullDetail ? result : result.map(appCard));
    }
  );

  server.registerTool(
    "apple_reviews",
    {
      title: "Get Apple App Store Reviews",
      description: `Fetch paginated customer reviews for an Apple App Store app.

Provide either \`id\` (numeric) or \`appId\` (bundle identifier).

By default, returns a filtered array with essential fields only: id, version, userName, score, title, text, updated. Set \`fullDetail\` to true to get the complete raw Review objects (adds userUrl, url, voteSum, voteCount).

Note: Apple limits review pages to 1-10.`,
      inputSchema: z.object({
        id: z.string().optional().describe("Numeric App Store ID. Provide this or appId."),
        appId: z.string().optional().describe("Bundle identifier. Provide this or id."),
        sort: z.enum(keysOf(sort)).optional().describe("Sort order for reviews (default: RECENT)"),
        page: z.number().int().min(1).max(10).default(1).describe("Page number, 1-10 (Apple-imposed limit, default: 1)"),
        country,
        fullDetail: z
          .boolean()
          .default(false)
          .describe(
            "When true, returns complete raw Review objects. When false (default), returns only essential fields: id, version, userName, score, title, text, updated."
          ),
      }),
      annotations: READ_ONLY,
    },
    async ({ fullDetail, ...params }) => {
      requireIdOrAppId(params);
      const result = await reviews({ ...params, sort: params.sort && sort[params.sort] });
      if (fullDetail) return jsonResult(result);
      return jsonResult(
        result.map(({ id, version, userName, score, title, text, updated }) => ({
          id,
          version,
          userName,
          score,
          title,
          text,
          updated,
        }))
      );
    }
  );

  server.registerTool(
    "apple_privacy",
    {
      title: "Get Apple App Privacy Details",
      description: `Retrieve App Privacy details (App Tracking Transparency data) for an Apple App Store app.

Returns a PrivacyDetails object containing:
- managePrivacyChoicesUrl: URL to manage privacy choices (or null)
- privacyPolicyUrl: The developer's privacy policy link (or null)
- privacyTypes: Array of privacy type objects, each with:
  - privacyType, identifier, description
  - dataCategories: Array of { dataCategory, identifier, dataTypes[] }
  - purposes: Array of purpose objects`,
      inputSchema: z.object({
        id: z.string().describe("Numeric App Store ID (e.g. '324684580')"),
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await privacy(params))
  );

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
        id: z.string().describe("Numeric App Store ID (e.g. '324684580')"),
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await versionHistory(params))
  );

  server.registerTool(
    "apple_in_app_purchases",
    {
      title: "Get Apple App In-App Purchases",
      description: `List an Apple App Store app's top in-app purchases (up to 10, as shown on its App Store page), priced in the \`country\` storefront's currency.

Returns an array (empty when the app has none) of:
- id, productId: Apple's numeric id and the developer's product identifier
- title, description
- price (number), currency (ISO 4217), formattedPrice (e.g. "$9.99")
- subscription (boolean), subscriptionPeriod (ISO 8601 duration such as "P1M", subscriptions only)`,
      inputSchema: z.object({
        id: z.string().describe("Numeric App Store ID (e.g. '570060128')"),
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await inAppPurchases(params))
  );
}
