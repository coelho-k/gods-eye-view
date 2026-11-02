/**
 * 3D before/after for nature places: two dated imagery sources draped on the
 * terrain with a swipe divider, the way the Nepal flood scene compares its
 * before and after images. Pure data and URL builders, testable in Node.
 *
 * Sources:
 * - Sentinel-2 cloudless (EOX): one cloud-free 10 m mosaic per year. The date
 *   is a year, not a day, because each pixel comes from the clearest scene.
 * - Esri World Imagery Wayback: dated releases of Esri's sub-metre imagery.
 *   A release date is when Esri published it; the capture date comes from
 *   Wayback's metadata service for the spot you are looking at.
 */

import { msg } from '../../i18n/marker.js';

export const S2_CLOUDLESS_YEARS = Object.freeze([
  2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
]);
const EOX_WMTS = 'https://tiles.maps.eox.at/wmts/1.0.0';
const WAYBACK_TILES =
  'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile';
export const WAYBACK_CONFIG_URL =
  'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
const WAYBACK_METADATA_HOST = 'https://metadata.maptiles.arcgis.com/';

export const DEFAULT_COMPARE = Object.freeze({
  before: 's2:2018',
  after: `s2:${S2_CLOUDLESS_YEARS.at(-1)}`,
});

/** EOX Sentinel-2 cloudless WMTS template for one year (Web Mercator). */
export function s2CloudlessTemplate(year) {
  const layer = year === 2016 ? 's2cloudless_3857' : `s2cloudless-${year}_3857`;
  return `${EOX_WMTS}/${layer}/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`;
}

/** Credit text EOX asks for; 2016 is CC BY 4.0, later years CC BY-NC-SA 4.0. */
export function s2CloudlessCredit(year) {
  const licence = year === 2016 ? 'CC BY 4.0' : 'CC BY-NC-SA 4.0';
  return `Sentinel-2 cloudless ${year} – s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data ${year}) · ${licence}`;
}

export function waybackTemplate(releaseId) {
  return `${WAYBACK_TILES}/${releaseId}/{z}/{y}/{x}`;
}

/**
 * Wayback's release list as `[{ id, date, metadataUrl }]`, oldest first.
 * Only numeric ids, ISO dates and metadata URLs on Esri's host survive.
 */
export function parseWaybackConfig(config) {
  if (!config || typeof config !== 'object') return [];
  const out = [];
  for (const [key, value] of Object.entries(config)) {
    const id = Number(key);
    const date = /Wayback (\d{4}-\d\d-\d\d)\)/.exec(value?.itemTitle || '');
    const metadataUrl =
      typeof value?.metadataLayerUrl === 'string' &&
      value.metadataLayerUrl.startsWith(WAYBACK_METADATA_HOST)
        ? value.metadataLayerUrl
        : null;
    if (!Number.isInteger(id) || id < 0 || !date) continue;
    out.push({ id, date: date[1], metadataUrl });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Early releases are often hazy, low-contrast composites; offer 2017 onward.
const WAYBACK_FIRST_YEAR = '2017';

/** The newest Wayback release of each year from 2017, oldest year first. */
export function waybackPerYear(releases) {
  const byYear = new Map();
  for (const release of releases)
    if (release.date >= WAYBACK_FIRST_YEAR)
      byYear.set(release.date.slice(0, 4), release);
  return [...byYear.values()];
}

/**
 * Describe a compare source key (`s2:2018`, `wb:43291`). Returns null for an
 * unknown key, so a stale or hand-edited key never builds a URL.
 */
export function compareSource(key, releases = []) {
  const [kind, value] = String(key || '').split(':');
  if (kind === 's2') {
    const year = Number(value);
    if (!S2_CLOUDLESS_YEARS.includes(year)) return null;
    return {
      key,
      kind: 's2',
      short: String(year),
      url: s2CloudlessTemplate(year),
      maximumLevel: 15,
      credit: s2CloudlessCredit(year),
    };
  }
  if (kind === 'wb') {
    const release = releases.find((entry) => entry.id === Number(value));
    if (!release) return null;
    return {
      key,
      kind: 'wb',
      short: release.date,
      url: waybackTemplate(release.id),
      maximumLevel: 19,
      credit: `Esri World Imagery Wayback ${release.date} · Esri, Maxar, Earthstar Geographics`,
      release,
    };
  }
  return null;
}

/** Metadata identify URL for the capture date under one point. */
export function waybackIdentifyUrl(metadataUrl, lat, lon) {
  const box = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05]
    .map((v) => v.toFixed(5))
    .join(',');
  const params = new URLSearchParams({
    geometry: `${lon.toFixed(5)},${lat.toFixed(5)}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'all',
    tolerance: '1',
    mapExtent: box,
    imageDisplay: '800,600,96',
    returnGeometry: 'false',
    f: 'json',
  });
  return `${metadataUrl}/identify?${params}`;
}

/**
 * The sharpest capture under the point: `{ date, provider, metres }` or null.
 * Wayback lists one record per resolution band; the finest one is drawn when
 * zoomed in, so it is the one worth naming.
 */
export function parseWaybackCapture(body) {
  let best = null;
  for (const result of body?.results || []) {
    const a = result?.attributes || {};
    const raw = String(a.SRC_DATE || '');
    if (!/^\d{8}$/.test(raw)) continue;
    const metres = Number(a.SRC_RES);
    const capture = {
      date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
      provider: String(a.NICE_DESC || a.NICE_NAME || '').slice(0, 60),
      metres: Number.isFinite(metres) ? metres : null,
    };
    if (!best || (capture.metres ?? 99) < (best.metres ?? 99)) best = capture;
  }
  return best;
}

/**
 * Curated places to fly into in 3D, each checked by eye for a visible change
 * between its two sources. `kind: 'imagery'` swipes two imagery sources;
 * `kind: 'map'` swipes one nature map on two dates. The camera looks across
 * the terrain (low pitch) rather than straight down.
 */
export const COMPARE_PLACES = Object.freeze([
  Object.freeze({
    id: 'jasper-2024',
    name: msg('Jasper National Park · 2024 wildfire'),
    kind: 'imagery',
    before: 's2:2023',
    after: 's2:2025',
    lat: 52.83,
    lon: -118.04,
    groundM: 1_100,
    headingDeg: 160,
    pitchDeg: -26,
    rangeM: 26_000,
    note: msg(
      'The July 2024 fire burned forest along the valley and into the town. Brown is burned forest.',
    ),
  }),
  Object.freeze({
    id: 'jasper-2024-hd',
    name: msg('Jasper town · 2024 wildfire in sharp imagery'),
    kind: 'imagery',
    // Esri releases whose capture under Jasper is 2022-09-21 and 2024-08-02
    // (0.46 m), checked against Wayback metadata.
    before: 'wb:64776',
    after: 'wb:43291',
    lat: 52.866,
    lon: -118.088,
    groundM: 1_060,
    headingDeg: 315,
    pitchDeg: -35,
    rangeM: 3_800,
    note: msg(
      'Sub-metre images from 2022 and from August 2024, a week after the fire. Zoom in to see single trees and burned houses.',
    ),
  }),
  Object.freeze({
    id: 'kangaroo-island-2020',
    name: msg('Kangaroo Island · Black Summer fire'),
    kind: 'imagery',
    before: 's2:2018',
    after: 's2:2020',
    lat: -35.93,
    lon: 136.75,
    headingDeg: 300,
    pitchDeg: -30,
    rangeM: 38_000,
    note: msg(
      'Fires in December 2019 and January 2020 burned about half the island, including most of Flinders Chase National Park.',
    ),
  }),
  Object.freeze({
    id: 'rondonia-frontier',
    name: msg('Amazon frontier, Rondônia · forest clearing'),
    kind: 'imagery',
    before: 's2:2018',
    after: 's2:2025',
    lat: -9.6,
    lon: -64.6,
    headingDeg: 20,
    pitchDeg: -35,
    rangeM: 45_000,
    note: msg(
      'Dark green is standing forest; lighter rectangles are cleared land, mostly for pasture.',
    ),
  }),
  Object.freeze({
    id: 'hooghly-mangroves',
    name: msg('Hooghly estuary · growing and eroding islands'),
    kind: 'imagery',
    before: 's2:2016',
    after: 's2:2025',
    lat: 21.905,
    lon: 88.125,
    headingDeg: 10,
    pitchDeg: -40,
    rangeM: 14_000,
    note: msg(
      'The mangrove island on the right has grown north and a new bank has formed beside it, while Ghoramara island in the middle keeps losing its shore.',
    ),
  }),
  Object.freeze({
    id: 'gbr-heat-2021-2024',
    name: msg('Great Barrier Reef · heat stress 2021 vs 2024'),
    kind: 'map',
    product: 'coral-dhw',
    before: '2021-03-15',
    after: '2024-03-15',
    lat: -17.5,
    lon: 147.2,
    headingDeg: 40,
    pitchDeg: -40,
    rangeM: 700_000,
    note: msg(
      'Same day of the year: a calm 2021 against the 2024 mass bleaching. Reefs sit at sea level, so the 3D comes from the camera angle, not the ground.',
    ),
  }),
]);

export function comparePlace(id) {
  return COMPARE_PLACES.find((place) => place.id === id) || null;
}
