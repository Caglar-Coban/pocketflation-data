# pocketflation-data

Public data pipeline and static site for the Pocketflation Android app. The repo contains only public statistics, the site files, the build script and the workflow. No app code.

## What it does

Once a month (and on demand) a GitHub Actions workflow downloads the IMF monthly consumer price index for all countries, computes the latest year-over-year rate per country, writes `site/cpi.json`, downloads the monthly index series by category, writes `site/cpi-series.json`, and deploys `site/` to GitHub Pages. The app downloads both files about once a day and bundles a snapshot of each for offline use.

Pages URL (once the repo is pushed as `Caglar-Coban/pocketflation-data` with Pages set to "GitHub Actions"):

- `https://caglar-coban.github.io/pocketflation-data/cpi.json`
- `https://caglar-coban.github.io/pocketflation-data/cpi-series.json`
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

## cpi-series.json

```json
{ "version": 1, "generatedAt": "...", "source": { "name": "IMF", "dataset": "Consumer Price Index (CPI)", "url": "https://data.imf.org/" },
  "start": "2024-01",
  "countries": { "DE": { "all": [100.1, 103.2, null], "food": [], "transport": [], "housing": [], "communication": [], "health": [], "personal": [] } } }
```

Seven monthly index series per country, for the app's automatic tracking: all items (`_T`) and the COICOP divisions CP01 (food), CP07 (transport), CP04 (housing and utilities), CP08 (communication), CP06 (health) and CP12 (miscellaneous). Index `i` of an array is the month `start + i`; a missing month is `null`; trailing nulls are trimmed; values are rounded to 2 decimals. A country needs at least 13 months of the all-items series. The query is the one below with the COICOP code in place of `_T`.

As of 2026-10-01: 175 countries have the all-items series, but only 96 of them carry the category series. The IMF returns rows with an empty `OBS_VALUE` for the national-CPI divisions of the rest (Türkiye, most of the EU, Canada, Japan, India, Brazil, Mexico and others), so those countries are published with `all` alone and the app follows the all-items index for every item there.

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

IMF terms are at https://www.imf.org/en/about/copyright-and-terms ("Copyright and Usage", effective October 11, 2024). The live page refuses automated requests (HTTP 403), so the text below was read on 2026-10-01 from the Internet Archive copy of 2026-06-25 (`web.archive.org/web/20260625061819/…`). Look at the live page once in a browser before release, in case it changed since.

What the section "The Use of IMF Data" says, and how this repo and the app meet it:

- "You may download, extract, copy, create derivative works, publish, distribute, and use Data obtained from IMF Sites", where Data includes "most statistical data available on www.IMF.org, www.data.IMF.org, or the iData Portal that explicitly identify the International Monetary Fund as the source". The CPI dataset is such data.
- Attribution: data "must appear accurately with attribution to the IMF as the source, e.g. 'Source: International Monetary Fund, Database Name, <<link to the dataset>>'". The site and the app's Data sources screen name the source with a link.
- "If the Data is materially transformed by the User, this must be stated explicitly along with the required source citation." The year-over-year rate in `cpi.json` and every estimate the app makes from `cpi-series.json` are calculated by Pocketflation from the IMF's index values; the site and the Data sources screen say so.
- "Users who make IMF Data available to other Users through any type of distribution or download environment agree to take reasonable efforts to communicate and promote compliance by their users with these terms." These JSON files are public, so the site links to the IMF terms.
- "If IMF Data is sold by Users as a standalone product, sellers must inform purchasers that the Data is available free of charge from the IMF." Not the case: the official figures are shown in the free version and never sold.
- The data is provided "as is", without warranty of any kind. Free reuse does not extend to confidential or unpublished data.
- The general terms forbid use "in a manner that is misleading or implies endorsement by or affiliation with the IMF", and the IMF name and seal are trademarks. The site and terms state that Pocketflation is not affiliated with the IMF; the seal is not used.

Open point, to be settled by e-mail before release:

- The same section ends with "For any potential commercial reuse of IMF Data, please email copyright@imf.org to request permission", although it opens with "Notwithstanding the general prohibition on the commercial use of IMF Content". An app with ads and in-app purchases is commercial, so permission is being asked rather than assumed (draft in the app repo's `docs/launch/launch-checklist.md`, step 1).
- The general terms also say "The IMF prohibits the bulk download of information by automated technology without explicit permission". This repo calls the IMF's public SDMX API (the interface the IMF provides for programs) once a month, with seven requests. The e-mail mentions it so the answer covers it.

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
