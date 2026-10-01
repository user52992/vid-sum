# VidSum

A local video duration calculator built with Next.js, React, TypeScript and Tailwind CSS. Videos, filenames and durations never leave the browser. No accounts, database or upload API.

## Development

```sh
pnpm install
pnpm dev
```

`/` redirects to `/en` by default. `/en` is English and `/zh` is Simplified Chinese. Use the language switch in the top-right corner to change routes. Both pages are statically generated, including their localized text and metadata.

## SEO

The public origin defaults to `https://vid-sum.vercel.app`. Each language has its own title, description, canonical URL, Open Graph / Twitter metadata and WebApplication structured data. Both pages publish reciprocal `en`, `zh` and `x-default` language links. `/sitemap.xml` lists the two language routes; `/robots.txt` references that sitemap.

For a custom domain, copy `.env.example` to `.env.local`, change `SITE_URL` to the new public origin, then rebuild. The origin must include `https://` (or `http://` for local development) and must not contain a path, query or fragment.

## Checks

```sh
pnpm lint:check
pnpm build
pnpm exec tsc --noEmit
node --test tests/*.test.mjs
```

If the execution environment prevents Turbopack from binding its internal port, use `pnpm build --webpack`. Run the build before tests: SEO output tests inspect the generated HTML, sitemap and route manifests.

## Video formats

The picker and drag-and-drop area accept common video extensions. MOV, AVI, FLV and RMVB/RM can read duration from container metadata without decoding video. Other formats use the browser's native video metadata support. Missing or invalid duration information is shown as a file error; successful files are still included in the total.

Reads are limited to four concurrent files. Container parsing uses bounded metadata slices, skips encoded video data and supports cancellation. Native reads use `preload="metadata"`, never play the video, and always release object URLs. Durations are summed before rounding once to the nearest second; hours continue above 24.
