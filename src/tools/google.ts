import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import gplay, { constants, type AppSummary, type AppDetails } from "google-play-scraper-ts";
import { jsonResult, keysOf, READ_ONLY } from "../utils.js";

const { collection, sort, age, category, device } = constants;

// Module-level, so the cache outlives the per-request McpServer: identical calls within 5 min hit memory, failures aren't cached.
// ponytail: library defaults (5 min, 1000 entries per method); pass { maxAge, max } if memory or freshness matters.
const play = gplay.memoized();

// Play's result cards carry the full description markup (~3 KB each, more than the rest of the card); keep it for fullDetail only.
function cards(apps: AppSummary[] | AppDetails[], fullDetail: boolean) {
  return fullDetail ? apps : (apps as AppSummary[]).map(({ descriptionHTML, ...card }) => card);
}

const lang = z.string().default("en").describe("Store UI language (default: 'en')");
const country = z.string().default("us").describe("Storefront country code (default: 'us')");
const fullDetail = z
  .boolean()
  .default(false)
  .describe("Fetch full AppDetails per app (slower, one extra request each; default: false)");

export function registerGoogleTools(server: McpServer): void {
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
        appId: z.string().describe("Package identifier (e.g. 'com.spotify.music', 'com.whatsapp')"),
        lang,
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await play.app(params))
  );

  server.registerTool(
    "google_list",
    {
      title: "List Google Play Store Apps",
      description: `Retrieve curated app charts from the Google Play Store (top free, top paid, grossing).

Returns an array of AppSummary objects (appId, title, url, icon, developer, price, score). Set fullDetail to true to get full AppDetails for each app (slower, makes additional requests).`,
      inputSchema: z.object({
        collection: z.enum(keysOf(collection)).optional().describe("Chart (default: TOP_FREE)"),
        category: z.enum(keysOf(category)).optional().describe("Category filter (e.g. 'GAME_ACTION', 'MUSIC_AND_AUDIO')"),
        age: z.enum(keysOf(age)).optional().describe("Age range filter"),
        lang,
        country,
        num: z.number().int().min(1).max(500).default(60).describe("Maximum entries to return (default: 60, max: 500)"),
        fullDetail,
      }),
      annotations: READ_ONLY,
    },
    async (params) => {
      const result = await play.list({
        ...params,
        collection: params.collection && collection[params.collection],
        category: params.category && category[params.category],
        age: params.age && age[params.age],
      });
      return jsonResult(cards(result, params.fullDetail));
    }
  );

  server.registerTool(
    "google_search",
    {
      title: "Search Google Play Store",
      description: `Search the Google Play Store catalogue by keyword.

Returns an array of AppSummary objects. Set fullDetail to true to hydrate each match with full AppDetails (slower).

Note: most queries stop at Play's first page (~20-30 apps); some (single characters, digits, some app names) continue up to ~250.`,
      inputSchema: z.object({
        term: z.string().min(1).describe("Search query (e.g. 'weather', 'todo list')"),
        lang,
        country,
        num: z.number().int().min(1).max(250).default(20).describe("Maximum results, 1-250 (default: 20)"),
        fullDetail,
        price: z.enum(["all", "free", "paid"]).default("all").describe("Price filter (default: 'all')"),
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(cards(await play.search(params), params.fullDetail))
  );

  server.registerTool(
    "google_suggest",
    {
      title: "Get Google Play Search Suggestions",
      description: `Fetch autocomplete suggestions from Google Play Store for a partial search query.

Returns an array of suggestion strings ordered by relevance.

Example: suggest({ term: "wea" }) might return ["weather", "weather channel", "weather bug", ...]`,
      inputSchema: z.object({
        term: z.string().min(1).describe("Partial search query to get suggestions for"),
        lang,
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await play.suggest(params))
  );

  server.registerTool(
    "google_developer",
    {
      title: "List Apps by Google Play Developer",
      description: `List applications published by a specific developer on Google Play Store.

Returns an array of AppSummary objects. Set fullDetail to true to get full AppDetails per app.`,
      inputSchema: z.object({
        devId: z
          .string()
          .describe("Developer identifier (numeric ID or slug name, e.g. 'Spotify AB', '5700313618786177705')"),
        lang,
        country,
        num: z.number().int().min(1).max(250).default(20).describe("Maximum results (default: 20, max: 250)"),
        fullDetail,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(cards(await play.developer(params), params.fullDetail))
  );

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
        appId: z.string().describe("Package identifier (e.g. 'com.spotify.music')"),
        lang,
        country,
        num: z.number().int().min(1).max(250).default(20).describe("Results per batch, max 250 (default: 20)"),
        sort: z.enum(keysOf(sort)).optional().describe("Sort order (default: NEWEST)"),
        score: z.literal([1, 2, 3, 4, 5]).optional().describe("Only reviews with this star rating (filtered by Play)"),
        device: z.enum(keysOf(device)).optional().describe("Only reviews written on this form factor (filtered by Play)"),
        paginate: z
          .boolean()
          .default(false)
          .describe("Enable pagination. When true, the response includes nextPaginationToken (default: false)"),
        nextPaginationToken: z
          .string()
          .optional()
          .describe("Continuation token from a previous reviews call to fetch the next page"),
        fullDetail: z
          .boolean()
          .default(false)
          .describe(
            "When true, returns complete raw Review objects. When false (default), returns only essential fields: id, userName, date, score, text, version."
          ),
      }),
      annotations: READ_ONLY,
    },
    async ({ fullDetail, ...params }) => {
      const result = await play.reviews({
        ...params,
        sort: params.sort && sort[params.sort],
        device: params.device && device[params.device],
      });
      if (fullDetail) return jsonResult(result);
      return jsonResult({
        data: result.data.map(({ id, userName, date, score, text, version }) => ({
          id,
          userName,
          date,
          score,
          text,
          version,
        })),
        nextPaginationToken: result.nextPaginationToken,
      });
    }
  );

  server.registerTool(
    "google_similar",
    {
      title: "Get Similar Google Play Apps",
      description: `Retrieve apps similar to a given Google Play Store app (the "Similar apps" section).

Returns an array of AppSummary objects (up to ~60). Set fullDetail to true for full AppDetails per app.`,
      inputSchema: z.object({
        appId: z.string().describe("Package identifier (e.g. 'com.spotify.music')"),
        lang,
        country,
        num: z.number().int().min(1).max(100).default(20).describe("Maximum results (default: 20, max: 100)"),
        fullDetail,
      }),
      annotations: READ_ONLY,
    },
    // The scraper has no num option, so trim here.
    async ({ num, ...params }) => jsonResult(cards(await play.similar(params), params.fullDetail).slice(0, num))
  );

  server.registerTool(
    "google_permissions",
    {
      title: "Get Google Play App Permissions",
      description: `Inspect runtime permissions requested by a Google Play Store app.

When shortOnly is false (default), returns an array of PermissionItem objects with:
- permission: Permission description (e.g. "approximate location (network-based)")
- type: Permission group label from Play (e.g. "Location")

When shortOnly is true, returns a flat array of permission strings.`,
      inputSchema: z.object({
        appId: z.string().describe("Package identifier (e.g. 'com.spotify.music')"),
        lang,
        country,
        shortOnly: z
          .boolean()
          .default(false)
          .describe("When true, returns only permission strings instead of full objects (default: false)"),
      }),
      annotations: READ_ONLY,
    },
    async ({ shortOnly, ...params }) => jsonResult(await play.permissions({ ...params, short: shortOnly }))
  );

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
        appId: z.string().describe("Package identifier (e.g. 'com.spotify.music')"),
        lang,
        country,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await play.datasafety(params))
  );

  server.registerTool(
    "google_categories",
    {
      title: "List Google Play Store Categories",
      description: `Retrieve the live list of Google Play Store category identifiers, as Play currently serves them.

Takes no parameters. Returns an array of category identifier strings (e.g. ["APPLICATION", "GAME_ACTION", "GAME_ADVENTURE", ...]).

google_list accepts the categories listed in its own input schema.`,
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async () => jsonResult(await play.categories())
  );

  server.registerTool(
    "google_availability",
    {
      title: "Check Google Play App Availability by Country",
      description: `Check in which storefronts a Google Play app is offered.

Returns an object keyed by lowercased country code, e.g. { "us": true, "fr": false }. Reads the listing's own availability flag (Play answers 200 even where an app isn't published); an unknown or removed app counts as unavailable. One request per country.`,
      inputSchema: z.object({
        appId: z.string().describe("Package identifier (e.g. 'com.venmo')"),
        countries: z
          .array(z.string().length(2))
          .min(1)
          .max(200)
          .describe("Two-letter storefront country codes to check (e.g. ['us', 'fr', 'jp'])"),
        lang,
      }),
      annotations: READ_ONLY,
    },
    async (params) => jsonResult(await play.availability(params))
  );
}
