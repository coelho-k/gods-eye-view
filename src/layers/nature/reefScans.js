/**
 * Underwater 3D coral scans: repeat Gaussian-splat surveys of fixed reef plots,
 * so the same coral can be compared across dates.
 *
 * Data: Wildflow × Soneva "Coral Reef Time-Series Photogrammetry" (Maldives,
 * Baa Atoll), CC BY 4.0, https://huggingface.co/datasets/wildflow/soneva-corals.
 * Each survey ships 3D Gaussian splats as binary PLY at five detail levels
 * (lod0 sharpest … lod4 coarsest). The PLY frame is metres, z up, with z = 0
 * near the sea surface; all surveys of a plot share one frame (checked: height
 * maps of every pair of dates agree to 2–5 cm with no shift).
 *
 * Cesium draws splats only from glTF with KHR_gaussian_splatting and SPZ
 * compression, so this module turns a PLY into that form. Pure functions, no
 * Node or browser APIs: the server gzips the SPZ bytes and caches the result.
 */

import { msg } from '../../i18n/marker.js';

export const REEF_SCAN_SOURCE = Object.freeze({
  name: 'Wildflow × Soneva coral time series',
  url: 'https://huggingface.co/datasets/wildflow/soneva-corals',
  licence: 'CC BY 4.0',
});
const HF_BASE =
  'https://huggingface.co/datasets/wildflow/soneva-corals/resolve/main';

/** Detail levels served: 3 (≈120k splats) loads fast, 2 (≈500k) is sharp. */
export const REEF_SCAN_LODS = Object.freeze([3, 2]);

/**
 * Plots with a usable GPS corner. Plot OOTB R is left out: its recorded corner
 * has latitude and longitude both 5.116, which puts it in Somalia.
 * `anchor` is the scan-frame point placed on the GPS corner (the south-west
 * corner of the first survey's map); the corner was taken by GPS at the
 * surface, so the plot's position is good to a few metres and its heading is
 * assumed north-up. `centre` is the median splat position of the first survey
 * (scan frame, metres; z is depth below the surface).
 */
export const REEF_SCAN_PLOTS = Object.freeze(
  [
    {
      id: 'hb',
      name: msg('Host Beach reef flat'),
      habitat: msg('Shallow reef flat, about 2 m deep'),
      lat: 5.115958861964,
      lon: 73.075207311707,
      anchor: [-3.008, -5.177],
      centre: [0.54, -1.54, -2.17],
      dates: ['2025-07-10', '2025-07-28', '2025-10-29', '2026-03-04'],
    },
    {
      id: 'ootbm',
      name: msg('Outer reef crest'),
      habitat: msg('Reef crest, about 4 m deep'),
      lat: 5.1150760326,
      lon: 73.07076428,
      anchor: [-3.368, -6.057],
      centre: [1.22, -2.48, -4.01],
      dates: ['2025-06-24', '2025-07-03', '2025-10-07'],
    },
    {
      id: 'ootsl1',
      name: msg('Outer slope outcrop'),
      habitat: msg('Reef slope, about 7 m deep'),
      lat: 5.109798729,
      lon: 73.076965777,
      anchor: [-3.837, -7.499],
      centre: [0.74, -2.6, -6.8],
      dates: ['2025-06-02', '2025-06-20', '2025-10-07', '2026-02-18'],
    },
    {
      id: 'ootsr2',
      name: msg('Flat above the cave'),
      habitat: msg('Reef flat on the slope, about 4 m deep'),
      lat: 5.110743804,
      lon: 73.074834262,
      anchor: [-4.071, -7.295],
      centre: [0.27, -3.18, -3.77],
      dates: ['2025-07-02', '2025-07-04', '2025-10-08', '2026-03-03'],
    },
    {
      id: 'ootsr3',
      name: msg('Sloping gully'),
      habitat: msg('Gully on the slope, about 10 m deep'),
      lat: 5.110664687,
      lon: 73.07502025595,
      anchor: [-7.142, -2.141],
      centre: [-2.07, 1.48, -9.93],
      dates: ['2025-07-03', '2025-07-04', '2025-10-08', '2026-03-03'],
    },
  ].map((plot) => Object.freeze({ ...plot, dates: Object.freeze(plot.dates) })),
);

export function reefScanPlot(id) {
  return REEF_SCAN_PLOTS.find((plot) => plot.id === id) || null;
}

/** `hb_20250710` → `{ plot, date }`, or null unless both are catalogued. */
export function parseReefScanId(scanId) {
  const match = /^([a-z0-9]{1,12})_(\d{4})(\d\d)(\d\d)$/.exec(String(scanId));
  if (!match) return null;
  const plot = reefScanPlot(match[1]);
  const date = `${match[2]}-${match[3]}-${match[4]}`;
  if (!plot || !plot.dates.includes(date)) return null;
  return { plot, date };
}

export function reefScanId(plotId, date) {
  return `${plotId}_${date.replaceAll('-', '')}`;
}

export function reefScanPlyUrl(scanId, lod) {
  return `${HF_BASE}/maldives_soneva_${scanId}/splats/ply/lod${lod}.ply`;
}

/** Browser URL of a scan's tileset (served by the reef-scans proxy). */
export function reefScanTilesetUrl(scanId) {
  return `/api/reef-scans/${scanId}/tileset.json`;
}

// ---------------------------------------------------------- camera -----

export const DIVE_RANGE_M = 7;

/**
 * Orbit pitch (radians, negative) that puts the camera halfway between the
 * reef and the surface at `rangeM` from the reef centre.
 */
export function divePitch(depthM, rangeM = DIVE_RANGE_M) {
  const rise = Math.max(0.5, depthM * 0.5);
  const sine = Math.min(0.8, Math.max(0.1, rise / rangeM));
  return -Math.asin(sine);
}

/**
 * Local sea level on Cesium's ellipsoid from terrain samples around a plot.
 * Water is the lowest surface nearby (land and reef tops sit above it), so the
 * lowest finite sample wins. Returns null when nothing usable came back.
 */
export function seaLevelFromSamples(heights) {
  const finite = heights.filter((h) => Number.isFinite(h));
  return finite.length ? Math.min(...finite) : null;
}

// ---------------------------------------------------------------- PLY -----

const MAX_SPLATS = 2_000_000;

/**
 * Read a 3D Gaussian splat PLY (binary little-endian, float properties only).
 * Returns `{ count, props, stride, data, col }` or throws on anything else.
 */
export function parseSplatPly(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const limit = Math.min(u8.length, 16_384);
  let end = -1;
  const marker = 'end_header\n';
  outer: for (let i = 0; i < limit - marker.length; i++) {
    for (let j = 0; j < marker.length; j++)
      if (u8[i + j] !== marker.charCodeAt(j)) continue outer;
    end = i + marker.length;
    break;
  }
  if (end < 0) throw new Error('ply_no_header');
  const header = new TextDecoder('latin1').decode(u8.subarray(0, end));
  const lines = header.split('\n').map((line) => line.trim());
  if (lines[0] !== 'ply') throw new Error('ply_bad_magic');
  if (!lines.includes('format binary_little_endian 1.0'))
    throw new Error('ply_not_binary_le');
  let count = 0;
  let inVertex = false;
  const props = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts[0] === 'element') {
      inVertex = parts[1] === 'vertex';
      if (inVertex) count = Number(parts[2]);
      else if (Number(parts[2]) > 0) throw new Error('ply_extra_element');
    } else if (parts[0] === 'property' && inVertex) {
      if (parts[1] !== 'float') throw new Error('ply_non_float');
      props.push(parts[2]);
    }
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_SPLATS)
    throw new Error('ply_bad_count');
  const required = ['x', 'y', 'z', 'opacity'];
  for (let i = 0; i < 3; i++)
    required.push(`scale_${i}`, `f_dc_${i}`, `rot_${i}`);
  required.push('rot_3');
  for (const name of required)
    if (!props.includes(name)) throw new Error(`ply_missing_${name}`);
  const stride = props.length;
  const byteLength = count * stride * 4;
  if (u8.length - end < byteLength) throw new Error('ply_truncated');
  // Copy so the floats are 4-byte aligned whatever the header length was.
  // (Node's Buffer#slice returns a view, so copy through Uint8Array.)
  const copy = new Uint8Array(byteLength);
  copy.set(u8.subarray(end, end + byteLength));
  const data = new Float32Array(copy.buffer);
  return { count, props, stride, data, col: (name) => props.indexOf(name) };
}

// ---------------------------------------------------------------- SPZ -----

const toByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const SPZ_MAGIC = 0x5053474e;
const SPZ_VERSION = 2;
// 12 fractional bits: 0.24 mm steps, ±2 km range; plenty for a reef plot.
const SPZ_FRACTIONAL_BITS = 12;
const SPZ_COLOR_SCALE = 0.15;

// Some published splats carry garbage positions (around -6.5e37 m); anything
// this far from the plot origin is dropped.
const MAX_OFFSET_M = 500;

/**
 * Pack a parsed PLY as uncompressed SPZ v2 (the caller gzips it). View-
 * dependent colour (spherical harmonics) is dropped: it is most of the file
 * and adds little under water. Splats with non-finite values or positions far
 * outside the plot are skipped. Also returns the position bounds.
 */
export function packSpz(ply) {
  const { stride, data } = ply;
  const at = (name) => ply.col(name);
  const pos = ['x', 'y', 'z'].map(at);
  const scale = [0, 1, 2].map((i) => at(`scale_${i}`));
  const dc = [0, 1, 2].map((i) => at(`f_dc_${i}`));
  const opacity = at('opacity');
  const rot = [0, 1, 2, 3].map((i) => at(`rot_${i}`));
  const used = [...pos, ...scale, ...dc, opacity, ...rot];
  const keep = [];
  for (let i = 0; i < ply.count; i++) {
    const base = i * stride;
    let ok = true;
    for (const k of used) if (!Number.isFinite(data[base + k])) ok = false;
    for (const k of pos)
      if (Math.abs(data[base + k]) > MAX_OFFSET_M) ok = false;
    if (ok) keep.push(base);
  }
  const n = keep.length;
  if (!n) throw new Error('ply_no_valid_splats');
  const out = new Uint8Array(16 + n * 19);
  const view = new DataView(out.buffer);
  view.setUint32(0, SPZ_MAGIC, true);
  view.setUint32(4, SPZ_VERSION, true);
  view.setUint32(8, n, true);
  out[12] = 0; // SH degree
  out[13] = SPZ_FRACTIONAL_BITS;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const fixed = 1 << SPZ_FRACTIONAL_BITS;
  let o = 16;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const value = data[keep[i] + pos[k]];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
      const q = Math.round(value * fixed);
      out[o++] = q & 0xff;
      out[o++] = (q >> 8) & 0xff;
      out[o++] = (q >> 16) & 0xff;
    }
  }
  for (let i = 0; i < n; i++)
    out[o++] = toByte(255 / (1 + Math.exp(-data[keep[i] + opacity])));
  for (let i = 0; i < n; i++)
    for (const k of dc)
      out[o++] = toByte(data[keep[i] + k] * SPZ_COLOR_SCALE * 255 + 127.5);
  for (let i = 0; i < n; i++)
    for (const k of scale) out[o++] = toByte((data[keep[i] + k] + 10) * 16);
  for (let i = 0; i < n; i++) {
    // PLY stores w first; SPZ v2 stores x, y, z of a unit quaternion with w ≥ 0.
    let [w, x, y, z] = rot.map((k) => data[keep[i] + k]);
    const length = Math.hypot(w, x, y, z) || 1;
    const sign = w < 0 ? -1 : 1;
    w /= length;
    x = (sign * x) / length;
    y = (sign * y) / length;
    z = (sign * z) / length;
    out[o++] = toByte(x * 127.5 + 127.5);
    out[o++] = toByte(y * 127.5 + 127.5);
    out[o++] = toByte(z * 127.5 + 127.5);
  }
  return { spz: out, count: n, min, max };
}

// ---------------------------------------------------------------- glTF ----

// Cesium turns splats from glTF's Y-up into Z-up. The node matrix undoes that
// (a −90° turn about X), so scan x, y, z land on the tile's east, north, up.
const UNDO_Y_UP = Object.freeze([
  1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1,
]);
const SPLAT_EXTENSIONS = Object.freeze([
  'KHR_gaussian_splatting',
  'KHR_gaussian_splatting_compression_spz_2',
]);

/** A GLB holding one gzipped SPZ splat cloud. */
export function buildSplatGlb({ gzippedSpz, count, min, max }) {
  const gltf = {
    asset: { version: '2.0', generator: 'gods-eye-view reef scans' },
    extensionsUsed: [...SPLAT_EXTENSIONS],
    extensionsRequired: [...SPLAT_EXTENSIONS],
    buffers: [{ byteLength: gzippedSpz.length }],
    // Cesium's SPZ loader always reads bufferView 0.
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: gzippedSpz.length }],
    accessors: [
      { componentType: 5126, count, type: 'VEC3', min, max },
      { componentType: 5121, normalized: true, count, type: 'VEC4' },
      { componentType: 5126, count, type: 'VEC3' },
      { componentType: 5126, count, type: 'VEC4' },
    ],
    meshes: [
      {
        primitives: [
          {
            mode: 0,
            attributes: {
              POSITION: 0,
              COLOR_0: 1,
              'KHR_gaussian_splatting:SCALE': 2,
              'KHR_gaussian_splatting:ROTATION': 3,
            },
            extensions: {
              KHR_gaussian_splatting: {
                extensions: {
                  KHR_gaussian_splatting_compression_spz_2: { bufferView: 0 },
                },
              },
            },
          },
        ],
      },
    ],
    nodes: [{ mesh: 0, matrix: [...UNDO_Y_UP] }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const encoder = new TextEncoder();
  let json = encoder.encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.length % 4)) % 4;
  const binPad = (4 - (gzippedSpz.length % 4)) % 4;
  const jsonLength = json.length + jsonPad;
  const binLength = gzippedSpz.length + binPad;
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // glTF
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(json, 20);
  out.fill(0x20, 20 + json.length, 20 + jsonLength);
  const bin = 20 + jsonLength;
  view.setUint32(bin, binLength, true);
  view.setUint32(bin + 4, 0x004e4942, true); // BIN
  out.set(gzippedSpz, bin + 8);
  json = null;
  return out;
}

// ------------------------------------------------------------- tileset ----

const WGS84_A = 6378137;
const WGS84_E2 = 6.69437999014e-3;

/** Column-major east-north-up frame at a point on the WGS84 ellipsoid. */
export function enuFrame(lat, lon, height = 0) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const origin = [
    (n + height) * cosPhi * cosLambda,
    (n + height) * cosPhi * sinLambda,
    (n * (1 - WGS84_E2) + height) * sinPhi,
  ];
  const east = [-sinLambda, cosLambda, 0];
  const north = [-sinPhi * cosLambda, -sinPhi * sinLambda, cosPhi];
  const up = [cosPhi * cosLambda, cosPhi * sinLambda, sinPhi];
  return { origin, east, north, up };
}

/**
 * Tileset for one survey: the coarse scan as the root and the sharp scan as
 * its child, so the sharp one replaces it once the camera is close. Placed on
 * the ellipsoid at height 0; the browser lifts it to local sea level.
 */
export function buildReefScanTileset(scanId) {
  const parsed = parseReefScanId(scanId);
  if (!parsed) return null;
  const { plot } = parsed;
  const { origin, east, north, up } = enuFrame(plot.lat, plot.lon, 0);
  const [ax, ay] = plot.anchor;
  // Put the anchor point of the scan frame on the GPS corner.
  const t = origin.map((v, i) => v - ax * east[i] - ay * north[i]);
  const transform = [...east, 0, ...north, 0, ...up, 0, ...t, 1];
  // A generous box around the reef in the scan frame: plots are under 10 m
  // across and a few metres tall.
  const [cx, cy, cz] = plot.centre;
  const box = [cx, cy, cz, 8, 0, 0, 0, 8, 0, 0, 0, 5];
  const [coarse, sharp] = REEF_SCAN_LODS;
  return {
    asset: { version: '1.1' },
    extensionsUsed: ['3DTILES_content_gltf'],
    extensionsRequired: ['3DTILES_content_gltf'],
    extensions: {
      '3DTILES_content_gltf': {
        extensionsUsed: [...SPLAT_EXTENSIONS],
        extensionsRequired: [...SPLAT_EXTENSIONS],
      },
    },
    geometricError: 64,
    root: {
      transform,
      boundingVolume: { box },
      geometricError: 4,
      refine: 'REPLACE',
      content: { uri: `lod${coarse}.glb` },
      children: [
        {
          boundingVolume: { box },
          geometricError: 0,
          content: { uri: `lod${sharp}.glb` },
        },
      ],
    },
  };
}
