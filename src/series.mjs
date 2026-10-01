/** App series key -> IMF COICOP_1999 code. */
export const SERIES = { all: '_T', food: 'CP01', transport: 'CP07', housing: 'CP04', communication: 'CP08', health: 'CP06', personal: 'CP12' };

/** The first month the published series carry. */
export const SERIES_START = '2024-01';

const MIN_ALL_MONTHS = 13;

function monthIndex(period) {
  const [y, m] = period.split('-').map(Number);
  return y * 12 + (m - 1);
}

/**
 * Turns the rows of each series into month-aligned arrays per country.
 * `rowsByKey[key]` holds `{ iso3, period, value }` rows; index `i` of an output array is the
 * month `start + i`, a missing month is `null`, and trailing nulls are trimmed. Countries
 * with fewer than 13 months of the all-items series are dropped.
 *
 * @param {Record<string, Array<{iso3: string, period: string, value: number}>>} rowsByKey
 * @param {Record<string, string>} iso3to2
 * @returns {{ start: string, countries: Record<string, Record<string, Array<number|null>>> }}
 */
export function buildSeries(rowsByKey, iso3to2, start = SERIES_START) {
  const base = monthIndex(start);
  const sparse = {};
  for (const key of Object.keys(SERIES)) {
    for (const { iso3, period, value } of rowsByKey[key] ?? []) {
      const iso2 = iso3to2[iso3];
      if (!iso2 || !Number.isFinite(value) || value <= 0) continue;
      const i = monthIndex(period) - base;
      if (i < 0) continue;
      const entry = (sparse[iso2] ??= {});
      (entry[key] ??= [])[i] = Math.round(value * 100) / 100;
    }
  }
  const countries = {};
  for (const iso2 of Object.keys(sparse).sort()) {
    const entry = {};
    for (const key of Object.keys(SERIES)) {
      const values = sparse[iso2][key];
      if (values) entry[key] = Array.from(values, (v) => v ?? null);
    }
    if ((entry.all ?? []).filter((v) => v !== null).length >= MIN_ALL_MONTHS) countries[iso2] = entry;
  }
  return { start, countries };
}
