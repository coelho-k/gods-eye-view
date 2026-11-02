# God's Eye View codebase architecture: can it be repurposed for nature monitoring?

Scope: a read-only analysis of the local repo at `/home/kcoelho/gods-eye-view` (HEAD `0d1a6816`, package version 0.3.0). Citations are repo-relative file paths, with line numbers where I saw them directly. Claims about outside providers (Coral Reef Watch, GBIF, WDPA, GFW/Hansen, CORS, keys, licences) were **not verified** here. They appear only under Inferences or Gaps.

---

## 1. Rendering stack and layer structure

### Takeaway
The app is vanilla JS + CesiumJS + Vite with no UI framework. Imagery comes from a fixed basemap catalog: Google 3D, Bing, Esri and OSM. Every data layer is a factory object with the interface `init/enable/disable/update/destroy/getStats`. Factories are composed in one catalog file, grouped in the layer panel by a static `PANEL_GROUPS` list, and toggled by a central lifecycle manager that polls each layer on its `updateInterval`.

### Cited Findings
- **Versions:** `package.json` declares `"cesium": "^1.124.0"`, while the installed `node_modules/cesium/package.json` is version `1.138.0`. Vite is `^6.4.4` with `vite-plugin-cesium`. Node `>=24.14.0 <25 || >=26 <27` is enforced. — [package.json](package.json); [node_modules/cesium/package.json](node_modules/cesium/package.json)
- **Architecture:** "No framework. Vanilla JS + CesiumJS + Vite." Assembly lives in `src/app/`, standalone defaults in `src/standalone/`, UI in `src/ui/`, layer factories in `src/layers/`, portable sources in `src/sources/`. "Sources acquire records; renderers own Cesium resources." — [CONTRIBUTING.md](CONTRIBUTING.md) ("Architecture in one minute")
- **Basemap catalog:** `src/maps/catalog.js` defines the `photoreal` (Google 3D), `bing-aerial`, `bing-labels`, `esri-imagery` and `osm` entries. — [src/maps/catalog.js:4-35](src/maps/catalog.js)
- **Google 3D tiles:** loaded either directly with `Cesium.createGooglePhotorealistic3DTileset` or via Cesium ion asset `2275207` (`IonResource.fromAssetId`). — [src/maps/google3d.js:70,118](src/maps/google3d.js)
- **Keyless default:** the app "boots on keyless Esri World Imagery with keyless terrain, and OSM takes over automatically if Esri is unreachable." Google Maps provides direct photorealistic 3D; Cesium ion provides ion-hosted Google 3D and Bing/world terrain. — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Layer interface:** layer factories implement `init/enable/disable/update/destroy/getStats`, with optional `getDetectableObjects`. — [CONTRIBUTING.md](CONTRIBUTING.md) ("Good first contributions"). The earthquake layer is a compact full example: `id`, `name`, `icon`, `source`, `updateInterval: 60000`, `init` creates a `Cesium.CustomDataSource`, `update` aborts the prior request and swaps entities, and `getAnalystRecords(maxCount)` serves the analyst. — [src/layers/earthquakes/index.js](src/layers/earthquakes/index.js)
- **Polling:** the lifecycle manager reads `module.refreshInterval` or `module.updateInterval`, polls only while the document is visible, and treats `updateInterval === 0` as camera-driven or static. — [src/data/lifecycle.js:545-594](src/data/lifecycle.js)
- **Catalog composition:** all layers are constructed in one array in `createApplicationCatalog()`. Examples are `createApplicationEarthquakes({ source: sources.earthquakes })`, `createWeatherLayer({ feed: sources.weather, id: 'weather-radar', clock: weatherClock })` and `createApplicationFirms({ id: 'local-firms', ... feed: sources.firms })`. — [src/app/constructCatalog.js:56-198](src/app/constructCatalog.js)
- **Source contracts:** `CATALOG_SOURCE_CONTRACTS` maps each source name to the layer ids it feeds and the methods it must have, e.g. `firms: contract(['local-firms'], ['getSnapshot'])` and `earthquakes: contract(['earthquakes'], ['getSnapshot'])`. An omitted source becomes an inert `SourceUnavailableError` stub, not an empty dataset. — [src/app/sourceComposition.js](src/app/sourceComposition.js)
- **Panel groups:** `PANEL_GROUPS` are Movement, Cameras, Infrastructure, Events, Weather and Utilities. Unlisted layers fall under "Other layers". — [src/ui/layerPanel.js:40-94](src/ui/layerPanel.js); [CONTRIBUTING.md](CONTRIBUTING.md) ("Adding a new layer")
- **Display names:** English layer display names are i18n keys in `LAYER_NAME_KEYS`, e.g. `'air-quality': msg('Air quality')`. — [src/ui/layerNames.js:15,43](src/ui/layerNames.js)
- **Layer families:** `src/layers/` contains these families: airQuality, aircraft, alpr, awareness, bikeshare, cctv, cyclones, directions, earthquakes, firms, flights, ghostMaps, gnss, installations, launches, localAdsb, military, perimeters, radio, recentImagery, satellites, streetLevel, submarineCables, traffic, transit, vessels, weather, wind. — [src/layers/](src/layers)
- **Package exports:** many internals are exposed as package subpaths, e.g. `./layers/firms`, `./maps/imagery`, `./director`, `./tools`, `./share/view-codec`. Boundaries are enforced by `npm run check:boundaries` and `scripts/package-boundaries.json`. — [package.json](package.json) `exports`; [CONTRIBUTING.md](CONTRIBUTING.md)

### Inferences
- The layer contract is small and well isolated. A nature layer such as "Coral heat stress", "Protected areas" or "Species sightings" fits as a new `src/layers/<family>/` with no change to the core.
- The panel groupings would need reframing for a nature product, e.g. "Ocean", "Forests", "Protected areas", "Species", "Hazards". That is a one-file edit to `PANEL_GROUPS` plus i18n keys.
- The declared Cesium range (`^1.124`) and the installed version (1.138) differ. A fork should pin the version: `src/cyberSonarGpu.js` comments warn that it touches EntityCluster internals, which an engine upgrade must revalidate.

### Gaps
- I did not inspect `src/maps/imagery.js` or `src/maps/controller.js` in detail. I could not confirm whether arbitrary extra basemaps (e.g. a Sentinel-2 cloudless mosaic) can be added by catalog entry alone.

---

## 2. How a data source is added end to end (FIRMS, earthquakes, air quality traced)

### Takeaway
There are **two ingestion patterns**:
- **Keyless, CORS-friendly feeds:** the browser fetches the upstream directly. Earthquakes (USGS) and air quality (ECCC) work this way and are wired through `src/sources/reference.js`.
- **Keyed or quota-bound feeds:** a server proxy written as a Vite middleware plugin in `server/providers/*.js`, registered in `localProviderPlugins()`. It has a TTL memory+disk cache, single-flight refresh and serve-stale-on-failure. FIRMS is the canonical example.

Both patterns then follow the same client path: source → catalog contract → layer factory → catalog → panel group → share token → credit → voice manifest → tools query. The air-quality commit is a real end-to-end checklist of 26 touched files.

### Cited Findings
**FIRMS (keyed, proxied) trace**
1. **Server proxy:** `firmsProxy()` returns a Vite plugin. It merges the `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `VIIRS_SNPP_NRT` and `MODIS_NRT` sources from `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/{SOURCE}/world/2`, fetched sequentially with `days=2` and clamped to the trailing 24 h. The comment notes that the FIRMS quota is "5,000 transactions / 10 min per MAP_KEY, so the cache is the point": TTL 30 min, single-flight refresh, serve-stale-on-failure, and a disk cache at `.gev-cache/firms.json`. Routes are `GET /api/firms` and `GET /api/firms/status`. Without a key it returns `503 {error:'no_key'}` and never contacts the upstream. There is a 64 MiB per-source body cap and an IPv4 retry fallback (`fetchFirms`/`fetchIpv4`). — [server/providers/firms.js:116-175](server/providers/firms.js)
2. **Registration:** `firmsProxy()` is listed in `localProviderPlugins()` alongside about 30 other proxies, e.g. `weatherProxy`, `firePerimetersProxy`, `overpassProxy`, `cycloneProxy` and `windProxy`. — [server/providers/local.js:1-66](server/providers/local.js)
3. **CSV parsing:** shared helpers live in `src/data/firmsCsv.js` (`parseFirmsCsv`, `filterTrailing24h`) and are imported by the server. — [server/providers/firms.js:6](server/providers/firms.js)
4. **Client source:** `createFirmsSource()` fetches `/api/firms` and maps `503 no_key` to `{keyRequired:true}`. — [src/layers/firms/source.js](src/layers/firms/source.js)
5. **Contract and configuration:** `CATALOG_SOURCE_CONTRACTS.firms` is `['local-firms'] / ['getSnapshot']` in [src/app/sourceComposition.js](src/app/sourceComposition.js). `configureFirmsSource` is called from `configureApplicationSources` in [src/app/sources.js:12,24](src/app/sources.js).
6. **Layer factory:** `createFirmsHeatmapLayer({services, feed, ...config})` composes the model, ingestion, rendering, cards, selection, viewport, lifecycle and queries sub-owners. — [src/layers/firms/index.js](src/layers/firms/index.js). The application binding `createApplicationFirms` injects render-governor, sprite, context, picking, overlay and focus services. — [src/app/layers/firms.js](src/app/layers/firms.js)
7. **Rendering:** LOD bands keyed by camera height. "cells" bands render aggregated ground-clamped heat rectangles; "detections" bands render glow-sprite billboards in a `Cesium.BillboardCollection`. Rendering is rebuilt only when the LOD band or the padded view rectangle changes. — [src/layers/firms/rendering.js:1-60](src/layers/firms/rendering.js); [src/layers/firms/policy.js:1-44](src/layers/firms/policy.js). The client polls every 600 s (`REFRESH_INTERVAL_MS`), while the proxy TTL guards the upstream quota. — [src/layers/firms/policy.js](src/layers/firms/policy.js)
8. **Catalog entry:** `createApplicationFirms({ id: 'local-firms', name: 'FIRMS Active Fires', icon: '▲', source: 'NASA FIRMS · LIVE', feed: sources.firms })`. — [src/app/constructCatalog.js](src/app/constructCatalog.js)
9. **Panel:** `'local-firms'` is in the Events group. — [src/ui/layerPanel.js:68-78](src/ui/layerPanel.js)
10. **Share link:** registry entry `{ id: 'local-firms', token: 'w', disposition: 'enabled-only' }` in [src/data/layerState.js:624](src/data/layerState.js), plus the ledger row `["local-firms","w"]` in [src/data/layerStateTokenReservations.json](src/data/layerStateTokenReservations.json).
11. **Credit:** the `{ key: 'firms', html: 'Active fires: NASA FIRMS — we acknowledge…' }` entry in `DATA_CREDITS`, registered into the Cesium credit lightbox. — [src/data/dataCredits.js:451-456](src/data/dataCredits.js)
12. **Voice/analyst:** the manifest entry has `id: 'local-firms'`, aliases `['fires','wildfires','active fires','firms']`, `context: true`, and a `query` with fields `frp`, `confidence`, `satellite`, `sensor`, `acqTime` and window "last 24 h". From the manifest, `VOICE_TOGGLE_LAYER_IDS`, `VOICE_CONTEXT_LAYER_IDS` and `VOICE_QUERY_LAYER_IDS` are derived, and they feed the enums in `src/voice/actionSchemas.js` (`set_layer_visibility`, `analyst_query`). — [src/voice/layerManifest.js:188-200,482-500](src/voice/layerManifest.js); [src/voice/actionSchemas.js:1-12,133-157](src/voice/actionSchemas.js). The analyst reads `module.getAnalystRecords(cap)` from `src/voice/gevActions.js` through `createAnalystEngine` in `src/data/analystEngine.js`. — [src/voice/gevActions.js:3505,3718,4758](src/voice/gevActions.js); [src/data/analystEngine.js:37,647](src/data/analystEngine.js)
13. **MCP / function-calling tools:** `get_active_fires` and `get_earthquakes` are defined with `defineTool({...})` in [src/tools/queries/hazards.js:26-86](src/tools/queries/hazards.js). Default services are built in `src/tools/services.js`, e.g. `earthquakes: createUsgsEarthquakeSource({ fetchImpl })` at line 51. Per-surface exposure is controlled in `src/tools/surfaces.js`. The tool architecture is documented in [docs/TOOLS.md](docs/TOOLS.md), and an MCP stdio server ships in `server/mcp/stdio.js` (`npm run mcp`).
14. **Key panel:** the `firms` entry with `envVars: ['FIRMS_MAP_KEY']` in [src/keySetupCore.mjs:85-89](src/keySetupCore.mjs) drives POWER UP → Provider Settings. `.env.example` documents `# FIRMS_MAP_KEY=` as server-side only. — [.env.example:153-157](.env.example)

**Earthquakes (keyless, direct browser fetch) trace**
- `createUsgsEarthquakeSource()` fetches `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` directly from the browser, normalizes it with `normalizeEarthquakeSnapshot`, and has no server proxy. — [src/layers/earthquakes/source.js](src/layers/earthquakes/source.js)
- It is wired via `createReferenceSources()`, which also includes `'air-quality'`, `'fire-perimeters'`, `cables` and `'gnss-integrity'`. — [src/sources/reference.js](src/sources/reference.js), spread into the standalone sources in [src/standalone/layerSources.js:24-33](src/standalone/layerSources.js)
- The app binding is a 6-line file. — [src/app/layers/earthquakes.js](src/app/layers/earthquakes.js)

**Real "add a layer" checklist: air-quality commit `8887ca47` ("feat(air-quality): add the Air quality layer to the Weather group")**
- Files touched (26): `CHANGELOG.md`, `DATA_SOURCES.md`, `README.md`, `docs/CURRENT-STATE.md`, `package.json` (exports), `scripts/format-scope.json`, `scripts/package-boundaries.json`, `scripts/qa-air-quality.mjs` (new headless gate), `src/app/constructCatalog.js` (+test), `src/app/layers/airQuality.js`, `src/data/dataCredits.js`, `src/data/layerState.js` (+test), `src/data/layerStateTokenLedger.test.mjs`, `src/data/layerStateTokenReservations.json`, `src/layers/airQuality/{index,model,source}.js` + `model.test.mjs` + `ownership.test.mjs`, `src/overlays/worldOverlayAllocation.{test,worker}.mjs`, `src/sources/reference.js` (+test), `src/ui/layerPanel.js`. The commit totals +1730 lines. — `git show --stat 8887ca47`
- Later, separate commits added `'air-quality'` to `src/voice/layerManifest.js:268` and `src/ui/layerNames.js:43`. — [src/voice/layerManifest.js](src/voice/layerManifest.js); [src/ui/layerNames.js](src/ui/layerNames.js)
- The air-quality source shows the keyless pattern with caching inside the client source: the station catalog is cached for 12 h (`STATION_TTL_MS`), responses are capped at 4 MiB, and the catalog is "only replaced when a refresh actually returns stations". — [src/layers/airQuality/source.js:15-40](src/layers/airQuality/source.js)

### Inferences
- **Choosing a pattern per nature source:**
  - A keyless, CORS-enabled JSON or GeoJSON API (likely candidates include GBIF occurrence search and some ArcGIS FeatureServer services, unverified) can follow the earthquakes/air-quality pattern with no server code.
  - Anything keyed (e.g. a GFW API key or eBird key), quota-limited, CSV, or non-CORS should follow the FIRMS pattern: a Vite plugin with TTL, disk cache, single-flight and serve-stale.
- A minimal new layer touches about 15–25 files. Most are registration and boilerplate: token ledger, credits, panel group, manifest, i18n, DATA_SOURCES, changelog fragment, QA gate. The air-quality commit is the best template to copy, because it is the most recent full layer addition with a contained diff.
- The analyst and voice integration is cheap once `getAnalystRecords()` exists. One manifest entry with typed `fields` gives voice "count/filter/rank" queries, and a `defineTool` in `src/tools/queries/` exposes the same data to Claude/Codex via MCP.

### Gaps
- I did not trace `src/data/firmsHeatmap.js#configureFirmsSource` or the `src/standalone/` source wiring for FIRMS line by line.
- I did not confirm whether every source in `CATALOG_SOURCE_CONTRACTS` must also be added to `src/tools/services.js` to reach MCP. It appears optional, because tools whose services are missing are left out ([docs/TOOLS.md](docs/TOOLS.md)).

---

## 3. Support for raster/tiled overlays, time animation, polygons, point clusters and historical replay

### Takeaway
- **Rasters:** yes, two ways. Server-proxied WMS GetMap frames are tiled client-side (nowCOAST weather), and direct XYZ/WMTS URL templates go through `UrlTemplateImageryProvider` (NASA GIBS in Recent Imagery). Basemaps use the ArcGIS MapServer, Bing, Ion and OSM providers in `src/maps/imagery.js`. Nothing in `src/` uses `WebMapServiceImageryProvider` or `WebMapTileServiceImageryProvider`.
- **Time animation:** there is a real time dimension, a shared "weather clock" with a scrubbable observed-history timeline. It is hard-wired to a fixed list of weather products. The weather layers are shareable (`enabled+options` tokens), but the selected history time is not: links always open on the latest frame.
- **Polygons:** yes. They come from GeoJSON/ArcGIS (fire perimeters, infrastructure GeoJSON with LOD, user file import, Director data packs).
- **Large point counts:** handled by per-layer LOD aggregation (FIRMS cells), primitive collections, and Cesium EntityCluster (radio, submarine cables).
- **Historical replay:** exists only per-feature (weather frames, transit history, track backfill, Director scene playback). There is no global time slider over all layers.

### Cited Findings
- **Weather WMS proxy:** fixed `PRODUCTS` (lightning, radar, clouds, clouds-regional) against `https://nowcoast.noaa.gov/geoserver/observations/`. The proxy uses `GetCapabilities` for available times and `GetMap` for whole-extent images (up to 4096×2048, `MAX_IMAGE_BYTES` 16 MiB). It serves `/api/weather/manifest`, `/api/weather/image?product&time` and `/api/weather/tile?product&time&z&x&y`, with `Cache-Control: public, max-age=86400, immutable` on exact-time images. — [server/providers/weather.js:1-60,351,410-421,532-607](server/providers/weather.js)
- **Client weather tiling:** a global frame is cropped into tiles by `createRasterTileProvider` (an in-memory canvas → Cesium imagery provider). A regional frame uses `new cesium.UrlTemplateImageryProvider({ url: weatherTileUrl(product, time), ... })`, added with `collection.addImageryProvider(provider)`. — [src/layers/weather/rasterTiles.js](src/layers/weather/rasterTiles.js); [src/layers/weather/rendering.js:380-472](src/layers/weather/rendering.js)
- **Hard-coded product list:** `WEATHER_PRODUCTS` in the client source is a frozen list (`'radar'`, `'clouds'`, `'clouds-regional'`, …). Unknown products throw `'Unknown weather product'`. — [src/layers/weather/source.js:7-10,113-115](src/layers/weather/source.js)
- **Display metadata from the source:** the latest merged PR (#1494, commit `039b0828`) lets a weather source supply `display` metadata per product: `source`, `credit`, `units`, `coverage`, `info`, a 2–16 stop `legend`, and an `extent`, each validated. — [src/layers/weather/display.js:1-25](src/layers/weather/display.js); [docs/CURRENT-STATE.md:478-500](docs/CURRENT-STATE.md)
- **Time clock:** `createWeatherClock()` has `latest` and target modes and play/scrub, and each product declares a `maxGapMs` (e.g. `RADAR_MAX_GAP_MS` 30 min, `GLOBAL_INFRARED_MAX_GAP_MS` 3 h). — [src/layers/weather/clock.js:1-50](src/layers/weather/clock.js)
- **Timeline UI:** "The right-rail WEATHER panel owns … the single observed-history timeline … Dragging previews UTC and age locally and coalesces clock commits at 150 ms." — [docs/CURRENT-STATE.md:444-452](docs/CURRENT-STATE.md)
- **History not shared:** "history remains transient and links open latest." — [docs/CURRENT-STATE.md:406-407](docs/CURRENT-STATE.md)
- **GIBS WMTS:** the Recent Imagery layer builds a NASA GIBS WMTS REST template, `https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/${gibsLayer}/default/${day}/GoogleMapsCompatible_Level${maxLevel}/{z}/{y}/{x}.${format}`. Products include `HLS_S30_Nadir_BRDF_Adjusted_Reflectance`, `HLS_L30_…` and `VIIRS_NOAA21_CorrectedReflectance_TrueColor`, plus Worldview Snapshots thumbnails. — [src/layers/recentImagery/model.js:22-65,574-613](src/layers/recentImagery/model.js); [src/layers/recentImagery/source.js](src/layers/recentImagery/source.js)
- **Vector-tile (MVT) decoding:** `@mapbox/vector-tile` and `pbf` are dependencies, used in [src/sources/vectorTiles.js](src/sources/vectorTiles.js), [src/sources/openFreeMap.js](src/sources/openFreeMap.js), [src/layers/traffic/flowDecode.js](src/layers/traffic/flowDecode.js), [src/layers/alpr/tileRecords.js](src/layers/alpr/tileRecords.js) and the Mapillary/Panoramax decoders.
- **Polygons, fire perimeters:** NIFC WFIGS ArcGIS FeatureServer (`WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query`, `maxAllowableOffset` simplification), paged via `resultOffset`, with in-memory cache TTLs of 5 min / 1 h / 30 min by route. The client renders `polygon` entities. — [server/providers/firePerimeters.js:9-30,56,152-213](server/providers/firePerimeters.js); [src/layers/perimeters/index.js:326-332](src/layers/perimeters/index.js)
- **Polygons, infrastructure GeoJSON:** `createInfrastructureLayers(services)` (datacenters, dams) loads bundled GeoJSON with `Cesium.GeoJsonDataSource.load` and LOD, label budgets and `getAnalystRecords()`. — [docs/INFRASTRUCTURE-LAYERS.md](docs/INFRASTRUCTURE-LAYERS.md); [src/data/localGeojsonCore.js](src/data/localGeojsonCore.js); [src/data/localGeojsonLod.js](src/data/localGeojsonLod.js)
- **User file import:** GeoJSON/KML/KMZ via `Cesium.GeoJsonDataSource.load` / `KmlDataSource.load`, with caps of 50 MiB per file, 12 files, `MAX_IMPORT_ENTITIES = 20_000` and `MAX_IMPORT_POSITIONS = 250_000`. — [src/data/geoFileImport.js:8-18](src/data/geoFileImport.js)
- **Director data packs:** version-5 scene documents can declare `dataPacks` (`format: "geojson"`, `source: { adapter: "assets", path }`, required `attribution.license`) per shot. Assets are served from `public/scene-assets/`, and the format is explicitly "not a new arbitrary-URL proxy". — [docs/DIRECTOR-DATA-PACKS.md](docs/DIRECTOR-DATA-PACKS.md)
- **Imagery providers by file:** an uncapped grep of `src/` (tests excluded) finds `UrlTemplateImageryProvider` only in `src/layers/recentImagery/rendering.js` and `src/layers/weather/rendering.js`. `ArcGisMapServerImageryProvider`, `BingMapsImageryProvider`, `IonImageryProvider` and `OpenStreetMapImageryProvider` appear only in `src/maps/imagery.js`. No `WebMapServiceImageryProvider` or `WebMapTileServiceImageryProvider` appears. — [src/maps/imagery.js](src/maps/imagery.js)
- **Clustering:** the radio layer uses Cesium `dataSource.clustering` (`enabled = true`, `clusterPoints = true`, `minimumClusterSize = 3`, `pixelRange = 42`). — [src/layers/radio/rendering.js](src/layers/radio/rendering.js). Submarine cables also use `EntityCluster`. — [src/layers/submarineCables/rendering.js](src/layers/submarineCables/rendering.js), [src/layers/submarineCables/policy.js](src/layers/submarineCables/policy.js)
- **Collection types** (same uncapped grep):
  - `PointPrimitiveCollection`: bikeshare, directions, installations (`namedMarkers.js`), satellites, traffic, submarine cables.
  - `BillboardCollection`: flights, military, CCTV, FIRMS, vessels, transit, street level, submarine cables, geo-import pins.
- **Other history/replay:** `server/providers/transitHistory.js` (transit history); `trackBackfillProxies` for about 24 h of aircraft trace history ([server/providers/local.js](server/providers/local.js); README "Ask the planet" row); `src/data/contactPlayback.js`; and the Director scene playback runner `buildPlaybackQueue` / `playSceneQueue`. — [docs/DIRECTOR.md](docs/DIRECTOR.md)

### Inferences
- **Coral heat-stress rasters** (e.g. NOAA Coral Reef Watch DHW/SST anomaly, unverified as WMS/WMTS) best map onto the weather pattern: server WMS GetMap or tile proxy, a time manifest, the clock and the legend/`display` metadata. The product enum is fixed in both `server/providers/weather.js PRODUCTS` and `src/layers/weather/source.js WEATHER_PRODUCTS`, so adding one means extending both lists and adding a new layer id/token, not just configuration. A generic "WMS/WMTS time-raster layer" family is probably cleaner for many nature rasters.
- **Forest-loss tiles** (XYZ/WMTS such as GFW/Hansen tiles, or GIBS layers, unverified) map onto the GIBS `UrlTemplateImageryProvider` pattern in Recent Imagery: no proxy if the tiles are keyless and CORS-enabled, otherwise a tile proxy like `/api/weather/tile`.
- **Protected-area polygons** (WDPA/OSM `boundary=protected_area`) map onto the infrastructure GeoJSON/LOD path, or the fire-perimeter ArcGIS FeatureServer paging path. Large global polygon sets would likely need MVT, reusing `src/sources/vectorTiles.js`, or server-side simplification. The 20k-entity / 250k-position import caps suggest Entity-based polygons do not scale to a global WDPA (~300k polygons, unverified).
- **Species occurrence points** map onto the FIRMS LOD pattern (aggregated cells far out, individual sprites close in), or onto EntityCluster as in radio.
- **Multi-year replay** (e.g. annual forest loss 2001–2024 or DHW history) has no general mechanism. The weather clock is the closest seam, but it is tuned to observed frames minutes to hours apart and is not shareable via links.

### Gaps
- I did not verify whether the Overpass proxy would accept protected-area tag queries at world scale. It rejects "world-sized bboxes" and oversized radii ([server/providers/overpass/query.js](server/providers/overpass/query.js) header), so it is viewport-bounded by design.
- I did not measure polygon-rendering performance for large GeoJSON sets.

---

## 4. API keys, rate limits, caching and licensing/attribution

### Takeaway
Secrets stay server-side and are managed through `.env` or the in-app POWER UP → Provider Settings panel, driven by the `src/keySetupCore.mjs` registry. Each proxy carries its own TTL/disk cache, per-IP limiter and upstream budget. Attribution is mandatory and lives in two places: `DATA_SOURCES.md`, and `src/data/dataCredits.js`, which feeds the in-app "Data attribution" lightbox.

### Cited Findings
- **Where secrets live:** "Secrets stay server-side. Anything needing a private key goes through a local proxy under `server/providers/`. The browser only ever sees the Google Maps key (which you restrict) and ephemeral tokens." — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Browser-exposed keys:** `GOOGLE_MAPS_API_KEY`, `CESIUM_ION_TOKEN` and `MAPILLARY_CLIENT_TOKEN` are injected into the browser bundle by design. Other keys include `GOOGLE_MAPS_SERVER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AISSTREAM_API_KEY`, `FIRMS_MAP_KEY`, `TOMTOM_API_KEY`, OpenSky OAuth and `OVERPASS_UPSTREAMS`. There are per-IP rate-limit knobs such as `GEV_RATELIMIT_GOOGLE_PER_MIN` (default 120) and `GEV_RATELIMIT_GEMINI_PER_MIN`. — [.env.example:16-27,37-57,63-91,153-200,266](.env.example)
- **Key registry:** POWER UP entries have an `id` and `envVars`: google-maps, google-maps-server, openai, gemini, aisstream, firms, tomtom, cesium-ion, opensky, mapillary, launch-library (`LL2_API_TOKEN`). — [src/keySetupCore.mjs:40-135](src/keySetupCore.mjs)
- **How POWER UP works:** keys are written to the repo-root `.env`, or `pinokio/ENVIRONMENT`, made owner-only before any write, and the app restarts. The panel and `/api/setup/*` are development-only. — [README.md:236-250](README.md); [CONTRIBUTING.md](CONTRIBUTING.md)
- **Rate limiters:** the Overpass proxy uses `makeRateLimiter({ windowMs: 60_000, max: 300, globalMax: 900 })` for request admission plus a tighter upstream limiter, an in-flight dedup map and disk cache helpers. — [server/providers/overpass.js](server/providers/overpass.js); the shared limiter is in [server/providers/common/rate-limit.js](server/providers/common/rate-limit.js) → `src/sources/rateLimit.js`
- **Proxy hardening rules:** "No arbitrary-URL fetching … Other proxies target fixed upstream hosts." There are cross-site gates on cost- and quota-bearing endpoints, and a Host check. — [SECURITY.md:67-83](SECURITY.md)
- **Attribution in DATA_SOURCES.md:** it documents each live and bundled source with its licence. "Attribution is shown in-app … registered into the expandable 'Data attribution' lightbox … (`src/data/dataCredits.js` → `viewer.creditDisplay.addStaticCredit`)." — [DATA_SOURCES.md:1-14](DATA_SOURCES.md). Section headers include NASA FIRMS acknowledgement (l.255), Natural Earth (l.266), Weather sources / NOAA nowCOAST (l.309-413).
- **Credit API:** `DATA_CREDITS`, `registerDataCredits(viewer, credits)` and `registerDynamicCredit(viewer, credit)`. — [src/data/dataCredits.js:101,601,619](src/data/dataCredits.js)
- **Weather product credits:** each weather product carries an `attribution` string, e.g. 'NOAA/NWS nowCOAST; derived from Vaisala NLDN/GLD360'. — [server/providers/weather.js:1-20](server/providers/weather.js)

### Inferences
- A nature product would add new POWER UP entries in `keySetupCore.mjs`, e.g. GFW API key, eBird key, or a Copernicus Marine/Sentinel Hub credential if used. All of these are unverified provider requirements.
- Each nature proxy should copy the FIRMS cache pattern (TTL + disk + single-flight + serve-stale). This protects quotas when many viewers hit one server, a concern the current local-first design largely sidesteps.

### Gaps
- I did not read the full 446-line DATA_SOURCES.md table. Per-source rate limits for Overpass upstreams and GBFS were not catalogued.

---

## 5. What CONTRIBUTING.md and the docs require for a new data source or layer

### Takeaway
The repo has a strict, explicit process:
- PR evidence: screenshots, a screen recording, a proposed panel group, and the source with its licence.
- Doc edits: DATA_SOURCES.md, `dataCredits.js`, `docs/CURRENT-STATE.md`, and a `changelog.d/<PR>-<slug>.md` fragment.
- An immutable share-link token.
- i18n for all user-visible text, a `scripts/qa-*.mjs` headless gate, and formatting and package-boundary checks.

### Cited Findings
- **"Adding a new layer":** a layer PR must include (1) screenshots, (2) a 15–30 s screen recording, (3) the proposed `PANEL_GROUPS` category, and (4) the data source and licence, added to DATA_SOURCES.md, with the credit registered in `src/data/dataCredits.js`. — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Data rules:** "If you add or change a data source, update DATA_SOURCES.md … Don't add data you don't have the right to redistribute — fetch it at runtime instead." Ground rule: "This is a tool for public data. Don't add scraping of sources whose terms forbid it, private/paywalled datasets…". — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Required green checks:** `npm run build`, `npm test` and `npm run test:track` (needs a dev server) must stay green, plus the feature's `scripts/qa-*.mjs` gate. CI runs neither `test:track` nor most qa gates. — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Share-link tokens:** every shareable layer owns an immutable token in `LAYER_STATE_REGISTRY` and `src/data/layerStateTokenReservations.json`. Get the next one with `npm run layer-token:next -- <layer-id>` and validate with `npm run layer-token:check -- --base-ref origin/main`. Tokens are never reused, even after a layer is removed. — [CONTRIBUTING.md](CONTRIBUTING.md)
  - **Discrepancy:** CONTRIBUTING says that "0, 1, 2 and 3 are already owned, so the next choices are 4 through 9". The ledger already assigns `4` (air-quality) and `5` (s2-ghostmaps), so the next free token is effectively `6`. — [src/data/layerStateTokenReservations.json](src/data/layerStateTokenReservations.json)
- **Changelog:** add `changelog.d/<pull request number>-<slug>.md`, one bullet written exactly as it should read. `npm run changelog` assembles the fragments. — [changelog.d/README.md](changelog.d/README.md)
- **Runtime docs:** if runtime behaviour changes, update `docs/CURRENT-STATE.md`, the "authoritative runtime reference". — [CONTRIBUTING.md](CONTRIBUTING.md)
- **i18n:** user-visible text goes through `t()`, `tn()` or `msg()`, or `data-i18n*`, and `npm run i18n` must pass. See [docs/I18N.md](docs/I18N.md). There are about 10 locales (de, es, fr, it, ja, pt, ru, uk, zh-CN, zh-Hant), visible in the `039b0828` diffstat. Portable layer packages keep English error data and translate it in the panel: "A portable package (no i18n)". — [src/layers/earthquakes/index.js](src/layers/earthquakes/index.js)
- **Formatting and boundaries:** `npm run format`, `format:check` and `check:boundaries`. New exports must be added to `scripts/package-boundaries.json`. — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Voice extension points:** argument schemas in `src/voice/actionSchemas.js`, server descriptions in `server/providers/openai/tools.js`, client execution in `src/voice/gevActions.js`. — [CONTRIBUTING.md](CONTRIBUTING.md)

### Inferences
- In a private fork, the PR-evidence rules and token-ledger etiquette are optional. Keeping the token ledger and the share codec intact is still wise, so that share links stay stable.
- If the nature product aims to stay upstream-compatible or to contribute layers back, the governance overhead is meaningful but well documented.

### Gaps
- There is no plugin system for external, runtime-loaded layers. Layers are compiled in through `constructCatalog.js`. Director data packs are the only declarative, document-supplied data path.

---

## 6. Repo licence and reuse constraints

### Takeaway
The code is MIT (© 2026 Bilawal Sidhu), with no non-commercial restriction on the code itself. Several bundled datasets and assets are not MIT, and some are non-commercial. Some runtime providers and default keys also carry their own limits:
- **Bundled:** TeleGeography (CC BY-NC-SA 3.0), the Bhote Koshi/Nepal imagery and flood path (CC BY-NC 4.0), ODbL OSM extracts, and separately licensed 3D models.
- **Runtime:** S2 GhostMaps (CC BY-NC-SA 4.0), and Cesium ion's free tier and Google/OpenSky terms.

### Cited Findings
- **MIT grant:** "MIT License — Copyright (c) 2026 Bilawal Sidhu". "NOTE ON THIRD-PARTY DATA AND ASSETS — THE MIT LICENSE ABOVE COVERS THE SOURCE CODE ONLY." — [LICENSE](LICENSE); `"license": "MIT"` in [package.json](package.json)
- **Data carve-outs listed in LICENSE:** — [LICENSE](LICENSE)
  - TeleGeography Submarine Cable Map: CC BY-NC-SA 3.0, "NOT for commercial use".
  - Datacenters and Dams: ODbL 1.0.
  - NASA FIRMS snapshot: CC0 / U.S. public domain.
  - Bhote Koshi event imagery and derived river centerline (`public/events/bhote-koshi-2026/`, `src/data/bhoteKoshiFloodPath.js`): Vantor / GeoPera CC BY-NC 4.0, "NOT for commercial use without separate permission".
- **Runtime providers:** live providers (Google Maps, OpenSky, etc.) are fetched under each provider's terms, and "some (e.g. Google Maps, OpenSky) restrict commercial use". 3D models under `public/models/` are not MIT. — [LICENSE](LICENSE)
- **S2 GhostMaps** credit: "licensed under CC BY-NC-SA 4.0. Shown as published; reports are S2 assessments, not verified fact." — [src/data/dataCredits.js](src/data/dataCredits.js) (around l.459-464)
- **Cesium ion:** the README describes the free token as "eligible personal, non-commercial use; current terms and quotas apply". — [README.md:247-249](README.md)
- **Contributions** are licensed under MIT. — [CONTRIBUTING.md](CONTRIBUTING.md)

### Inferences
- **Forking:** a fork for a commercial or NGO nature product is permitted under MIT if it keeps the copyright notice. To be safe, it should:
  - delete `src/data/local_data/telegeography_submarine_cables/`, the Bhote Koshi assets and data files, and the GhostMaps layer;
  - review the 3D models;
  - provide a paid or appropriately licensed Cesium ion and Google Maps Tiles setup;
  - honour ODbL share-alike if it keeps any OSM extracts.
- Reuse the Nepal flood scene as an **authoring pattern** (Director scenes + data packs), not as data.

### Gaps
- I did not read `THIRD_PARTY_NOTICES.md` or `public/models/README.md` in full.

---

## 7. What is irrelevant or needs reframing, and what is directly reusable

### Takeaway
About half the layer families are surveillance or mobility oriented and would be removed or hidden: military flights and HUD, ALPR, CCTV, installations, awareness, GNSS jamming, GhostMaps, radio, traffic, transit, bikeshare, AIS. The core (globe, basemaps, layer lifecycle, proxy/cache pattern, overlay/label system, analyst/voice/MCP tools, share codec, Director scenes) and the environmental layers (FIRMS, fire perimeters, weather/wind/cyclones, earthquakes, air quality, Recent Imagery/GIBS) are directly reusable. Removal has ripple effects through the catalog, the voice manifest and the token ledger.

### Cited Findings
- **Surveillance-flavoured features in the README:** "Military HUD: Tactical heads-up display with intelligence-style telemetry", "Mapped ALPR cameras", "CCTV Mesh (~4,000 public cameras)", "Mapped Installations", NVG/FLIR visual styles, detection and cockpit. The AI HUD summary is "a terse, five-word intelligence-style readout". — [README.md:13,66,72,330,394-411,456-461](README.md)
- **Positioning:** the package description is "A real-time intelligence console for planet Earth", with keywords including `osint` and `spatial-intelligence`. — [package.json](package.json)
- **Military and awareness wiring:** `createMilitaryRegistry()` is constructed unconditionally in `createApplicationCatalog`. `createApplicationAwareness({ flights, military, vessels, installations })` depends on four layers. The Bhote Koshi event and locator layers are always constructed first. — [src/app/constructCatalog.js:74-150](src/app/constructCatalog.js)
- **Reusable environmental layers:** FIRMS (`src/layers/firms/`), fire perimeters (`src/layers/perimeters/`, NIFC WFIGS + InciWeb), weather radar/satellite/lightning (`src/layers/weather/`), wind (ECMWF IFS / NOAA GFS), cyclones (NHC/CPHC), earthquakes, air quality (ECCC AQHI), and Recent Imagery (NASA GIBS/HLS). — [src/app/constructCatalog.js](src/app/constructCatalog.js); [DATA_SOURCES.md:309-413](DATA_SOURCES.md)
- **Nepal flood scene:** "Nepal Flood Incident is available in Authoring, with a 25-shot sequence, geographic labels, an event panel, scene scrubbing and shot playback. Comparison shots use Esri beneath Vantor imagery … the animated flood path is schematic, not a hazard model." — [docs/CURRENT-STATE.md:792](docs/CURRENT-STATE.md). Implementation: `src/data/bhoteKoshiEvent.js` (3,939 lines) and `src/data/bhoteKoshiLocator.js`. — `wc -l`
- **Director and agent tooling:** the Director playback runner and scene documents are in [docs/DIRECTOR.md](docs/DIRECTOR.md), [docs/SCENE-DOCUMENT.md](docs/SCENE-DOCUMENT.md) and [docs/DIRECTOR-DATA-PACKS.md](docs/DIRECTOR-DATA-PACKS.md). The analyst engine is in `src/data/analystEngine.js`. The MCP server (`server/mcp/`, `npm run mcp`) is documented for Claude Code and Claude Desktop in [docs/MCP_SETUP.md](docs/MCP_SETUP.md). The world packet for agents is at `src/agent/worldPacket.js`.
- **Share links:** the share codec is pure, with no DOM or Cesium (`src/share/viewCodec.js`). Short `/share/<code>` links restore camera, style, layers and panel layout. — [docs/SHARE-LINK-FORMAT.md](docs/SHARE-LINK-FORMAT.md)
- **Deployment model:** the "server" is Vite dev/preview middleware. Each proxy returns `import('vite').Plugin` (see the `firmsProxy` JSDoc). The Docker entrypoint starts Vite `createServer` "exactly as under `npm run dev`". "Vite preview is for checking a local build; it is not a production server." SECURITY.md describes the app as "built for exploration, demos, and learning — not as a hardened production service". — [server/providers/firms.js:150-153](server/providers/firms.js); [scripts/docker-start.mjs:54,125-142](scripts/docker-start.mjs); [CONTRIBUTING.md](CONTRIBUTING.md); [SECURITY.md:3](SECURITY.md)

### Inferences
- **Remove or hide for a nature product:**
  - military, military-awareness, military-installations
  - alpr-cameras, cctv, gnss-integrity, s2-ghostmaps
  - local-adsb, radio, traffic, transit, bikeshare, directions
  - the cockpit/detection/NVG/FLIR modes and the "intelligence" HUD prompt in `server/providers/openai/instructions.js` and `hud-summary.js`
  - possibly flights and AIS, unless kept for context such as vessel traffic near reefs (AIS could be reframed as "ships near marine protected areas")
- **Removal mechanics:** each removed layer needs edits in `constructCatalog.js`, `sourceComposition.js` contracts, `layerManifest.js`, `layerPanel.js`, `layerNames.js` and tests. Its share token must stay reserved in the ledger (retired, not deleted). Removing military requires untangling `createMilitaryRegistry` and the awareness layer.
- **Directly reusable:**
  - the globe, basemap, terrain and Google 3D stack
  - the lifecycle manager and polling
  - the proxy template (FIRMS) and the WMS raster+clock template (weather)
  - the GIBS tile template
  - the GeoJSON/LOD and perimeter polygon templates
  - the overlay/label budgeting
  - the analyst `getAnalystRecords` + manifest query system
  - the MCP tools
  - share links
  - Director scenes, as the "story" vehicle, e.g. a "Great Barrier Reef bleaching 2024" scene modelled on the Nepal flood scene
- **Hosting for public use:** a public-facing nature product would need a real backend in place of the Vite middleware host. The providers are plain Connect-style middleware, so porting them to an Express/Fastify host is plausible but not done in-repo.

### Gaps
- I did not verify how deeply HUD, cockpit and detection code is entangled with core UI (`src/hud.js`, `src/ui/cockpit.js`). Removal effort is unquantified.

---

## 8. Performance limits (entity counts, clustering)

### Takeaway
The only published numbers come from a single Apple M5/Chrome 150 capture, explicitly "not a minimum hardware specification". Inside that capture:
- FIRMS showed 100,430 detections (aggregated into 3,557 cells) at 32/55 FPS.
- AIS showed 12,000 vessels at 22/30 FPS.
- A combined static scene showed 11,575 objects at 57.6/60 FPS with 872 MiB heap.

Scale is achieved through per-layer LOD caps (FIRMS 1,800–3,600 cells and 2,500–3,000 detections in view), label budgets, and occasional EntityCluster use, not a global clustering engine.

### Cited Findings
- **Baseline scope:** "one hardware-rendered Apple M5 comparison captured on 22 August 2026 in Chrome 150 at 1440 x 900. It is not a minimum hardware specification". — [docs/PERFORMANCE.md](docs/PERFORMANCE.md)
- **Cold activation:**
  - Datacenters: 4,362 objects, 817.7 ms, 59.6/60 FPS, 328.2 MiB heap.
  - Submarine cables: 2,629 objects, 412.0 MiB heap.
  - CCTV: 19.6 s activation.

  — [docs/PERFORMANCE.md](docs/PERFORMANCE.md)
- **Keyed sources** (captured unfocused, so not directly comparable):
  - NASA FIRMS: 100,430 detections in 3,557 cells, 30.0 s activation, 32.1 / 55.2 FPS.
  - AISStream: 12,000 vessels, 22.1 / 29.8 FPS.
  - TomTom: 4,222 road dots.

  — [docs/PERFORMANCE.md](docs/PERFORMANCE.md)
- **Combined scenes:** the combined static scene has 11,575 objects, 872.2 MiB heap, 48–54k text draws, and 57.6/60 FPS. Combined operational runs at 39.9/43.1 FPS. — [docs/PERFORMANCE.md](docs/PERFORMANCE.md)
- **FIRMS LOD caps:** `global` uses 2° grid with `maxCells: 1800`; `regional` uses 1° grid with `maxCells: 3600`; `local` (<~750 km height) renders `maxDetections: 2500`; the closest band renders 3,000. Labels go through a "shared screen-space greedy declutter (hard cap MAX_AMBIENT_LABELS)". — [src/layers/firms/policy.js:1-44](src/layers/firms/policy.js)
- **Other caps:**
  - AIS default `VITE_AIS_LIVE_MAX_ROWS=12000`, label rows 900. — [.env.example:161-167](.env.example)
  - File-import caps of 20,000 entities and 250,000 positions. — [src/data/geoFileImport.js:12-16](src/data/geoFileImport.js)
  - CCTV "~4,000 public cameras (shared cap)". — [README.md:402](README.md)
- **Earthquakes:** the earthquake layer avoids `CallbackProperty` on clamped ellipses because it "re-tessellates the clamped ground geometry every frame". It keeps static geometry and no continuous-render hold. — [src/layers/earthquakes/index.js](src/layers/earthquakes/index.js)

### Inferences
- **Species occurrences:** GBIF-scale points (millions) must be aggregated server-side, e.g. grid or hex bins and GBIF's own density tiles (unverified), or rendered as raster/MVT tiles. Pushing raw points to the client exceeds every tested population here. The FIRMS cells→detections LOD pattern is the right template.
- **Protected-area polygons:** global WDPA-scale polygons via Entities/GeoJsonDataSource will likely exceed the heap budget, judging by cables (2.6k features → 412 MiB). Use vector or raster tiles or viewport-bounded queries instead.

### Gaps
- There is no published benchmark for large polygon counts, imagery-layer stacking (several raster overlays at once), or low-end and mobile hardware. The doc itself notes that its results may not predict other systems.
