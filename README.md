# App Store Scraper MCP Server

An MCP (Model Context Protocol) server that exposes Apple App Store and Google Play Store scraping capabilities as 21 tools. Connect it to any MCP-compatible client (Claude Desktop, Cursor, etc.) to let LLMs search, browse, and analyze mobile apps from both stores.

Built on top of [app-store-scraper-ts](https://www.npmjs.com/package/app-store-scraper-ts) and [google-play-scraper-ts](https://www.npmjs.com/package/google-play-scraper-ts).

## Features

- **21 read-only tools** covering both Apple App Store (10 tools) and Google Play Store (11 tools)
- **Dual transport**: stdio (for local MCP clients) and Streamable HTTP (for remote access)
- **No authentication required** — all data is publicly available on the stores
- **Docker-ready** with a multi-stage production build
- **Fully documented** tool schemas with Zod validation, enum descriptions, and inline examples

## Quick Start

### Prerequisites

- Node.js >= 18

### Install & Build

```bash
npm install
npm run build
```

### Run

**Stdio transport** (default — for Claude Desktop, Cursor, etc.):

```bash
npm start
```

**HTTP transport** (remote/networked access):

```bash
node dist/index.js --http
# or
TRANSPORT=http npm start
```

The HTTP server listens on `http://localhost:3000/mcp` by default. Set the `PORT` environment variable to change it:

```bash
PORT=8080 node dist/index.js --http
```

**Development mode** (auto-reload):

```bash
npm run dev
```

## Client Configuration

### Claude Desktop / Cursor (stdio)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "app-store-scraper": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

### Remote HTTP Client

Point your MCP client to:

```
http://localhost:3000/mcp
```

Requests must include the header:

```
Accept: application/json, text/event-stream
```

### HTTPS

The server itself speaks plain HTTP — TLS termination is handled by a reverse proxy in front of it. This is the standard production pattern and keeps certificate management separate from application code.

**Caddy** (easiest — automatic Let's Encrypt certificates):

```
# Caddyfile
mcp.example.com {
    reverse_proxy localhost:3000
}
```

Run with `caddy run` and Caddy will automatically obtain and renew TLS certificates.

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;

    ssl_certificate     /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    location /mcp {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use [certbot](https://certbot.eff.org/) to obtain certificates from Let's Encrypt.

**Cloudflare Tunnel** (no open ports needed):

```bash
cloudflared tunnel --url http://localhost:3000
```

This exposes the server under a `*.trycloudflare.com` URL with automatic HTTPS, no domain or certificates required. For a permanent subdomain, configure a named tunnel in your Cloudflare dashboard.

**Docker + Caddy** (single compose stack):

```yaml
# docker-compose.yml
services:
  mcp:
    build: .
    expose:
      - "3000"

  caddy:
    image: caddy:2
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - mcp

volumes:
  caddy_data:
```

```
# Caddyfile
mcp.example.com {
    reverse_proxy mcp:3000
}
```

Your MCP client then connects to `https://mcp.example.com/mcp`.

## Docker

### Build

```bash
docker build -t app-store-scraper-mcp .
```

### Run

```bash
docker run -p 3000:3000 app-store-scraper-mcp
```

Custom port:

```bash
docker run -p 8080:8080 -e PORT=8080 app-store-scraper-mcp
```

The Docker image runs in HTTP transport mode by default.

## Tools Reference

All tools are **read-only**, **idempotent**, and make requests to public app store endpoints. No API keys needed.

---

### Apple App Store Tools

#### `apple_app`

Retrieve detailed information for a single app.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | one of id/appId | — | Numeric App Store ID (e.g. `"553834731"`) |
| `appId` | string | one of id/appId | — | Bundle identifier (e.g. `"com.midasplayer.apps.candycrushsaga"`) |
| `country` | string | no | `"us"` | Two-letter ISO country code |
| `lang` | string | no | — | IETF language tag (e.g. `"en-us"`, `"fr-fr"`) |
| `ratings` | boolean | no | — | Include total ratings count and star histogram |

**Returns:** Full App object with title, description, icon, screenshots, price, score, ratings, version, release notes, developer info, genres, content rating, supported devices, and more.

---

#### `apple_ratings`

Fetch the total ratings count and star distribution histogram.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | yes | — | Numeric App Store ID |
| `country` | string | no | `"us"` | Two-letter ISO country code |

**Returns:** `{ ratings: number, histogram: { "1": number, "2": number, "3": number, "4": number, "5": number } }`

---

#### `apple_list`

Browse ranked app collections (top free, top paid, new, grossing, etc.).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `collection` | enum | no | — | Collection key (see [Apple Collections](#apple-collections)) |
| `category` | string | no | — | Category key (see [Apple Categories](#apple-categories)) |
| `country` | string | no | `"us"` | Two-letter ISO country code |
| `lang` | string | no | — | IETF language tag |
| `num` | number | no | `50` | Number of results (1-200) |
| `fullDetail` | boolean | no | — | Return full App objects instead of lightweight AppLite |

---

#### `apple_search`

Search apps by keyword.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `term` | string | yes | — | Search query |
| `num` | number | no | `50` | Results per page (1-200) |
| `page` | number | no | `1` | Page number (1-based) |
| `country` | string | no | `"us"` | Two-letter ISO country code |
| `lang` | string | no | `"en-us"` | Accept-Language header value |
| `idsOnly` | boolean | no | — | Return only app IDs instead of full objects |

---

#### `apple_developer`

List all apps by a specific developer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `devId` | string | yes | — | Apple developer ID (e.g. `"284882218"` for Facebook) |
| `country` | string | no | `"us"` | Two-letter ISO country code |
| `lang` | string | no | — | IETF language tag |

---

#### `apple_suggest`

Get autocomplete search suggestions.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `term` | string | yes | — | Partial search query |
| `country` | string | no | `"us"` | Two-letter ISO country code |

**Returns:** Array of `{ term: string }` suggestion objects.

---

#### `apple_similar`

Get "Customers Also Bought" related apps.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | one of id/appId | — | Numeric App Store ID |
| `appId` | string | one of id/appId | — | Bundle identifier |
| `country` | string | no | — | Two-letter ISO country code |
| `lang` | string | no | — | IETF language tag |

---

#### `apple_reviews`

Fetch paginated customer reviews.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | one of id/appId | — | Numeric App Store ID |
| `appId` | string | one of id/appId | — | Bundle identifier |
| `sort` | enum | no | `RECENT` | Sort order (see [Apple Sort](#apple-sort-values)) |
| `page` | number | no | `1` | Page number (1-10, Apple-imposed limit) |
| `country` | string | no | `"us"` | Two-letter ISO country code |

**Returns:** Array of Review objects with id, userName, userUrl, version, score (1-5), title, text, url, updated.

---

#### `apple_privacy`

Get App Privacy / App Tracking Transparency details.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | yes | — | Numeric App Store ID |
| `country` | string | no | `"US"` | Upper-case ISO country code |

**Returns:** PrivacyDetails object with managePrivacyChoicesUrl, privacyTypes array (dataCategories, purposes).

---

#### `apple_version_history`

Fetch version release history with release notes.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | yes | — | Numeric App Store ID |
| `country` | string | no | `"US"` | Upper-case ISO country code |

**Returns:** Array of `{ versionDisplay, releaseNotes, releaseDate, releaseTimestamp }`.

---

### Google Play Store Tools

#### `google_app`

Fetch detailed information for a single app.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `appId` | string | yes | — | Package identifier (e.g. `"com.spotify.music"`) |
| `lang` | string | no | `"en"` | Store UI language |
| `country` | string | no | `"us"` | Storefront country code |

**Returns:** Full AppDetails object with title, description, score, ratings, histogram, installs, price, IAP info, icon, screenshots, video, developer details, version, Android version, content rating, genre, categories, and availability flags.

---

#### `google_list`

Browse curated app charts (top free, top paid, grossing).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `collection` | enum | no | — | Chart identifier (see [Google Collections](#google-collections)) |
| `category` | string | no | — | Category key (see [Google Categories](#google-categories)) |
| `age` | enum | no | — | Age range filter (see [Google Age Ranges](#google-age-ranges)) |
| `lang` | string | no | `"en"` | Metadata locale |
| `country` | string | no | `"us"` | Storefront region |
| `num` | number | no | `60` | Max entries (1-500) |
| `fullDetail` | boolean | no | `false` | Fetch full AppDetails per entry (slower) |

---

#### `google_search`

Search the Google Play catalogue by keyword.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `term` | string | yes | — | Search query |
| `lang` | string | no | `"en"` | Metadata language |
| `country` | string | no | `"us"` | Storefront country |
| `num` | number | no | `20` | Requested results (max ~250, Google caps at ~60) |
| `fullDetail` | boolean | no | `false` | Fetch full AppDetails per result |
| `price` | enum | no | `"all"` | Price filter: `"all"`, `"free"`, or `"paid"` |

---

#### `google_search_global`

Legacy global feed search via `/work/search` endpoint. Returns geo-neutral results. Same parameters as `google_search`.

---

#### `google_suggest`

Get autocomplete search suggestions.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `term` | string | yes | — | Partial search query |
| `lang` | string | no | `"en"` | Suggestion language |
| `country` | string | no | `"us"` | Storefront country |

**Returns:** Array of suggestion strings.

---

#### `google_developer`

List apps published by a specific developer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `devId` | string | yes | — | Developer ID or slug (e.g. `"Spotify AB"`, `"5700313618786177705"`) |
| `lang` | string | no | `"en"` | Metadata locale |
| `country` | string | no | `"us"` | Storefront country |
| `num` | number | no | `20` | Max results (1-250) |
| `fullDetail` | boolean | no | `false` | Fetch full AppDetails per app |

---

#### `google_reviews`

Retrieve paginated user reviews.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `appId` | string | yes | — | Package identifier |
| `lang` | string | no | `"en"` | UI language |
| `country` | string | no | `"us"` | Store country |
| `num` | number | no | `20` | Results per batch (1-250) |
| `sort` | enum | no | — | Sort order (see [Google Sort](#google-sort-values)) |
| `paginate` | boolean | no | `false` | Enable pagination (returns `nextPaginationToken`) |
| `nextPaginationToken` | string | no | — | Token from previous call for next page |

**Returns:** `{ data: Review[], nextPaginationToken: string | null }`. Each Review has id, userName, userImage, date, score (1-5), text, replyDate, replyText, version, thumbsUp, url.

---

#### `google_similar`

Get "Similar apps" for a given app.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `appId` | string | yes | — | Package identifier |
| `lang` | string | no | `"en"` | Metadata language |
| `country` | string | no | `"us"` | Storefront region |
| `num` | number | no | `20` | Max results (1-100) |
| `fullDetail` | boolean | no | `false` | Fetch full AppDetails per app |

---

#### `google_permissions`

Inspect runtime permissions requested by an app.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `appId` | string | yes | — | Package identifier |
| `lang` | string | no | `"en"` | UI language |
| `country` | string | no | `"us"` | Store country |
| `shortOnly` | boolean | no | `false` | Return only permission name strings |

**Returns:** Array of `{ permission, type }` objects (or flat string array when `shortOnly` is true).

---

#### `google_datasafety`

Fetch Data Safety / privacy disclosures.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `appId` | string | yes | — | Package identifier |
| `lang` | string | no | `"en"` | UI language |
| `country` | string | no | `"us"` | Store country |

**Returns:** `{ sharedData, collectedData, securityPractices, privacyPolicyUrl }`.

---

#### `google_categories`

List all available Google Play category identifiers. Takes no parameters.

**Returns:** Array of category strings (e.g. `["APPLICATION", "GAME_ACTION", ...]`).

---

## Enum Reference

### Apple Collections

Pass the key name as the `collection` parameter:

| Key | Description |
|-----|-------------|
| `TOP_FREE_IOS` | Top Free iPhone Apps |
| `TOP_FREE_IPAD` | Top Free iPad Apps |
| `TOP_PAID_IOS` | Top Paid iPhone Apps |
| `TOP_PAID_IPAD` | Top Paid iPad Apps |
| `TOP_GROSSING_IOS` | Top Grossing iPhone Apps |
| `TOP_GROSSING_IPAD` | Top Grossing iPad Apps |
| `NEW_IOS` | New iPhone Apps |
| `NEW_IPAD` | New iPad Apps |

### Apple Sort Values

| Key | Description |
|-----|-------------|
| `RECENT` | Most recent reviews first |
| `HELPFUL` | Most helpful reviews first |

### Apple Categories

Pass the key name as the `category` parameter:

**Top-level:** `GAMES`, `BUSINESS`, `EDUCATION`, `ENTERTAINMENT`, `FINANCE`, `FOOD_AND_DRINK`, `HEALTH_AND_FITNESS`, `LIFESTYLE`, `MEDICAL`, `MUSIC`, `NAVIGATION`, `NEWS`, `PHOTO_AND_VIDEO`, `PRODUCTIVITY`, `REFERENCE`, `SHOPPING`, `SOCIAL_NETWORKING`, `SPORTS`, `TRAVEL`, `UTILITIES`, `WEATHER`, `BOOKS`, `CATALOGS`

**Game subcategories:** `GAMES_ACTION`, `GAMES_ADVENTURE`, `GAMES_ARCADE`, `GAMES_BOARD`, `GAMES_CARD`, `GAMES_CASINO`, `GAMES_DICE`, `GAMES_EDUCATIONAL`, `GAMES_FAMILY`, `GAMES_MUSIC`, `GAMES_PUZZLE`, `GAMES_RACING`, `GAMES_ROLE_PLAYING`, `GAMES_SIMULATION`, `GAMES_SPORTS`, `GAMES_STRATEGY`, `GAMES_TRIVIA`, `GAMES_WORD`

### Google Collections

| Key | Description |
|-----|-------------|
| `TOP_FREE` | Top Free Apps |
| `TOP_PAID` | Top Paid Apps |
| `GROSSING` | Top Grossing Apps |

### Google Sort Values

| Key | Description |
|-----|-------------|
| `NEWEST` | Most recent first |
| `RATING` | Highest rated first |
| `HELPFULNESS` | Most helpful first |

### Google Age Ranges

| Key | Description |
|-----|-------------|
| `FIVE_UNDER` | Ages 5 and under |
| `SIX_EIGHT` | Ages 6-8 |
| `NINE_UP` | Ages 9 and up |

### Google Categories

**General:** `APPLICATION`, `ANDROID_WEAR`, `BUSINESS`, `COMMUNICATION`, `EDUCATION`, `ENTERTAINMENT`, `LIFESTYLE`, `PRODUCTIVITY`, `SHOPPING`, `SOCIAL`, `TOOLS`, `WEATHER`

**Content:** `ART_AND_DESIGN`, `BOOKS_AND_REFERENCE`, `COMICS`, `MUSIC_AND_AUDIO`, `NEWS_AND_MAGAZINES`, `PHOTOGRAPHY`, `VIDEO_PLAYERS`

**Specialized:** `AUTO_AND_VEHICLES`, `BEAUTY`, `DATING`, `EVENTS`, `FINANCE`, `FOOD_AND_DRINK`, `HEALTH_AND_FITNESS`, `HOUSE_AND_HOME`, `LIBRARIES_AND_DEMO`, `MAPS_AND_NAVIGATION`, `MEDICAL`, `PARENTING`, `PERSONALIZATION`, `SPORTS`, `TRAVEL_AND_LOCAL`, `WATCH_FACE`, `FAMILY`

**Games:** `GAME_ACTION`, `GAME_ADVENTURE`, `GAME_ARCADE`, `GAME_BOARD`, `GAME_CARD`, `GAME_CASINO`, `GAME_CASUAL`, `GAME_EDUCATIONAL`, `GAME_MUSIC`, `GAME_PUZZLE`, `GAME_RACING`, `GAME_ROLE_PLAYING`, `GAME_SIMULATION`, `GAME_SPORTS`, `GAME_STRATEGY`, `GAME_TRIVIA`, `GAME_WORD`

Use `google_categories` tool at runtime for the full dynamic list.

## Project Structure

```
src/
  index.ts          # Entry point, transport selection, Express HTTP server
  utils.ts          # Shared response helpers (jsonResult, errorResult)
  tools/
    apple.ts        # 10 Apple App Store tools
    google.ts       # 11 Google Play Store tools
Dockerfile          # Multi-stage production build
tsconfig.json       # TypeScript configuration
```

## License

MIT
