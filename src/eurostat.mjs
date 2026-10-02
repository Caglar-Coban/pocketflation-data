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

/** How many months the total may run ahead of the divisions and still be taken for a flash estimate. The app drops a category index more than 2 months behind. */
const MAX_FLASH_LEAD = 2;

const ENDPOINT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr';

/** App series key -> ECOICOP version 2 code. Not the IMF's COICOP 1999: personal care is CP13 here. */
export const HICP_SERIES = { all: 'TOTAL', food: 'CP01', transport: 'CP07', housing: 'CP04', communication: 'CP08', health: 'CP06', personal: 'CP13' };

/**
 * Finer indexes, published per country under `products` and keyed by their ECOICOP code. The app
 * follows one of these for an automatically tracked item when it knows the product (milk follows
 * the milk index, not all of food), and the five division codes at the end for the categories the
 * seven series above do not cover. Only codes the app's catalogue refers to are listed: every
 * code adds about 8 KB to the file.
 */
export const HICP_PRODUCTS = [
  // Food and drink
  'CP01111', 'CP01112', 'CP01113', 'CP01114', 'CP01115', 'CP01122', 'CP01123', 'CP01125', 'CP01131', 'CP01133',
  'CP01141', 'CP01145', 'CP01146', 'CP01147', 'CP01148', 'CP01151', 'CP01152', 'CP01153',
  'CP01161', 'CP01162', 'CP01163', 'CP01164', 'CP01165', 'CP01167', 'CP01168',
  'CP01171', 'CP01172', 'CP01173', 'CP01174', 'CP01175', 'CP01176', 'CP01179',
  'CP01181', 'CP01183', 'CP01185', 'CP01186', 'CP01189', 'CP01191', 'CP01192', 'CP01193', 'CP01194',
  'CP01210', 'CP01220', 'CP01230', 'CP01250', 'CP01260', 'CP02110', 'CP02121', 'CP02130', 'CP02301',
  // Clothing, housing, household
  'CP0312', 'CP0321', 'CP04110', 'CP04411', 'CP04441', 'CP04510', 'CP04521', 'CP04522', 'CP05611', 'CP05619',
  // Health, transport, communication
  'CP06111', 'CP06131', 'CP06229', 'CP06231',
  'CP07221', 'CP07222', 'CP07223', 'CP07230', 'CP07241', 'CP07242', 'CP07311', 'CP07321', 'CP07322', 'CP07331', 'CP07340',
  'CP08120', 'CP08131', 'CP08320', 'CP08330', 'CP08392',
  // Leisure, eating out, insurance, personal care
  'CP09211', 'CP09212', 'CP09221', 'CP09322', 'CP09450', 'CP09462', 'CP09610', 'CP09690', 'CP09719', 'CP0972', 'CP09740', 'CP09800',
  'CP11111', 'CP11112', 'CP11201', 'CP12120', 'CP12130', 'CP12141', 'CP13120', 'CP13131', 'CP13291', 'CP13301',
  // Division fallbacks: clothing, household, leisure, education, eating out
  'CP03', 'CP05', 'CP09', 'CP10', 'CP111',
];

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
    ...HICP_PRODUCTS.map((code) => `coicop18=${code}`),
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
    // Only a short lead is a flash figure. Category indexes further behind have stopped; the app ignores those and follows `all`.
    if (reach === 0 || entry.all.length <= reach || entry.all.length - reach > MAX_FLASH_LEAD) continue;
    const all = entry.all.slice(0, reach);
    while (all.length > 0 && all[all.length - 1] === null) all.pop();
    if (all.filter((v) => v !== null).length < MIN_ALL_MONTHS) delete built.countries[iso2];
    else entry.all = all;
  }

  // Product series, for the countries that made it: aligned to the same start month, gaps as null.
  const base = monthIndex(start);
  const wanted = new Set(HICP_PRODUCTS);
  const sparse = {};
  for (const { geo, code, period, value } of rows) {
    const iso2 = toIso2[geo];
    if (!wanted.has(code) || !iso2 || !built.countries[iso2] || !Number.isFinite(value) || value <= 0) continue;
    const i = monthIndex(period) - base;
    if (i < 0) continue;
    ((sparse[iso2] ??= {})[code] ??= [])[i] = Math.round(value * 100) / 100;
  }
  for (const [iso2, byCode] of Object.entries(sparse)) {
    const products = {};
    for (const code of HICP_PRODUCTS) {
      const values = byCode[code] ? Array.from(byCode[code], (v) => v ?? null) : null;
      // Fewer months than a 12-month estimate needs: the app would ignore it anyway.
      if (values && values.filter((v) => v !== null).length >= MIN_ALL_MONTHS) products[code] = values;
    }
    if (Object.keys(products).length > 0) built.countries[iso2].products = products;
  }
  return built;
}

function monthIndex(period) {
  const [y, m] = period.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Fetches every series of every allowed country in one request. Throws on any failure. */
export async function fetchHicpRows(start = SERIES_START) {
  const res = await fetch(hicpUrl(start), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Eurostat answered ${res.status} ${res.statusText}`);
  return parseJsonStat(await res.json());
}
