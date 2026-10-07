import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OECD_SERIES, oecdUrl, parseOecdCsv, splitBySeries } from './oecd.mjs';

test('reads country, month and value from OECD SDMX-CSV, skipping empty observations and aggregates', () => {
  const csv = [
    'DATAFLOW,REF_AREA,FREQ,METHODOLOGY,MEASURE,UNIT_MEASURE,EXPENDITURE,ADJUSTMENT,TRANSFORMATION,TIME_PERIOD,OBS_VALUE,OBS_STATUS',
    'OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),USA,M,N,CPI,IX,_T,N,_Z,2026-08,145.2,A',
    'OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),USA,M,N,CPI,IX,_T,N,_Z,2026-09,,A',
    'OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),G20,M,N,CPI,IX,_T,N,_Z,2026-08,150,A',
    'OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),GBR,M,N,CPI,IX,_T,N,_Z,2026-Q3,130,A',
  ].join('\n');
  assert.deepEqual(parseOecdCsv(csv), [
    { iso3: 'USA', period: '2026-08', value: 145.2, expenditure: '_T' },
    { iso3: 'G20', period: '2026-08', value: 150, expenditure: '_T' },
  ]);
});

test('asks for the national monthly CPI index of every published group in one request, from a month on', () => {
  const url = oecdUrl(['_T', 'CP01'], '2024-01');
  assert.ok(url.startsWith('https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/'));
  assert.ok(url.includes('/.M.N.CPI.IX._T+CP01.N.?'));
  assert.ok(url.includes('startPeriod=2024-01'));
});

test('splits one answer into the app series by expenditure group', () => {
  const rows = [
    { iso3: 'USA', period: '2026-08', value: 145.2, expenditure: '_T' },
    { iso3: 'USA', period: '2026-08', value: 150.1, expenditure: 'CP01' },
    { iso3: 'USA', period: '2026-08', value: 99, expenditure: 'CP045_0722' },
  ];
  assert.deepEqual(splitBySeries(rows), {
    all: [{ iso3: 'USA', period: '2026-08', value: 145.2 }],
    food: [{ iso3: 'USA', period: '2026-08', value: 150.1 }],
  });
});

test('publishes all items and food, the groups the OECD has for its countries', () => {
  assert.deepEqual(OECD_SERIES, { all: '_T', food: 'CP01' });
});
