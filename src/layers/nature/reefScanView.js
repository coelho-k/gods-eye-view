/**
 * Underwater viewer for one reef plot's 3D coral scans (Gaussian splats).
 *
 * Opening a plot flies to it from above, where the scan shows through the sea
 * surface. The camera then orbits the plot, so zooming in or tilting takes it
 * under the water. Below sea level the globe and sky give way to open water,
 * and the coral is all that is drawn. A scan date can be changed at any time;
 * the old scan stays until the new one has loaded, so the reef never blinks.
 */

import * as Cesium from 'cesium';
import {
  DIVE_RANGE_M,
  divePitch,
  reefScanId,
  reefScanPlot,
  reefScanTilesetUrl,
  seaLevelFromSamples,
} from './reefScans.js';

const WATER = '#0d4652';
const ABOVE = Object.freeze({ headingDeg: 20, pitchDeg: -55, rangeM: 70 });

const UNDERWATER_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform vec3 water;
void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  // Water absorbs red first; fade toward the water colour at the edges.
  vec3 tinted = color.rgb * vec3(0.82, 0.97, 1.03) + water * 0.08;
  float edge = smoothstep(0.25, 0.9, length(v_textureCoordinates - 0.5) * 1.4);
  out_FragColor = vec4(mix(tinted, water, edge * 0.55), color.a);
}`;

export function createReefScanView({
  viewer,
  requestRender = () => {},
  onChange = () => {},
}) {
  const scene = viewer.scene;
  const camera = viewer.camera;
  let plot = null;
  let date = null;
  let tileset = null; // the scan on screen
  let incoming = null; // { tileset, date } still loading
  let seaLevel = null;
  let frame = null; // ENU at the plot centre (world)
  let underwater = false;
  let saved = null;
  let stage = null;
  let removePreRender = null;
  let generation = 0;
  const scratch = new Cesium.Cartographic();

  function emit() {
    onChange(getState());
  }

  function getState() {
    return {
      open: Boolean(plot),
      plot: plot?.id || null,
      date,
      loading: Boolean(incoming),
      underwater,
    };
  }

  async function sampleSeaLevel(target) {
    const offsets = [
      [0, 0],
      [0.003, 0],
      [-0.003, 0],
      [0, 0.003],
      [0, -0.003],
    ];
    const points = offsets.map(([dLat, dLon]) =>
      Cesium.Cartographic.fromDegrees(target.lon + dLon, target.lat + dLat),
    );
    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(
        viewer.terrainProvider,
        points,
      );
      return seaLevelFromSamples(sampled.map((p) => p.height));
    } catch {
      return null;
    }
  }

  function centreWorld() {
    const [x, y, z] = plot.centre;
    const [ax, ay] = plot.anchor;
    const corner = Cesium.Cartesian3.fromDegrees(
      plot.lon,
      plot.lat,
      seaLevel ?? 0,
    );
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(corner);
    return Cesium.Matrix4.multiplyByPoint(
      enu,
      new Cesium.Cartesian3(x - ax, y - ay, z),
      new Cesium.Cartesian3(),
    );
  }

  function liftToSeaLevel(target) {
    const corner = Cesium.Cartesian3.fromDegrees(plot.lon, plot.lat, 0);
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      corner,
      new Cesium.Cartesian3(),
    );
    target.modelMatrix = Cesium.Matrix4.fromTranslation(
      Cesium.Cartesian3.multiplyByScalar(up, seaLevel ?? 0, up),
    );
  }

  async function loadScan(nextDate) {
    const mine = ++generation;
    if (incoming) {
      scene.primitives.remove(incoming.tileset);
      incoming = null;
    }
    let next;
    try {
      next = await Cesium.Cesium3DTileset.fromUrl(
        reefScanTilesetUrl(reefScanId(plot.id, nextDate)),
        { maximumScreenSpaceError: 8 },
      );
    } catch (error) {
      console.warn('[nature] reef scan failed:', error?.message || error);
      if (mine === generation) emit();
      return;
    }
    if (mine !== generation || !plot) {
      next.destroy();
      return;
    }
    liftToSeaLevel(next);
    // Keep the old scan on screen until this one has loaded.
    incoming = { tileset: next, date: nextDate };
    scene.primitives.add(next);
    emit();
    const swap = () => {
      if (!incoming || incoming.tileset !== next) return;
      if (tileset) scene.primitives.remove(tileset);
      tileset = next;
      date = nextDate;
      incoming = null;
      emit();
      requestRender();
    };
    next.initialTilesLoaded.addEventListener(swap);
    // A tileset that is off screen never reports loaded; swap anyway.
    setTimeout(swap, 20_000);
    requestRender();
  }

  function setUnderwater(next) {
    if (next === underwater) return;
    underwater = next;
    scene.globe.show = !next;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = !next;
    if (scene.skyBox) scene.skyBox.show = !next;
    if (scene.sun) scene.sun.show = !next && saved.sun;
    if (scene.moon) scene.moon.show = !next && saved.moon;
    scene.fog.enabled = !next && saved.fog;
    scene.backgroundColor = next
      ? Cesium.Color.fromCssColorString(WATER)
      : saved.background;
    if (stage) stage.enabled = next;
    emit();
  }

  function onPreRender() {
    if (!plot || seaLevel == null) return;
    const carto = Cesium.Cartographic.fromCartesian(
      camera.positionWC,
      undefined,
      scratch,
    );
    if (carto) setUnderwater(carto.height < seaLevel - 0.05);
  }

  function orbit(headingDeg, pitchRad, rangeM) {
    frame = Cesium.Transforms.eastNorthUpToFixedFrame(centreWorld());
    camera.lookAtTransform(
      frame,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(headingDeg),
        pitchRad,
        rangeM,
      ),
    );
  }

  function flyToOrbit(headingDeg, pitchRad, rangeM, duration) {
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    const mine = generation;
    camera.flyToBoundingSphere(new Cesium.BoundingSphere(centreWorld(), 1), {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(headingDeg),
        pitchRad,
        rangeM,
      ),
      duration,
      complete: () => {
        if (plot && mine === generation) orbit(headingDeg, pitchRad, rangeM);
      },
    });
  }

  function saveScene() {
    const controller = scene.screenSpaceCameraController;
    saved = {
      collision: controller.enableCollisionDetection,
      minZoom: controller.minimumZoomDistance,
      background: Cesium.Color.clone(scene.backgroundColor),
      fog: scene.fog.enabled,
      sun: scene.sun?.show ?? false,
      moon: scene.moon?.show ?? false,
    };
    controller.enableCollisionDetection = false;
    controller.minimumZoomDistance = 0.3;
    stage = scene.postProcessStages.add(
      new Cesium.PostProcessStage({
        fragmentShader: UNDERWATER_SHADER,
        uniforms: { water: Cesium.Color.fromCssColorString(WATER) },
      }),
    );
    stage.enabled = false;
    removePreRender = scene.preRender.addEventListener(onPreRender);
  }

  function restoreScene() {
    if (!saved) return;
    setUnderwater(false);
    const controller = scene.screenSpaceCameraController;
    controller.enableCollisionDetection = saved.collision;
    controller.minimumZoomDistance = saved.minZoom;
    if (stage) scene.postProcessStages.remove(stage);
    stage = null;
    removePreRender?.();
    removePreRender = null;
    saved = null;
  }

  /** Fly to a plot and load one of its scans (the newest by default). */
  async function open(plotId, nextDate) {
    const next = reefScanPlot(plotId);
    if (!next) return false;
    const switching = plot && plot.id !== next.id;
    if (switching) close();
    plot = next;
    if (!saved) saveScene();
    const mine = ++generation;
    seaLevel = await sampleSeaLevel(plot);
    if (mine !== generation || !plot) return false;
    await loadScan(
      next.dates.includes(nextDate) ? nextDate : next.dates.at(-1),
    );
    flyToOrbit(
      ABOVE.headingDeg,
      Cesium.Math.toRadians(ABOVE.pitchDeg),
      ABOVE.rangeM,
      3,
    );
    emit();
    return true;
  }

  /** Swim down to just above the reef. */
  function dive() {
    if (!plot) return;
    const depth = -plot.centre[2];
    flyToOrbit(ABOVE.headingDeg, divePitch(depth), DIVE_RANGE_M, 3);
  }

  function setDate(nextDate) {
    if (!plot || !plot.dates.includes(nextDate)) return;
    if (nextDate === date && !incoming) return;
    void loadScan(nextDate);
  }

  function close() {
    if (!plot && !saved) return;
    generation++;
    if (incoming) scene.primitives.remove(incoming.tileset);
    if (tileset) scene.primitives.remove(tileset);
    incoming = null;
    tileset = null;
    // Surface first: the globe comes back and would hide an underwater camera.
    if (plot && underwater)
      orbit(ABOVE.headingDeg, Cesium.Math.toRadians(-60), 300);
    // Leave the orbit so the normal camera controls come back.
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    restoreScene();
    plot = null;
    date = null;
    frame = null;
    seaLevel = null;
    emit();
    requestRender();
  }

  return { open, dive, setDate, close, getState };
}
