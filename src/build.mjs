import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeHicpFile } from './build-hicp.mjs';
import { writeWeightsFile } from './build-weights.mjs';
import { fetchOecdRows, OECD_SERIES } from './oecd.mjs';
import { buildSeries, SERIES_START } from './series.mjs';
import { transform } from './transform.mjs';

/** Fewer countries than this means the OECD's answer was cut short; the previous files stay published. */
const MIN_COUNTRIES = 8;

const generatedAt = new Date().toISOString();
const iso3to2 = JSON.parse(await readFile(new URL('./iso3to2.json', import.meta.url), 'utf8'));
await mkdir(new URL('../site/', import.meta.url), { recursive: true });

/** cpi.json and cpi-series.json, from the OECD. Throws on any failure before cpi.json is written. */
async function writeOecdFiles() {
  // The all-items index from SERIES_START: plenty for a 12-month rate. A longer request (from 2023)
  // answers 500 every time from GitHub's runners (checked 2026-10-07), while this one works.
  const rows = await fetchOecdRows('_T', SERIES_START);
  const countries = transform(rows, iso3to2);

  const unmapped = [...new Set(rows.map((r) => r.iso3))].filter((c) => !iso3to2[c]).sort();
  // Aggregates (G20, OECD, EA20...) have no ISO 2 code and are expected here.
  if (unmapped.length > 0) console.log(`Not countries, or unmapped (skipped): ${unmapped.join(' ')}`);

  const codes = Object.keys(countries).sort();
  if (codes.length < MIN_COUNTRIES) throw new Error(`Only ${codes.length} countries; refusing to write cpi.json`);

  const doc = {
    version: 1,
    generatedAt,
    source: { name: 'OECD', dataset: 'Consumer price indices (CPIs, HICPs), COICOP 1999', url: 'https://data-explorer.oecd.org/', licence: 'CC BY 4.0' },
    countries: Object.fromEntries(codes.map((c) => [c, countries[c]])),
  };
  const out = fileURLToPath(new URL('../site/cpi.json', import.meta.url));
  await writeFile(out, JSON.stringify(doc, null, 2) + '\n');
  const newest = codes.map((c) => countries[c].period).sort().at(-1);
  console.log(`Wrote ${out}: ${codes.length} countries, newest period ${newest}`);
  for (const c of ['US', 'GB', 'CA']) console.log(c, JSON.stringify(countries[c]));

  // The category series, for automatic tracking. The all-items rows fetched above are reused.
  // A failure here must not hold back cpi.json, which is already written.
  try {
    const rowsByKey = { all: rows };
    for (const [key, code] of Object.entries(OECD_SERIES)) {
      if (key !== 'all') rowsByKey[key] = await fetchOecdRows(code, SERIES_START);
    }
    const series = buildSeries(rowsByKey, iso3to2);
    const seriesCodes = Object.keys(series.countries);
    if (seriesCodes.length < MIN_COUNTRIES) throw new Error(`Only ${seriesCodes.length} countries; refusing to write cpi-series.json`);
    const seriesOut = fileURLToPath(new URL('../site/cpi-series.json', import.meta.url));
    // Compact on purpose: the app downloads this file.
    await writeFile(seriesOut, JSON.stringify({ version: 1, generatedAt, source: doc.source, ...series }) + '\n');
    console.log(`Wrote ${seriesOut}: ${seriesCodes.length} countries, start ${series.start}`);
    for (const c of ['US', 'GB', 'CA']) console.log(c, Object.keys(series.countries[c] ?? {}).join(' '), (series.countries[c]?.all ?? []).length);
  } catch (e) {
    console.warn(`::warning::cpi-series.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Each source on its own: one that fails (the OECD's API answers 500 now and then) leaves its
// previous files published, the run shows a warning, and the others still update and deploy.
try {
  await writeOecdFiles();
} catch (e) {
  console.warn(`::warning::cpi.json and cpi-series.json were not updated: ${e instanceof Error ? e.message : String(e)}`);
}

// Eurostat's HICP series: the source for its 36 countries, Türkiye among them.
try {
  await writeHicpFile(generatedAt);
} catch (e) {
  console.warn(`::warning::hicp-series.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
}

// Eurostat's HICP weights, for "why does my rate differ".
try {
  await writeWeightsFile(generatedAt);
} catch (e) {
  console.warn(`::warning::hicp-weights.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
}
