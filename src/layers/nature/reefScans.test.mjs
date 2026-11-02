import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REEF_SCAN_LODS,
  REEF_SCAN_PLOTS,
  buildReefScanTileset,
  buildSplatGlb,
  divePitch,
  enuFrame,
  packSpz,
  parseReefScanId,
  parseSplatPly,
  reefScanId,
  reefScanPlyUrl,
  seaLevelFromSamples,
} from './reefScans.js';

const PROPS = [
  'x',
  'y',
  'z',
  'scale_0',
  'scale_1',
  'scale_2',
  'f_dc_0',
  'f_dc_1',
  'f_dc_2',
  'opacity',
  'rot_0',
  'rot_1',
  'rot_2',
  'rot_3',
];

/** A binary PLY with the given rows (one array of PROPS values per splat). */
function ply(rows, { headerPad = '' } = {}) {
  const header =
    `ply\nformat binary_little_endian 1.0\n${headerPad}element vertex ${rows.length}\n` +
    PROPS.map((p) => `property float ${p}\n`).join('') +
    'end_header\n';
  const head = new TextEncoder().encode(header);
  const body = new Float32Array(rows.flat());
  const out = new Uint8Array(head.length + body.byteLength);
  out.set(head);
  out.set(new Uint8Array(body.buffer), head.length);
  return out;
}

const splat = (x, y, z, extra = {}) => {
  const row = {
    x,
    y,
    z,
    scale_0: Math.log(0.02),
    scale_1: Math.log(0.01),
    scale_2: Math.log(0.005),
    f_dc_0: 0.5,
    f_dc_1: -0.5,
    f_dc_2: 0,
    opacity: 2,
    rot_0: -1,
    rot_1: 0,
    rot_2: 0,
    rot_3: 0,
    ...extra,
  };
  return PROPS.map((p) => row[p]);
};

test('reef scan ids only resolve catalogued plots and dates', () => {
  assert.deepEqual(parseReefScanId('hb_20250710')?.date, '2025-07-10');
  assert.equal(parseReefScanId('hb_20250711'), null);
  assert.equal(parseReefScanId('ootbr_20250709'), null); // bad GPS, left out
  assert.equal(parseReefScanId('../hb_20250710'), null);
  assert.equal(reefScanId('hb', '2026-03-04'), 'hb_20260304');
  assert.match(
    reefScanPlyUrl('hb_20250710', 3),
    /^https:\/\/huggingface\.co\/datasets\/wildflow\/soneva-corals\/resolve\/main\/maldives_soneva_hb_20250710\/splats\/ply\/lod3\.ply$/,
  );
  for (const plot of REEF_SCAN_PLOTS) {
    assert.ok(plot.dates.length >= 3, plot.id);
    assert.deepEqual([...plot.dates].sort(), [...plot.dates], plot.id);
    assert.ok(
      plot.lat > 5 && plot.lat < 5.2 && plot.lon > 73 && plot.lon < 73.1,
    );
    assert.ok(plot.centre[2] < 0, `${plot.id} reef sits under water`);
  }
});

test('PLY parsing copies floats even when the header length is unaligned', () => {
  // A Buffer slice shares memory; one byte of padding misaligns the floats.
  const bytes = Buffer.from(
    ply([splat(1.5, -2.25, -3)], { headerPad: 'comment x\n' }),
  );
  const parsed = parseSplatPly(bytes);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.data[parsed.col('x')], 1.5);
  assert.equal(parsed.data[parsed.col('y')], -2.25);
  assert.throws(() => parseSplatPly(new TextEncoder().encode('nope')), /ply_/);
  const truncated = ply([splat(0, 0, 0)]).slice(0, -4);
  assert.throws(() => parseSplatPly(truncated), /ply_truncated/);
});

test('SPZ packing quantises each attribute and drops garbage splats', () => {
  const parsed = parseSplatPly(
    ply([
      splat(1, -2, -3),
      splat(-6.5e37, 0, 0), // garbage position in the published data
      splat(0, 0, 0, { opacity: NaN }),
    ]),
  );
  const { spz, count, min, max } = packSpz(parsed);
  assert.equal(count, 1);
  assert.deepEqual(min, [1, -2, -3]);
  assert.deepEqual(max, [1, -2, -3]);
  const view = new DataView(spz.buffer);
  assert.equal(view.getUint32(0, true), 0x5053474e);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), 1);
  assert.equal(spz[12], 0); // no spherical harmonics
  assert.equal(spz.length, 16 + 19);
  // x = 1 m at 12 fractional bits.
  assert.equal(spz[16] | (spz[17] << 8) | (spz[18] << 16), 4096);
  // Opacity: sigmoid(2) ≈ 0.88.
  assert.equal(spz[25], Math.round(255 / (1 + Math.exp(-2))));
  // Rotation (-1, 0, 0, 0) flips to w ≥ 0, so x, y, z sit at the midpoint.
  assert.deepEqual([...spz.slice(32, 35)], [128, 128, 128]);
});

test('the GLB declares Gaussian splats with SPZ in buffer view 0', () => {
  const gzippedSpz = new Uint8Array([1, 2, 3, 4, 5]);
  const glb = buildSplatGlb({
    gzippedSpz,
    count: 1,
    min: [0, 0, 0],
    max: [1, 1, 1],
  });
  const view = new DataView(glb.buffer);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(8, true), glb.length);
  assert.equal(glb.length % 4, 0);
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(
    new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)),
  );
  const primitive = gltf.meshes[0].primitives[0];
  assert.deepEqual(gltf.extensionsRequired, [
    'KHR_gaussian_splatting',
    'KHR_gaussian_splatting_compression_spz_2',
  ]);
  assert.equal(
    primitive.extensions.KHR_gaussian_splatting.extensions
      .KHR_gaussian_splatting_compression_spz_2.bufferView,
    0,
  );
  assert.ok(primitive.attributes['KHR_gaussian_splatting:ROTATION'] >= 0);
  const binStart = 20 + jsonLength + 8;
  assert.deepEqual([...glb.subarray(binStart, binStart + 5)], [1, 2, 3, 4, 5]);
});

test('a scan tileset puts the plot anchor on its GPS corner', () => {
  assert.equal(buildReefScanTileset('hb_20990101'), null);
  const tileset = buildReefScanTileset('hb_20250710');
  const plot = REEF_SCAN_PLOTS.find((p) => p.id === 'hb');
  assert.deepEqual(
    tileset.extensions['3DTILES_content_gltf'].extensionsRequired,
    ['KHR_gaussian_splatting', 'KHR_gaussian_splatting_compression_spz_2'],
  );
  assert.equal(tileset.root.content.uri, `lod${REEF_SCAN_LODS[0]}.glb`);
  assert.equal(
    tileset.root.children[0].content.uri,
    `lod${REEF_SCAN_LODS[1]}.glb`,
  );
  const m = tileset.root.transform;
  const [ax, ay] = plot.anchor;
  const corner = [0, 1, 2].map((i) => m[i] * ax + m[4 + i] * ay + m[12 + i]);
  const { origin } = enuFrame(plot.lat, plot.lon, 0);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(corner[i] - origin[i]) < 1e-6);
});

test('dive pitch keeps the camera between reef and surface', () => {
  const shallow = divePitch(2.17);
  const deep = divePitch(9.93);
  assert.ok(shallow < 0 && deep < shallow);
  assert.ok(Math.sin(-shallow) * 7 < 2.17, 'shallow dive stays under water');
  assert.equal(seaLevelFromSamples([-95.8, NaN, -96.03, -40]), -96.03);
  assert.equal(seaLevelFromSamples([undefined]), null);
});
