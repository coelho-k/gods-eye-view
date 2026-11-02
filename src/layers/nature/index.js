import * as Cesium from 'cesium';
import {
  NATURE_PRODUCTS,
  NATURE_PLACES,
  natureProduct,
  productDates,
  nearestDateIndex,
  gibsTileTemplate,
  gibsWmsOptions,
  gibsDomainUrl,
  parseGibsDomain,
  dhwTileUrl,
  coralAlert,
} from './products.js';
import { createNaturePanel } from './panel.js';
import {
  COMPARE_PLACES,
  DEFAULT_COMPARE,
  WAYBACK_CONFIG_URL,
  comparePlace,
  compareSource,
  parseWaybackCapture,
  parseWaybackConfig,
  waybackIdentifyUrl,
  waybackPerYear,
} from './compare.js';
import {
  REEF_SCAN_PLOTS,
  REEF_SCAN_SOURCE,
  reefScanPlot,
} from './reefScans.js';
import { createReefScanView } from './reefScanView.js';
import { createImagerySplit } from '../../ui/imagerySplit.js';
import { msg, t } from '../../i18n/index.js';
export * from './products.js';
export * from './compare.js';
export * from './reefScans.js';
export { createCoralStationSource } from './source.js';

const STATION_PREFIX = 'nature-coral:';
const REEF_SCAN_MARKER = 'nature-reef-scans';
// Playback waits this long for a frame to draw before moving on.
const SWAP_TIMEOUT_MS = 30_000;
const PLAY_MIN_FRAME_MS = 650;

// DHW below ~1 °C-week draws near-white on ERDDAP's white-red-black bar; it is
// not heat stress, so it becomes transparent, fading in up to ~2 °C-weeks.
const DHW_CLEAR_BELOW = 46;
const DHW_FADE_UNTIL = 90;

/**
 * Make "no heat stress" transparent before the tile reaches the GPU. Doing it
 * here, rather than with ImageryLayer.colorToAlpha, keeps texture filtering
 * from blending white into the transparent edges and drawing pale seams.
 */
function cleanDhwImage(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const { width, height } = canvas;
  fillEmptyEdges(data, width, height);
  for (let i = 0; i < data.length; i += 4) {
    const stress = data[i + 3] === 0 ? 0 : 255 - data[i + 1];
    if (stress < DHW_CLEAR_BELOW) {
      // Transparent pixels keep a pale colour: filtering blends them with
      // their neighbours, and transparent black would draw dark fringes.
      data[i] = 255;
      data[i + 1] = 235;
      data[i + 2] = 235;
      data[i + 3] = 0;
    } else if (stress < DHW_FADE_UNTIL)
      data[i + 3] = Math.round(
        (255 * (stress - DHW_CLEAR_BELOW)) / (DHW_FADE_UNTIL - DHW_CLEAR_BELOW),
      );
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * ERDDAP sometimes leaves the last column or row of a tile empty (its grid
 * ends a fraction of a cell short), which shows as a seam between tiles.
 * Copy the neighbouring line into an edge line that is completely empty.
 */
function fillEmptyEdges(data, width, height) {
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
  const copy = (fromX, fromY, toX, toY) => {
    const from = (fromY * width + fromX) * 4;
    const to = (toY * width + toX) * 4;
    for (let k = 0; k < 4; k++) data[to + k] = data[from + k];
  };
  const columnEmpty = (x) => {
    for (let y = 0; y < height; y++) if (alphaAt(x, y)) return false;
    return true;
  };
  const rowEmpty = (y) => {
    for (let x = 0; x < width; x++) if (alphaAt(x, y)) return false;
    return true;
  };
  for (const [edge, inner] of [
    [width - 1, width - 2],
    [0, 1],
  ])
    if (columnEmpty(edge) && !columnEmpty(inner))
      for (let y = 0; y < height; y++) copy(inner, y, edge, y);
  for (const [edge, inner] of [
    [height - 1, height - 2],
    [0, 1],
  ])
    if (rowEmpty(edge) && !rowEmpty(inner))
      for (let x = 0; x < width; x++) copy(x, inner, x, edge);
}

/** Coral Reef Watch DHW tiles through the local queueing, caching proxy. */
function createDhwProvider(day, maximumLevel) {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: dhwTileUrl(day, '{z}', '{x}', '{y}'),
    tilingScheme: new Cesium.GeographicTilingScheme(),
    maximumLevel,
    tileWidth: 256,
    tileHeight: 256,
    credit: 'NOAA Coral Reef Watch (PacIOOS ERDDAP)',
  });
  provider.requestImage = (x, y, level, request) => {
    const resource = new Cesium.Resource({
      url: dhwTileUrl(day, level, x, y),
      request,
    });
    const loading = resource.fetchImage({ preferImageBitmap: false });
    return loading ? loading.then(cleanDhwImage) : undefined;
  };
  return provider;
}

/** Retry a failed tile a couple of times instead of leaving a hole. */
function retryFailedTiles(provider) {
  provider.errorEvent?.addEventListener((error) => {
    if (error && error.timesRetried < 2) error.retry = true;
  });
  return provider;
}

function createProvider(product, day) {
  return retryFailedTiles(createProviderFor(product, day));
}

function createProviderFor(product, day) {
  if (product.kind === 'erddap-dhw')
    return createDhwProvider(day, product.maximumLevel);
  if (product.kind === 'gibs-wms') {
    const options = gibsWmsOptions(product, day);
    return new Cesium.WebMapServiceImageryProvider({
      url: options.url,
      layers: options.layers,
      parameters: options.parameters,
      tilingScheme: new Cesium.GeographicTilingScheme(),
      tileWidth: 256,
      tileHeight: 256,
      maximumLevel: product.maximumLevel,
      credit: product.source,
    });
  }
  return new Cesium.UrlTemplateImageryProvider({
    url: gibsTileTemplate(product, day),
    maximumLevel: product.maximumLevel,
    credit: product.source,
  });
}

/**
 * Nature layer: dated nature maps on the globe with a date slider, plus NOAA
 * Coral Reef Watch stations you can fly to and read 40 years of heat stress.
 */
export function createNatureLayer({
  coralSource,
  requestRender = () => {},
  mount = () => document.body,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  if (typeof coralSource?.getStations !== 'function')
    throw new TypeError('Nature requires a coral station source');

  let viewer = null;
  let panel = null;
  let enabled = false;
  let product = natureProduct('coral-dhw');
  let dates = [];
  let index = 0;
  let imagery = null; // { layer, key }
  let incoming = null; // { layer, key, timer, done }
  let stations = [];
  let stationsLatest = null;
  let stationSource = null;
  let stationsRequest = null;
  let selected = null; // { station, series, request }
  let clickHandler = null;
  let playing = false;
  let playTimer = null;
  let lastError = null;
  let lastUpdate = null;
  let removePostRender = null;
  let removePreUpdate = null;
  const domainDates = new Map(); // product id -> dates GIBS really has
  const domainPending = new Set();
  const occlusionCamera = new Cesium.Cartesian3();
  let occlusionDirty = true;
  let mapStackController = null;
  // Before/after: { kind: 'imagery' | 'map', lease, split, layers, ... }
  let compare = null;
  let compareGeneration = 0;
  let waybackReleases = null;
  let waybackPending = null;
  let reefScan = null; // underwater coral scan viewer, made on first use

  const currentDay = () => dates[index];

  function refreshDates(keepDay = currentDay()) {
    dates =
      domainDates.get(product.id) ||
      productDates(
        product,
        Date.now(),
        product.stations ? stationsLatest : null,
      );
    index = keepDay ? nearestDateIndex(dates, keepDay) : dates.length - 1;
  }

  /** Swap the computed dates for the ones GIBS says it actually has. */
  async function loadDomain(target) {
    const url = gibsDomainUrl(target);
    if (!url || domainDates.has(target.id) || domainPending.has(target.id))
      return;
    domainPending.add(target.id);
    try {
      const response = await fetchImpl(url);
      if (!response.ok) return;
      const list = parseGibsDomain(await response.text());
      if (list.length < 1) return;
      domainDates.set(target.id, list);
      if (product.id !== target.id || !viewer) return;
      const wasLatest = index >= dates.length - 1;
      refreshDates(wasLatest ? null : currentDay());
      syncPanel();
      void showImagery();
    } catch {
      // Keep the computed dates; a missing day just draws nothing.
    } finally {
      domainPending.delete(target.id);
    }
  }

  function removeLayer(entry) {
    if (!entry?.layer || !viewer) return;
    viewer.imageryLayers.remove(entry.layer, true);
  }

  function finishSwap() {
    if (!incoming) return;
    clearTimeout(incoming.timer);
    removeLayer(imagery);
    imagery = { layer: incoming.layer, key: incoming.key };
    const done = incoming.done;
    incoming = null;
    panel?.setLoading(false);
    requestRender('nature-swap');
    done?.();
  }

  /** Show the current product/date, keeping the old map until the new one loads. */
  function showImagery() {
    if (!viewer || !enabled) return Promise.resolve();
    const day = currentDay();
    const key = `${product.id}:${product.static ? 'static' : day}`;
    if (imagery?.key === key && !incoming) return Promise.resolve();
    if (incoming) {
      // A newer request replaces the one still loading.
      clearTimeout(incoming.timer);
      removeLayer(incoming);
      const done = incoming.done;
      incoming = null;
      done?.();
    }
    const layer = createProductLayer(product, day);
    styleTimelineLayer(layer);
    viewer.imageryLayers.add(layer);
    return new Promise((resolve) => {
      const entry = {
        layer,
        key,
        done: resolve,
        since: Date.now(),
        // A slow load stops holding up playback, but the old map stays
        // underneath until the new one has every tile: never a blank globe.
        timer: setTimeout(() => {
          const done = entry.done;
          entry.done = null;
          done?.();
        }, SWAP_TIMEOUT_MS),
      };
      incoming = entry;
      panel?.setLoading(true);
      requestRender('nature-load');
      // In request-render mode a fast load may leave no later frame to
      // notice it; ask for one after the settle delay.
      setTimeout(() => requestRender('nature-settle'), 350);
    });
  }

  function createProductLayer(target, day) {
    const layer = new Cesium.ImageryLayer(createProvider(target, day), {
      alpha: target.alpha ?? 1,
    });
    if (target.colorToAlpha) {
      layer.colorToAlpha = Cesium.Color.fromCssColorString(target.colorToAlpha);
      layer.colorToAlphaThreshold = target.colorToAlphaThreshold ?? 0.05;
    }
    return layer;
  }

  /**
   * The slider's map is the right half of a date comparison and steps aside
   * while two imagery sources are compared.
   */
  function styleTimelineLayer(layer) {
    if (!layer) return;
    layer.splitDirection =
      compare?.kind === 'map'
        ? Cesium.SplitDirection.RIGHT
        : Cesium.SplitDirection.NONE;
    // A reef scan is a few metres across; a 5 km heat map would only tint it.
    layer.show = compare?.kind !== 'imagery' && !reefScan?.getState().open;
  }

  function restyleTimeline() {
    styleTimelineLayer(imagery?.layer);
    styleTimelineLayer(incoming?.layer);
    updateStationsVisibility();
    requestRender('nature-compare');
  }

  function onPostRender() {
    // Give the globe a moment to notice the new layer before trusting
    // tilesLoaded, which can still describe the previous frame.
    if (
      incoming &&
      Date.now() - incoming.since > 300 &&
      viewer?.scene?.globe?.tilesLoaded
    )
      finishSwap();
  }

  function syncPanel() {
    panel?.setProduct(product, dates, index);
    panel?.setPlaying(playing);
  }

  function setProduct(id) {
    const next = natureProduct(id);
    if (!next) return;
    const keep = currentDay();
    product = next;
    if (!product.stations) closeStation();
    refreshDates(keep);
    syncPanel();
    updateStationsVisibility();
    void showImagery();
    void loadDomain(product);
    if (compare?.kind === 'map') rebuildPinnedLayer();
  }

  function setDateIndex(nextIndex) {
    index = Math.max(0, Math.min(dates.length - 1, nextIndex));
    panel?.setDateIndex(index);
    if (compare?.kind === 'map') syncMapCompareText();
    return showImagery();
  }

  function setDay(day) {
    return setDateIndex(nearestDateIndex(dates, day));
  }

  function stopPlaying() {
    playing = false;
    clearTimeout(playTimer);
    playTimer = null;
    panel?.setPlaying(false);
  }

  function playStep() {
    if (!playing) return;
    if (index >= dates.length - 1) return stopPlaying();
    const started = Date.now();
    void setDateIndex(index + (product.playStep || 1)).then(() => {
      if (!playing) return;
      const wait = Math.max(0, PLAY_MIN_FRAME_MS - (Date.now() - started));
      playTimer = setTimeout(playStep, wait);
    });
  }

  function togglePlay() {
    if (playing) return stopPlaying();
    if (dates.length <= 1) return;
    if (index >= dates.length - 1) index = 0;
    playing = true;
    panel?.setPlaying(true);
    playStep();
  }

  function flyTo(lat, lon, height, pitchDegrees = -55) {
    if (!viewer) return;
    const target = Cesium.Cartesian3.fromDegrees(lon, lat);
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(pitchDegrees),
        height,
      ),
      duration: 2.5,
    });
  }

  function goToPlace(id) {
    const place = NATURE_PLACES.find((entry) => entry.id === id);
    if (!place) return;
    stopPlaying();
    closeReefScan();
    exitCompare();
    if (place.product !== product.id) setProduct(place.product);
    // A place without a date opens on the newest one.
    if (place.day) void setDay(place.day);
    else void setDateIndex(dates.length - 1);
    flyTo(place.lat, place.lon, place.height, -70);
  }

  // ── 3D before/after ───────────────────────────────────────────────────────
  /** Fly in low over the terrain so relief reads as 3D. */
  function flyTo3D(place) {
    if (!viewer) return;
    const target = Cesium.Cartesian3.fromDegrees(
      place.lon,
      place.lat,
      place.groundM ?? 0,
    );
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(place.headingDeg ?? 0),
        Cesium.Math.toRadians(place.pitchDeg ?? -35),
        place.rangeM ?? 20_000,
      ),
      duration: 3,
    });
  }

  /** Tilt the current view toward the horizon around the screen centre. */
  function tiltCurrentView() {
    const scene = viewer?.scene;
    if (!scene) return;
    const canvas = scene.canvas;
    const centre = new Cesium.Cartesian2(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
    );
    const ground = scene.camera.pickEllipsoid(centre, scene.globe.ellipsoid);
    if (!ground) return;
    const distance = Cesium.Cartesian3.distance(
      scene.camera.positionWC,
      ground,
    );
    if (scene.camera.pitch > Cesium.Math.toRadians(-50)) return;
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(ground, 1), {
      offset: new Cesium.HeadingPitchRange(
        scene.camera.heading,
        Cesium.Math.toRadians(-35),
        Math.min(distance, 80_000),
      ),
      duration: 2,
    });
  }

  async function loadWayback() {
    if (waybackReleases) return waybackReleases;
    waybackPending ??= fetchImpl(WAYBACK_CONFIG_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        waybackReleases = parseWaybackConfig(config);
        return waybackReleases;
      })
      .catch(() => [])
      .finally(() => {
        waybackPending = null;
      });
    return waybackPending;
  }

  /** Borrow the shared swipe; null (with a status line) when it is taken. */
  function acquireLease() {
    if (!mapStackController?.acquireImageryComparison) return { release() {} };
    try {
      return mapStackController.acquireImageryComparison({
        owner: 'nature',
        switchPolicy: 'esri-if-photoreal',
      });
    } catch {
      panel?.setStatus(t('Comparison in use by another scene'));
      return null;
    }
  }

  function startCompare(kind) {
    closeReefScan();
    exitCompare();
    const lease = acquireLease();
    if (!lease) return null;
    compare = {
      kind,
      lease,
      split: null,
      layers: { before: null, after: null },
      generation: ++compareGeneration,
    };
    compare.split = createImagerySplit({
      scene: viewer.scene,
      parent: mount(),
      initialValue: 0.5,
      id: 'nature-split-line',
      handleClass: 'nature-split-handle',
      cssProperty: '--nature-split',
      ariaLabel: t('Before and after divider'),
      formatValueText: (beforePercent, afterPercent) =>
        t('Before {before} percent, after {after} percent', {
          before: beforePercent,
          after: afterPercent,
        }),
      requestRender: () => requestRender('nature-split'),
    });
    return compare;
  }

  function setSplitLabels(before, after) {
    const line = document.getElementById('nature-split-line');
    const beforeLabel = line?.querySelector('.before');
    const afterLabel = line?.querySelector('.after');
    if (beforeLabel) beforeLabel.textContent = before;
    if (afterLabel) afterLabel.textContent = after;
  }

  function exitCompare() {
    if (!compare) return;
    const ending = compare;
    compare = null;
    for (const layer of Object.values(ending.layers))
      if (layer && viewer) viewer.imageryLayers.remove(layer, true);
    ending.split?.destroy();
    try {
      void ending.lease?.release();
    } catch {
      // The map controller restores its own stack.
    }
    restyleTimeline();
    panel?.hideCompare();
  }

  function compareSides() {
    return {
      before: compareSource(compare?.beforeKey, waybackReleases || []),
      after: compareSource(compare?.afterKey, waybackReleases || []),
    };
  }

  function setImagerySide(side, key) {
    if (compare?.kind !== 'imagery') return;
    const source = compareSource(key, waybackReleases || []);
    if (!source) return;
    compare[`${side}Key`] = key;
    const old = compare.layers[side];
    if (old) viewer.imageryLayers.remove(old, true);
    const provider = retryFailedTiles(
      new Cesium.UrlTemplateImageryProvider({
        url: source.url,
        maximumLevel: source.maximumLevel,
        credit: source.credit,
      }),
    );
    const layer = new Cesium.ImageryLayer(provider);
    layer.splitDirection =
      side === 'before'
        ? Cesium.SplitDirection.LEFT
        : Cesium.SplitDirection.RIGHT;
    // Above the basemap, below the station markers and any timeline map.
    viewer.imageryLayers.add(layer);
    compare.layers[side] = layer;
    const { before, after } = compareSides();
    setSplitLabels(before?.short || '', after?.short || '');
    syncImageryCompareText();
    requestRender('nature-compare');
  }

  function describeSource(source, capture) {
    if (!source) return '';
    if (source.kind === 's2')
      return t('Sentinel-2 cloud-free mosaic {year} · 10 m', {
        year: source.short,
      });
    return capture
      ? t(
          'Esri Wayback {release} · captured {date} · {provider} · {metres} m',
          {
            release: source.short,
            date: capture.date,
            provider: capture.provider || 'Esri',
            metres: capture.metres ?? '—',
          },
        )
      : t('Esri Wayback {release} · sub-metre where available', {
          release: source.short,
        });
  }

  function syncImageryCompareText() {
    if (compare?.kind !== 'imagery') return;
    const { before, after } = compareSides();
    panel?.showCompare({
      kind: 'imagery',
      beforeKey: compare.beforeKey,
      afterKey: compare.afterKey,
      wayback: waybackPerYear(waybackReleases || []),
      // Release dates for curated releases that are not a year's newest.
      releaseDates: Object.fromEntries(
        [before, after]
          .filter((source) => source?.kind === 'wb')
          .map((source) => [source.key, source.short]),
      ),
      beforeText: describeSource(before, compare.captures?.before),
      afterText: describeSource(after, compare.captures?.after),
      note: [
        compare.place ? t(compare.place.note) : '',
        // EOX's processing changed between years, so colour and haze differ
        // even where nothing on the ground did.
        before?.kind === 's2' || after?.kind === 's2'
          ? t(
              'Yearly mosaics differ in colour and haze because of processing. Compare shapes, not colours.',
            )
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
    void loadCaptures();
  }

  /** Name the real capture date under the view for Wayback sides. */
  async function loadCaptures() {
    if (compare?.kind !== 'imagery' || !viewer) return;
    const generation = compare.generation;
    const centre = compare.place || viewCentre();
    if (!centre) return;
    compare.captures ??= {};
    for (const side of ['before', 'after']) {
      const source = compareSides()[side];
      const key = `${source?.key}@${centre.lat.toFixed(3)},${centre.lon.toFixed(3)}`;
      if (source?.kind !== 'wb' || !source.release.metadataUrl) continue;
      if (compare.captures[`${side}Key`] === key) continue;
      compare.captures[`${side}Key`] = key;
      try {
        const response = await fetchImpl(
          waybackIdentifyUrl(
            source.release.metadataUrl,
            centre.lat,
            centre.lon,
          ),
        );
        const capture = response.ok
          ? parseWaybackCapture(await response.json())
          : null;
        if (compare?.generation !== generation) return;
        compare.captures[side] = capture;
        syncImageryCompareText();
      } catch {
        // The release date stays as the label.
      }
    }
  }

  function viewCentre() {
    const scene = viewer?.scene;
    if (!scene) return null;
    const ground = scene.camera.pickEllipsoid(
      new Cesium.Cartesian2(
        scene.canvas.clientWidth / 2,
        scene.canvas.clientHeight / 2,
      ),
      scene.globe.ellipsoid,
    );
    if (!ground) return null;
    const c = Cesium.Cartographic.fromCartesian(ground);
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
    };
  }

  /** Swipe two imagery sources over the terrain. */
  async function compareImagery({
    before = DEFAULT_COMPARE.before,
    after = DEFAULT_COMPARE.after,
    place = null,
  } = {}) {
    stopPlaying();
    if (!startCompare('imagery')) return;
    const generation = compare.generation;
    compare.place = place;
    restyleTimeline();
    if (before.startsWith('wb:') || after.startsWith('wb:'))
      await loadWayback();
    else
      void loadWayback().then(() => {
        if (compare?.generation === generation) syncImageryCompareText();
      });
    if (compare?.generation !== generation) return;
    setImagerySide('before', before);
    setImagerySide('after', after);
  }

  function syncMapCompareText() {
    if (compare?.kind !== 'map') return;
    setSplitLabels(compare.pinnedDay, currentDay() || '');
    panel?.showCompare({
      kind: 'map',
      beforeText: t('Left: {map} on {date}', {
        map: t(product.label),
        date: compare.pinnedDay,
      }),
      afterText: t('Right: the slider date, {date}', {
        date: currentDay() || '—',
      }),
      note: compare.place
        ? t(compare.place.note)
        : t('Move the slider to change the right side.'),
    });
  }

  function rebuildPinnedLayer() {
    if (compare?.kind !== 'map' || !viewer) return;
    const old = compare.layers.before;
    if (old) viewer.imageryLayers.remove(old, true);
    compare.pinnedDay = dates[nearestDateIndex(dates, compare.pinnedDay)];
    const layer = createProductLayer(product, compare.pinnedDay);
    layer.splitDirection = Cesium.SplitDirection.LEFT;
    viewer.imageryLayers.add(layer);
    compare.layers.before = layer;
    syncMapCompareText();
    requestRender('nature-compare');
  }

  /** Swipe this map on a pinned date (left) against the slider date (right). */
  function compareDates(pinnedDay = currentDay(), place = null) {
    stopPlaying();
    if (product.static || dates.length <= 1) return;
    if (!startCompare('map')) return;
    compare.pinnedDay = pinnedDay;
    compare.place = place;
    restyleTimeline();
    rebuildPinnedLayer();
  }

  function goToComparePlace(id) {
    const place = comparePlace(id);
    if (!place || !viewer) return;
    stopPlaying();
    closeReefScan();
    exitCompare();
    if (place.kind === 'map') {
      if (product.id !== place.product) setProduct(place.product);
      void setDay(place.after);
      compareDates(place.before, place);
    } else {
      void compareImagery({
        before: place.before,
        after: place.after,
        place,
      });
    }
    flyTo3D(place);
  }

  // ── Underwater coral scans ────────────────────────────────────────────────
  function syncReefScanPanel(state) {
    if (!panel) return;
    if (!state.open) {
      panel.hideScan();
      return;
    }
    panel.showScan({ ...state, plot: reefScanPlot(state.plot) });
  }

  function onReefScanChange(state) {
    syncReefScanPanel(state);
    restyleTimeline();
  }

  /** Fly to a reef plot and show its 3D scans (newest date unless given). */
  async function openReefScan(plotId, date) {
    if (!viewer || !reefScanPlot(plotId)) return false;
    stopPlaying();
    exitCompare();
    closeStation();
    reefScan ??= createReefScanView({
      viewer,
      requestRender: () => requestRender('nature-reef-scan'),
      onChange: onReefScanChange,
    });
    panel?.showScan({
      open: true,
      plot: reefScanPlot(plotId),
      date: null,
      loading: true,
      underwater: false,
    });
    return reefScan.open(plotId, date);
  }

  function closeReefScan() {
    reefScan?.close();
  }

  // ── Coral stations ────────────────────────────────────────────────────────
  function updateStationsVisibility() {
    if (!stationSource) return;
    stationSource.show =
      enabled &&
      Boolean(product.stations) &&
      compare?.kind !== 'imagery' &&
      !reefScan?.getState().open;
    occlusionDirty = true;
    requestRender('nature-stations');
  }

  /**
   * Markers draw on top of terrain so reefs are never buried, which also
   * means the globe cannot hide them; hide the ones over the horizon here.
   */
  function updateOcclusion() {
    if (!viewer || !stationSource?.show) return;
    const camera = viewer.camera.positionWC;
    if (
      !occlusionDirty &&
      Cesium.Cartesian3.equalsEpsilon(camera, occlusionCamera, 0, 1)
    )
      return;
    Cesium.Cartesian3.clone(camera, occlusionCamera);
    occlusionDirty = false;
    const occluder = new Cesium.EllipsoidalOccluder(
      Cesium.Ellipsoid.WGS84,
      camera,
    );
    let changed = false;
    for (const entity of stationSource.entities.values) {
      const visible = occluder.isPointVisible(entity.natureSurface);
      if (entity.show !== visible) {
        entity.show = visible;
        changed = true;
      }
    }
    if (changed) requestRender('nature-occlusion');
  }

  /** One marker for the scanned reef plots; clicking it opens the newest. */
  function addReefScanMarker() {
    const first = REEF_SCAN_PLOTS[0];
    const surface = Cesium.Cartesian3.fromDegrees(first.lon, first.lat);
    const entity = stationSource.entities.add({
      id: REEF_SCAN_MARKER,
      // Picked by id; the name shows in Cesium's selection UI if enabled.
      name: t('Underwater 3D coral scans'),
      position: surface,
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString('#5ee0f0'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    entity.natureSurface = surface;
  }

  function drawStations() {
    if (!stationSource) return;
    stationSource.entities.removeAll();
    addReefScanMarker();
    for (const station of stations) {
      const alert = coralAlert(station.alert ?? 0);
      const color = Cesium.Color.fromCssColorString(alert.color);
      const surface = Cesium.Cartesian3.fromDegrees(station.lon, station.lat);
      const entity = stationSource.entities.add({
        id: `${STATION_PREFIX}${station.id}`,
        name: station.name,
        position: surface,
        point: {
          pixelSize: 10,
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 1.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entity.natureSurface = surface;
    }
    updateStationsVisibility();
  }

  async function loadStations() {
    stationsRequest?.abort();
    const request = new AbortController();
    stationsRequest = request;
    try {
      const body = await coralSource.getStations({ signal: request.signal });
      if (request.signal.aborted || !enabled) return false;
      stations = body.stations || [];
      stationsLatest = stations.reduce(
        (max, s) => (s.date && (!max || s.date > max) ? s.date : max),
        null,
      );
      if (product.stations) {
        const wasLatest = index >= dates.length - 1;
        refreshDates(wasLatest ? null : currentDay());
        syncPanel();
      }
      drawStations();
      panel?.setStations(stations);
      lastError = null;
      lastUpdate = Date.now();
      panel?.showStationsLoaded(stations.length, stationsLatest);
      return true;
    } catch (error) {
      if (request.signal.aborted) return false;
      lastError = error?.message || msg('Coral stations unavailable');
      panel?.showStationsFailed();
      return false;
    } finally {
      if (stationsRequest === request) stationsRequest = null;
    }
  }

  async function selectStation(id, { fly = true } = {}) {
    const station = stations.find((entry) => entry.id === id);
    if (!station) return;
    selected?.request?.abort();
    const request = new AbortController();
    selected = { station, series: null, request };
    if (!product.stations) setProduct('coral-dhw');
    panel?.showStation(station, {
      onPickDate: (day) => {
        stopPlaying();
        if (!product.stations) setProduct('coral-dhw');
        void setDay(day);
      },
    });
    if (fly) flyTo(station.lat, station.lon, 350_000, -50);
    try {
      const series = await coralSource.getSeries(id, {
        signal: request.signal,
      });
      if (request.signal.aborted || selected?.station !== station) return;
      selected.series = series;
      panel?.setStationSeries(series, currentDay());
    } catch {
      if (!request.signal.aborted) panel?.setStationSeries(null);
    }
  }

  function closeStation() {
    selected?.request?.abort();
    selected = null;
    panel?.hideStation();
  }

  function installClick() {
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click) => {
      if (!enabled || !stationSource?.show) return;
      const picked = viewer.scene.pick(click.position);
      const id = picked?.id?.id;
      if (id === REEF_SCAN_MARKER) void openReefScan(REEF_SCAN_PLOTS[0].id);
      else if (typeof id === 'string' && id.startsWith(STATION_PREFIX))
        void selectStation(id.slice(STATION_PREFIX.length));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  const layer = {
    id: 'nature',
    name: 'Nature timeline',
    icon: '🌿',
    source: 'NOAA CRW · NASA GIBS',
    updateInterval: 6 * 3600_000,

    init(nextViewer) {
      if (viewer) throw new Error('Nature layer is already initialized');
      viewer = nextViewer;
      stationSource = new Cesium.CustomDataSource('nature-coral-stations');
      stationSource.show = false;
      viewer.dataSources.add(stationSource);
      addReefScanMarker();
      panel = createNaturePanel({
        onProduct: (id) => {
          stopPlaying();
          if (compare?.kind === 'imagery') exitCompare();
          setProduct(id);
        },
        onDateIndex: (i) => {
          stopPlaying();
          void setDateIndex(i);
        },
        onPlay: togglePlay,
        onPlace: goToPlace,
        onComparePlace: goToComparePlace,
        onStation: (id) => void selectStation(id),
        onCloseStation: closeStation,
        onCompareImagery: () => {
          if (compare?.kind === 'imagery') return exitCompare();
          void compareImagery();
          tiltCurrentView();
        },
        onCompareDates: () => {
          if (compare?.kind === 'map') return exitCompare();
          compareDates();
        },
        onCompareSide: setImagerySide,
        onCompareExit: exitCompare,
        onScanPlace: (id) => void openReefScan(id),
        onScanDate: (date) => reefScan?.setDate(date),
        onScanDive: () => reefScan?.dive(),
        onScanExit: closeReefScan,
      });
      mount().appendChild(panel.element);
      refreshDates(null);
      const scene = viewer.scene;
      scene.postRender.addEventListener(onPostRender);
      removePostRender = () =>
        scene.postRender.removeEventListener(onPostRender);
      scene.preUpdate.addEventListener(updateOcclusion);
      removePreUpdate = () =>
        scene.preUpdate.removeEventListener(updateOcclusion);
      installClick();
    },

    enable() {
      enabled = true;
      panel?.show(true);
      syncPanel();
      updateStationsVisibility();
      void showImagery();
      void loadDomain(product);
    },

    disable() {
      enabled = false;
      stopPlaying();
      closeReefScan();
      exitCompare();
      stationsRequest?.abort();
      panel?.show(false);
      if (incoming) {
        clearTimeout(incoming.timer);
        removeLayer(incoming);
        incoming.done?.();
        incoming = null;
      }
      removeLayer(imagery);
      imagery = null;
      updateStationsVisibility();
      requestRender('nature-off');
    },

    async update() {
      if (!enabled) return false;
      return loadStations();
    },

    destroy() {
      this.disable();
      closeStation();
      clickHandler?.destroy();
      clickHandler = null;
      removePostRender?.();
      removePostRender = null;
      removePreUpdate?.();
      removePreUpdate = null;
      if (stationSource && viewer)
        viewer.dataSources.remove(stationSource, true);
      stationSource = null;
      panel?.destroy();
      panel = null;
      viewer = null;
    },

    /** Coral stations as plain records for the analyst/voice tools. */
    getAnalystRecords(maxCount = 500) {
      if (!enabled) return [];
      return stations.slice(0, maxCount).map((s) => ({
        kind: 'coral-reef-station',
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        date: s.date,
        degreeHeatingWeeks: s.dhw,
        seaSurfaceTemperatureC: s.sst,
        alertLevel: s.alert,
        alertLabel: coralAlert(s.alert ?? 0).label,
        note: 'Satellite heat stress on ~5 km pixels; not observed bleaching.',
      }));
    },

    getStats() {
      return {
        count: stations.length,
        lastUpdate,
        error: lastError,
      };
    },

    /** Programmatic control (console, tests, future voice tools). */
    getState() {
      return {
        product: product.id,
        day: currentDay(),
        playing,
        // The date actually on the globe (it lags `day` while tiles load).
        shown: imagery?.key?.split(':')[1] || null,
        station: selected?.station?.id || null,
        reefScan: reefScan?.getState().open ? reefScan.getState() : null,
        compare: compare
          ? {
              kind: compare.kind,
              before:
                compare.kind === 'map' ? compare.pinnedDay : compare.beforeKey,
              after: compare.kind === 'map' ? currentDay() : compare.afterKey,
              place: compare.place?.id || null,
            }
          : null,
      };
    },
    setProduct,
    setDay,
    goToPlace,
    goToComparePlace,
    compareImagery,
    compareDates,
    exitCompare,
    attachMapStackController(controller) {
      mapStackController = controller || null;
    },
    comparePlaces: COMPARE_PLACES,
    openReefScan,
    closeReefScan,
    diveReefScan: () => reefScan?.dive(),
    setReefScanDate: (date) => reefScan?.setDate(date),
    reefScanPlots: REEF_SCAN_PLOTS,
    reefScanSource: REEF_SCAN_SOURCE,
    selectStation,
    products: NATURE_PRODUCTS,
  };
  return layer;
}
