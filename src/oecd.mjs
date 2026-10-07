// The OECD's consumer price indices, the official figures for countries Eurostat does not cover.
// Reuse: OECD data are licensed under CC BY 4.0 (OECD "Open by default" policy, July 2024):
// commercial use is allowed with attribution. Dataset "Consumer price indices (CPIs, HICPs), COICOP 1999".
//   GET https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/
//       .M.N.CPI.IX.<EXPENDITURE>.N.?startPeriod=YYYY-MM&dimensionAtObservation=AllDimensions
//   Accept: application/vnd.sdmx.data+csv; charset=utf-8
// Key: REF_AREA.FREQ.METHODOLOGY.MEASURE.UNIT_MEASURE.EXPENDITURE.ADJUSTMENT.TRANSFORMATION
// (monthly, national methodology, CPI, index, not adjusted). Aggregates such as G20 come back too;
// they have no ISO 2 code and are dropped downstream.

const FLOW = 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0';
const ACCEPT = 'application/vnd.sdmx.data+csv; charset=utf-8';
/** Further tries after a server error, waiting RETRY_MS, then twice that, and so on. */
const RETRIES = 3;
const RETRY_MS = 10_000;

/** App series key -> OECD expenditure code. The OECD publishes only these two groups for most countries. */
export const OECD_SERIES = { all: '_T', food: 'CP01' };

export function oecdUrl(expenditure, start) {
  return `${FLOW}/.M.N.CPI.IX.${expenditure}.N.?startPeriod=${start}&dimensionAtObservation=AllDimensions`;
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

/** Parses the OECD SDMX-CSV body into { iso3, period, value } rows, monthly periods only. */
export function parseOecdCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error('OECD CSV empty');
  const header = splitCsvLine(lines[0]);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`OECD CSV is missing column ${name}`);
    return i;
  };
  const [ai, pi, vi] = [col('REF_AREA'), col('TIME_PERIOD'), col('OBS_VALUE')];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const value = Number(f[vi]);
    if (!/^\d{4}-\d{2}$/.test(f[pi]) || f[vi] === '' || !Number.isFinite(value)) continue;
    rows.push({ iso3: f[ai], period: f[pi], value });
  }
  return rows;
}

/** Monthly index rows of one expenditure group (`_T` is all items) for every country, from `start` (`YYYY-MM`) on. */
export async function fetchOecdRows(expenditure, start, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const url = oecdUrl(expenditure, start);
  // The OECD's API answers 500 or 429 now and then; a later try usually works.
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { headers: { Accept: ACCEPT, 'User-Agent': 'pocketflation-data' }, signal: AbortSignal.timeout(120_000) });
    if (res.ok || attempt === RETRIES || (res.status < 500 && res.status !== 429)) break;
    await wait(RETRY_MS * (attempt + 1));
  }
  if (!res.ok) throw new Error(`OECD API responded ${res.status} for ${url}`);
  const rows = parseOecdCsv(await res.text());
  if (rows.length === 0) throw new Error(`OECD API returned no rows for ${expenditure}`);
  return rows;
}
