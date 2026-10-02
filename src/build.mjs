import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeHicpFile } from './build-hicp.mjs';
import { fetchImfRows, fetchIndexRows } from './fetch-imf.mjs';
import { buildSeries, SERIES, SERIES_START } from './series.mjs';
import { transform } from './transform.mjs';

const iso3to2 = JSON.parse(await readFile(new URL('./iso3to2.json', import.meta.url), 'utf8'));
const rows = await fetchImfRows();
const countries = transform(rows, iso3to2);

const unmapped = [...new Set(rows.map((r) => r.iso3))].filter((c) => !iso3to2[c]).sort();
if (unmapped.length > 0) console.warn(`Unmapped IMF codes (skipped): ${unmapped.join(' ')}`);

const codes = Object.keys(countries).sort();
if (codes.length < 100) throw new Error(`Only ${codes.length} countries; refusing to write cpi.json`);

const doc = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: { name: 'IMF', dataset: 'Consumer Price Index (CPI)', url: 'https://data.imf.org/' },
  countries: Object.fromEntries(codes.map((c) => [c, countries[c]])),
};

const out = fileURLToPath(new URL('../site/cpi.json', import.meta.url));
await mkdir(new URL('../site/', import.meta.url), { recursive: true });
await writeFile(out, JSON.stringify(doc, null, 2) + '\n');

const newest = codes.map((c) => countries[c].period).sort().at(-1);
console.log(`Wrote ${out}: ${codes.length} countries, newest period ${newest}`);
for (const c of ['TR', 'US', 'GB']) console.log(c, JSON.stringify(countries[c]));

// The category series, for automatic tracking. The all-items rows fetched above are reused.
// A failure here must not hold back cpi.json, which is already written: the previous
// cpi-series.json stays published and the run shows a warning.
try {
  const rowsByKey = { all: rows };
  for (const [key, code] of Object.entries(SERIES)) {
    if (key !== 'all') rowsByKey[key] = await fetchIndexRows(code, SERIES_START);
  }
  const series = buildSeries(rowsByKey, iso3to2);
  const seriesCodes = Object.keys(series.countries);
  if (seriesCodes.length < 100) throw new Error(`Only ${seriesCodes.length} countries; refusing to write cpi-series.json`);

  const seriesOut = fileURLToPath(new URL('../site/cpi-series.json', import.meta.url));
  // Compact on purpose: the app downloads this file.
  await writeFile(seriesOut, JSON.stringify({ version: 1, generatedAt: doc.generatedAt, source: doc.source, ...series }) + '\n');
  console.log(`Wrote ${seriesOut}: ${seriesCodes.length} countries, start ${series.start}`);
  for (const c of ['TR', 'US', 'GB']) console.log(c, Object.keys(series.countries[c] ?? {}).join(' '), (series.countries[c]?.all ?? []).length);
} catch (e) {
  console.warn(`::warning::cpi-series.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
}

// Eurostat's HICP series: the app's second data source. Independent of the IMF files above: a
// failure here leaves the previous hicp-series.json published and the run shows a warning.
try {
  await writeHicpFile(doc.generatedAt);
} catch (e) {
  console.warn(`::warning::hicp-series.json was not updated: ${e instanceof Error ? e.message : String(e)}`);
}
