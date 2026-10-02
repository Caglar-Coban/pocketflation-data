import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildHicp, fetchHicpRows } from './eurostat.mjs';

/** Fewer countries than this means the answer was cut short; the previous file stays published. */
const MIN_COUNTRIES = 25;

/**
 * Writes site/hicp-series.json: Eurostat's HICP index series, in the shape of cpi-series.json.
 * The app offers it as a second data source. Throws on any failure, so nothing partial is written.
 */
export async function writeHicpFile(generatedAt = new Date().toISOString()) {
  const series = buildHicp(await fetchHicpRows());
  const codes = Object.keys(series.countries);
  if (codes.length < MIN_COUNTRIES) throw new Error(`Only ${codes.length} countries; refusing to write hicp-series.json`);
  const doc = {
    version: 1,
    generatedAt,
    source: {
      name: 'Eurostat',
      dataset: 'Harmonised Index of Consumer Prices (HICP), ECOICOP ver. 2',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr',
    },
    ...series,
  };
  const out = fileURLToPath(new URL('../site/hicp-series.json', import.meta.url));
  // Compact on purpose: the app downloads this file.
  await writeFile(out, JSON.stringify(doc) + '\n');
  console.log(`Wrote ${out}: ${codes.length} countries, start ${series.start}`);
  for (const c of ['TR', 'DE', 'GR']) {
    const entry = series.countries[c] ?? {};
    console.log(c, Object.keys(entry).filter((k) => k !== 'products').join(' '), (entry.all ?? []).length, `${Object.keys(entry.products ?? {}).length} products`);
  }
}

// `node src/build-hicp.mjs` writes this one file alone.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await writeHicpFile();
