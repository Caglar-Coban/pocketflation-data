import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHicp, HICP_COUNTRIES, HICP_SERIES, hicpUrl, parseJsonStat } from './eurostat.mjs';

/** A JSON-stat answer with the given dimension order; `cells` maps "coicop|geo|time" to a value. */
function jsonStat(order, cells) {
  const cats = { freq: ['M'], unit: ['I25'], coicop18: ['TOTAL', 'CP01'], geo: ['EL', 'TR'], time: ['2024-01', '2024-02', '2024-03'] };
  const size = order.map((d) => cats[d].length);
  const value = {};
  for (const [key, v] of Object.entries(cells)) {
    const [coicop18, geo, time] = key.split('|');
    const pick = { freq: 'M', unit: 'I25', coicop18, geo, time };
    let flat = 0;
    order.forEach((d, i) => {
      flat = flat * size[i] + cats[d].indexOf(pick[d]);
    });
    value[flat] = v;
  }
  const dimension = Object.fromEntries(order.map((d) => [d, { category: { index: Object.fromEntries(cats[d].map((c, i) => [c, i])) } }]));
  return { id: order, size, dimension, value };
}

test('HICP_SERIES maps the seven keys to ECOICOP version 2 codes', () => {
  // Personal care is CP13 here (CP12 in the IMF's COICOP 1999): the two classifications differ.
  assert.deepEqual(HICP_SERIES, { all: 'TOTAL', food: 'CP01', transport: 'CP07', housing: 'CP04', communication: 'CP08', health: 'CP06', personal: 'CP13' });
});

test('only countries Eurostat lets us reuse commercially are asked for', () => {
  // EU, EFTA and official candidate countries. The US, the UK and Kosovo (a potential candidate) are in the dataset but not reusable.
  for (const code of ['US', 'UK', 'GB', 'XK']) assert.equal(HICP_COUNTRIES.includes(code), false, code);
  for (const code of ['TR', 'DE', 'FR', 'EL', 'NO', 'CH', 'IS', 'RS']) assert.equal(HICP_COUNTRIES.includes(code), true, code);
  assert.equal(new Set(HICP_COUNTRIES).size, HICP_COUNTRIES.length);
  assert.equal(HICP_COUNTRIES.length, 36);
});

test('the request names the index unit, the start month, every series and every country', () => {
  const url = hicpUrl('2024-01');
  assert.match(url, /^https:\/\/ec\.europa\.eu\/eurostat\/api\/dissemination\/statistics\/1\.0\/data\/prc_hicp_minr\?/);
  assert.match(url, /unit=I25/);
  assert.match(url, /sinceTimePeriod=2024-01/);
  for (const code of Object.values(HICP_SERIES)) assert.ok(url.includes(`coicop18=${code}`), code);
  for (const geo of HICP_COUNTRIES) assert.ok(url.includes(`geo=${geo}`), geo);
});

test('reads values whatever order the dimensions come in', () => {
  const cells = { 'TOTAL|TR|2024-01': 100, 'TOTAL|TR|2024-03': 104.5, 'CP01|EL|2024-02': 99.1 };
  const expected = [
    { geo: 'EL', code: 'CP01', period: '2024-02', value: 99.1 },
    { geo: 'TR', code: 'TOTAL', period: '2024-01', value: 100 },
    { geo: 'TR', code: 'TOTAL', period: '2024-03', value: 104.5 },
  ];
  const sorted = (rows) => [...rows].sort((a, b) => `${a.geo}${a.code}${a.period}`.localeCompare(`${b.geo}${b.code}${b.period}`));
  assert.deepEqual(sorted(parseJsonStat(jsonStat(['freq', 'unit', 'coicop18', 'geo', 'time'], cells))), expected);
  assert.deepEqual(sorted(parseJsonStat(jsonStat(['time', 'geo', 'freq', 'coicop18', 'unit'], cells))), expected);
});

test('a missing or null cell is no row, and an answer of another shape is refused', () => {
  const some = jsonStat(['freq', 'unit', 'coicop18', 'geo', 'time'], { 'TOTAL|TR|2024-01': 100, 'TOTAL|TR|2024-02': null });
  assert.equal(parseJsonStat(some).length, 1);
  assert.throws(() => parseJsonStat({ id: ['geo'], size: [1], dimension: {}, value: {} }), /JSON-stat/);
  assert.throws(() => parseJsonStat(null), /JSON-stat/);
});

test('builds month-aligned series per country, Greece under its ISO code', () => {
  const months = Array.from({ length: 13 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  const rows = [
    ...months.map((period, i) => ({ geo: 'EL', code: 'TOTAL', period, value: 100 + i })),
    ...months.map((period, i) => ({ geo: 'EL', code: 'CP13', period, value: 200 + i })),
    ...months.map((period, i) => ({ geo: 'TR', code: 'TOTAL', period, value: 300 + i })),
    { geo: 'TR', code: 'CP01', period: '2024-03', value: 55.555 },
    // Not a series the app knows: ignored.
    { geo: 'TR', code: 'CP09', period: '2024-03', value: 1 },
  ];
  const out = buildHicp(rows, '2024-01');
  assert.equal(out.start, '2024-01');
  assert.deepEqual(Object.keys(out.countries), ['GR', 'TR']);
  assert.equal(out.countries.GR.all.length, 13);
  assert.equal(out.countries.GR.personal[12], 212);
  assert.deepEqual(out.countries.TR.food, [null, null, 55.56]);
});

test('a country with less than 13 months of the all-items index is left out', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ geo: 'TR', code: 'TOTAL', period: `2024-${String(i + 1).padStart(2, '0')}`, value: 100 + i }));
  assert.deepEqual(buildHicp(rows, '2024-01').countries, {});
});

test('the all-items index never runs ahead of the category indexes', () => {
  // Eurostat publishes a flash figure for the total weeks before the divisions. A month only the
  // total has would be priced by part of an automatic basket, so it is held back until they catch up.
  const months = Array.from({ length: 15 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  const rows = [
    ...months.map((period, i) => ({ geo: 'DE', code: 'TOTAL', period, value: 100 + i })),
    ...months.slice(0, 14).map((period, i) => ({ geo: 'DE', code: 'CP01', period, value: 200 + i })),
    ...months.slice(0, 13).map((period, i) => ({ geo: 'DE', code: 'CP07', period, value: 300 + i })),
    // A country with the total alone keeps all of it.
    ...months.map((period, i) => ({ geo: 'TR', code: 'TOTAL', period, value: 400 + i })),
  ];
  const out = buildHicp(rows, '2024-01');
  assert.equal(out.countries.DE.all.length, 14);
  assert.equal(out.countries.DE.food.length, 14);
  assert.equal(out.countries.DE.transport.length, 13);
  assert.equal(out.countries.TR.all.length, 15);
});

import { HICP_PRODUCTS } from './eurostat.mjs';

test('product codes are unique ECOICOP codes and include the five division fallbacks', () => {
  assert.equal(new Set(HICP_PRODUCTS).size, HICP_PRODUCTS.length);
  for (const code of HICP_PRODUCTS) assert.match(code, /^CP\d{2,5}$/, code);
  // The categories the IMF-style keys do not cover: clothing, household, leisure, education, eating out.
  for (const code of ['CP03', 'CP05', 'CP09', 'CP10', 'CP111']) assert.ok(HICP_PRODUCTS.includes(code), code);
  for (const code of ['CP01141', 'CP01148', 'CP07222', 'CP04110']) assert.ok(HICP_PRODUCTS.includes(code), code);
  // None of them doubles as one of the seven series.
  for (const code of Object.values(HICP_SERIES)) assert.equal(HICP_PRODUCTS.includes(code), false, code);
  for (const code of HICP_PRODUCTS) assert.ok(hicpUrl('2024-01').includes(`coicop18=${code}&`) || hicpUrl('2024-01').includes(`coicop18=${code}`), code);
});

test('product series go under `products`, month-aligned, and a short one is left out', () => {
  const months = Array.from({ length: 14 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  const rows = [
    ...months.map((period, i) => ({ geo: 'TR', code: 'TOTAL', period, value: 100 + i })),
    ...months.map((period, i) => ({ geo: 'TR', code: 'CP01141', period, value: 200 + i + 0.004 })),
    // Starts two months in: leading months are null.
    ...months.slice(2).map((period, i) => ({ geo: 'TR', code: 'CP01148', period, value: 300 + i })).slice(0, 13).slice(0, 12),
    // Twelve values only: cannot carry a 12-month estimate.
    ...months.slice(0, 12).map((period, i) => ({ geo: 'TR', code: 'CP07222', period, value: 400 + i })),
    // A country without the all-items index gets nothing at all.
    ...months.map((period, i) => ({ geo: 'DE', code: 'CP01141', period, value: 500 + i })),
  ];
  const out = buildHicp(rows, '2024-01');
  assert.deepEqual(Object.keys(out.countries), ['TR']);
  assert.deepEqual(Object.keys(out.countries.TR.products), ['CP01141']);
  assert.equal(out.countries.TR.products.CP01141.length, 14);
  assert.equal(out.countries.TR.products.CP01141[0], 200);
  assert.equal(out.countries.TR.all.length, 14);
});

test('a product series with gaps keeps its place in time, and a country with no product has no `products`', () => {
  const months = Array.from({ length: 15 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  const rows = [
    ...months.map((period, i) => ({ geo: 'TR', code: 'TOTAL', period, value: 100 + i })),
    ...months.filter((_, i) => i !== 0 && i !== 5).map((period) => ({ geo: 'TR', code: 'CP01148', period, value: 300 })),
    ...months.map((period, i) => ({ geo: 'EL', code: 'TOTAL', period, value: 100 + i })),
  ];
  const out = buildHicp(rows, '2024-01');
  assert.equal(out.countries.TR.products.CP01148[0], null);
  assert.equal(out.countries.TR.products.CP01148[5], null);
  assert.equal(out.countries.TR.products.CP01148.length, 15);
  assert.equal('products' in out.countries.GR, false);
});
