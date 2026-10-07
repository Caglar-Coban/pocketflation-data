import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from './transform.mjs';

const map = { TUR: 'TR', USA: 'US' };

function series(iso3, start, values) {
  const [y, m] = start.split('-').map(Number);
  return values.map((value, i) => {
    const t = y * 12 + (m - 1) + i;
    const period = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    return { iso3, period, value };
  });
}

test('13 consecutive months, 100 to 150, gives yoy 0.5 at the latest period', () => {
  const values = Array(12).fill(120);
  values[0] = 100;
  values.push(150);
  const out = transform(series('TUR', '2025-08', values), map);
  assert.deepEqual(out.TR, { period: '2026-08', yoy: 0.5 });
});

test('falls back to the latest period that has a t-12 when the exact one is missing', () => {
  // 2025-06 .. 2026-08 (15 months), with 2025-08 removed so 2026-08 has no t-12.
  const values = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 140, 150, 160];
  const rows = series('TUR', '2025-06', values).filter((r) => r.period !== '2025-08');
  assert.equal(rows.at(-1).period, '2026-08');
  // 2026-07 is the latest period whose t-12 (2025-07, value 100) exists; 2026-07 value is 150.
  assert.deepEqual(transform(rows, map).TR, { period: '2026-07', yoy: 0.5 });
});

test('a country whose latest valid yoy is more than 18 months behind the dataset newest is excluded', () => {
  const stale = series('TUR', '2023-01', Array(13).fill(0).map((_, i) => 100 + i)); // ends 2024-01
  const fresh = series('USA', '2025-08', Array(13).fill(100)); // ends 2026-08
  const out = transform([...stale, ...fresh], map);
  assert.equal(out.TR, undefined);
  assert.ok(out.US);
});

test('the 18-month boundary is inclusive: 18 behind is kept, 19 behind is excluded', () => {
  const fresh = series('USA', '2025-08', Array(13).fill(100)); // newest 2026-08
  const at18 = series('TUR', '2024-02', Array(13).fill(100)); // ends 2025-02, 18 months behind
  const at19 = series('TUR', '2024-01', Array(13).fill(100)); // ends 2025-01, 19 months behind
  assert.deepEqual(transform([...at18, ...fresh], map).TR, { period: '2025-02', yoy: 0 });
  assert.equal(transform([...at19, ...fresh], map).TR, undefined);
});

test('the non-ISO codes KOS and WBG map to XK and PS', () => {
  const iso3to2 = JSON.parse(readFileSync(new URL('./iso3to2.json', import.meta.url), 'utf8'));
  const rows = [...series('KOS', '2025-08', Array(13).fill(100)), ...series('WBG', '2025-08', Array(13).fill(100))];
  assert.deepEqual(Object.keys(transform(rows, iso3to2)).sort(), ['PS', 'XK']);
});

test('unknown ISO3 codes are skipped', () => {
  const rows = [...series('XXX', '2025-08', Array(13).fill(100)), ...series('TUR', '2025-08', Array(13).fill(100))];
  const out = transform(rows, map);
  assert.deepEqual(Object.keys(out), ['TR']);
});

test('yoy is rounded to 4 decimals', () => {
  const values = Array(13).fill(100);
  values[0] = 300;
  values[12] = 400.123456; // 400.123456/300 - 1 = 0.33374...
  const out = transform(series('TUR', '2025-08', values), map);
  assert.equal(out.TR.yoy, 0.3337);
});
