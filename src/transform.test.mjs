import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  // 2025-06 .. 2026-07 present, 2026-08 present but 2025-08 missing.
  const rows = series('TUR', '2025-06', [100, 100, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 132, 150]).filter(
    (r) => r.period !== '2025-08',
  );
  // 2026-08 has no 2025-08; 2026-07 has 2025-07 (100) -> 150/100... check values
  const out = transform(rows, map);
  assert.equal(out.TR.period, '2026-07');
  const jul25 = rows.find((r) => r.period === '2025-07').value;
  const jul26 = rows.find((r) => r.period === '2026-07').value;
  assert.equal(out.TR.yoy, Math.round((jul26 / jul25 - 1) * 10000) / 10000);
});

test('a country whose latest valid yoy is more than 18 months behind the dataset newest is excluded', () => {
  const stale = series('TUR', '2023-01', Array(13).fill(0).map((_, i) => 100 + i)); // ends 2024-01
  const fresh = series('USA', '2025-08', Array(13).fill(100)); // ends 2026-08
  const out = transform([...stale, ...fresh], map);
  assert.equal(out.TR, undefined);
  assert.ok(out.US);
});

test('a country exactly 18 months behind is kept', () => {
  const edge = series('TUR', '2025-02', Array(13).fill(100)); // ends 2026-02
  const fresh = series('USA', '2025-08', Array(13).fill(100)); // ends 2026-08 (6 months apart)
  const older = series('TUR', '2023-08', Array(13).fill(100)); // ends 2024-08, 24 months behind
  assert.ok(transform([...edge, ...fresh], map).TR);
  assert.equal(transform([...older, ...fresh], map).TR, undefined);
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
