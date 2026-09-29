const MAX_LAG_MONTHS = 18;

function monthIndex(period) {
  const [y, m] = period.split('-').map(Number);
  return y * 12 + (m - 1);
}

function periodOf(index) {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Turns monthly CPI index rows into the latest year-over-year rate per country.
 * For each country the latest period t that also has t-12 is used. Countries whose
 * latest usable period is more than 18 months older than the newest period in the
 * dataset are dropped, as are ISO3 codes not in the map (regional aggregates etc).
 *
 * @param {Array<{iso3: string, period: string, value: number}>} rows
 * @param {Record<string, string>} iso3to2
 * @returns {Record<string, {period: string, yoy: number}>}
 */
export function transform(rows, iso3to2) {
  const byCountry = new Map();
  let newest = -Infinity;
  for (const { iso3, period, value } of rows) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const iso2 = iso3to2[iso3];
    if (!iso2) continue;
    if (!byCountry.has(iso2)) byCountry.set(iso2, new Map());
    const idx = monthIndex(period);
    byCountry.get(iso2).set(idx, value);
    if (idx > newest) newest = idx;
  }

  const result = {};
  for (const [iso2, series] of byCountry) {
    const candidates = [...series.keys()].filter((t) => series.has(t - 12)).sort((a, b) => b - a);
    if (candidates.length === 0) continue;
    const t = candidates[0];
    if (newest - t > MAX_LAG_MONTHS) continue;
    const yoy = Math.round((series.get(t) / series.get(t - 12) - 1) * 10000) / 10000;
    result[iso2] = { period: periodOf(t), yoy };
  }
  return result;
}
