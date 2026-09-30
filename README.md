# pocketflation-data

Public data pipeline and static site for the Pocketflation Android app. The repo contains only public statistics, the site files, the build script and the workflow. No app code.

## What it does

Once a month (and on demand) a GitHub Actions workflow downloads the IMF monthly consumer price index for all countries, computes the latest year-over-year rate per country, writes `site/cpi.json` and deploys `site/` to GitHub Pages. The app downloads `cpi.json` about once a day and bundles a snapshot for offline use.

Pages URL (once the repo is pushed as `Caglar-Coban/pocketflation-data` with Pages set to "GitHub Actions"):

- `https://caglar-coban.github.io/pocketflation-data/cpi.json`
- `https://caglar-coban.github.io/pocketflation-data/privacy.html`
- `https://caglar-coban.github.io/pocketflation-data/terms.html`

## Run it

Node 24, no dependencies.

```bash
node --test          # unit tests (npm test)
node src/build.mjs   # fetch from IMF and write site/cpi.json (npm run build)
```

## cpi.json

```json
{ "version": 1, "generatedAt": "...", "source": { "name": "IMF", "dataset": "Consumer Price Index (CPI)", "url": "https://data.imf.org/" },
  "countries": { "TR": { "period": "2026-08", "yoy": 0.3151 } } }
```

`yoy` is a fraction rounded to 4 decimals. For each country the latest period `t` that also has `t-12` is used. Countries whose latest usable period is more than 18 months older than the newest period in the dataset are dropped, as are IMF codes that are not ISO 3166 countries (regional aggregates). ISO3 codes from the IMF are mapped to ISO2 by `src/iso3to2.json` (includes the IMF-specific codes `KOS` to `XK` for Kosovo and `WBG` to `PS` for West Bank and Gaza, plus `XKX` to `XK`). `build.mjs` logs any IMF code that is not in the map, so a code change shows up in the Actions log.

## IMF query (verified with curl on 2026-09-29)

```
GET https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/CPI/+/*.CPI._T.IX.M?c[TIME_PERIOD]=ge:2023-01
Accept: application/vnd.sdmx.data+csv;version=2.0.0
```

- Dataflow `IMF.STA:CPI`, latest version (`+`). Key dimensions: `COUNTRY.INDEX_TYPE.COICOP_1999.TYPE_OF_TRANSFORMATION.FREQUENCY`, so `*.CPI._T.IX.M` is all countries, CPI, all items, index, monthly.
- Correction to the plan: `startPeriod=` is silently ignored by the SDMX 3.0 endpoint (it returned the full 1900-onward history, about 190k rows). The working time filter is `c[TIME_PERIOD]=ge:YYYY-MM` (brackets URL-encoded by the script). With it, about 7.3k rows are returned.
- Periods come as `2026-M08`; the script converts them to `2026-08`. One row per country and month, no duplicates.
- As of 2026-09-29: 191 country/aggregate codes, newest period 2026-M08.

## Fonts

The pages self-host Barlow and Barlow Condensed (latin and latin-ext woff2 from Google Fonts, SIL Open Font License 1.1, text in `site/fonts/OFL.txt`), so visitors do not contact Google. System fonts are the fallback.

## Data source and IMF terms

Source: International Monetary Fund, Consumer Price Index (CPI) dataset, https://data.imf.org/. The site and the app name this source with a link.

IMF terms are at https://www.imf.org/en/about/copyright-and-terms (the old `external/terms.htm` redirects there). The IMF site blocked automated fetches (HTTP 403), so this summary was taken from IMF's published terms as surfaced by search, not read on the page directly. Re-read the page before release.

What applies:

- IMF data may be downloaded, extracted and copied, with attribution to the IMF as the source, for example "Source: International Monetary Fund, Consumer Price Index (CPI) dataset, https://data.imf.org/".
- The data is provided "as is", without warranty of any kind.
- Free access and reuse of IMF data does not extend to confidential or unpublished data.
- Content not attributed to the IMF belongs to third parties who must be asked directly.
- The IMF page says commercial reuse of some IMF material needs permission (copyright@imf.org). Pocketflation has ads and in-app purchases, so confirm on the live terms page that reuse of the CPI dataset in an app is covered, or ask the IMF, before release.
- Do not imply IMF endorsement. The site and terms state that Pocketflation is not affiliated with the IMF.

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
