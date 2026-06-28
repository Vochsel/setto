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
