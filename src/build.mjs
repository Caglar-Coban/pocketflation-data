import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeHicpFile } from './build-hicp.mjs';
import { writeWeightsFile } from './build-weights.mjs';
import { fetchOecdRows, OECD_SERIES } from './oecd.mjs';
import { buildSeries, SERIES_START } from './series.mjs';
import { transform } from './transform.mjs';

/** Fewer countries than this means the OECD's answer was cut short; the previous files stay published. */
const MIN_COUNTRIES = 8;

const iso3to2 = JSON.parse(await readFile(new URL('./iso3to2.json', import.meta.url), 'utf8'));
// The OECD's all-items index, three years back: the 12-month rate needs 13 months and more.
const rows = await fetchOecdRows('_T', `${new Date().getUTCFullYear() - 3}-01`);
const countries = transform(rows, iso3to2);

const unmapped = [...new Set(rows.map((r) => r.iso3))].filter((c) => !iso3to2[c]).sort();
// Aggregates (G20, OECD, EA20...) have no ISO 2 code and are expected here.
if (unmapped.length > 0) console.log(`Not countries, or unmapped (skipped): ${unmapped.join(' ')}`);

const codes = Object.keys(countries).sort();
// The OECD publishes about a dozen countries monthly; fewer means the answer was cut short.
if (codes.length < MIN_COUNTRIES) throw new Error(`Only ${codes.length} countries; refusing to write cpi.json`);

const doc = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: { name: 'OECD', dataset: 'Consumer price indices (CPIs, HICPs), COICOP 1999', url: 'https://data-explorer.oecd.org/', licence: 'CC BY 4.0' },
  countries: Object.fromEntries(codes.map((c) => [c, countries[c]])),
};

const out = fileURLToPath(new URL('../site/cpi.json', import.meta.url));
await mkdir(new URL('../site/', import.meta.url), { recursive: true });
await writeFile(out, JSON.stringify(doc, null, 2) + '\n');

const newest = codes.map((c) => countries[c].period).sort().at(-1);
console.log(`Wrote ${out}: ${codes.length} countries, newest period ${newest}`);
for (const c of ['US', 'GB', 'CA']) console.log(c, JSON.stringify(countries[c]));

// The category series, for automatic tracking. The all-items rows fetched above are reused.
// A failure here must not hold back cpi.json, which is already written: the previous
// cpi-series.json stays published and the run shows a warning.
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
  await writeFile(seriesOut, JSON.stringify({ version: 1, generatedAt: doc.generatedAt, source: doc.source, ...series }) + '\n');
  console.log(`Wrote ${seriesOut}: ${seriesCodes.length} countries, start ${series.start}`);
  for (const c of ['US', 'GB', 'CA']) console.log(c, Object.keys(series.countries[c] ?? {}).join(' '), (series.countries[c]?.all ?? []).length);
} catch (e) {
  console.warn(`::warning::cpi-series.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
}

// Eurostat's HICP series: the source for its 36 countries, Türkiye among them. Independent of the OECD files above: a
// failure here leaves the previous hicp-series.json published and the run shows a warning.
try {
  await writeHicpFile(doc.generatedAt);
} catch (e) {
  console.warn(`::warning::hicp-series.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
}

// Eurostat's HICP weights, for "why does my rate differ". Same rule: a failure keeps the previous file.
try {
  await writeWeightsFile(doc.generatedAt);
} catch (e) {
  console.warn(`::warning::hicp-weights.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
}
