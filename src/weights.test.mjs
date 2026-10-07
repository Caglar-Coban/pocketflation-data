import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeights, WEIGHT_GROUPS, weightsUrl } from './weights.mjs';

const row = (geo, code, value, period = '2026') => ({ geo, code, period, value });

test('adds the divisions up into the app categories, in parts of a thousand', () => {
  const rows = [
    ['TOTAL', 1000], ['CP01', 244.44], ['CP02', 27.55], ['CP03', 79.04], ['CP041', 67.64], ['CP043', 7.98], ['CP044', 6.62], ['CP045', 31.78],
    ['CP05', 79.2], ['CP06', 27.92], ['CP07', 166.17], ['CP08', 31.04], ['CP09', 43.38], ['CP10', 20.22], ['CP111', 84.38], ['CP112', 26.97], ['CP12', 10.74], ['CP13', 44.94],
  ].map(([code, v]) => row('TR', code, v));
  const out = buildWeights(rows);
  assert.equal(out.year, '2026');
  const tr = out.countries.TR;
  assert.equal(tr.food, 244.44);
  assert.equal(tr.housing, 75.62);
  assert.equal(tr.utilities, 38.4);
  assert.equal(tr.leisure, 70.35);
  assert.equal(tr.eatingOut, 84.38);
  // Alcohol and tobacco, insurance and anything left over are "other": the parts add up to the whole.
  const sum = Object.values(tr).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1000) < 0.01);
  assert.equal(tr.other, 38.28);
});

test('rounds every weight to 2 decimals', () => {
  const rows = [['TOTAL', 1000], ['CP041', 67.64], ['CP043', 7.98], ['CP01', 244.444]].map(([code, v]) => row('TR', code, v));
  const tr = buildWeights(rows).countries.TR;
  assert.equal(tr.housing, 75.62);
  assert.equal(tr.food, 244.44);
  assert.equal(tr.other, 679.94);
});

test('maps Greece to its ISO code, and keeps only the latest year per country', () => {
  const rows = [row('EL', 'TOTAL', 1000, '2025'), row('EL', 'CP01', 100, '2025'), row('EL', 'TOTAL', 1000, '2026'), row('EL', 'CP01', 200, '2026')];
  const out = buildWeights(rows);
  assert.equal(out.countries.GR.food, 200);
  assert.equal(out.countries.EL, undefined);
});

test('leaves out a country without a total or without any division', () => {
  const out = buildWeights([row('TR', 'CP01', 244), row('DE', 'TOTAL', 1000)]);
  assert.deepEqual(out.countries, {});
});

test('asks Eurostat for the divisions the groups use, for the countries whose data may be reused', () => {
  const url = weightsUrl();
  assert.ok(url.startsWith('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_iw?'));
  for (const code of new Set(Object.values(WEIGHT_GROUPS).flat())) assert.ok(url.includes(`coicop18=${code}`), code);
  assert.ok(url.includes('geo=TR'));
  assert.ok(!url.includes('geo=UK') && !url.includes('geo=US'));
});
