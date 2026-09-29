import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchImfRows } from './fetch-imf.mjs';
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
