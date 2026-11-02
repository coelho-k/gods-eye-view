import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseReefScanPath, reefScansProxy } from './reefScans.js';

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
function tinyPly() {
  const head = new TextEncoder().encode(
    `ply\nformat binary_little_endian 1.0\nelement vertex 2\n${PROPS.map((p) => `property float ${p}\n`).join('')}end_header\n`,
  );
  const body = new Float32Array([
    0, 0, -2, -4, -4, -4, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, -2, -4, -4, -4, 0, 0, 0,
    1, 1, 0, 0, 0,
  ]);
  const out = new Uint8Array(head.length + body.byteLength);
  out.set(head);
  out.set(new Uint8Array(body.buffer), head.length);
  return out;
}

test('reef scan paths only accept catalogued scans and served detail levels', () => {
  assert.deepEqual(parseReefScanPath('/hb_20250710/lod3.glb'), {
    scanId: 'hb_20250710',
    file: 'glb',
    lod: 3,
  });
  assert.equal(parseReefScanPath('/hb_20250710/lod0.glb'), null);
  assert.equal(parseReefScanPath('/hb_20250711/lod3.glb'), null);
  assert.equal(parseReefScanPath('/hb_20250710/../../x'), null);
  assert.equal(parseReefScanPath('/hb_20250710/tileset.json').file, 'tileset');
});

test('the proxy converts a scan once and serves later requests from disk', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'reef-scans-'));
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    return new Response(tinyPly(), { status: 200 });
  };
  let handler;
  reefScansProxy({ fetchImpl, cacheDir }).configureServer({
    middlewares: { use: (_route, fn) => (handler = fn) },
  });
  const call = async (method, url) => {
    const res = {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
        this.headersSent = true;
      },
      setHeader() {},
      end(body) {
        this.body = body;
        this.writableEnded = true;
      },
    };
    await handler({ method, url, headers: {} }, res);
    return res;
  };
  try {
    assert.equal((await call('POST', '/hb_20250710/lod3.glb')).status, 405);
    assert.equal((await call('GET', '/hb_20990101/lod3.glb')).status, 404);
    const tileset = await call('GET', '/hb_20250710/tileset.json');
    assert.equal(tileset.status, 200);
    assert.equal(JSON.parse(tileset.body).root.content.uri, 'lod3.glb');
    assert.equal(fetched.length, 0);

    const first = await call('GET', '/hb_20250710/lod3.glb');
    assert.equal(first.status, 200);
    assert.equal(first.headers['Content-Type'], 'model/gltf-binary');
    assert.equal(Buffer.from(first.body).readUInt32LE(0), 0x46546c67);
    assert.equal(fetched.length, 1);
    assert.match(
      fetched[0],
      /maldives_soneva_hb_20250710\/splats\/ply\/lod3\.ply$/,
    );

    const second = await call('GET', '/hb_20250710/lod3.glb');
    assert.equal(second.status, 200);
    assert.equal(fetched.length, 1, 'served from the disk cache');
    assert.deepEqual(await readdir(cacheDir), ['hb_20250710-lod3.glb']);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('an upstream failure answers 502 and caches nothing', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'reef-scans-'));
  let handler;
  reefScansProxy({
    fetchImpl: async () => new Response('gone', { status: 404 }),
    cacheDir,
  }).configureServer({ middlewares: { use: (_r, fn) => (handler = fn) } });
  const res = {
    headersSent: false,
    writeHead(status) {
      this.status = status;
      this.headersSent = true;
    },
    setHeader() {},
    end() {},
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    await handler(
      { method: 'GET', url: '/hb_20250710/lod3.glb', headers: {} },
      res,
    );
  } finally {
    console.warn = warn;
  }
  assert.equal(res.status, 502);
  assert.deepEqual(await readdir(cacheDir).catch(() => []), []);
  await rm(cacheDir, { recursive: true, force: true });
});
