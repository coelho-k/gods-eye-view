import {
  readResponseTextCapped,
  readResponseBytesCapped,
} from './common/http.js';
import { admitSameSiteKeyless } from './common/same-site.js';

/**
 * Keyless proxy for NOAA Coral Reef Watch (CRW) 5 km Regional Virtual Stations.
 *
 * CRW publishes one GeoJSON with the latest reading for every station and one
 * daily text time series per station (1985 to present). Neither sends CORS
 * headers, so the browser cannot read them directly. This proxy fetches them,
 * keeps a small in-memory cache, and returns compact JSON.
 *
 * Stations are regional averages over 5 km satellite pixels. Their values are
 * heat stress (Degree Heating Weeks, alert level), not observed bleaching.
 */

const BASE = 'https://coralreefwatch.noaa.gov/product/vs';
const STATIONS_URL = `${BASE}/vs_polygons.json`;
const SERIES_URL = (slug) => `${BASE}/data/${slug}.txt`;
const HOUR = 3600_000;
const STATIONS_TTL_MS = 6 * HOUR;
const SERIES_TTL_MS = 12 * HOUR;
const RETRY_AFTER_FAILURE_MS = 60_000;
const STATIONS_CAP = 12 * 1024 * 1024;
const SERIES_CAP = 4 * 1024 * 1024;
const SERIES_CACHE_LIMIT = 64;
const SLUG = /^[a-z0-9_]{1,64}$/;
const USER_AGENT = 'Gods Eye View (NOAA Coral Reef Watch context)';

// Daily 5 km Degree Heating Weeks as PNG tiles, rendered by PacIOOS ERDDAP.
const ERDDAP_DHW =
  'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.transparentPng';
const CRW_CELL = 0.05;
const CRW_FIRST_LON = -179.975;
const CRW_FIRST_LAT = 89.975;
const CRW_COLUMNS = 7200;
const CRW_ROWS = 3600;
const DHW_START = '1985-04-01';
export const DHW_MAX_LEVEL = 5;
const TILE_SIZE = 256;
const TILE_CAP = 2 * 1024 * 1024;
const TILE_CACHE_LIMIT = 600;
// ERDDAP answers 429 "make just one request at a time" to bursts.
const TILE_CONCURRENCY = 2;
const TILE_RETRY_DELAYS_MS = [400, 1200, 3000];
const DAY = /^\d{4}-\d\d-\d\d$/;

/**
 * Grid-aligned ERDDAP request for one Cesium geographic tile (2 x 1 tiles at
 * level 0). Both ends of each axis land on real 0.05° cell centres a whole
 * number of strides apart, so the image has no empty edge row or column.
 */
export function erddapDhwTileUrl({ day, level, x, y }) {
  const span = 180 / 2 ** level;
  const west = -180 + x * span;
  const north = 90 - y * span;
  const cells = span / CRW_CELL;
  const stride = Math.max(1, Math.floor(cells / TILE_SIZE));
  const axis = (from, count, limit) => {
    const first = Math.max(0, Math.ceil(from - 1e-6));
    let last = Math.min(limit - 1, Math.floor(from + count - 1 + 1e-6));
    last = first + stride * Math.floor((last - first) / stride);
    return [first, last];
  };
  const [c0, c1] = axis((west - CRW_FIRST_LON) / CRW_CELL, cells, CRW_COLUMNS);
  const [r0, r1] = axis((CRW_FIRST_LAT - north) / CRW_CELL, cells, CRW_ROWS);
  const lon = (i) => (CRW_FIRST_LON + i * CRW_CELL).toFixed(3);
  const lat = (i) => (CRW_FIRST_LAT - i * CRW_CELL).toFixed(3);
  const query =
    `CRW_DHW[(${day}T12:00:00Z)]` +
    `[(${lat(r0)}):${stride}:(${lat(r1)})]` +
    `[(${lon(c0)}):${stride}:(${lon(c1)})]`;
  return (
    `${ERDDAP_DHW}?${encodeURIComponent(query)}` +
    '&.draw=surface&.vars=longitude%7Clatitude%7CCRW_DHW' +
    '&.colorBar=WhiteRedBlack%7CC%7CLinear%7C0%7C20%7C' +
    `&.size=${TILE_SIZE}%7C${TILE_SIZE}`
  );
}

/** Validate a DHW tile request; returns the parts or null. */
export function parseDhwTileQuery(params, today) {
  const day = params.get('day') || '';
  const level = Number(params.get('z'));
  const x = Number(params.get('x'));
  const y = Number(params.get('y'));
  if (!DAY.test(day) || day < DHW_START || day > today) return null;
  if (!Number.isInteger(level) || level < 0 || level > DHW_MAX_LEVEL)
    return null;
  if (!Number.isInteger(x) || x < 0 || x >= 2 ** (level + 1)) return null;
  if (!Number.isInteger(y) || y < 0 || y >= 2 ** level) return null;
  return { day, level, x, y };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function finite(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function cleanText(value, max = 120) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f<>]/g, '').trim();
  return text && text.length <= max ? text : null;
}

/** Turn CRW's station GeoJSON into compact, validated station records. */
export function parseCoralStations(payload) {
  if (!Array.isArray(payload?.features)) throw new Error('invalid_coral_data');
  const seen = new Set();
  const stations = [];
  for (const feature of payload.features) {
    if (feature?.geometry?.type !== 'Point') continue;
    const [lon, lat] = feature.geometry.coordinates || [];
    if (finite(lon, -180, 180) === null || finite(lat, -90, 90) === null)
      continue;
    const p = feature.properties || {};
    const slug =
      typeof p.gauge_page === 'string'
        ? p.gauge_page.replace(/\.php$/, '')
        : '';
    const name = cleanText(p.name);
    if (!SLUG.test(slug) || !name || seen.has(slug)) continue;
    seen.add(slug);
    const region =
      typeof p.ts_fig === 'string' ? p.ts_fig.split('.php')[0] : '';
    stations.push({
      id: slug,
      name,
      lat,
      lon,
      region: SLUG.test(region) ? region : null,
      date: /^\d{4}-\d\d-\d\d$/.test(p.date) ? p.date : null,
      sst: finite(p.sst, -5, 45),
      ssta: finite(p.ssta, -20, 20),
      hotspot: finite(p.hs, 0, 30),
      dhw: finite(p.dhw, 0, 100),
      alert: finite(p.alert, 0, 7),
    });
  }
  if (!stations.length) throw new Error('invalid_coral_data');
  stations.sort((a, b) => a.name.localeCompare(b.name));
  return stations;
}

/**
 * Parse one CRW virtual-station text file into column arrays.
 * Columns: YYYY MM DD SST_MIN SST_MAX SST@90th_HS SSTA@90th_HS 90th_HS>0
 * DHW_from_90th_HS>1 BAA_7day_max.
 */
export function parseCoralSeries(text) {
  if (typeof text !== 'string') throw new Error('invalid_coral_series');
  const lines = text.split(/\r?\n/);
  const field = (label) => {
    const index = lines.findIndex((line) => line.trim() === `${label}:`);
    return index >= 0 ? (lines[index + 1] || '').trim() : '';
  };
  const mmm = finite(field('Averaged Maximum Monthly Mean'), -5, 45);
  const monthly = field('Averaged Monthly Mean (Jan-Dec)')
    .split(/\s+/)
    .map((v) => finite(v, -5, 45));
  const dates = [];
  const sst = [];
  const ssta = [];
  const dhw = [];
  const alert = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10 || !/^\d{4}$/.test(parts[0])) continue;
    const [y, m, d] = parts;
    if (!/^\d\d$/.test(m) || !/^\d\d$/.test(d)) continue;
    dates.push(`${y}-${m}-${d}`);
    sst.push(finite(parts[5], -5, 45));
    ssta.push(finite(parts[6], -20, 20));
    dhw.push(finite(parts[8], 0, 100));
    alert.push(finite(parts[9], 0, 7));
  }
  if (!dates.length) throw new Error('invalid_coral_series');
  return {
    maximumMonthlyMean: mmm,
    monthlyMeans: monthly.length === 12 ? monthly : null,
    dates,
    sst,
    ssta,
    dhw,
    alert,
  };
}

export function coralReefWatchProxy({
  fetchImpl = fetch,
  now = () => Date.now(),
  timeoutMs = 20_000,
} = {}) {
  let stations = null;
  let stationsPending = null;
  let stationsFailedAt = -Infinity;
  const series = new Map();
  const seriesPending = new Map();
  const tiles = new Map();
  const tilesPending = new Map();
  const tileQueue = [];
  let tilesActive = 0;

  function pumpTiles() {
    while (tilesActive < TILE_CONCURRENCY && tileQueue.length) {
      const job = tileQueue.shift();
      // The browser gave up on this tile (a newer date replaced it).
      if (job.isAbandoned()) {
        job.reject(new Error('coral_tile_abandoned'));
        continue;
      }
      tilesActive++;
      job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          tilesActive--;
          pumpTiles();
        });
    }
  }

  async function fetchTileOnce(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: 'error',
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error('coral_tile_unavailable');
        error.status = response.status;
        throw error;
      }
      return await readResponseBytesCapped(
        response,
        TILE_CAP,
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTile(url) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchTileOnce(url);
      } catch (error) {
        const retryable = error?.status === 429 || error?.status >= 500;
        if (!retryable || attempt >= TILE_RETRY_DELAYS_MS.length) throw error;
        await sleep(TILE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  function getTile(tile, isAbandoned) {
    const key = `${tile.day}/${tile.level}/${tile.x}/${tile.y}`;
    const cached = tiles.get(key);
    if (cached) {
      tiles.delete(key);
      tiles.set(key, cached);
      return Promise.resolve(cached);
    }
    if (!tilesPending.has(key)) {
      const pending = new Promise((resolve, reject) => {
        tileQueue.push({
          run: () => fetchTile(erddapDhwTileUrl(tile)),
          resolve,
          reject,
          isAbandoned,
        });
        pumpTiles();
      })
        .then((bytes) => {
          tiles.set(key, bytes);
          while (tiles.size > TILE_CACHE_LIMIT)
            tiles.delete(tiles.keys().next().value);
          return bytes;
        })
        .finally(() => tilesPending.delete(key));
      tilesPending.set(key, pending);
    }
    return tilesPending.get(key);
  }

  async function fetchText(url, cap) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: 'error',
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('coral_upstream_unavailable');
      }
      return await readResponseTextCapped(response, cap, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async function getStations() {
    if (stations && now() - stations.fetchedAt < STATIONS_TTL_MS)
      return stations;
    if (!stationsPending) {
      if (!stations && now() - stationsFailedAt < RETRY_AFTER_FAILURE_MS)
        throw new Error('coral_retry_later');
      stationsPending = fetchText(STATIONS_URL, STATIONS_CAP)
        .then((text) => {
          stations = {
            list: parseCoralStations(JSON.parse(text)),
            fetchedAt: now(),
          };
          return stations;
        })
        .catch((error) => {
          stationsFailedAt = now();
          // Serve the stale copy when one exists.
          if (stations) return { ...stations, stale: true };
          throw error;
        })
        .finally(() => {
          stationsPending = null;
        });
    }
    return stationsPending;
  }

  async function getSeries(slug) {
    const cached = series.get(slug);
    if (cached && now() - cached.fetchedAt < SERIES_TTL_MS) return cached;
    if (!seriesPending.has(slug)) {
      const pending = fetchText(SERIES_URL(slug), SERIES_CAP)
        .then((text) => {
          const value = { ...parseCoralSeries(text), fetchedAt: now() };
          series.delete(slug);
          series.set(slug, value);
          while (series.size > SERIES_CACHE_LIMIT)
            series.delete(series.keys().next().value);
          return value;
        })
        .catch((error) => {
          if (cached) return { ...cached, stale: true };
          throw error;
        })
        .finally(() => seriesPending.delete(slug));
      seriesPending.set(slug, pending);
    }
    return seriesPending.get(slug);
  }

  async function handler(req, res) {
    const json = (status, value, maxAge = 0) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': maxAge ? `private, max-age=${maxAge}` : 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    if (admitSameSiteKeyless(req, res)) return;
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const url = new URL(req.url || '/', 'http://local');
    if (url.pathname === '/dhw' || url.pathname === '/dhw/') {
      const today = new Date(now()).toISOString().slice(0, 10);
      const tile = parseDhwTileQuery(url.searchParams, today);
      if (!tile) return json(400, { error: 'invalid_tile' });
      let closed = false;
      res.on('close', () => {
        closed = !res.writableEnded;
      });
      try {
        const bytes = await getTile(tile, () => closed);
        if (closed) return;
        // Past days never change; the newest few can still be reprocessed.
        const settled =
          Date.parse(today) - Date.parse(tile.day) > 7 * 86_400_000;
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': `private, max-age=${settled ? 7 * 86_400 : 3600}`,
        });
        res.end(Buffer.from(bytes));
      } catch (error) {
        if (closed) return;
        if (error?.message !== 'coral_tile_abandoned')
          console.warn('[coral] DHW tile failed:', error?.message || error);
        json(502, { error: 'coral_tile_unavailable' });
      }
      return;
    }
    try {
      if (url.pathname === '/stations' || url.pathname === '/stations/') {
        const value = await getStations();
        return json(
          200,
          {
            schemaVersion: 1,
            source: 'NOAA Coral Reef Watch',
            fetchedAt: value.fetchedAt,
            stale: Boolean(value.stale),
            stations: value.list,
          },
          600,
        );
      }
      if (url.pathname === '/series' || url.pathname === '/series/') {
        const slug = url.searchParams.get('id') || '';
        if (!SLUG.test(slug)) return json(400, { error: 'invalid_station' });
        // Only stations CRW lists are fetched: the id never builds an
        // arbitrary upstream path.
        const known = await getStations();
        const station = known.list.find((entry) => entry.id === slug);
        if (!station) return json(404, { error: 'unknown_station' });
        const value = await getSeries(slug);
        return json(
          200,
          {
            schemaVersion: 1,
            id: slug,
            name: station.name,
            source: 'NOAA Coral Reef Watch',
            fetchedAt: value.fetchedAt,
            stale: Boolean(value.stale),
            maximumMonthlyMean: value.maximumMonthlyMean,
            monthlyMeans: value.monthlyMeans,
            dates: value.dates,
            sst: value.sst,
            ssta: value.ssta,
            dhw: value.dhw,
            alert: value.alert,
          },
          3600,
        );
      }
      return json(404, { error: 'not_found' });
    } catch (error) {
      console.warn('[coral] upstream failed:', error?.message || error);
      return json(502, { error: 'coral_unavailable' });
    }
  }

  return {
    name: 'coral-reef-watch',
    configureServer({ middlewares }) {
      middlewares.use('/api/coral', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/coral', handler);
    },
  };
}
