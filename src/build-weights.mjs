import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildWeights, fetchWeightRows } from './weights.mjs';

/** Fewer countries than this means the answer was cut short; the previous file stays published. */
const MIN_COUNTRIES = 25;

/**
 * Writes site/hicp-weights.json: what an average household spends on each of the app's categories,
 * in parts of a thousand, per country. Weights change once a year; the app ships a copy.
 */
export async function writeWeightsFile(generatedAt = new Date().toISOString()) {
  const weights = buildWeights(await fetchWeightRows());
  const codes = Object.keys(weights.countries);
  if (codes.length < MIN_COUNTRIES) throw new Error(`Only ${codes.length} countries; refusing to write hicp-weights.json`);
  const doc = {
    version: 1,
    generatedAt,
    source: {
      name: 'Eurostat',
      dataset: 'HICP item weights, ECOICOP ver. 2 (prc_hicp_iw), grouped into Pocketflation categories',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_iw',
    },
    ...weights,
  };
  const out = fileURLToPath(new URL('../site/hicp-weights.json', import.meta.url));
  await writeFile(out, JSON.stringify(doc) + '\n');
  console.log(`Wrote ${out}: ${codes.length} countries, year ${weights.year}`);
  console.log('TR', JSON.stringify(weights.countries.TR));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await writeWeightsFile();
