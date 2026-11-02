/**
 * qa-nature.mjs — headless proof for the Nature timeline layer.
 *
 * Turns the layer on, checks that NOAA Coral Reef Watch stations load through
 * the local proxy, flies to a featured place, scrubs the date, opens a reef
 * station's 40-year history, and saves screenshots along the way.
 *
 * Run:  node scripts/qa-nature.mjs --url http://localhost:4173 --out ./qa-out
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4173');
const OUT = getOpt('--out', 'qa-out/nature');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function record(name, ok, detail) {
  if (!ok) failures++;
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${tag}] ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
    defaultViewport: { width: 1400, height: 900 },
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && /nature|coral/i.test(text))
        errors.push(text.slice(0, 200));
    });
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      () => window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager,
      { timeout: 90000 },
    );
    await sleep(2000);
    // Dismiss the first-run chooser if it is showing.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) =>
        /explore manually/i.test(b.textContent || ''),
      );
      button?.click();
    });
    await sleep(800);

    const stats = await page.evaluate(async () => {
      const dm = window.__godsEyeView.dataManager;
      await dm.setEnabled('nature', true);
      const mod = dm.layers.get('nature')?.module;
      if (!mod) return { missing: true };
      let s = null;
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        s = mod.getStats();
        if (s.count > 0 || s.error) break;
      }
      return s;
    });
    record(
      'coral stations load through the proxy',
      stats?.count > 150 && !stats?.error,
      `count=${stats?.count} error=${stats?.error}`,
    );
    const panelVisible = await page.evaluate(
      () => !document.querySelector('.nature-panel')?.hidden,
    );
    record('nature panel is visible', panelVisible);
    await sleep(6000);
    await page.screenshot({ path: join(OUT, '1-global-dhw-latest.png') });

    // Featured place: Great Barrier Reef, March 2024.
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.goToPlace('gbr-2024'),
    );
    await sleep(12000);
    const state1 = await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers.get('nature').module.getState(),
    );
    record(
      'place sets product and date',
      state1.product === 'coral-dhw' && state1.day === '2024-03-15',
      JSON.stringify(state1),
    );
    await page.screenshot({ path: join(OUT, '2-gbr-2024-03-15.png') });

    // Same place, a calm year, to show change over time.
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.setDay('2021-03-15'),
    );
    await sleep(10000);
    await page.screenshot({ path: join(OUT, '3-gbr-2021-03-15.png') });

    // Station card with 40-year history.
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.selectStation('gbr_far_northern'),
    );
    await sleep(12000);
    const card = await page.evaluate(() => ({
      text: document.querySelector('.nature-station-at')?.textContent || '',
      chart: Boolean(document.querySelector('.nature-chart')),
    }));
    record(
      'station history loads',
      card.chart && /DHW/.test(card.text),
      card.text.slice(0, 120),
    );
    await page.screenshot({ path: join(OUT, '4-station-card.png') });

    // Fires: Black Summer.
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.goToPlace('black-summer'),
    );
    await sleep(14000);
    await page.screenshot({ path: join(OUT, '5-fires-black-summer.png') });

    // Mangroves.
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.goToPlace('sundarbans'),
    );
    await sleep(12000);
    await page.screenshot({ path: join(OUT, '6-mangroves-sundarbans.png') });

    // Land cover in Rondônia, 2001 vs 2024.
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.goToPlace('rondonia'),
    );
    await sleep(12000);
    await page.screenshot({ path: join(OUT, '7-rondonia-2001.png') });
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.setDay('2024-01-01'),
    );
    await sleep(10000);
    await page.screenshot({ path: join(OUT, '8-rondonia-2024.png') });

    const state = () =>
      page.evaluate(() =>
        window.__godsEyeView.dataManager.layers.get('nature').module.getState(),
      );

    // Remaining products, each over a place where it has something to show.
    const views = [
      ['forest-disturbance', null, -9.0, -55.5, 500_000, '9-disturbance'],
      ['sea-temp-anomaly', '2024-03-15', -15, 150, 5_000_000, '10-sst-anomaly'],
      ['vegetation', null, -5, 20, 6_000_000, '11-ndvi'],
    ];
    for (const [product, day, lat, lon, height, name] of views) {
      await page.evaluate(
        (args) => {
          const [productId, d, la, lo, h] = args;
          const gev = window.__godsEyeView;
          const mod = gev.dataManager.layers.get('nature').module;
          mod.setProduct(productId);
          if (d) mod.setDay(d);
          gev.viewer.camera.cancelFlight?.();
          gev.viewer.camera.setView({
            destination: window.Cesium
              ? window.Cesium.Cartesian3.fromDegrees(lo, la, h)
              : gev.viewer.scene.globe.ellipsoid.cartographicToCartesian({
                  longitude: (lo * Math.PI) / 180,
                  latitude: (la * Math.PI) / 180,
                  height: h,
                }),
          });
        },
        [product, day, lat, lon, height],
      );
      await sleep(12000);
      await page.screenshot({ path: join(OUT, `${name}.png`) });
    }

    // Real controls: the product dropdown.
    await page.select('.nature-panel [data-role="product"]', 'coral-dhw');
    await sleep(500);
    record(
      'product dropdown switches the map',
      (await state()).product === 'coral-dhw',
    );

    // Real controls: dragging the slider.
    const before = (await state()).day;
    await page.evaluate(() => {
      const slider = document.querySelector(
        '.nature-panel [data-role="slider"]',
      );
      slider.value = String(Math.floor(Number(slider.max) / 2));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The slider waits for the hand to settle; the headless GPU is slow.
    let afterSlide = before;
    for (let i = 0; i < 25 && afterSlide === before; i++) {
      await sleep(200);
      afterSlide = (await state()).day;
    }
    record(
      'slider input changes the date',
      afterSlide && afterSlide !== before,
      `${before} → ${afterSlide}`,
    );

    // Real controls: play, then pause.
    await page.click('.nature-panel [data-role="play"]');
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const s = await state();
      seen.add(s.day);
      if (seen.size >= 3) break;
    }
    record(
      'play advances the date repeatedly',
      seen.size >= 3,
      [...seen].join(', '),
    );
    await page.click('.nature-panel [data-role="play"]');
    await sleep(500);
    const paused = await state();
    await sleep(2500);
    const stillPaused = await state();
    record(
      'pause stops playback',
      !stillPaused.playing && paused.day === stillPaused.day,
      `${paused.day} / ${stillPaused.day}`,
    );

    // Real controls: the Go-to dropdown with a reef station.
    await page.select(
      '.nature-panel [data-role="place"]',
      'station:gbr_far_northern',
    );
    await sleep(3000);
    record(
      'Go-to station opens the station card',
      (await state()).station === 'gbr_far_northern' &&
        (await page.evaluate(
          () =>
            !document.querySelector('.nature-panel [data-role="station"]')
              ?.hidden,
        )),
    );
    await page.click('.nature-panel [data-role="station-close"]');
    await sleep(500);

    // Real click on a reef marker on the globe.
    await sleep(6000);
    const point = await page.evaluate(() => {
      const gev = window.__godsEyeView;
      const viewer = gev.viewer;
      const source = viewer.dataSources.getByName('nature-coral-stations')[0];
      const ctor = viewer.scene.camera.position.constructor;
      for (const entity of source.entities.values) {
        const position = entity.position.getValue(viewer.clock.currentTime);
        const Cesium = window.Cesium;
        const win = Cesium?.SceneTransforms?.worldToWindowCoordinates
          ? Cesium.SceneTransforms.worldToWindowCoordinates(
              viewer.scene,
              position,
            )
          : viewer.scene.cartesianToCanvasCoordinates(position);
        const canvas = viewer.scene.canvas.getBoundingClientRect();
        if (
          win &&
          win.x > 300 &&
          win.x < canvas.width - 300 &&
          win.y > 320 &&
          win.y < canvas.height - 200
        )
          return {
            x: win.x + canvas.left,
            y: win.y + canvas.top,
            id: entity.id,
          };
      }
      return ctor ? null : null;
    });
    if (point) {
      await page.mouse.click(point.x, point.y);
      await sleep(3000);
      const clicked = await state();
      record(
        'clicking a reef marker opens its card',
        clicked.station && point.id.endsWith(clicked.station),
        `${point.id} → ${clicked.station}`,
      );
      await page.screenshot({ path: join(OUT, '13-marker-click.png') });
    } else {
      record(
        'clicking a reef marker opens its card',
        false,
        'no marker on screen',
      );
    }

    // 3D before/after: a curated place swipes two imagery years over terrain.
    await page.select(
      '.nature-panel [data-role="place"]',
      'compare:jasper-2024',
    );
    await sleep(20000);
    const imageryCompare = await page.evaluate(() => ({
      state: window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.getState().compare,
      split: Boolean(document.getElementById('nature-split-line')),
      pitch: window.__godsEyeView.viewer.camera.pitch,
    }));
    record(
      '3D place opens an imagery before/after with a tilted camera',
      imageryCompare.state?.kind === 'imagery' &&
        imageryCompare.state.before === 's2:2023' &&
        imageryCompare.state.after === 's2:2025' &&
        imageryCompare.split &&
        imageryCompare.pitch > -0.8,
      JSON.stringify(imageryCompare),
    );
    await page.screenshot({ path: join(OUT, '14-3d-jasper.png') });
    await page.select('.nature-panel [data-role="compare-after"]', 's2:2024');
    await sleep(800);
    record(
      'after picker changes the right side',
      (await state()).compare?.after === 's2:2024',
    );
    await page.click('.nature-panel [data-role="compare-exit"]');
    await sleep(800);
    record(
      'closing before/after removes the divider',
      !(await state()).compare &&
        !(await page.evaluate(() =>
          document.getElementById('nature-split-line'),
        )),
    );

    // Date compare: pin a date on the left, move the slider on the right.
    await page.select('.nature-panel [data-role="product"]', 'coral-dhw');
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.setDay('2021-03-15'),
    );
    await sleep(500);
    await page.click('.nature-panel [data-role="compare-dates"]');
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.layers
        .get('nature')
        .module.setDay('2024-03-15'),
    );
    await sleep(500);
    const dateCompare = (await state()).compare;
    record(
      'date compare keeps the pinned date left and the slider right',
      dateCompare?.kind === 'map' &&
        dateCompare.before === '2021-03-15' &&
        dateCompare.after === '2024-03-15',
      JSON.stringify(dateCompare),
    );
    await page.click('.nature-panel [data-role="compare-dates"]');
    await sleep(500);
    record('date compare toggles off', !(await state()).compare);

    // Underwater 3D coral scan: open, dive, change date, close.
    await page.select('.nature-panel [data-role="place"]', 'scan:hb');
    const waitScan = async (test, ms = 60_000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const scan = (await state()).reefScan;
        if (test(scan)) return scan;
        await sleep(500);
      }
      return (await state()).reefScan;
    };
    const opened = await waitScan((s) => s?.date && !s.loading);
    record(
      'reef scan opens on the newest survey',
      opened?.plot === 'hb' && opened.date === '2026-03-04',
      JSON.stringify(opened),
    );
    await sleep(4000);
    await page.click('.nature-panel [data-role="scan-dive"]');
    const dived = await waitScan((s) => s?.underwater, 15_000);
    const globeHidden = await page.evaluate(
      () => !window.__godsEyeView.viewer.scene.globe.show,
    );
    record(
      'diving takes the camera under water and hides the globe',
      dived?.underwater === true && globeHidden,
      JSON.stringify(dived),
    );
    await page.screenshot({ path: `${OUT}/nature-reef-scan.png` });
    await page.click(
      '.nature-panel [data-role="scan-dates"] button[data-date="2025-07-10"]',
    );
    const switched = await waitScan(
      (s) => s?.date === '2025-07-10' && !s.loading,
    );
    record(
      'a scan date button swaps in that survey',
      switched?.date === '2025-07-10',
      JSON.stringify(switched),
    );
    await page.click('.nature-panel [data-role="scan-exit"]');
    await sleep(800);
    const after = await page.evaluate(() => ({
      globe: window.__godsEyeView.viewer.scene.globe.show,
      collision:
        window.__godsEyeView.viewer.scene.screenSpaceCameraController
          .enableCollisionDetection,
      height: window.__godsEyeView.viewer.camera.positionCartographic.height,
    }));
    record(
      'closing the scan surfaces the camera and restores the globe',
      !(await state()).reefScan &&
        after.globe &&
        after.collision &&
        after.height > -90,
      JSON.stringify(after),
    );

    record(
      'no nature errors in the console',
      errors.length === 0,
      errors.join(' | '),
    );
  } finally {
    await browser.close();
  }
  console.log(
    failures ? `\n${failures} check(s) failed` : '\nAll checks passed',
  );
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
