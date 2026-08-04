# Setto

AI photo shoots in real places. Plan shoots at real locations, save **models**,
**outfits** (with variations), and **presets**, optionally stage scenes in 3D,
and generate grounded imagery through **fal** — shared across your team.

## Stack

| Concern        | Tech |
| -------------- | ---- |
| Frontend       | Next.js 16 (App Router) · React 19 · TypeScript |
| UI             | Tailwind CSS v4 · shadcn/ui (Radix) · dark-first theme |
| Database / API | [Convex](https://convex.dev) (reactive DB, file storage, actions) |
| Auth & teams   | [WorkOS AuthKit](https://workos.com) (orgs = shared workspaces) |
| Maps           | Google Maps JS + Places + **Street View Static API** |
| 3D staging     | three.js · react-three-fiber · drei |
| Generation     | [fal](https://fal.ai) — Nano Banana, GPT Image, FLUX, Imagen, Ideogram, Recraft |

## How it fits together

- **Shoot → Locations → Shots.** A shoot has a date/time and one or more real
  locations picked on a map. Each location holds the models present there and a
  list of **Shots** (the renamed "takes").
- A **Shot** = model + outfit (+ selected variations) + pose + style/camera/
  lighting presets. Selecting multiple outfit variations and hitting **Generate**
  fans out one image per variation in a single click.
- **Backdrops are grounded in reality**: saving a location pulls Google Street
  View frames, which are fed to image-conditioned models (Nano Banana, GPT Image)
  as references and woven into the prompt.
- **Optional 3D staging**: block out the scene (model, cameras, lights) in a
  top-down view, preview through a virtual camera, and apply the camera framing
  to the shots' prompts.
- **Flows** (`/flows`) are the store-facing path: a graph wiring products (and
  their variants) to people and places, saved as a template and re-run whenever
  the catalogue changes — on a new arrival, or across every variant of one
  product. Runs are counted and costed before they spend, and refuse to start
  past the flow's image cap. Products come from Shopify sync, so "new product →
  photographed" is one call, from the web app or from an agent over MCP.
- Everything is scoped to your WorkOS **organization**, so teammates share all
  shoots, models, outfits, locations and presets.

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Convex

```bash
npx convex dev    # first run: log in + create the deployment, then keep it running
```

This writes `CONVEX_DEPLOYMENT` and a deployment URL. Put the URL in `.env.local`
as `NEXT_PUBLIC_CONVEX_URL`. Then set the **server-side** secrets in the Convex
deployment (not `.env.local`):

```bash
npx convex env set WORKOS_CLIENT_ID    client_xxx        # validates auth JWTs
npx convex env set FAL_KEY             <your-fal-key>     # image generation
npx convex env set GOOGLE_MAPS_API_KEY <key>             # Street View capture
```

### 3. WorkOS

Create an app at [dashboard.workos.com](https://dashboard.workos.com), enable
AuthKit, and add the redirect URI `http://localhost:3000/callback`. Then fill in
`.env.local`:

```
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=<32+ char secret>   # openssl rand -base64 32
WORKOS_REDIRECT_URI=http://localhost:3000/callback
```

### 4. Google Maps (browser)

A key with **Maps JavaScript API** + **Places API** enabled (and the **Street
View Static API** for the Convex side). Add to `.env.local`:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...   # optional; defaults to Google's DEMO_MAP_ID
```

See `.env.example` for the full list.

### 5. Run

```bash
npx convex dev   # terminal 1 — backend + codegen
pnpm dev         # terminal 2 — Next.js
```

Open http://localhost:3000.

## Driving setto from agents (CLI & MCP)

The whole product surface is exposed to scripts and AI agents through three
front-ends that share one auth + call layer (`@setto/core`), so they always stay
in sync with the backend:

- **`@setto/cli`** — `setto <domain> <fn>` (JSON output). Run `setto login` once,
  then e.g. `setto shoots list` or `setto describe`.
- **`@setto/mcp`** — a **local (stdio)** MCP server for desktop agents (Claude
  Desktop, Claude Code, Cursor). It reuses the CLI's credentials, so run
  `setto login` first, then point your client at the built `dist/index.js`.
- **Remote MCP** — a **hosted** MCP server at `POST /api/mcp` in the web app, for
  **Claude.ai and ChatGPT online** connectors. This is the one to use if you want
  to connect from the browser apps rather than a desktop client.

### The MCP tool surface

Both MCP servers expose the same hand-written, product-shaped surface — not one
tool per backend function. The job is "a store catalogue that needs imagery", so
the tools are:

| Tool | What it's for |
| --- | --- |
| `list_products` / `get_product` | the catalogue, with variants, images, and how many photos each has. `{ shotStatus: "unshot" }` finds what still needs shooting |
| `list_models` / `list_locations` | the people and places a shot can use |
| `gallery` | finished images/videos, filterable by product, model, location, flow, favourites or rating |
| `generate_product_shot` | make photos of a product, optionally on a person and in a place. `{ estimateOnly: true }` prices it first |
| `shot_brief` | the prompt + reference images for a shot, **without generating** — free |
| `import_image` | file an image generated elsewhere into a product's gallery |
| `sync_shopify` | pull the store catalogue in; reports which products are newly imported |
| `list_flows` / `run_flow` | run a saved template, optionally against a different product or every variant |
| `list_image_models` | the models and their per-image prices |
| `describe` / `call` | escape hatch to the full ~175-function surface |
| `search` / `fetch` | required by ChatGPT Deep Research |

Generation defaults to the cheapest tier (`openai/gpt-image-2-low`) because an
agent asked to "shoot the new arrivals" will fan out further than you expect;
pass `modelKey` to choose deliberately.

**Skills** are exposed as MCP prompts — playbooks that encode the order of
operations, which is the part a model gets wrong when handed tools alone:
`shoot-new-products`, `variant-sweep`, `generate-with-your-own-images` (use the
client's own image generation and import the results), and `pick-the-keepers`.

**Using ChatGPT's own image generation**: `shot_brief` (or
`run_flow { mode: "brief" }`) returns the assembled prompt and reference image
URLs without spending anything. Generate from those yourself, then hand the
result back with `import_image` — it lands in the product's gallery tagged like
any other shot.

### Local (stdio) MCP

```bash
pnpm install
pnpm --filter @setto/cli build && node apps/cli/dist/index.js login   # one-time
pnpm --filter @setto/mcp build
```

Then register it in your client (e.g. `.mcp.json`):

```json
{
  "mcpServers": {
    "setto": { "command": "node", "args": ["<repo>/apps/mcp/dist/index.js"] }
  }
}
```

### Remote MCP (Claude.ai & ChatGPT online)

Claude.ai and ChatGPT connectors are **OAuth clients** that talk to a public
HTTPS endpoint, so this requires the web app to be **deployed** (not localhost).
The endpoint:

- speaks MCP's **Streamable HTTP** transport at `POST /api/mcp` (stateless);
- exposes the tool surface above **plus `search` + `fetch`** (the two tools
  ChatGPT Deep Research expects), and the skills as MCP prompts;
- authenticates each request with a **WorkOS access token** — the same JWT Convex
  validates — so org-scoping and permissions match the web app exactly;
- advertises its OAuth authorization server (your **WorkOS AuthKit** domain) via
  `GET /.well-known/oauth-protected-resource` (RFC 9728), and returns a
  `401` + `WWW-Authenticate` challenge when called without a valid token.

**Setup**

1. Deploy the web app over HTTPS (e.g. `https://app.example.com`).
2. Set `MCP_AUTHORIZATION_SERVER` to your WorkOS AuthKit domain (see
   `.env.example`) and make sure `WORKOS_CLIENT_ID` / `WORKOS_JWT_CLIENT_ID` are
   set so tokens can be validated.
3. In the **WorkOS dashboard**, enable **Dynamic Client Registration** for that
   AuthKit environment so connectors can self-register, and add your deployed
   origin as an allowed redirect/origin.

**Connect**

- **Claude.ai** → Settings → Connectors → *Add custom connector* → enter
  `https://app.example.com/api/mcp`. Claude discovers the OAuth metadata, signs
  you in through WorkOS, and the setto tools appear.
- **ChatGPT** → Settings → Connectors (Developer Mode) or the Deep Research
  connector picker → add the same URL. `search`/`fetch` power Deep Research; the
  product tools power Developer-Mode tool calls.

> Auth model: the MCP endpoint is an OAuth **resource server**; WorkOS AuthKit is
> the **authorization server**. No new user store — connectors authenticate the
> same WorkOS accounts/orgs your team already uses.

## Messaging agent (Telegram or iMessage, via eve)

One chat that manages the whole catalogue: message it like a person, and it
syncs Shopify, finds what hasn't been photographed, shoots it once you say yes,
and sends the photos back. It also opens the conversation itself once a day
with what it would shoot.

**Telegram is the default** — a bot from @BotFather is free, can start
conversations, and handles photos both ways. The Sendblue channel is the same
agent on iMessage, for blue bubbles; note that Sendblue's free sandbox is
*inbound-first on a shared number*, so the daily suggestion needs a paid line
there.

It's an [eve](https://eve.dev) agent living in `apps/web/agent/`, mounted on
this same deployment by `withEve` in `next.config.ts` — one dev server, one
deploy, no separate service.

```
apps/web/agent/
├── agent.ts                    Sonnet 5 via the AI Gateway; compaction at 70%
├── instructions.md             how it writes and when it's allowed to spend
├── channels/telegram.ts        the Telegram bot (free, the default)
├── channels/sendblue.ts        the same agent on iMessage (paid line)
├── tools/                      list_products, generate_product_shot, …
├── skills/                     shoot-a-product, daily-suggestions, review-and-pick
└── schedules/daily-suggestions.ts   the 08:30 nudge (a Vercel Cron Job)
```

**One conversation, forever.** The session's continuation token is the chat
itself, so every message resumes the same durable session — it remembers what
you liked last week. Compaction summarizes older turns at 70% of the
context window, so the thread never has to be reset.

**Skills** are loaded on demand rather than carried on every turn: the agent
pulls in `shoot-a-product` when it's actually shooting something.

### Setup

1. **Telegram bot** (free) — message [@BotFather](https://t.me/BotFather),
   `/newbot`, and copy the token. Message your new bot once, then read your chat
   id from
   `https://api.telegram.org/bot<TOKEN>/getUpdates` (`result[].message.chat.id`).
2. **Env vars** — see `.env.example` under "messaging agent".
   `TELEGRAM_ALLOWED_CHAT_IDS` is the allowlist and defaults to *nobody*; the bot
   ignores anyone not on it. A bot username is discoverable, so this matters.
3. **Shared secret** — the agent reaches Convex through `convex/agent.ts`, which
   authenticates a shared secret instead of a user session:
   ```bash
   openssl rand -hex 32                       # use the same value in both places
   npx convex env set AGENT_SHARED_SECRET "<value>" --prod
   vercel env add AGENT_SHARED_SECRET production
   ```
4. **Bind your phone to a workspace** — an unbound number gets nothing:
   ```bash
   npx convex run agent:bindPhone \
     '{"phone":"+61...","orgId":"<org>","userId":"<user>","label":"Ben"}' --prod
   ```
5. **Point Sendblue at the webhook** — in the Sendblue dashboard, set the
   `receive` webhook to `https://<your-domain>/eve/v1/sendblue/webhook`, with the
   secret you put in `SENDBLUE_WEBHOOK_SECRET`.

### What it can do

`list_products` (including "what's unshot?") · `list_cast` · `generate_product_shot`
· `show_gallery` · `mark_image` · `sync_shopify` · `list_flows`.

Generation costs money, so the agent is instructed to quote a batch and wait for
agreement; the tool also caps a single call at 4 images and defaults to the
cheap model tier. That's a guardrail, not a guarantee — treat the allowlist as
the real boundary.

## Notes

- The app gracefully degrades without keys: missing `NEXT_PUBLIC_CONVEX_URL`
  shows a setup screen; missing Maps key shows a placeholder; missing `FAL_KEY`
  records a clear error on the generation instead of crashing.
- Without a WorkOS organization selected, a user still gets a private workspace
  (`user:<id>`); members of the same org share everything.
- `convex/_generated` is committed so the app type-checks before the first
  `convex dev`; it's regenerated automatically once Convex runs.

## Project layout

```
app/                  Routes (landing, /dashboard, /shoots, /models, …)
  (app)/              Authenticated shell (sidebar layout)
components/           UI: editors, library tiles, shoot editor, map, 3D staging
  shoot/              Shoot editor (map, location panel, shot card)
  shoot/staging/      react-three-fiber scene + dialog
  map/                Google Maps provider, place search
convex/               Schema + queries/mutations/actions
  lib/prompt.ts       Prompt assembly (shared with the client preview)
  lib/falModels.ts    fal model registry + request shaping
  generate.ts         Node action that calls fal
  streetview.ts       Street View capture action
lib/                  Client helpers (types, formatting, nav)
```
