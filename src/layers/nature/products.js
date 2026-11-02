/**
 * Nature time-series products: dated, keyless raster maps the Nature layer can
 * scrub through with its date slider. Pure data and URL builders: no DOM, no
 * Cesium, so it can be unit tested in Node.
 *
 * Every product states what it measures and how coarse it is, because the
 * colours alone invite over-reading (heat stress is not confirmed bleaching;
 * a fire pixel is a 375 m detection, not a mapped burn scar).
 */

import { msg } from '../../i18n/marker.js';

const DAY_MS = 86_400_000;
const GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const DHW_TILE_PATH = '/api/coral/dhw';

/** `YYYY-MM-DD` for a UTC time in milliseconds. */
export function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC midnight in milliseconds for `YYYY-MM-DD`, or NaN. */
export function dayMs(day) {
  return /^\d{4}-\d\d-\d\d$/.test(day || '')
    ? Date.parse(`${day}T00:00:00Z`)
    : NaN;
}

/**
 * Product catalog. `step` is the native cadence; `playStep` is how many steps
 * one animation frame advances. `endLagDays` keeps the newest date inside the
 * provider's publication delay.
 */
export const NATURE_PRODUCTS = Object.freeze([
  Object.freeze({
    id: 'coral-dhw',
    group: msg('Ocean'),
    label: msg('Coral heat stress (DHW)'),
    measures: msg(
      'Degree Heating Weeks: heat accumulated above the usual warmest month over 12 weeks',
    ),
    caveat: msg(
      'Heat stress on ~5 km pixels, not observed bleaching. Bleaching becomes likely near 4 °C-weeks and severe above 8, but many reefs bleach below 4.',
    ),
    resolution: '5 km · daily',
    source: 'NOAA Coral Reef Watch v3.1 (via PacIOOS ERDDAP)',
    kind: 'erddap-dhw',
    start: '1985-04-01',
    step: 'day',
    playStep: 7,
    endLagDays: 3,
    maximumLevel: 5,
    alpha: 0.85,
    legend: [
      { color: '#ffe6e6', label: '0' },
      { color: '#ff9a9a', label: '4' },
      { color: '#ff3a3a', label: '8' },
      { color: '#b30000', label: '12' },
      { color: '#3a0000', label: '16+' },
    ],
    legendUnits: '°C-weeks',
    stations: true,
  }),
  Object.freeze({
    id: 'sea-temp-anomaly',
    group: msg('Ocean'),
    label: msg('Sea temperature anomaly'),
    measures: msg(
      'Sea surface temperature difference from the long-term average',
    ),
    caveat: msg(
      'Surface temperature only. A warm anomaly in a cool month can be harmless; compare with DHW for reef stress.',
    ),
    resolution: '25 km · daily',
    source: 'NASA GIBS · GHRSST MUR25 (JPL)',
    kind: 'gibs-wmts',
    layer: 'GHRSST_L4_MUR25_Sea_Surface_Temperature_Anomalies',
    matrix: 'GoogleMapsCompatible_Level6',
    format: 'png',
    start: '2002-09-01',
    step: 'day',
    playStep: 7,
    endLagDays: 3,
    maximumLevel: 6,
    alpha: 0.7,
    legend: [
      { color: '#2166ac', label: '−3 °C' },
      { color: '#f7f7f7', label: '0' },
      { color: '#b2182b', label: '+3 °C' },
    ],
    stations: true,
  }),
  Object.freeze({
    id: 'fires',
    group: msg('Land'),
    label: msg('Fire detections'),
    measures: msg(
      'Satellite thermal anomalies (active fires) detected that day',
    ),
    caveat: msg(
      'Each dot is a 375 m pixel with a hot spot, not a mapped fire edge. Cloud and smoke hide fires; gas flares and hot industry can appear.',
    ),
    resolution: '375 m · daily',
    source: 'NASA GIBS · VIIRS S-NPP thermal anomalies (FIRMS)',
    kind: 'gibs-wms',
    layer: 'VIIRS_SNPP_Thermal_Anomalies_375m_All',
    start: '2012-01-20',
    step: 'day',
    playStep: 1,
    endLagDays: 1,
    maximumLevel: 12,
    alpha: 1,
    legend: [{ color: '#f42b2b', label: msg('Fire pixel') }],
  }),
  Object.freeze({
    id: 'forest-disturbance',
    group: msg('Land'),
    label: msg('Vegetation disturbance alerts'),
    measures: msg(
      'Loss of vegetation cover detected by Landsat and Sentinel-2 (OPERA DIST-ALERT)',
    ),
    caveat: msg(
      'Shows that vegetation was lost, not why: clearing, fire, storms and harvest look alike. Only drops of 30 % or more are mapped. 30 m pixels.',
    ),
    resolution: '30 m · daily composite',
    source: 'NASA GIBS · OPERA DIST-ALERT-HLS (JPL / UMD)',
    kind: 'gibs-wmts',
    layer: 'OPERA_L3_DIST-ALERT-HLS_Color_Index',
    matrix: 'GoogleMapsCompatible_Level12',
    format: 'png',
    start: '2023-01-01',
    step: 'day',
    playStep: 7,
    endLagDays: 3,
    maximumLevel: 12,
    alpha: 1,
    // GIBS paints undisturbed land inside each scene dark grey; hide it.
    colorToAlpha: '#121212',
    colorToAlphaThreshold: 0.04,
    legend: [
      {
        color: '#e01b07',
        label: msg('Coloured pixel = vegetation loss detected'),
      },
    ],
  }),
  Object.freeze({
    id: 'vegetation',
    group: msg('Land'),
    label: msg('Vegetation greenness (NDVI)'),
    measures: msg('How green and dense plant cover is, as a 16-day composite'),
    caveat: msg(
      'Greenness, not forest. Crops and plantations look as green as natural forest; seasons change it every year.',
    ),
    resolution: '250 m–1 km · 16-day',
    source: 'NASA GIBS · MODIS Terra NDVI',
    kind: 'gibs-wmts',
    layer: 'MODIS_Terra_L3_NDVI_16Day',
    matrix: 'GoogleMapsCompatible_Level9',
    format: 'png',
    start: '2000-03-05',
    step: '16day',
    playStep: 1,
    endLagDays: 32,
    maximumLevel: 9,
    alpha: 0.75,
    legend: [
      { color: '#c8b48c', label: msg('Bare') },
      { color: '#9cc85a', label: msg('Sparse') },
      { color: '#1e6e1e', label: msg('Dense') },
    ],
  }),
  Object.freeze({
    id: 'land-cover',
    group: msg('Land'),
    label: msg('Land cover (yearly)'),
    measures: msg(
      'Forest, grassland, wetland, cropland, urban and other classes for each year',
    ),
    caveat: msg(
      '500 m pixels; about 3 in 4 pixels are classified correctly. Good for large changes, not single fields.',
    ),
    resolution: '500 m · yearly',
    source: 'NASA GIBS · MODIS MCD12Q1 (IGBP classes)',
    kind: 'gibs-wmts',
    layer: 'MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual',
    matrix: 'GoogleMapsCompatible_Level8',
    format: 'png',
    start: '2001-01-01',
    end: '2024-01-01',
    step: 'year',
    playStep: 1,
    maximumLevel: 8,
    alpha: 0.7,
    // Colours from the GIBS MODIS_IGBP_Land_Cover_Type colormap.
    legend: [
      { color: 'rgb(49,204,49)', label: msg('Tropical forest') },
      { color: 'rgb(33,138,33)', label: msg('Conifer forest') },
      { color: 'rgb(255,213,0)', label: msg('Savanna') },
      { color: 'rgb(240,185,103)', label: msg('Grassland') },
      { color: 'rgb(250,239,115)', label: msg('Cropland') },
      { color: 'rgb(153,147,86)', label: msg('Crop/natural mosaic') },
      { color: 'rgb(71,131,181)', label: msg('Wetland') },
      { color: 'rgb(255,0,0)', label: msg('Urban') },
    ],
  }),
  Object.freeze({
    id: 'mangroves',
    group: msg('Coast'),
    label: msg('Mangrove forests (2000)'),
    measures: msg('Where mangrove forests grew in 2000 (Landsat, 30 m)'),
    caveat: msg(
      'A single 2000 snapshot. Use 3D before/after to see change since.',
    ),
    resolution: '≈1 km on the map (30 m source) · 2000 only',
    source: 'NASA GIBS · Giri et al. Global Mangrove Distribution (SEDAC)',
    kind: 'gibs-wmts',
    layer: 'Mangrove_Forest_Distribution_2000',
    matrix: 'GoogleMapsCompatible_Level7',
    format: 'png',
    static: true,
    start: '2000-01-01',
    end: '2000-01-01',
    step: 'year',
    playStep: 1,
    maximumLevel: 7,
    alpha: 1,
    legend: [{ color: '#2ca02c', label: msg('Mangrove') }],
  }),
]);

export function natureProduct(id) {
  return NATURE_PRODUCTS.find((product) => product.id === id) || null;
}

/** Newest date the product should offer, as `YYYY-MM-DD`. */
export function productEnd(product, now = Date.now(), latestHint = null) {
  if (product.end) return product.end;
  const lagged = isoDay(now - (product.endLagDays ?? 1) * DAY_MS);
  if (latestHint && dayMs(latestHint) < dayMs(lagged)) return latestHint;
  return lagged;
}

/** Every date the product offers, oldest first. */
export function productDates(product, now = Date.now(), latestHint = null) {
  const start = dayMs(product.start);
  const end = dayMs(productEnd(product, now, latestHint));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return [product.start];
  const out = [];
  if (product.step === 'year') {
    const first = new Date(start).getUTCFullYear();
    const last = new Date(end).getUTCFullYear();
    const md = product.start.slice(4);
    for (let year = first; year <= last; year++) out.push(`${year}${md}`);
    return out;
  }
  const stepDays = product.step === '16day' ? 16 : 1;
  if (product.step === '16day') {
    // MODIS 16-day composites restart on 1 January each year.
    const firstYear = new Date(start).getUTCFullYear();
    const lastYear = new Date(end).getUTCFullYear();
    for (let year = firstYear; year <= lastYear; year++) {
      for (let doy = 0; doy < 366; doy += stepDays) {
        const ms = Date.UTC(year, 0, 1) + doy * DAY_MS;
        if (new Date(ms).getUTCFullYear() !== year) break;
        if (ms >= start && ms <= end) out.push(isoDay(ms));
      }
    }
    return out;
  }
  for (let ms = start; ms <= end; ms += DAY_MS) out.push(isoDay(ms));
  return out;
}

const GIBS_DESCRIBE = 'https://gibs.earthdata.nasa.gov/wmts';

/**
 * GIBS DescribeDomains URL listing the dates a product really has. GIBS skips
 * days (sensor outages, reprocessing), and a missing day renders blank.
 */
export function gibsDomainUrl(product) {
  if (product.kind === 'gibs-wmts' && !product.static)
    return `${GIBS_DESCRIBE}/epsg3857/best/1.0.0/${product.layer}/default/${product.matrix}/all/all.xml`;
  if (product.kind === 'gibs-wms')
    return `${GIBS_DESCRIBE}/epsg4326/best/1.0.0/${product.layer}/default/250m/all/all.xml`;
  return null;
}

const MAX_DOMAIN_DATES = 40_000;

/**
 * Expand a GIBS time domain (`start/end/P1D,start/end/P16D,day,...`) into the
 * product's available dates, oldest first, never past `today`.
 */
export function parseGibsDomain(text, today = isoDay(Date.now())) {
  const match = /<Domain>([^<]*)<\/Domain>/.exec(String(text || ''));
  if (!match) return [];
  const limit = dayMs(today);
  const out = new Set();
  for (const part of match[1].split(',')) {
    const [rawStart, rawEnd, period = 'P1D'] = part.trim().split('/');
    const start = dayMs((rawStart || '').slice(0, 10));
    const end = rawEnd ? dayMs(rawEnd.slice(0, 10)) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const years = /^P(\d+)Y$/.exec(period);
    const days = /^P(\d+)D$/.exec(period);
    if (!years && !days) continue;
    for (let ms = start; ms <= Math.min(end, limit);) {
      out.add(isoDay(ms));
      if (out.size > MAX_DOMAIN_DATES) break;
      if (years) {
        const d = new Date(ms);
        ms = Date.UTC(
          d.getUTCFullYear() + Number(years[1]),
          d.getUTCMonth(),
          d.getUTCDate(),
        );
      } else ms += Number(days[1]) * DAY_MS;
    }
  }
  return [...out].sort();
}

/** Index of the date closest to `day` (exact or the nearest earlier one). */
export function nearestDateIndex(dates, day) {
  const target = dayMs(day);
  if (!dates.length || !Number.isFinite(target)) return dates.length - 1;
  let lo = 0;
  let hi = dates.length - 1;
  if (target <= dayMs(dates[0])) return 0;
  if (target >= dayMs(dates[hi])) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dayMs(dates[mid]) <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** GIBS WMTS tile template for a product and date (Web Mercator). */
export function gibsTileTemplate(product, day) {
  const time = product.static ? 'default' : day;
  return `${GIBS_WMTS}/${product.layer}/default/${time}/${product.matrix}/{z}/{y}/{x}.${product.format}`;
}

/** GIBS WMS request parameters for vector products rendered server-side. */
export function gibsWmsOptions(product, day) {
  return {
    url: GIBS_WMS,
    layers: product.layer,
    parameters: {
      service: 'WMS',
      version: '1.1.1',
      format: 'image/png',
      transparent: true,
      styles: '',
      time: day,
    },
  };
}

/**
 * Local proxy URL for one Coral Reef Watch DHW tile. The proxy asks ERDDAP one
 * or two tiles at a time and caches them, because ERDDAP refuses bursts.
 */
export function dhwTileUrl(day, level, x, y) {
  return `${DHW_TILE_PATH}?day=${day}&z=${level}&x=${x}&y=${y}`;
}

/** CRW bleaching alert levels as published by the virtual stations. */
export const CORAL_ALERT_LEVELS = Object.freeze([
  Object.freeze({ level: 0, label: msg('No stress'), color: '#c8e6f5' }),
  Object.freeze({ level: 1, label: msg('Bleaching watch'), color: '#fff200' }),
  Object.freeze({
    level: 2,
    label: msg('Bleaching warning'),
    color: '#faaa0a',
  }),
  Object.freeze({ level: 3, label: msg('Alert level 1'), color: '#ff0000' }),
  Object.freeze({ level: 4, label: msg('Alert level 2'), color: '#960000' }),
  Object.freeze({ level: 5, label: msg('Alert level 3'), color: '#6e0064' }),
  Object.freeze({ level: 6, label: msg('Alert level 4'), color: '#3c0050' }),
  Object.freeze({ level: 7, label: msg('Alert level 5'), color: '#1e0028' }),
]);

export function coralAlert(level) {
  return (
    CORAL_ALERT_LEVELS.find((entry) => entry.level === level) ||
    CORAL_ALERT_LEVELS[0]
  );
}

/**
 * Curated places to explore, each with a product and a date where something
 * notable is visible. Coordinates are approximate area centres.
 */
export const NATURE_PLACES = Object.freeze([
  {
    id: 'gbr-2024',
    name: msg('Great Barrier Reef · 2024 heat stress'),
    product: 'coral-dhw',
    day: '2024-03-15',
    lat: -18.3,
    lon: 147.6,
    height: 900_000,
  },
  {
    id: 'florida-2023',
    name: msg('Florida Keys · 2023 marine heatwave'),
    product: 'coral-dhw',
    day: '2023-09-01',
    lat: 24.6,
    lon: -81.3,
    height: 600_000,
  },
  {
    id: 'red-sea',
    name: msg('Red Sea reefs'),
    product: 'coral-dhw',
    day: null,
    lat: 22.0,
    lon: 38.0,
    height: 1_800_000,
  },
  {
    id: 'black-summer',
    name: msg('Australia · Black Summer fires'),
    product: 'fires',
    day: '2020-01-04',
    lat: -36.0,
    lon: 149.5,
    height: 900_000,
  },
  {
    id: 'canada-2023',
    name: msg('Quebec · 2023 wildfires'),
    product: 'fires',
    day: '2023-06-05',
    lat: 50.5,
    lon: -75.0,
    height: 1_400_000,
  },
  {
    id: 'amazon-2019',
    name: msg('Amazon · August 2019 fires'),
    product: 'fires',
    day: '2019-08-20',
    lat: -9.5,
    lon: -63.5,
    height: 1_500_000,
  },
  {
    id: 'borneo-2015',
    name: msg('Borneo · 2015 peat fires'),
    product: 'fires',
    day: '2015-09-25',
    lat: -2.3,
    lon: 113.5,
    height: 1_000_000,
  },
  {
    id: 'rondonia',
    name: msg('Rondônia, Brazil · forest clearing'),
    product: 'land-cover',
    day: '2001-01-01',
    lat: -10.3,
    lon: -63.0,
    height: 700_000,
  },
  {
    id: 'amazon-alerts',
    name: msg('Southern Amazon · disturbance alerts'),
    product: 'forest-disturbance',
    day: null,
    lat: -9.0,
    lon: -55.5,
    height: 150_000,
  },
  {
    id: 'sundarbans',
    name: msg('Sundarbans mangroves'),
    product: 'mangroves',
    day: null,
    lat: 21.95,
    lon: 89.2,
    height: 250_000,
  },
]);
