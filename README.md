# pocketflation-data

Public data pipeline and static site for the Pocketflation Android app. The repo contains only public statistics, the site files, the build script and the workflow. No app code.

## What it does

Once a month (and on demand) a GitHub Actions workflow downloads the OECD's monthly consumer price index for the countries it publishes, computes the latest year-over-year rate per country, writes `site/cpi.json`, downloads the monthly index series by category, writes `site/cpi-series.json`, downloads Eurostat's HICP index series, writes `site/hicp-series.json`, and deploys `site/` to GitHub Pages. The app downloads the files it needs about once a day and bundles a snapshot of each for offline use.

Pages URL (once the repo is pushed as `Caglar-Coban/pocketflation-data` with Pages set to "GitHub Actions"):

- `https://caglar-coban.github.io/pocketflation-data/cpi.json`
- `https://caglar-coban.github.io/pocketflation-data/cpi-series.json`
- `https://caglar-coban.github.io/pocketflation-data/privacy.html`
- `https://caglar-coban.github.io/pocketflation-data/terms.html`

## Run it

Node 24, no dependencies.

```bash
node --test          # unit tests (npm test)
node src/build.mjs   # fetch from the OECD and Eurostat and write site/*.json (npm run build)
```

## cpi.json

```json
{ "version": 1, "generatedAt": "...", "source": { "name": "OECD", "dataset": "Consumer price indices (CPIs, HICPs), COICOP 1999", "url": "https://data-explorer.oecd.org/", "licence": "CC BY 4.0" },
  "countries": { "US": { "period": "2026-08", "yoy": 0.034 } } }
```

`yoy` is a fraction rounded to 4 decimals. For each country the latest period `t` that also has `t-12` is used. Countries whose latest usable period is more than 18 months older than the newest period in the dataset are dropped, as are codes that are not ISO 3166 countries (aggregates such as `G20`, `OECD`, `EA20`). ISO3 codes are mapped to ISO2 by `src/iso3to2.json`. `build.mjs` logs every code that is not in the map, so a new one shows up in the Actions log.

## cpi-series.json

```json
{ "version": 1, "generatedAt": "...", "source": { "name": "OECD", ... },
  "start": "2024-01",
  "countries": { "US": { "all": [100.1, 103.2, null], "food": [] } } }
```

Monthly index series per country, for the app's automatic tracking: all items (`_T`) and food (`CP01`), the two groups the OECD publishes for most of its countries. Index `i` of an array is the month `start + i`; a missing month is `null`; trailing nulls are trimmed; values are rounded to 2 decimals. A country needs at least 13 months of the all-items series. The app follows the all-items index for items of other categories there.

As of 2026-10-07: 40 countries (the OECD members with monthly data, Brazil, China, Colombia, India, Indonesia, Saudi Arabia among the partners). Countries missing from the OECD's monthly data (Japan, Mexico and New Zealand among them) have no official figure in the app.

## hicp-series.json

The app's second data source: Eurostat's Harmonised Index of Consumer Prices, for the 36 countries Eurostat lets us reuse commercially. Same shape as `cpi-series.json`, and every country carries all seven series.

```json
{ "version": 1, "generatedAt": "...", "source": { "name": "Eurostat", "dataset": "Harmonised Index of Consumer Prices (HICP), ECOICOP ver. 2", "url": "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr" },
  "start": "2024-01",
  "countries": { "TR": { "all": [], "food": [], "transport": [], "housing": [], "communication": [], "health": [], "personal": [] } } }
```

- Query (verified on 2026-10-02, no key needed): `GET https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?format=JSON&unit=I25&sinceTimePeriod=2024-01&coicop18=TOTAL&coicop18=CP01&…&geo=TR&geo=DE&…`. The answer is JSON-stat; `src/eurostat.mjs` reads it whatever order the dimensions come in.
- Unit `I25` (2025 = 100). The older dataset `prc_hicp_midx` (2015 = 100) ends in 2025-12 and is not used.
- The classification is ECOICOP version 2, not COICOP 1999: all items is `TOTAL`, and personal care is `CP13` (`CP12` is insurance and finance there). The mapping is `HICP_SERIES`.
- Eurostat codes Greece `EL`; the file uses `GR`.
- The app uses this file for a country when the user picks it in Settings, and by default where it has the category series and the OECD file does not (Türkiye, the EU). The two sources are never mixed inside one country: the base years differ, and a series stitched from both would jump.
- The 12-month rate shown for this source is calculated in the app from the `all` series.
- If the request fails, or fewer than 25 countries come back, the previous file stays published and the run shows a warning. `node src/build-hicp.mjs` writes this file alone.

### Eurostat reuse terms

Eurostat's reuse policy (https://ec.europa.eu/eurostat/help/copyright-notice, read on 2026-10-02): reuse is allowed, commercially too, under CC BY 4.0, provided the source is acknowledged and changes are indicated. The exception that matters here: for commercial reuse, data of countries that are not EU members, EFTA members or official EU candidate countries must be left out. So `HICP_COUNTRIES` lists the 27 members, Iceland, Norway, Switzerland, and the candidates the dataset carries (Albania, Georgia, Montenegro, North Macedonia, Serbia, Türkiye). The United States, the United Kingdom and Kosovo are in the dataset and are not requested; a test keeps it so. The site and the app's Data sources screen name Eurostat with a link and say that the rates and estimates are calculated by Pocketflation.

## OECD query (verified with curl on 2026-10-07)

```
GET https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/.M.N.CPI.IX._T+CP01.N.?startPeriod=2024-01&dimensionAtObservation=AllDimensions
Accept: application/vnd.sdmx.data+csv; charset=utf-8
```

- Key dimensions: `REF_AREA.FREQ.METHODOLOGY.MEASURE.UNIT_MEASURE.EXPENDITURE.ADJUSTMENT.TRANSFORMATION`: every area, monthly, national methodology, CPI, index, all items (`_T`) and food (`CP01`) in one answer, not adjusted; the `EXPENDITURE` column tells them apart.
- Periods come as `2026-08`. Values are indexes, 2015 = 100.
- Ask from 2024-01, not earlier: from GitHub's runners a request from 2023-01, and a food-only request, answered 500 every time (checked 2026-10-07 with curl and Node), while the one above worked. The same request from a home connection worked.
- The API answers 500 or 429 now and then; `src/oecd.mjs` tries up to three more times, 10, 20 and 30 seconds apart. If it still fails, the previous files stay published and the run shows a warning.

## Fonts

The pages self-host Barlow and Barlow Condensed (latin and latin-ext woff2 from Google Fonts, SIL Open Font License 1.1, text in `site/fonts/OFL.txt`), so visitors do not contact Google. System fonts are the fallback.

## Data sources and their terms

- **OECD** (`cpi.json`, `cpi-series.json`): "Consumer price indices (CPIs, HICPs), COICOP 1999", https://data-explorer.oecd.org/. Since July 2024 the OECD publishes its data under CC BY 4.0 ("Open by default" policy): reuse for any purpose, commercial too, with attribution. The site and the app's Data sources screen name the OECD with a link and the licence, and say that the rates and estimates are calculated by Pocketflation and are not OECD figures.
- **Eurostat** (`hicp-series.json`, `hicp-weights.json`): see "Eurostat reuse terms" above.

### Why not the IMF (decided 2026-10-07)

Until 2026-10-07 `cpi.json` and `cpi-series.json` came from the IMF's CPI dataset. The IMF's terms allow reuse with attribution, but end with "For any potential commercial reuse of IMF Data, please email copyright@imf.org to request permission". The e-mail was sent; the answer pointed to the Copyright Clearance Center (www.copyright.com), i.e. a licence, not a permission. An app with ads and in-app purchases is commercial, so the IMF source was dropped and replaced by the OECD, whose licence needs no permission. The IMF fetcher is in the git history (`src/fetch-imf.mjs`) if a licence is ever obtained. Files published before that date carried IMF data under the attribution terms.

## app-ads.txt

`site/app-ads.txt` authorizes Google AdMob to sell the app's rewarded ad inventory. It ships with a **placeholder** publisher ID (`pub-0000000000000000`).

1. In AdMob, open **Apps > View all apps > app-ads.txt > How to set up app-ads.txt** and copy the line. It looks like `google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0`.
2. Replace the placeholder line in `site/app-ads.txt` with it, commit and push. The workflow deploys it with the rest of `site/` (run it by hand from **Actions > Update CPI data and deploy site > Run workflow** if you don't want to wait for the monthly run).
3. **AdMob only looks at the root of the developer website's host.** The Play listing's developer website is `https://caglar-coban.github.io/pocketflation-data/`, so the crawler requests `https://caglar-coban.github.io/app-ads.txt`, not the copy under `/pocketflation-data/`. Publish the same file at the root with a GitHub user site:
   ```bash
   cd ..
   mkdir caglar-coban.github.io && cd caglar-coban.github.io
   git init -b main
   cp ../pocketflation-data/site/app-ads.txt .
   git add app-ads.txt && git commit -m "Add app-ads.txt"
   gh repo create caglar-coban.github.io --public --source=. --push
   ```
   Then in that repo, **Settings > Pages > Build and deployment > Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**. After a minute, `https://caglar-coban.github.io/app-ads.txt` must show the line. The project site keeps working at `/pocketflation-data/`.
4. AdMob checks the file after the app is live on Play and linked in AdMob (**Apps > your app > App settings > App store details**). It can take up to 24 hours; the status shows under **Apps > View all apps > app-ads.txt**.
