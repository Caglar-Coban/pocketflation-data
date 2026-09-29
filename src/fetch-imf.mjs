// Fetches monthly all-items CPI index rows for all countries from the IMF SDMX 3.0 API.
// Verified query (see README):
//   GET https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/CPI/+/*.CPI._T.IX.M
//       ?c[TIME_PERIOD]=ge:YYYY-MM
//   Accept: application/vnd.sdmx.data+csv;version=2.0.0
// Dimension order of the key: COUNTRY.INDEX_TYPE.COICOP_1999.TYPE_OF_TRANSFORMATION.FREQUENCY

const BASE = 'https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/CPI/+/*.CPI._T.IX.M';
const ACCEPT = 'application/vnd.sdmx.data+csv;version=2.0.0';

/** '2026-M08' -> '2026-08'. Returns null for anything that is not a monthly period. */
export function normalizePeriod(p) {
  const m = /^(\d{4})-M(\d{2})$/.exec(p);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Minimal CSV line splitter (handles quoted fields). */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Parses the IMF SDMX-CSV 2.0 body into { iso3, period, value } rows. */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error('IMF CSV empty');
  const header = splitCsvLine(lines[0]);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`IMF CSV is missing column ${name}`);
    return i;
  };
  const [ci, pi, vi] = [col('COUNTRY'), col('TIME_PERIOD'), col('OBS_VALUE')];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const period = normalizePeriod(f[pi]);
    const value = Number(f[vi]);
    if (!period || f[vi] === '' || !Number.isFinite(value)) continue;
    rows.push({ iso3: f[ci], period, value });
  }
  return rows;
}

/** @param {number} [years] how many years of history to request (yoy needs 13+ months) */
export async function fetchImfRows(years = 3, now = new Date()) {
  const start = `${now.getUTCFullYear() - years}-01`;
  const url = `${BASE}?${encodeURIComponent('c[TIME_PERIOD]')}=ge:${start}`;
  const res = await fetch(url, { headers: { Accept: ACCEPT }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`IMF API responded ${res.status} for ${url}`);
  const rows = parseCsv(await res.text());
  if (rows.length === 0) throw new Error('IMF API returned no rows');
  return rows;
}
