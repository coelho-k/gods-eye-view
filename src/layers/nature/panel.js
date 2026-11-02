import { t, tn } from '../../i18n/index.js';
import {
  NATURE_PRODUCTS,
  NATURE_PLACES,
  coralAlert,
  dayMs,
} from './products.js';
import { COMPARE_PLACES, S2_CLOUDLESS_YEARS } from './compare.js';
import { REEF_SCAN_PLOTS, REEF_SCAN_SOURCE } from './reefScans.js';

/** Escape text for safe insertion into markup. */
function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function signed(value, digits = 2) {
  return Number.isFinite(value)
    ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
    : '—';
}

/** One reading line: alert, DHW and sea temperature (units stay English). */
function readingText(alertLevel, dhw, sst, ssta) {
  return t('{alert} · DHW {dhw} °C-weeks · SST {sst} °C ({anomaly})', {
    alert: t(coralAlert(alertLevel ?? 0).label),
    dhw: fmt(dhw),
    sst: fmt(sst, 2),
    anomaly: signed(ssta),
  });
}

/**
 * The floating Nature panel: product picker, place shortcuts, date slider with
 * playback, legend and caveat, and a coral station card with a DHW history
 * chart. It owns only DOM; the layer passes callbacks in.
 */
export function createNaturePanel({
  onProduct,
  onDateIndex,
  onPlay,
  onPlace,
  onComparePlace = () => {},
  onStation,
  onCloseStation,
  onCompareImagery = () => {},
  onCompareDates = () => {},
  onCompareSide = () => {},
  onCompareExit = () => {},
  onScanPlace = () => {},
  onScanDate = () => {},
  onScanDive = () => {},
  onScanExit = () => {},
}) {
  const root = document.createElement('section');
  root.className = 'nature-panel';
  root.setAttribute('aria-label', t('Nature timeline'));
  root.hidden = true;

  const groups = [...new Set(NATURE_PRODUCTS.map((p) => p.group))];
  const productOptions = groups
    .map((group) => {
      const options = NATURE_PRODUCTS.filter((p) => p.group === group)
        .map((p) => `<option value="${esc(p.id)}">${esc(t(p.label))}</option>`)
        .join('');
      return `<optgroup label="${esc(t(group))}">${options}</optgroup>`;
    })
    .join('');
  const placeOptions = NATURE_PLACES.map(
    (p) => `<option value="place:${esc(p.id)}">${esc(t(p.name))}</option>`,
  ).join('');
  const scanPlaceOptions = REEF_SCAN_PLOTS.map(
    (p) =>
      `<option value="scan:${esc(p.id)}">${esc(
        tn(p.dates.length, '{name} · {count} scan', '{name} · {count} scans', {
          name: t(p.name),
        }),
      )}</option>`,
  ).join('');
  const comparePlaceOptions = COMPARE_PLACES.map(
    (p) => `<option value="compare:${esc(p.id)}">${esc(t(p.name))}</option>`,
  ).join('');

  root.innerHTML = `
    <header class="nature-head">
      <span class="nature-title">${esc(t('NATURE'))}</span>
      <label class="nature-field">
        <span class="nature-sr">${esc(t('Map'))}</span>
        <select data-role="product">${productOptions}</select>
      </label>
      <label class="nature-field">
        <span class="nature-sr">${esc(t('Go to'))}</span>
        <select data-role="place">
          <option value="">${esc(t('Go to…'))}</option>
          <optgroup label="${esc(t('Underwater 3D coral scans · Maldives'))}">${scanPlaceOptions}</optgroup>
          <optgroup label="${esc(t('3D before/after'))}">${comparePlaceOptions}</optgroup>
          <optgroup label="${esc(t('Featured'))}">${placeOptions}</optgroup>
          <optgroup label="${esc(t('Coral reef stations (NOAA)'))}" data-role="place-stations"></optgroup>
        </select>
      </label>
      <button type="button" class="nature-btn nature-3d" data-role="compare-imagery" aria-pressed="false" title="${esc(t('3D before/after: swipe satellite imagery from two years over the terrain'))}">3D ⇆</button>
      <button type="button" class="nature-collapse" data-role="collapse" aria-expanded="true" title="${esc(t('Collapse'))}">▾</button>
    </header>
    <div class="nature-body" data-role="body">
      <p class="nature-measures" data-role="measures"></p>
      <div class="nature-legend" data-role="legend"></div>
      <div class="nature-time" data-role="time">
        <button type="button" class="nature-btn" data-role="back" title="${esc(t('Step back'))}">◀</button>
        <button type="button" class="nature-btn nature-play" data-role="play" title="${esc(t('Play'))}">▶</button>
        <button type="button" class="nature-btn" data-role="fwd" title="${esc(t('Step forward'))}">▶|</button>
        <input type="range" data-role="slider" min="0" max="0" value="0" aria-label="${esc(t('Date'))}" />
        <span class="nature-date" data-role="date"></span>
        <button type="button" class="nature-btn" data-role="compare-dates" aria-pressed="false" title="${esc(t('Compare dates: keep this date on the left, then move the slider'))}">⇆</button>
      </div>
      <div class="nature-compare" data-role="compare" hidden>
        <div class="nature-compare-row">
          <span class="nature-compare-title">${esc(t('BEFORE / AFTER'))}</span>
          <label class="nature-field" data-role="compare-pickers">
            <span class="nature-sr">${esc(t('Before'))}</span>
            <select data-role="compare-before"></select>
          </label>
          <label class="nature-field" data-role="compare-pickers-after">
            <span class="nature-sr">${esc(t('After'))}</span>
            <select data-role="compare-after"></select>
          </label>
          <button type="button" class="nature-btn" data-role="compare-exit" title="${esc(t('Close before/after'))}">✕</button>
        </div>
        <p class="nature-compare-side" data-role="compare-before-text"></p>
        <p class="nature-compare-side" data-role="compare-after-text"></p>
        <p class="nature-compare-note" data-role="compare-note"></p>
      </div>
      <div class="nature-scan" data-role="scan" hidden>
        <div class="nature-compare-row">
          <span class="nature-compare-title">${esc(t('UNDERWATER 3D SCAN'))}</span>
          <label class="nature-field nature-scan-name">
            <span class="nature-sr">${esc(t('Reef plot'))}</span>
            <select data-role="scan-plot">${REEF_SCAN_PLOTS.map(
              (p) => `<option value="${esc(p.id)}">${esc(t(p.name))}</option>`,
            ).join('')}</select>
          </label>
          <button type="button" class="nature-btn" data-role="scan-exit" title="${esc(t('Close the scan'))}">✕</button>
        </div>
        <div class="nature-scan-dates" data-role="scan-dates" role="group" aria-label="${esc(t('Scan date'))}"></div>
        <div class="nature-compare-row">
          <button type="button" class="nature-btn nature-dive" data-role="scan-dive">${esc(t('Dive in'))}</button>
          <span class="nature-scan-status" data-role="scan-status"></span>
        </div>
        <p class="nature-compare-note" data-role="scan-note"></p>
      </div>
      <div class="nature-range" data-role="range"></div>
      <p class="nature-caveat" data-role="caveat"></p>
      <div class="nature-station" data-role="station" hidden></div>
      <p class="nature-status" data-role="status"></p>
    </div>`;

  const $ = (role) => root.querySelector(`[data-role="${role}"]`);
  const refs = {
    product: $('product'),
    place: $('place'),
    stations: $('place-stations'),
    body: $('body'),
    collapse: $('collapse'),
    measures: $('measures'),
    legend: $('legend'),
    time: $('time'),
    back: $('back'),
    play: $('play'),
    fwd: $('fwd'),
    slider: $('slider'),
    date: $('date'),
    range: $('range'),
    caveat: $('caveat'),
    station: $('station'),
    status: $('status'),
    compareImagery: $('compare-imagery'),
    compareDates: $('compare-dates'),
    compare: $('compare'),
    compareBefore: $('compare-before'),
    compareAfter: $('compare-after'),
    comparePickers: [$('compare-pickers'), $('compare-pickers-after')],
    compareBeforeText: $('compare-before-text'),
    compareAfterText: $('compare-after-text'),
    compareNote: $('compare-note'),
    compareExit: $('compare-exit'),
    scan: $('scan'),
    scanPlot: $('scan-plot'),
    scanDates: $('scan-dates'),
    scanDive: $('scan-dive'),
    scanStatus: $('scan-status'),
    scanNote: $('scan-note'),
    scanExit: $('scan-exit'),
  };

  // Keep globe gestures from firing through the panel.
  for (const type of ['pointerdown', 'wheel', 'dblclick', 'keydown'])
    root.addEventListener(type, (event) => event.stopPropagation());

  let dates = [];
  let sliderTimer = null;
  let stationChart = null;
  let onPickDate = null;

  refs.product.addEventListener('change', () => onProduct(refs.product.value));
  refs.place.addEventListener('change', () => {
    const value = refs.place.value;
    refs.place.value = '';
    if (value.startsWith('place:')) onPlace(value.slice(6));
    else if (value.startsWith('compare:')) onComparePlace(value.slice(8));
    else if (value.startsWith('scan:')) onScanPlace(value.slice(5));
    else if (value.startsWith('station:')) onStation(value.slice(8));
  });
  refs.slider.addEventListener('input', () => {
    const index = Number(refs.slider.value);
    refs.date.textContent = dates[index] || '';
    clearTimeout(sliderTimer);
    // Wait for the hand to settle before asking the server for a new map.
    sliderTimer = setTimeout(() => onDateIndex(index), 220);
  });
  refs.back.addEventListener('click', () =>
    onDateIndex(Math.max(0, Number(refs.slider.value) - 1)),
  );
  refs.fwd.addEventListener('click', () =>
    onDateIndex(Math.min(dates.length - 1, Number(refs.slider.value) + 1)),
  );
  refs.play.addEventListener('click', () => onPlay());
  refs.compareImagery.addEventListener('click', () => onCompareImagery());
  refs.compareDates.addEventListener('click', () => onCompareDates());
  refs.compareExit.addEventListener('click', () => onCompareExit());
  refs.scanExit.addEventListener('click', () => onScanExit());
  refs.scanPlot.addEventListener('change', () =>
    onScanPlace(refs.scanPlot.value),
  );
  refs.scanDive.addEventListener('click', () => onScanDive());
  refs.scanDates.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-date]');
    if (button) onScanDate(button.dataset.date);
  });
  refs.compareBefore.addEventListener('change', () =>
    onCompareSide('before', refs.compareBefore.value),
  );
  refs.compareAfter.addEventListener('change', () =>
    onCompareSide('after', refs.compareAfter.value),
  );

  /** Year mosaics, then one sharp Esri release per year once loaded. */
  function sourceOptions(wayback) {
    const years = S2_CLOUDLESS_YEARS.map(
      (year) =>
        `<option value="s2:${year}">${esc(t('Sentinel-2 {year} · 10 m', { year }))}</option>`,
    ).join('');
    const releases = wayback
      .map(
        (release) =>
          `<option value="wb:${release.id}">${esc(t('Esri Wayback {date} · sharp', { date: release.date }))}</option>`,
      )
      .join('');
    return (
      `<optgroup label="${esc(t('Cloud-free yearly mosaic'))}">${years}</optgroup>` +
      (releases
        ? `<optgroup label="${esc(t('Sharp imagery archive'))}">${releases}</optgroup>`
        : '')
    );
  }
  let compareOptionsKey = '';
  refs.collapse.addEventListener('click', () => {
    const collapsed = !refs.body.hidden;
    refs.body.hidden = collapsed;
    refs.collapse.textContent = collapsed ? '▴' : '▾';
    refs.collapse.title = collapsed ? t('Expand') : t('Collapse');
    refs.collapse.setAttribute('aria-expanded', String(!collapsed));
  });

  return {
    element: root,
    show(visible) {
      root.hidden = !visible;
    },
    setProduct(product, productDates, index) {
      dates = productDates;
      refs.product.value = product.id;
      refs.measures.textContent = `${t(product.measures)} · ${product.resolution}`;
      refs.caveat.textContent = t(product.caveat);
      refs.legend.innerHTML = product.legend.length
        ? product.legend
            .map(
              (item) =>
                `<span class="nature-legend-item"><span class="nature-swatch" style="background:${esc(item.color)}"></span>${esc(t(item.label))}</span>`,
            )
            .join('') +
          (product.legendUnits
            ? `<span class="nature-legend-units">${esc(product.legendUnits)}</span>`
            : '')
        : '';
      const single = productDates.length <= 1;
      refs.time.hidden = single;
      refs.slider.max = String(Math.max(0, productDates.length - 1));
      refs.range.textContent = single
        ? t('Snapshot · {source}', { source: product.source })
        : `${productDates[0]} → ${productDates.at(-1)} · ${product.source}`;
      this.setDateIndex(index);
    },
    setDateIndex(index) {
      refs.slider.value = String(index);
      refs.date.textContent = dates[index] || '';
      stationChart?.setCursor(dates[index]);
    },
    /** Dim the date while the map for it is still loading. */
    setLoading(loading) {
      refs.date.classList.toggle('is-loading', Boolean(loading));
    },
    setPlaying(playing) {
      refs.play.textContent = playing ? '❚❚' : '▶';
      refs.play.title = playing ? t('Pause') : t('Play');
    },
    setStatus(text) {
      refs.status.textContent = text || '';
    },
    showStationsLoaded(count, latest) {
      refs.status.textContent = tn(
        count,
        '{count} NOAA reef station · latest data {date}',
        '{count} NOAA reef stations · latest data {date}',
        { date: latest || '—' },
      );
    },
    showStationsFailed() {
      refs.status.textContent = t('Reef stations unavailable');
    },
    setStations(stations) {
      const sorted = [...stations].sort(
        (a, b) =>
          (b.alert ?? 0) - (a.alert ?? 0) || a.name.localeCompare(b.name),
      );
      // Station names are NOAA data and stay as published.
      refs.stations.innerHTML = sorted
        .map(
          (s) =>
            `<option value="station:${esc(s.id)}">${esc(s.name)} · ${esc(t(coralAlert(s.alert ?? 0).label))}</option>`,
        )
        .join('');
    },
    /** Show a station; its history arrives later via setStationSeries. */
    showStation(station, options = {}) {
      onPickDate = options.onPickDate || null;
      stationChart = null;
      const alert = coralAlert(station.alert ?? 0);
      refs.station.hidden = false;
      refs.station.innerHTML = `
        <div class="nature-station-head">
          <span class="nature-swatch" style="background:${esc(alert.color)}"></span>
          <strong>${esc(station.name)}</strong>
          <button type="button" class="nature-btn" data-role="station-close" title="${esc(t('Close'))}">✕</button>
        </div>
        <div class="nature-station-now">${esc(
          t('Latest {date}: {reading}', {
            date: station.date || '—',
            reading: readingText(
              station.alert,
              station.dhw,
              station.sst,
              station.ssta,
            ),
          }),
        )}</div>
        <div class="nature-station-at" data-role="station-at">${esc(t('Loading daily history since 1985…'))}</div>
        <canvas class="nature-chart" data-role="chart" width="640" height="120" aria-label="${esc(t('Degree Heating Weeks history'))}"></canvas>
        <div class="nature-chart-axis" data-role="chart-axis"></div>
        <a class="nature-link" href="https://coralreefwatch.noaa.gov/product/vs/gauges/${esc(station.id)}.php" target="_blank" rel="noopener noreferrer">${esc(t('NOAA station page ↗'))}</a>`;
      refs.station
        .querySelector('[data-role="station-close"]')
        .addEventListener('click', () => onCloseStation());
    },
    setStationSeries(series, currentDay) {
      const canvas = refs.station.querySelector('[data-role="chart"]');
      const at = refs.station.querySelector('[data-role="station-at"]');
      const axis = refs.station.querySelector('[data-role="chart-axis"]');
      if (!canvas || !series?.dates?.length) {
        if (at) at.textContent = t('History unavailable');
        return;
      }
      stationChart = createDhwChart(canvas, at, series, (day) =>
        onPickDate?.(day),
      );
      axis.textContent = t(
        '{first} → {last} · DHW (°C-weeks), dashed lines at 4 and 8 · click the chart to jump to a date',
        { first: series.dates[0].slice(0, 4), last: series.dates.at(-1) },
      );
      stationChart.setCursor(currentDay);
    },
    hideStation() {
      refs.station.hidden = true;
      refs.station.innerHTML = '';
      stationChart = null;
      onPickDate = null;
    },
    /** Show the before/after section for an imagery or a date comparison. */
    showCompare(view) {
      const imagery = view.kind === 'imagery';
      refs.compare.hidden = false;
      // Imagery mode does not use the timeline; keep the view clear.
      root.classList.toggle('is-imagery-compare', imagery);
      for (const picker of refs.comparePickers) picker.hidden = !imagery;
      refs.compareImagery.setAttribute('aria-pressed', String(imagery));
      refs.compareDates.setAttribute('aria-pressed', String(!imagery));
      if (imagery) {
        const key = view.wayback.map((r) => r.id).join(',');
        if (key !== compareOptionsKey || !refs.compareBefore.options.length) {
          compareOptionsKey = key;
          const options = sourceOptions(view.wayback);
          refs.compareBefore.innerHTML = options;
          refs.compareAfter.innerHTML = options;
        }
        for (const [select, value] of [
          [refs.compareBefore, view.beforeKey],
          [refs.compareAfter, view.afterKey],
        ]) {
          // A curated release that is not the year's newest still shows.
          if (value && ![...select.options].some((o) => o.value === value)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = view.releaseDates?.[value]
              ? t('Esri Wayback {date} · sharp', {
                  date: view.releaseDates[value],
                })
              : value;
            select.append(option);
          }
          select.value = value || '';
        }
      }
      refs.compareBeforeText.textContent = view.beforeText
        ? `◀ ${view.beforeText}`
        : '';
      refs.compareAfterText.textContent = view.afterText
        ? `▶ ${view.afterText}`
        : '';
      refs.compareNote.textContent = view.note || '';
    },
    /** Show the underwater scan section: plot, its dates and loading state. */
    showScan(view) {
      const plot = view.plot;
      if (!plot) return;
      refs.scan.hidden = false;
      root.classList.add('is-scan');
      refs.scanPlot.value = plot.id;
      const key = `${plot.id}:${plot.dates.join(',')}`;
      if (refs.scanDates.dataset.key !== key) {
        refs.scanDates.dataset.key = key;
        refs.scanDates.innerHTML = plot.dates
          .map(
            (date) =>
              `<button type="button" class="nature-btn nature-scan-date" data-date="${esc(date)}" aria-pressed="false">${esc(date)}</button>`,
          )
          .join('');
      }
      for (const button of refs.scanDates.querySelectorAll('button')) {
        const shown = button.dataset.date === view.date;
        button.setAttribute('aria-pressed', String(shown));
      }
      refs.scanStatus.textContent = view.loading
        ? t('Loading scan… the first view of each date takes a few seconds')
        : view.underwater
          ? t('Under water · drag to look around, scroll to move')
          : t('Above the water · scroll in or press Dive in');
      refs.scanStatus.classList.toggle('is-loading', Boolean(view.loading));
      refs.scanNote.innerHTML = `${esc(
        t(
          '{habitat}. Diver photogrammetry turned into 3D Gaussian splats, same plot on each date. Position is good to a few metres; heading assumed north-up.',
          { habitat: t(plot.habitat) },
        ),
      )} <a class="nature-link" href="${esc(REEF_SCAN_SOURCE.url)}" target="_blank" rel="noopener noreferrer">${esc(REEF_SCAN_SOURCE.name)} · ${esc(REEF_SCAN_SOURCE.licence)} ↗</a>`;
    },
    hideScan() {
      refs.scan.hidden = true;
      root.classList.remove('is-scan');
    },
    hideCompare() {
      refs.compare.hidden = true;
      root.classList.remove('is-imagery-compare');
      refs.compareImagery.setAttribute('aria-pressed', 'false');
      refs.compareDates.setAttribute('aria-pressed', 'false');
    },
    destroy() {
      clearTimeout(sliderTimer);
      root.remove();
    },
  };
}

/** Draw a whole-history DHW chart with a cursor at the selected date. */
function createDhwChart(canvas, readout, series, onPick) {
  const ctx = canvas.getContext('2d');
  const { dates, dhw, sst, ssta, alert } = series;
  const first = dayMs(dates[0]);
  const last = dayMs(dates.at(-1));
  const W = canvas.width;
  const H = canvas.height;
  const pad = { l: 4, r: 4, t: 6, b: 4 };
  const maxDhw = Math.max(
    12,
    ...dhw.filter((v) => Number.isFinite(v)).map((v) => Math.ceil(v)),
  );
  const x = (ms) =>
    pad.l + ((ms - first) / (last - first || 1)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / maxDhw) * (H - pad.t - pad.b);

  // Per-column maximum so 40 years fit without aliasing.
  const columns = new Float32Array(W).fill(-1);
  const colAlert = new Int8Array(W);
  for (let i = 0; i < dates.length; i++) {
    const v = dhw[i];
    if (!Number.isFinite(v)) continue;
    const c = Math.max(0, Math.min(W - 1, Math.round(x(dayMs(dates[i])))));
    if (v > columns[c]) {
      columns[c] = v;
      colAlert[c] = alert[i] ?? 0;
    }
  }
  let cursorDay = null;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, W, H);
    for (let c = 0; c < W; c++) {
      if (columns[c] < 0) continue;
      ctx.fillStyle = coralAlert(colAlert[c]).color;
      const top = y(columns[c]);
      ctx.fillRect(c, top, 1, H - pad.b - top);
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (const level of [4, 8]) {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(level));
      ctx.lineTo(W - pad.r, y(level));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (cursorDay) {
      const cx = x(dayMs(cursorDay));
      if (cx >= 0 && cx <= W) {
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }

  function indexOfDay(day) {
    const i = Math.round((dayMs(day) - first) / 86_400_000);
    if (i >= 0 && i < dates.length && dates[i] === day) return i;
    return dates.indexOf(day);
  }

  function describe(day) {
    const i = indexOfDay(day);
    if (i < 0) {
      readout.textContent = day
        ? t("{date}: outside this station's record ({first} → {last})", {
            date: day,
            first: dates[0],
            last: dates.at(-1),
          })
        : '';
      return;
    }
    const swatch = document.createElement('span');
    swatch.className = 'nature-swatch';
    swatch.style.background = coralAlert(alert[i] ?? 0).color;
    readout.replaceChildren(
      swatch,
      `${day}: ${readingText(alert[i], dhw[i], sst[i], ssta[i])}`,
    );
  }

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const ms = first + ((px - pad.l) / (W - pad.l - pad.r)) * (last - first);
    const clamped = Math.max(first, Math.min(last, ms));
    onPick?.(new Date(clamped).toISOString().slice(0, 10));
  });

  draw();
  return {
    setCursor(day) {
      cursorDay = day || null;
      draw();
      describe(cursorDay);
    },
  };
}
