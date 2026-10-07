// Eurostat's HICP item weights (dataset prc_hicp_iw, ECOICOP ver. 2): how much of an average
// household's spending each kind of product takes, in parts of a thousand, one set per year.
// The app sets them beside the user's own basket, to show why the two rates differ.
//   GET https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_iw
// Reuse: Eurostat's copyright notice, CC BY 4.0; same country list and attribution as the series.
import { HICP_COUNTRIES, parseJsonStat } from './eurostat.mjs';

const ENDPOINT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_iw';
const FETCH_TIMEOUT_MS = 60000;

/** The app's categories as ECOICOP ver. 2 divisions and groups. What none of them takes is "other". */
export const WEIGHT_GROUPS = {
  food: ['CP01'],
  eatingOut: ['CP111'],
  household: ['CP05'],
  personal: ['CP13'],
  health: ['CP06'],
  transport: ['CP07'],
  housing: ['CP041', 'CP043'],
  utilities: ['CP044', 'CP045'],
  subscriptions: ['CP08'],
  clothing: ['CP03'],
  education: ['CP10'],
  leisure: ['CP09', 'CP112'],
};

const GEO_TO_ISO2 = { EL: 'GR' };
const round2 = (x) => Math.round(x * 100) / 100;

export function weightsUrl() {
  const codes = ['TOTAL', ...new Set(Object.values(WEIGHT_GROUPS).flat())];
  const params = ['format=JSON', 'lastTimePeriod=1', ...codes.map((c) => `coicop18=${c}`), ...HICP_COUNTRIES.map((g) => `geo=${g}`)];
  return `${ENDPOINT}?${params.join('&')}`;
}

/**
 * The latest year's weights per country, summed into the app's categories. "other" is the total
 * less every category, so the parts always add up to the whole. A country without a total, or
 * without a single category, is left out.
 */
export function buildWeights(rows) {
  const latest = {};
  for (const r of rows) if (!latest[r.geo] || r.period > latest[r.geo]) latest[r.geo] = r.period;
  const byGeo = {};
  for (const r of rows) {
    if (r.period !== latest[r.geo]) continue;
    (byGeo[r.geo] ??= {})[r.code] = r.value;
  }
  const countries = {};
  let year = null;
  for (const [geo, values] of Object.entries(byGeo)) {
    if (typeof values.TOTAL !== 'number') continue;
    const out = {};
    let used = 0;
    for (const [category, codes] of Object.entries(WEIGHT_GROUPS)) {
      const present = codes.filter((c) => typeof values[c] === 'number');
      if (present.length === 0) continue;
      const sum = present.reduce((s, c) => s + values[c], 0);
      out[category] = round2(sum);
      used += sum;
    }
    if (Object.keys(out).length === 0) continue;
    out.other = round2(Math.max(0, values.TOTAL - used));
    countries[GEO_TO_ISO2[geo] ?? geo] = out;
    if (!year || latest[geo] > year) year = latest[geo];
  }
  return { year, countries };
}

export async function fetchWeightRows() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(weightsUrl(), { signal: controller.signal, headers: { 'User-Agent': 'pocketflation-data' } });
    if (!res.ok) throw new Error(`Eurostat answered ${res.status}`);
    return parseJsonStat(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
