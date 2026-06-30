# Landing-page Studio demo assets

The interactive studio preview on the landing page
(`components/landing/studio-demo.tsx`) renders the image/video files in this
folder. They are **generated**, not hand-placed:

```bash
FAL_KEY=xxxx node scripts/gen-demo-assets.mjs
```

Filenames are defined in `apps/web/lib/demo-data.ts` (and mirrored in the
generator). Until the script is run, the demo degrades gracefully to labelled
gradient tiles, so the page is never broken. Once generated, commit the files
here to ship them.

See `scripts/gen-demo-assets.mjs` for all options (model endpoints, video
duration, skipping video, forcing regeneration).
