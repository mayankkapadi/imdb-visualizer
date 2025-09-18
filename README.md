# IMDb Ratings Visualizer

A single-page app to explore and visualize your personal IMDb ratings. Upload an exported CSV or point the app to a public CSV URL. The UI is minimal, fast, and uses a unified accent color with dark/light mode.

## Features

- CSV upload, drag-and-drop, and paste support
- Load from URL and remember it in localStorage
- Unified one-color theme with dark/light toggle
- Filters: title search, year range, minimum rating, type, genres
- Charts (Recharts):
  - Ratings over time
  - Your rating distribution
  - Your rating vs IMDb rating
  - Average rating by release year
  - Runtime vs rating
  - Average by day of week
  - Monthly rating activity (last 24 months)
- “Fascinating facts”:
  - Estimated total watch time
  - Longest rating streak and longest gap
  - Biggest disagreement with IMDb
  - Top director by your average (min 3 titles)
- Download filtered results as CSV
- Links to IMDb title pages when available

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Recharts
- Papa Parse

CI/CD: GitHub Actions → GitHub Pages

## Getting Started

Clone and install:

```bash
git clone https://github.com/mayankkapadi/imdb-visualizer.git
cd imdb-visualizer
npm install
npm run dev
```

Open `http://localhost:3000`.

### CSV Input

Export your ratings from IMDb and either:

1) Click “Upload CSV” or drop the file on the page, or  
2) Paste a public CSV URL in “Load from a URL” and click “Save & Fetch”.

Google Drive direct link format:

```
https://drive.google.com/uc?export=download&id=FILE_ID
```

Make sure the file is shared publicly.

### Expected Columns

The app is flexible with header names, but it looks for these fields:

- Title
- Your Rating
- IMDb Rating
- Runtime (mins)
- Year
- Genres
- Title Type
- Date Rated
- URL
- Directors
- Const

If some columns are missing, related features will be skipped gracefully.

## Development Notes

This project uses Next.js 15 static export via `output: 'export'` in `next.config.js`. You do not need the `next export` CLI.

Key files:

- `app/page.tsx` – Client component with all UI and charts
- `app/layout.tsx` – Global layout and fonts
- `next.config.js` – Static export and base path for GitHub Pages
- `postcss.config.mjs` and `tailwind.config` – Tailwind setup

Run dev:

```bash
npm run dev
```

Build:

```bash
npm run build
```

A static site is emitted to `out/`.

## Deploying to GitHub Pages

This repo is configured for GitHub Pages.

1) Ensure `next.config.js` matches the repo name:

```js
const isProd = process.env.NODE_ENV === 'production'
const repo = 'imdb-visualizer'

module.exports = {
  output: 'export',
  assetPrefix: isProd ? `/${repo}/` : '',
  basePath:   isProd ? `/${repo}`   : '',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
```

2) The workflow at `.github/workflows/deploy.yml` builds and publishes `out/` on push to the default branch.

Your site is available at:

```
https://mayankkapadi.github.io/imdb-visualizer/
```

## Configuration

- Accent color: set the `ACCENT` constant at the top of the component (e.g., `violet`, `emerald`, `rose`, `cyan`, `amber`).
- Theme preference persists to localStorage.
- The last CSV URL persists to localStorage.

## Privacy

All parsing and visualization happen in the browser. No data is uploaded to a server. If you use a public URL for your CSV, anyone with the link can access it—use at your discretion.

## Troubleshooting

- Missing CSS/JS on GitHub Pages: check `assetPrefix` and `basePath` in `next.config.js` match the repo name.
- Hydration warnings on localhost: browser extensions like Grammarly inject attributes. Test in a private window or add `suppressHydrationWarning` to `<html>`/`<body>` in `app/layout.tsx`.
- CSV fails to load from Google Drive: use the `uc?export=download&id=` format and ensure the file is public.
- TypeScript or ESLint errors during CI: the Next config is set to ignore them on build. For strict mode, remove those flags and fix the reported issues.

## Roadmap

- Per-director and per-actor dashboards
- Title detail modal with richer metadata
- Bookmarkable filter URLs
- Export chart images
- Optional Vercel deployment preset

## Acknowledgments

- IMDb for making personal ratings exportable
- Recharts for chart components
- Papa Parse for CSV parsing
- Next.js and Tailwind CSS
