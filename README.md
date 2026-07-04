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
- exposes the full setto tool surface **plus `search` + `fetch`** (the two tools
  ChatGPT Deep Research expects);
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
  typed per-function tools power Developer-Mode tool calls.

> Auth model: the MCP endpoint is an OAuth **resource server**; WorkOS AuthKit is
> the **authorization server**. No new user store — connectors authenticate the
> same WorkOS accounts/orgs your team already uses.

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
