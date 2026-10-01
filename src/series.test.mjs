import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, SERIES } from './series.mjs';

const map = { TUR: 'TR', USA: 'US' };

function rows(iso3, start, values) {
  const [y, m] = start.split('-').map(Number);
  return values.flatMap((value, i) => {
    if (value === null) return [];
    const t = y * 12 + (m - 1) + i;
    return [{ iso3, period: `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`, value }];
  });
}
const flat = (n, v = 100) => Array(n).fill(v);

test('SERIES maps the seven keys to COICOP codes', () => {
  assert.deepEqual(SERIES, { all: '_T', food: 'CP01', transport: 'CP07', housing: 'CP04', communication: 'CP08', health: 'CP06', personal: 'CP12' });
});

test('aligns values to the start month and rounds to 2 decimals', () => {
  const out = buildSeries({ all: rows('TUR', '2024-01', flat(13)), food: rows('TUR', '2024-03', [101.234, 102.999]) }, map, '2024-01');
  assert.equal(out.start, '2024-01');
  assert.deepEqual(out.countries.TR.food, [null, null, 101.23, 103]);
  assert.equal(out.countries.TR.all.length, 13);
});

test('months before the start are dropped, gaps are null, order of rows does not matter', () => {
  const food = rows('TUR', '2023-11', [90, 91, 100, null, 102]).reverse();
  const out = buildSeries({ all: rows('TUR', '2024-01', flat(13)), food }, map, '2024-01');
  assert.deepEqual(out.countries.TR.food, [100, null, 102]);
});

test('non-positive and non-finite values become null and trailing nulls are trimmed', () => {
  const food = [...rows('TUR', '2024-01', [100, 0, -5]), { iso3: 'TUR', period: '2024-04', value: NaN }];
  const out = buildSeries({ all: rows('TUR', '2024-01', flat(13)), food }, map, '2024-01');
  assert.deepEqual(out.countries.TR.food, [100]);
});

test('a country needs 13 months of the all-items series', () => {
  const out = buildSeries({ all: [...rows('TUR', '2024-01', flat(12)), ...rows('USA', '2024-01', flat(13))], food: rows('TUR', '2024-01', flat(20)) }, map, '2024-01');
  assert.deepEqual(Object.keys(out.countries), ['US']);
});

test('unknown ISO3 codes and unknown series keys are skipped; a series with no values is omitted', () => {
  const out = buildSeries({ all: [...rows('XXX', '2024-01', flat(13)), ...rows('USA', '2024-01', flat(13))], bogus: rows('USA', '2024-01', flat(13)), food: [] }, map, '2024-01');
  assert.deepEqual(Object.keys(out.countries), ['US']);
  assert.deepEqual(Object.keys(out.countries.US), ['all']);
});

test('a country whose all-items series ends more than 18 months before the newest month is dropped', () => {
  const fresh = rows('USA', '2024-01', flat(32)); // newest 2026-08
  const at18 = rows('TUR', '2024-01', flat(14)); // ends 2025-02, 18 months behind
  const at19 = rows('TUR', '2024-01', flat(13)); // ends 2025-01, 19 months behind
  assert.deepEqual(Object.keys(buildSeries({ all: [...fresh, ...at18] }, map, '2024-01').countries), ['TR', 'US']);
  assert.deepEqual(Object.keys(buildSeries({ all: [...fresh, ...at19] }, map, '2024-01').countries), ['US']);
});
