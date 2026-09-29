import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePeriod, parseCsv } from './fetch-imf.mjs';

test('normalizePeriod converts IMF monthly periods and rejects others', () => {
  assert.equal(normalizePeriod('2026-M08'), '2026-08');
  assert.equal(normalizePeriod('2026-Q3'), null);
  assert.equal(normalizePeriod('2026'), null);
});

test('parseCsv reads country, period and value and skips empty observations', () => {
  const csv = [
    'STRUCTURE[;],STRUCTURE_ID,ACTION,COUNTRY,INDEX_TYPE,COICOP_1999,TYPE_OF_TRANSFORMATION,FREQUENCY,TIME_PERIOD,OBS_VALUE',
    'dataflow,IMF.STA:CPI(5.0.0),R,TUR,CPI,_T,IX,M,2026-M08,4321.5',
    'dataflow,IMF.STA:CPI(5.0.0),R,TUR,CPI,_T,IX,M,2026-M09,',
  ].join('\n');
  assert.deepEqual(parseCsv(csv), [{ iso3: 'TUR', period: '2026-08', value: 4321.5 }]);
});
