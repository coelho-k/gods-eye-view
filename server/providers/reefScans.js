import fsp from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  REEF_SCAN_LODS,
  buildReefScanTileset,
  buildSplatGlb,
  packSpz,
  parseReefScanId,
  parseSplatPly,
  reefScanPlyUrl,
} from '../../src/layers/nature/reefScans.js';
import { readResponseBytesCapped } from './common/http.js';
import { admitSameSiteKeyless } from './common/same-site.js';

/**
 * Underwater coral scans for the nature layer.
 *
 * The Wildflow × Soneva dataset (CC BY 4.0, Hugging Face) publishes Gaussian
 * splats as PLY, which Cesium cannot draw. On first request this proxy
 * downloads one catalogued survey's PLY, converts it to a glTF with SPZ
 * compression (the form Cesium's splat renderer reads), and keeps the result
 * on disk. Later requests are served from disk. Only catalogued surveys and
 * detail levels are ever fetched.
 *
 * Routes (under /api/reef-scans):
 *   /{plot}_{yyyymmdd}/tileset.json
 *   /{plot}_{yyyymmdd}/lod{3|2}.glb
 */

const USER_AGENT = 'Gods Eye View (nature layer, reef scans)';
// lod2 PLYs are about 120–150 MB; lod3 about 30 MB.
const PLY_CAP = 220 * 1024 * 1024;
const ROUTE = /^\/([a-z0-9]{1,12}_\d{8})\/(tileset\.json|lod(\d)\.glb)$/;

/** `{ scanId, file, lod }` for a valid catalogued path, else null. */
export function parseReefScanPath(pathname) {
  const match = ROUTE.exec(pathname);
  if (!match || !parseReefScanId(match[1])) return null;
  if (match[2] === 'tileset.json') return { scanId: match[1], file: 'tileset' };
  const lod = Number(match[3]);
  if (!REEF_SCAN_LODS.includes(lod)) return null;
  return { scanId: match[1], file: 'glb', lod };
}

/** PLY bytes → GLB bytes. */
export function convertReefScan(plyBytes) {
  const packed = packSpz(parseSplatPly(plyBytes));
  return buildSplatGlb({ ...packed, gzippedSpz: gzipSync(packed.spz) });
}

export function reefScansProxy({
  fetchImpl = fetch,
  cacheDir = path.join(process.cwd(), '.gev-cache', 'reef-scans'),
  timeoutMs = 10 * 60_000,
} = {}) {
  const pending = new Map();

  async function download(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Hugging Face answers with a redirect to its file CDN.
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`reef scan HTTP ${response.status}`);
      }
      return await readResponseBytesCapped(
        response,
        PLY_CAP,
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function glb(scanId, lod) {
    const target = path.join(cacheDir, `${scanId}-lod${lod}.glb`);
    try {
      return await fsp.readFile(target);
    } catch {
      /* not converted yet */
    }
    const key = `${scanId}-${lod}`;
    let job = pending.get(key);
    if (!job) {
      job = (async () => {
        const started = Date.now();
        const bytes = Buffer.from(
          convertReefScan(await download(reefScanPlyUrl(scanId, lod))),
        );
        await fsp.mkdir(cacheDir, { recursive: true });
        const temp = `${target}.${process.pid}.tmp`;
        await fsp.writeFile(temp, bytes);
        await fsp.rename(temp, target);
        console.info(
          `[reef-scans] converted ${scanId} lod${lod} (${(bytes.length / 1e6).toFixed(1)} MB) in ${((Date.now() - started) / 1000).toFixed(0)} s`,
        );
        return bytes;
      })().finally(() => pending.delete(key));
      pending.set(key, job);
    }
    return job;
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
    const route = parseReefScanPath(url.pathname);
    if (!route) return json(404, { error: 'not_found' });
    if (route.file === 'tileset')
      return json(200, buildReefScanTileset(route.scanId), 86_400);
    try {
      const bytes = await glb(route.scanId, route.lod);
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(200, {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': bytes.length,
        // A survey never changes once published.
        'Cache-Control': 'private, max-age=604800',
      });
      res.end(bytes);
    } catch (error) {
      console.warn('[reef-scans] failed:', error?.message || error);
      if (!res.headersSent) json(502, { error: 'reef_scan_unavailable' });
    }
  }

  return {
    name: 'reef-scans',
    configureServer({ middlewares }) {
      middlewares.use('/api/reef-scans', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/reef-scans', handler);
    },
  };
}
