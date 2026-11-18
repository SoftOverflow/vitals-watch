# vitals-watch

Check Core Web Vitals (LCP, INP, CLS) against budgets — from your terminal or CI. Uses the PageSpeed Insights API: real-user CrUX field data when available, Lighthouse lab data as fallback.

```bash
PSI_API_KEY=xxx node index.mjs softoverflow.com
```

```
  https://softoverflow.com  (field data, mobile)
  ✓ LCP            1240ms  (budget 2500ms)
  ✓ INP             140ms  (budget 200ms)
  ✓ CLS             0.02  (budget 0.1)

  All budgets passed
```

## Setup

1. Get a free API key (25,000 queries/day): [Google Cloud Console](https://developers.google.com/speed/docs/insights/v5/get-started) → enable PageSpeed Insights API → create key.
2. Export it: `export PSI_API_KEY=xxx` (or a CI secret).

Zero dependencies. Node 18+.

## Usage

```bash
# Single page, Google "good" budgets (LCP 2500ms / INP 200ms / CLS 0.1)
vitals-watch example.com

# Lab metrics instead of field data
vitals-watch example.com --lab

# Desktop strategy
vitals-watch example.com --strategy desktop

# Local Lighthouse — no API key, no quota (needs `npm i` once)
vitals-watch example.com --local

# JSON output
vitals-watch example.com --json
```

## CI budgets — fail the pipeline on regression

`vitals-watch.json`:

```json
{
  "budgets": { "lcp": 2500, "inp": 200, "cls": 0.1 },
  "pages": [
    { "url": "https://example.com" },
    { "url": "https://example.com/pricing", "budgets": { "lcp": 2000 } }
  ]
}
```

```bash
vitals-watch --config vitals-watch.json   # exit 1 if any page regresses
```

GitHub Action example:

```yaml
- run: node tools/vitals-watch/index.mjs --config vitals-watch.json
  env:
    PSI_API_KEY: ${{ secrets.PSI_API_KEY }}
```

## Notes

- **Field vs lab**: field = real users from the Chrome UX Report (needs enough traffic to exist); lab = simulated Lighthouse run. When field data is missing, vitals-watch falls back to lab automatically and labels `TBT→INP` since INP can't be measured without interaction.
- **`--local`** runs a real Lighthouse audit on your machine instead of calling PSI — handy for dev, for sites behind auth, or when the API quota is exhausted. `lighthouse` and `chrome-launcher` are devDependencies: `npm i` in the tool directory, plus a Chrome/Chromium binary (`CHROME_PATH` env var if it's not auto-detected).
- Budgets default to Google's "good" thresholds. Tighten per page via config.

Made by [SoftOverflow](https://www.softoverflow.com) — performance audits are part of the job.
