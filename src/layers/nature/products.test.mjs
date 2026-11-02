import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NATURE_PRODUCTS,
  NATURE_PLACES,
  natureProduct,
  productDates,
  productEnd,
  nearestDateIndex,
  gibsTileTemplate,
  gibsDomainUrl,
  parseGibsDomain,
  dhwTileUrl,
  coralAlert,
} from './products.js';
import {
  COMPARE_PLACES,
  compareSource,
  parseWaybackConfig,
  parseWaybackCapture,
  waybackPerYear,
  waybackIdentifyUrl,
} from './compare.js';
import {
  parseCoralStations,
  parseCoralSeries,
  erddapDhwTileUrl,
  parseDhwTileQuery,
} from '../../../server/providers/coralReefWatch.js';

const NOW = Date.parse('2026-11-01T12:00:00Z');

test('every product has a unique id, a caveat and a known kind', () => {
  const ids = new Set();
  for (const product of NATURE_PRODUCTS) {
    assert.ok(!ids.has(product.id), product.id);
    ids.add(product.id);
    assert.ok(product.caveat && product.measures && product.resolution);
    assert.ok(['erddap-dhw', 'gibs-wmts', 'gibs-wms'].includes(product.kind));
  }
});

test('featured places point at real products and valid coordinates', () => {
  for (const place of NATURE_PLACES) {
    assert.ok(natureProduct(place.product), place.id);
    assert.ok(Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180);
    if (place.day) assert.match(place.day, /^\d{4}-\d\d-\d\d$/);
  }
});

test('daily products end inside the publication lag and step by one day', () => {
  const coral = natureProduct('coral-dhw');
  assert.equal(productEnd(coral, NOW), '2026-10-29');
  // A newer station date never pushes past the lagged end; an older one wins.
  assert.equal(productEnd(coral, NOW, '2026-10-30'), '2026-10-29');
  assert.equal(productEnd(coral, NOW, '2026-10-20'), '2026-10-20');
  const dates = productDates(coral, NOW);
  assert.equal(dates[0], '1985-04-01');
  assert.equal(dates.at(-1), '2026-10-29');
  assert.equal(dates[1], '1985-04-02');
});

test('yearly and 16-day products follow their native cadence', () => {
  const landCover = productDates(natureProduct('land-cover'), NOW);
  assert.equal(landCover[0], '2001-01-01');
  assert.equal(landCover.at(-1), '2024-01-01');
  assert.equal(landCover.length, 24);
  const ndvi = productDates(natureProduct('vegetation'), NOW);
  assert.ok(ndvi.includes('2026-01-01'));
  assert.ok(ndvi.includes('2026-01-17'));
  assert.ok(!ndvi.includes('2026-01-02'));
  assert.deepEqual(productDates(natureProduct('mangroves'), NOW), [
    '2000-01-01',
  ]);
});

test('nearestDateIndex finds the exact or nearest earlier date', () => {
  const dates = ['2001-01-01', '2002-01-01', '2003-01-01'];
  assert.equal(nearestDateIndex(dates, '2002-01-01'), 1);
  assert.equal(nearestDateIndex(dates, '2002-06-30'), 1);
  assert.equal(nearestDateIndex(dates, '1990-01-01'), 0);
  assert.equal(nearestDateIndex(dates, '2030-01-01'), 2);
});

test('GIBS templates carry the date unless the product is a snapshot', () => {
  assert.match(
    gibsTileTemplate(natureProduct('vegetation'), '2026-09-30'),
    /MODIS_Terra_L3_NDVI_16Day\/default\/2026-09-30\/GoogleMapsCompatible_Level9\/\{z\}\/\{y\}\/\{x\}\.png$/,
  );
  assert.match(
    gibsTileTemplate(natureProduct('mangroves'), '2000-01-01'),
    /Mangrove_Forest_Distribution_2000\/default\/default\//,
  );
});

test('ERDDAP tiles land on whole grid cells and stride large tiles', () => {
  const whole = decodeURIComponent(
    erddapDhwTileUrl({ day: '2024-03-15', level: 0, x: 0, y: 0 }),
  );
  assert.match(whole, /CRW_DHW\[\(2024-03-15T12:00:00Z\)\]/);
  // 3600 cells over 256 px → stride 14, ending on a real cell 14·k from the start.
  assert.match(whole, /\[\(89\.975\):14:\(-89\.925\)\]/);
  assert.match(whole, /\[\(-179\.975\):14:\(-0\.075\)\]/);
  // The tile touching 180° ends on a cell, not past the grid.
  const east = decodeURIComponent(
    erddapDhwTileUrl({ day: '2024-03-15', level: 2, x: 7, y: 1 }),
  );
  assert.match(east, /\[\(135\.025\):3:\(179\.875\)\]/);
  const fine = decodeURIComponent(
    erddapDhwTileUrl({ day: '2024-03-15', level: 5, x: 50, y: 10 }),
  );
  assert.match(fine, /:1:/);
});

test('DHW tile queries are validated before reaching ERDDAP', () => {
  const q = (s) => parseDhwTileQuery(new URLSearchParams(s), '2026-11-01');
  assert.deepEqual(q('day=2024-03-15&z=2&x=7&y=1'), {
    day: '2024-03-15',
    level: 2,
    x: 7,
    y: 1,
  });
  assert.equal(q('day=2024-03-15&z=6&x=0&y=0'), null);
  assert.equal(q('day=2024-03-15&z=0&x=2&y=0'), null);
  assert.equal(q('day=1980-01-01&z=0&x=0&y=0'), null);
  assert.equal(q('day=2027-01-01&z=0&x=0&y=0'), null);
  assert.equal(q('day=2024-03-15)];drop&z=0&x=0&y=0'), null);
  assert.equal(
    dhwTileUrl('2024-03-15', 2, 7, 1),
    '/api/coral/dhw?day=2024-03-15&z=2&x=7&y=1',
  );
});

test('GIBS domains expand into the dates that really exist', () => {
  const xml =
    '<Domains><DimensionDomain><Domain>2022-07-25/2022-07-26/P1D,2022-08-23/2022-08-24/P1D,2024-05-31</Domain></DimensionDomain></Domains>';
  assert.deepEqual(parseGibsDomain(xml, '2026-11-01'), [
    '2022-07-25',
    '2022-07-26',
    '2022-08-23',
    '2022-08-24',
    '2024-05-31',
  ]);
  const yearly = '<Domain>2001-01-01/2003-01-01/P1Y</Domain>';
  assert.deepEqual(parseGibsDomain(yearly, '2026-11-01'), [
    '2001-01-01',
    '2002-01-01',
    '2003-01-01',
  ]);
  const ndvi = '<Domain>2026-01-01/2026-02-02/P16D</Domain>';
  assert.deepEqual(parseGibsDomain(ndvi, '2026-11-01'), [
    '2026-01-01',
    '2026-01-17',
    '2026-02-02',
  ]);
  // Never past today, and junk is ignored.
  assert.deepEqual(
    parseGibsDomain(
      '<Domain>2026-10-30/2026-11-05/P1D,junk</Domain>',
      '2026-11-01',
    ),
    ['2026-10-30', '2026-10-31', '2026-11-01'],
  );
  assert.deepEqual(parseGibsDomain('no domain'), []);
  assert.match(
    gibsDomainUrl(natureProduct('fires')),
    /epsg4326\/best\/1\.0\.0\/VIIRS_SNPP_Thermal_Anomalies_375m_All\/default\/250m\/all\/all\.xml$/,
  );
  assert.equal(gibsDomainUrl(natureProduct('mangroves')), null);
  assert.equal(gibsDomainUrl(natureProduct('coral-dhw')), null);
});

test('compare sources only build URLs for known years and releases', () => {
  const releases = parseWaybackConfig({
    10: {
      itemTitle: 'World Imagery (Wayback 2014-02-20)',
      metadataLayerUrl: 'https://metadata.maptiles.arcgis.com/x/MapServer',
    },
    43291: {
      itemTitle: 'World Imagery (Wayback 2026-10-29)',
      metadataLayerUrl: 'https://evil.example/MapServer',
    },
    20: { itemTitle: 'World Imagery (Wayback 2014-12-30)' },
    bad: { itemTitle: 'World Imagery (Wayback 2015-01-01)' },
  });
  assert.deepEqual(
    releases.map((r) => r.id),
    [10, 20, 43291],
  );
  assert.equal(releases[2].metadataUrl, null);
  // Releases before 2017 are left out of the per-year picker.
  assert.deepEqual(
    waybackPerYear(releases).map((r) => r.id),
    [43291],
  );
  assert.match(compareSource('s2:2016').url, /s2cloudless_3857\/default/);
  assert.match(compareSource('s2:2023').url, /s2cloudless-2023_3857\/default/);
  assert.match(compareSource('s2:2023').credit, /CC BY-NC-SA/);
  assert.match(
    compareSource('wb:43291', releases).url,
    /\/tile\/43291\/\{z\}\/\{y\}\/\{x\}$/,
  );
  assert.equal(compareSource('s2:2015'), null);
  assert.equal(compareSource('wb:999', releases), null);
  assert.equal(compareSource('http://x'), null);
  assert.match(
    waybackIdentifyUrl(
      'https://metadata.maptiles.arcgis.com/m/MapServer',
      -33.6,
      150.31,
    ),
    /identify\?geometry=150\.31000%2C-33\.60000/,
  );
});

test('Wayback capture picks the sharpest record', () => {
  assert.deepEqual(
    parseWaybackCapture({
      results: [
        {
          attributes: {
            SRC_DATE: '20151202',
            SRC_RES: '0.5',
            NICE_DESC: 'Maxar',
          },
        },
        {
          attributes: {
            SRC_DATE: '20190101',
            SRC_RES: '0.31',
            NICE_DESC: 'Maxar',
          },
        },
        { attributes: { SRC_DATE: 'bad' } },
      ],
    }),
    { date: '2019-01-01', provider: 'Maxar', metres: 0.31 },
  );
  assert.equal(parseWaybackCapture({ results: [] }), null);
});

test('3D places point at known sources or products', () => {
  for (const place of COMPARE_PLACES) {
    assert.ok(Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180);
    assert.ok(place.pitchDeg < 0 && place.rangeM > 0, place.id);
    if (place.kind === 'imagery') {
      for (const key of [place.before, place.after])
        assert.ok(
          key.startsWith('wb:') ? /^wb:\d+$/.test(key) : compareSource(key),
          `${place.id} ${key}`,
        );
    } else {
      assert.ok(natureProduct(place.product), place.id);
      assert.match(place.after, /^\d{4}-\d\d-\d\d$/);
    }
  }
});

test('alert levels fall back to no stress for unknown values', () => {
  assert.equal(coralAlert(4).label, 'Alert level 2');
  assert.equal(coralAlert(99).label, 'No stress');
});

test('CRW station GeoJSON keeps valid points only', () => {
  const stations = parseCoralStations({
    features: [
      {
        geometry: { type: 'Point', coordinates: [144.1, -12.675] },
        properties: {
          name: 'Far Northern GBR',
          gauge_page: 'gbr_far_northern.php',
          ts_fig: 'great_barrier_reef.php#gbr_far_northern',
          date: '2026-10-29',
          sst: '27.81',
          ssta: '1.035',
          hs: '0.000',
          dhw: '0.000',
          alert: '0',
        },
      },
      { geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
      {
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { name: 'Bad slug', gauge_page: '../etc/passwd.php' },
      },
    ],
  });
  assert.equal(stations.length, 1);
  assert.deepEqual(stations[0], {
    id: 'gbr_far_northern',
    name: 'Far Northern GBR',
    lat: -12.675,
    lon: 144.1,
    region: 'great_barrier_reef',
    date: '2026-10-29',
    sst: 27.81,
    ssta: 1.035,
    hotspot: 0,
    dhw: 0,
    alert: 0,
  });
  assert.throws(() => parseCoralStations({ features: [] }));
});

test('CRW station text parses header fields and daily columns', () => {
  const text = [
    'Name:',
    'Bermuda',
    ' ',
    'Averaged Maximum Monthly Mean:',
    '27.2714',
    ' ',
    'Averaged Monthly Mean (Jan-Dec):',
    '20.3868 19.6310 19.4600 19.9376 21.4839 24.1469 26.5644 27.2714 26.7887 25.1750 23.1355 21.6026',
    ' ',
    'YYYY MM DD SST_MIN SST_MAX SST@90th_HS SSTA@90th_HS 90th_HS>0 DHW_from_90th_HS>1 BAA_7day_max',
    '2024 03 15 28.4900 29.9500 29.3700      1.2100       0.9000   12.0286            4',
    '2024 03 16 28.5000 29.9000 29.3000      1.1000       0.8000   12.1000            4',
  ].join('\n');
  const series = parseCoralSeries(text);
  assert.equal(series.maximumMonthlyMean, 27.2714);
  assert.equal(series.monthlyMeans.length, 12);
  assert.deepEqual(series.dates, ['2024-03-15', '2024-03-16']);
  assert.deepEqual(series.sst, [29.37, 29.3]);
  assert.deepEqual(series.ssta, [1.21, 1.1]);
  assert.deepEqual(series.dhw, [12.0286, 12.1]);
  assert.deepEqual(series.alert, [4, 4]);
  assert.throws(() => parseCoralSeries('no data here'));
});
