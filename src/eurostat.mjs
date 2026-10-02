// Fetches monthly HICP index series from Eurostat's dissemination API (no key needed).
// Dataset prc_hicp_minr: HICP, ECOICOP version 2, monthly, unit I25 (2025 = 100).
// Verified query (see README):
//   GET https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr
//       ?format=JSON&unit=I25&sinceTimePeriod=YYYY-MM&coicop18=TOTAL&coicop18=CP01...&geo=TR&geo=DE...
// The answer is JSON-stat: `id` gives the order of the dimensions, `size` their lengths, and
// `value` maps a flat (row-major) index to a number; a missing cell has no entry.

import { buildSeries, SERIES_START } from './series.mjs';

/** The same floor as `buildSeries`: fewer months of the all-items index cannot carry a 12-month rate. */
const MIN_ALL_MONTHS = 13;

const ENDPOINT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr';

/** App series key -> ECOICOP version 2 code. Not the IMF's COICOP 1999: personal care is CP13 here. */
export const HICP_SERIES = { all: 'TOTAL', food: 'CP01', transport: 'CP07', housing: 'CP04', communication: 'CP08', health: 'CP06', personal: 'CP13' };

/**
 * The countries asked for, by Eurostat's own code (Greece is EL). Eurostat's reuse policy allows
 * commercial reuse of its data except data of countries that are not EU members, EFTA members or
 * official EU candidates: so the 27 members, Iceland, Norway, Switzerland, and the candidates the
 * dataset carries. The United States, the United Kingdom and Kosovo are in the dataset and are
 * deliberately not here.
 */
export const HICP_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'IS', 'NO', 'CH',
  'AL', 'GE', 'ME', 'MK', 'RS', 'TR',
];

/** Eurostat's country code -> ISO 3166 alpha-2, where they differ. */
const GEO_TO_ISO2 = { EL: 'GR' };

export function hicpUrl(start = SERIES_START) {
  const params = [
    'format=JSON',
    'unit=I25',
    `sinceTimePeriod=${start}`,
    ...Object.values(HICP_SERIES).map((code) => `coicop18=${code}`),
    ...HICP_COUNTRIES.map((geo) => `geo=${geo}`),
  ];
  return `${ENDPOINT}?${params.join('&')}`;
}

/**
 * Turns a JSON-stat answer into rows, whatever order its dimensions come in.
 * @returns {Array<{geo: string, code: string, period: string, value: number}>}
 */
export function parseJsonStat(json) {
  const bad = () => new Error('Eurostat answer is not the expected JSON-stat');
  if (!json || !Array.isArray(json.id) || !Array.isArray(json.size) || !json.dimension || !json.value) throw bad();
  const at = { geo: json.id.indexOf('geo'), code: json.id.indexOf('coicop18'), period: json.id.indexOf('time') };
  if (at.geo < 0 || at.code < 0 || at.period < 0 || json.id.length !== json.size.length) throw bad();

  // Per dimension: the category code at each position.
  const codes = json.id.map((dim, d) => {
    const index = json.dimension[dim]?.category?.index;
    if (!index) throw bad();
    const list = [];
    for (const [code, i] of Object.entries(index)) list[i] = code;
    if (list.length !== json.size[d]) throw bad();
    return list;
  });

  const rows = [];
  for (const [key, value] of Object.entries(json.value)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    // Unflatten the row-major index, last dimension fastest.
    let rest = Number(key);
    const pos = new Array(json.id.length);
    for (let d = json.id.length - 1; d >= 0; d--) {
      pos[d] = rest % json.size[d];
      rest = Math.floor(rest / json.size[d]);
    }
    rows.push({ geo: codes[at.geo][pos[at.geo]], code: codes[at.code][pos[at.code]], period: codes[at.period][pos[at.period]], value });
  }
  return rows;
}

/**
 * Month-aligned series per country, in the shape of cpi-series.json: the same rules as the IMF
 * series (13 months of the all-items index, a country that went quiet is dropped).
 */
export function buildHicp(rows, start = SERIES_START) {
  const keyOf = Object.fromEntries(Object.entries(HICP_SERIES).map(([key, code]) => [code, key]));
  const rowsByKey = {};
  for (const { geo, code, period, value } of rows) {
    const key = keyOf[code];
    if (!key) continue;
    (rowsByKey[key] ??= []).push({ iso3: geo, period, value });
  }
  const toIso2 = Object.fromEntries(HICP_COUNTRIES.map((geo) => [geo, GEO_TO_ISO2[geo] ?? geo]));
  const built = buildSeries(rowsByKey, toIso2, start);

  // Eurostat publishes a flash estimate of the total weeks before the divisions. A month that only
  // the all-items index has would be priced by part of an automatic basket (the items that follow
  // `all`), so the total is held back to the newest month a category index reaches.
  for (const [iso2, entry] of Object.entries(built.countries)) {
    const reach = Math.max(0, ...Object.entries(entry).filter(([key]) => key !== 'all').map(([, values]) => values.length));
    if (reach === 0 || entry.all.length <= reach) continue;
    const all = entry.all.slice(0, reach);
    while (all.length > 0 && all[all.length - 1] === null) all.pop();
    if (all.filter((v) => v !== null).length < MIN_ALL_MONTHS) delete built.countries[iso2];
    else entry.all = all;
  }
  return built;
}

/** Fetches every series of every allowed country in one request. Throws on any failure. */
export async function fetchHicpRows(start = SERIES_START) {
  const res = await fetch(hicpUrl(start), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Eurostat answered ${res.status} ${res.statusText}`);
  return parseJsonStat(await res.json());
}
