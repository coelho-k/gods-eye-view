# Forest, Land-Cover Change, Wildfire & Protected-Area Data Sources for a CesiumJS Globe (as of Nov 2026)

Note on method: about 20 tool calls (search plus fetch). Items marked **[unverified – prior knowledge]** in the Inferences sections come from the researcher's background knowledge (cutoff mid-2026). They were NOT re-checked against a live source in this session, so verify them before you rely on them.

## Global Forest Watch (now "Global Nature Watch"): Data API, keys, tiles, alerts (GLAD-L, GLAD-S2, RADD, DIST-ALERT, integrated)

### Takeaway
GFW has rebranded to **Global Nature Watch (GNW)**: globalforestwatch.org URLs now 301-redirect to globalnaturewatch.org. The Data API (data-api.globalforestwatch.org) still serves the alert and tree cover loss datasets. Access uses an API key sent in an `x-api-key` header, and the key is bound to an Origin-domain allowlist, so a Node proxy should hold the key. Integrated alerts now include **DIST-ALERT** (30 m, global, all vegetation, weekly updates). Combining systems raises producer's accuracy but lowers user's accuracy. Only the "highest" confidence tier (two or more systems agree) is high-precision.

### Cited Findings
- globalforestwatch.org blog URLs redirect (301) to globalnaturewatch.org; GNW pages describe GFW as "now Global Nature Watch, GNW" — [GNW blog: Planet imagery changes](https://globalnaturewatch.org/blog/data-and-tools/planet-imagery-changes-gfw)
- The Data API is documented as ReDoc at https://data-api.globalforestwatch.org/. Its dataset pages include `gfw_integrated_alerts` — [GFW Data API](https://data-api.globalforestwatch.org/); [dataset page](https://data-api.globalforestwatch.org/dataset/gfw_integrated_alerts)
- Key workflow: get a bearer token from the token endpoint, then POST to the API-key endpoint with alias, email, organization and an optional `domains` list (wildcard subdomains and localhost are allowed). Requests send the key in an `x-api-key` header, and the Origin must match an allowlisted domain. www.example.com and example.com count as different domains — [GNW developer guide: Create and use an API key](https://globalnaturewatch.org/help/developers/guides/create-and-use-an-api-key/) (page truncated on fetch; details via search summary); [OpenEPI how-to](https://developer.openepi.io/how-tos/getting-started-using-global-forest-watch-data-api)
- Third-party guides (possibly dated) say keys expire after 1 year, and that keys with no domains get the lowest rate-limit tier. Never-expiring keys are admin-only — [OpenEPI how-to](https://developer.openepi.io/how-tos/getting-started-using-global-forest-watch-data-api)
- Integrated alerts combine GLAD-L, GLAD-S2 and RADD on a 10 m grid, with GLAD-L resampled from 30 m. Integration gives "higher producer's accuracy (fewer false negatives), but a lower user's accuracy (more false positives) since the commission errors from each system are combined". The "highest confidence" tier, where more than one system detects, is meant to offset this. Integrated alert counts are much larger than native GLAD-L counts, so the two are not directly comparable — [GFW Data API dataset gfw_integrated_alerts](https://data-api.globalforestwatch.org/dataset/gfw_integrated_alerts); [GFW blog: integrated alerts](https://globalforestwatch.org/blog/data-and-tools/integrated-deforestation-alerts)
- **DIST-ALERT** (UMD with NASA OPERA): 30 m pixels built from Harmonized Landsat Sentinel-2 (HLS), with an observation every 2–4 days per pixel under clear conditions. **The GFW layer updates weekly.** An alert fires when vegetation fraction falls below the minimum for the same period in the previous 3 years, and only drops of at least 30% in vegetation cover are shown. Coverage is global across forest and non-forest vegetation (grassland, savanna, wetlands, cropland), with a filter for ≥30% tree canopy. Confidence is low with 2–3 anomalous observations and high with 4 or more. Monitoring continues after an alert, so repeat disturbances are recorded. The post (updated 20 Mar 2026) gives **no accuracy figures** — [GNW blog: DIST-ALERT](https://globalnaturewatch.org/blog/data-and-tools/global-vegetation-disturbance-deforestation-alerts)
- The "Integrated Disturbance Alerts" combine DIST-ALERT with GFW's other alerts and cover all vegetation globally — [GNW blog: DIST-ALERT](https://globalnaturewatch.org/blog/data-and-tools/global-vegetation-disturbance-deforestation-alerts)
- **RADD (Sentinel-1 radar, Wageningen)**, peer-reviewed validation for the Congo Basin: **user's accuracy 97.6% ± 4.8** for confirmed alerts ≥0.2 ha, and **producer's accuracy 95.0% ± 25.8** for disturbances ≥0.2 ha. Producer's accuracy falls to **83.5% ± 37.5** when events under 0.2 ha are included. The MMU is 0.2 ha (20 pixels at 10 m). Of core pixels, 74% were confirmed within 24 days and 95% within 48 days; for boundary pixels the figures were 53% and 83%. The disturbance usually happened 6–12 days or less before the triggering image — [Reiche et al. 2021, ERL](https://iopscience.iop.org/article/10.1088/1748-9326/abd0a8)
- A 2024 ERL study tested combinations of RADD, GLAD-S2 and GLAD-L at ten 1° sites in the Amazon. RADD plus GLAD-S2 gave the largest improvement — [ERL Jan 2024 via DOAJ](https://doaj.org/article/a415d09ce4ac4e15b08777badbcbec55)
- "Places to Watch" (WRI) is a prioritization layer built on the near-real-time alerts — [WRI publication](https://www.wri.org/publication/places-to-watch)

### Inferences
- For Cesium: put the GFW key in the Node proxy, register the proxy's domain, and proxy tile and query calls through it. Alert tiles on the Data API usually follow `https://tiles.globalforestwatch.org/{dataset}/{version}/{implementation}/{z}/{x}/{y}.png`, for example `umd_glad_landsat_alerts/latest/default` or `gfw_integrated_alerts/latest/default`. The integrated layer encodes date and confidence in RGB channels, so client-side decoding or a styled endpoint is needed **[unverified – prior knowledge]**.
- Whether the tile CDN (tiles.globalforestwatch.org) requires a key in 2026 is not confirmed. Historically it did not, while the query endpoints did **[unverified]**.
- "Highly accurate" for these alerts in practice means precise (UA above 90%) only for the high or highest confidence tier, for clearings ≥0.2–0.5 ha in humid tropical forest. Small clearings, selective logging and degradation (as opposed to clear-cut deforestation) are under-detected. Optical alerts (GLAD-L, GLAD-S2, DIST) slow down in cloudy seasons, while radar (RADD) is unaffected by cloud. Alerts flag disturbance, not cause: fire, wind, flooding, and logging versus agricultural conversion all look alike.
- From prior knowledge **[unverified]**: GLAD-L validation (Hansen et al. 2016, ERL) reported user's and producer's accuracies around the high 80s to 90s% for the full annual set, with lower values for single-scene detections. GLAD-S2 (Pickens et al.) covers the Amazon basin only.

### Gaps
- No accuracy study was found for DIST-ALERT (UMD/OPERA validation) or for the integrated alerts as a combined product.
- GLAD-L and GLAD-S2 UA/PA figures were not retrieved from primary papers in this session.
- No exact current rate-limit numbers for GFW API key tiers were found.
- Terms of use and license for alert data (historically CC BY 4.0 for most GFW datasets) were not re-verified for 2026.
- Whether the GNW rebrand changed API hostnames beyond the blog was not confirmed. data-api.globalforestwatch.org still resolved.

## Hansen/UMD Global Forest Change (annual tree cover loss, 30 m)

### Takeaway
The latest version is **GFC-2024-v1.12**, covering loss years 2001–2024 at roughly 30 m (1 arc-second). The 2025 loss year (v1.13) would normally appear around spring/summer 2026, but its release was **not confirmed** in this research. Gain covers only 2000–2012. The product records stand-replacing tree cover loss, not deforestation.

### Cited Findings
- The Earth Engine catalog lists `UMD/hansen/global_forest_change_2024_v1_12`, available 2000-01-01 to 2024-12-31. The lossyear band holds 1–24 for 2001–2024. Pixel size is 30.92 m. Gain is cumulative 2000–2012 only and has not been updated in later versions — [Earth Engine catalog](https://developers.google.com/earth-engine/datasets/catalog/UMD_hansen_global_forest_change_2024_v1_12)
- Bulk GeoTIFF tiles are on storage.googleapis.com under the GFC-2024-v1.12 path, e.g. a lossyear.txt index — [Earth Engine catalog](https://developers.google.com/earth-engine/datasets/catalog/UMD_hansen_global_forest_change_2024_v1_12)
- Downstream tools such as mapme.biodiversity updated to GFC-2024-v1.12 — [mapme GitHub issue](https://github.com/mapme-initiative/mapme.biodiversity/issues/416)

### Inferences
- Bulk download pattern: `https://storage.googleapis.com/earthenginepartners-hansen/GFC-2024-v1.12/Hansen_GFC-2024-v1.12_lossyear_{lat}_{lon}.tif`. The license is CC BY 4.0 **[unverified – prior knowledge]**.
- GFW serves this dataset as `umd_tree_cover_loss` raster tiles, and the GFW tile layer is the easiest Cesium integration **[unverified – prior knowledge]**.
- Failure modes: the product does not tell natural loss (fire, storms) from human loss. Plantation harvest cycles count as loss. Methods changed across versions (notably after 2011 and 2015), so GFW warns against comparing years before and after those changes. Small or degraded clearings are missed.

### Gaps
- Whether v1.13 (2025 loss) was released by Nov 2026 is unknown.
- Peer-reviewed accuracy figures (Hansen 2013 Science, and later sample-based assessments) were not retrieved in this session.

## Other forest and land products (JRC TMF, WorldCover, Dynamic World, canopy height, PRODES/DETER)

### Takeaway
ESA WorldCover (10 m) has independently validated overall accuracy of **76.7% (2021 v200)**. The Meta/WRI 1 m canopy height map claims **MAE 2.8 m**, but independent lidar checks show it underestimates tall canopies. It is a 2018–2020 snapshot, and a CHMv2 successor was published in 2026. JRC TMF, Dynamic World, ETH canopy height and PRODES/DETER were not verified in this session.

### Cited Findings
- **ESA WorldCover 2021 v200:** independent validation by Wageningen University gave 76.7% overall accuracy, against 74.4% for 2020 v100. Accuracy by continent ranges from about 73% to 82% — [WorldCover PVR v2.0](https://pure.iiasa.ac.at/18981/1/WorldCover_PVR_V2.0.pdf); [ESA WorldCover 2021](https://worldcover2021.esa.int)
- For Africa cropland, WorldCover (v100) had UA 71.4% and PA 50.8% — [arXiv 2307.02575](https://arxiv.org/pdf/2307.02575)
- **Meta/WRI 1 m canopy height (Tolan et al. 2024):** claimed MAE is 2.8 m. The license is listed as CC BY 4.0, with data on AWS, GEE and GitHub — [GEE community catalog: meta_trees](https://gee-community-catalog.org/projects/meta_trees/); [Wildlabs review](https://www.wildlabs.net/node/11935)
- The map is nominally a 2018–2020 snapshot and "can't be used to map change" — [Wildlabs review](https://www.wildlabs.net/node/11935)
- A 2026 *Ecological Informatics* lidar comparison found reliable canopy cover (R² 0.82–0.92, RMSE 8–15%). However, the map substantially underestimates maximum canopy height and fails to reliably estimate tree count, positions or crown size — [unibz record](https://bia.unibz.it/esploro/outputs/journalArticle/Evaluating-the-reliability-of-the-1-meter/991007384663701241)
- **CHMv2** (2026, DINOv3-based, Tolan co-author) reports substantially better accuracy and less bias in tall forests than v1 — [arXiv 2603.06382](https://arxiv.org/pdf/2603.06382)

### Inferences
- **[unverified – prior knowledge]** WorldCover is CC BY 4.0. ESA/Terrascope serves WMTS at `https://services.terrascope.be/wmts/v2` with layers such as `WORLDCOVER_2021_MAP`, which Cesium can use directly as a WebMapTileServiceImageryProvider. There are only two epochs, 2020 and 2021, and no later updates were known.
- **[unverified]** Dynamic World (Brown et al. 2022, Scientific Data) is near-real-time 10 m class probabilities, available only through Google Earth Engine (CC BY 4.0). It has no public XYZ tiles, so it needs GEE server-side tile generation (getMapId) through the proxy, and GEE commercial use requires a paid license.
- **[unverified]** JRC Tropical Moist Forest (Vancutsem et al. 2021, Science) gives 30 m Landsat annual change classes that separate degradation from deforestation, updated yearly. The site is forobs.jrc.ec.europa.eu/TMF and the data is also in GEE.
- **[unverified]** ETH global canopy height (Lang et al. 2023, Nature Ecology & Evolution) is 10 m for 2020, CC BY 4.0, with RMSE around 6 m. GEDI L2A/L4A footprints (about 25 m) are sparse samples, not wall-to-wall maps.
- **[unverified]** Brazil PRODES (annual, Aug–Jul year, about 6.25 ha MMU historically) and DETER (daily alerts, about 3 ha MMU) from INPE are served through TerraBrasilis (terrabrasilis.dpi.inpe.br) GeoServer WMS/WFS. These are official government data, open with attribution.

### Gaps
- No primary-source accuracy figures were retrieved for Dynamic World, JRC TMF, ETH CHM or PRODES/DETER.
- The licensing and download URL of CHMv2 was not confirmed.

## Fire: NASA FIRMS active fire and burned area

### Takeaway
The FIRMS area API returns CSVs of VIIRS 375 m (S-NPP, NOAA-20, NOAA-21), MODIS 1 km and Landsat (US/Canada only) detections. It needs a free MAP_KEY and allows 5,000 transactions per 10 minutes. VIIRS 375 m nominal-confidence detections have **commission error <1.2%** (Schroeder et al. 2014). Omission is poorly quantified, and is substantial for small, short-lived or cloud- and canopy-obscured fires.

### Cited Findings
- Endpoint: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/[SOURCE]/[west,south,east,north | world]/[DAY_RANGE 1-5]/[optional YYYY-MM-DD]` — [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/)
- Sources: LANDSAT_NRT (US/Canada only), MODIS_NRT, MODIS_SP, VIIRS_NOAA20_NRT/SP, VIIRS_NOAA21_NRT/SP, VIIRS_SNPP_NRT/SP — [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/)
- MAP_KEY limit: 5,000 transactions per 10-minute interval. Large requests such as 7-day pulls may count as several transactions. Higher limits are available by contacting FIRMS — [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/)
- Other endpoints: `/api/data_availability/`, `/api/missing_data/`, `/api/kml_fire_footprints/`, `/api/map_key/`. The country endpoints were marked unavailable at fetch time — [FIRMS API index](https://firms.modaps.eosdis.nasa.gov/api/)
- VIIRS 375 m initial global assessment: "small, although variable, commission errors (<1.2%) for nominal confidence fire pixels" — [Schroeder et al. 2014, RSE 143:85–96](https://directreadout.sci.gsfc.nasa.gov/publications_documents/Schroeder_et_al_2014b_RSE.pdf)
- The NOAA-20 I-band provisional review lists a low (<2%) false alarm rate, and still lists omission/commission validation as open because reference data is limited — [NOAA STAR maturity review](https://www.star.nesdis.noaa.gov/JPSS/documents/AMM/N20/Land_ActiveFires_Iband_Beta_Provisional.pdf)
- Hot smoke plumes are a known, rare source of commission — [Giglio, MODIS science team 2019](https://modis.gsfc.nasa.gov/sci_team/meetings/201911/presentations/land/giglio.pdf)

### Inferences
- **[unverified – prior knowledge]** NRT latency is under 3 hours globally, and in the US/Canada ultra-real-time and real-time data arrive within minutes. FIRMS also offers WMS/WFS (`https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/{MAP_KEY}/`), which Cesium can use as a WebMapServiceImageryProvider through the proxy. NASA GIBS also serves fire WMTS layers without a key (`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/...`). NASA data has no copyright restrictions, and attribution is requested.
- **[unverified]** MODIS 1 km false alarms are higher than VIIRS, and the MODIS Terra/Aqua missions are near end-of-life. Burned-area products include MCD64A1 (500 m, monthly, about 1–2 month latency) and VIIRS VNP64A1. Burned area is not suitable for near-real-time use.
- Failure modes: fires under clouds or thick canopy go undetected. Detection depends on overpass timing (roughly 4 VIIRS passes a day at mid-latitudes across 3 satellites). Industrial hot spots and gas flares need a static-source mask. A detection marks a pixel containing fire, not the fire's extent; a 375 m pixel is about 14 ha.

### Gaps
- No peer-reviewed omission rate was found for VIIRS 375 m.
- Exact current NRT latency and the FIRMS WMS endpoint format were not verified this session.

## Imagery: Sentinel-2 / Landsat via STAC, NICFI/Planet, EOX cloudless

### Takeaway
The **NICFI Planet tropical basemaps program ended**. PlanetScope tropical mosaics left NICFI on 24 Jan 2025, and GFW removed them on 1 Apr 2025. A **limited revival** started 26 May 2026: Amazon basin only, alert areas only, on GNW Horizon, running until 25 May 2027. EOX Sentinel-2 cloudless WMTS is free only for **non-commercial** use with attribution. STAC endpoints were not re-verified in this session.

### Cited Findings
- Planet said the PlanetScope Tropical Mosaics would no longer be part of NICFI from 24 Jan 2025 (contract end), with a temporary access extension — [Planet community post](https://community.planet.com/tropical-basemaps-85/nicfi-satellite-data-program-prolongs-public-access-to-high-resolution-rainforest-satellite-images-6020)
- Planet imagery was removed from GFW/GNW on 1 Apr 2025, including new and historical mosaics. Since 26 May 2026 a GNW, Bezos Earth Fund, Andes Amazon Fund and Planet partnership provides monthly mosaics on **GNW Horizon (preview)**. Coverage is limited to the **Amazon basin only**, and within it only to areas with integrated disturbance alerts from the past 2 years plus a 500 m buffer. Each month's mosaic is available around the 15th of the next month. The arrangement runs until **25 May 2027**. GNW's own alternatives are Google imagery and Landsat 8 / Sentinel-2 — [GNW blog](https://globalnaturewatch.org/blog/data-and-tools/planet-imagery-changes-gfw)
- The Earth Engine NICFI catalog dates are inconsistent: Africa runs to 2025-07-01 and Asia to 2026-01-01 — [GEE NICFI Asia](https://developers.google.com/earth-engine/datasets/catalog/projects_planet-nicfi_assets_basemaps_asia)
- EOX: WM(T)S layers are "free to use for non-commercial purposes" with attribution. The 2016 original s2cloudless tiles were CC BY-SA 4.0. The 2024 layer ID is `s2cloudless-2024`, with attribution "EOxCloudless - https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)", zoom 0–14 in EPSG:3857. Commercial use is through paid plans — [EOX cloudless viewing](https://cloudless.eox.at/products/viewing); [EOX pricing](https://cloudless.eox.at/pricing); [EOX 2017 post](https://eox.at/2017/03/sentinel-2-cloudless-original-tiles-available/); [EOxMaps service page](https://osapiens.maps.eox.at/)

### Inferences
- **[unverified – prior knowledge]** STAC endpoints:
  - Element84 Earth Search: `https://earth-search.aws.element84.com/v1`, collections `sentinel-2-l2a` and `landsat-c2-l2`. No auth; COGs on AWS open data.
  - Microsoft Planetary Computer: `https://planetarycomputer.microsoft.com/api/stac/v1`, with SAS token signing at `/api/sas/v1/sign`. It also provides a TiTiler-based tile endpoint (`/api/data/v1/item/tiles/...` and mosaic tiles). Microsoft announced changes to the PC Data Catalog/hub, so check its 2026 status.
  - Copernicus Data Space: STAC at `https://stac.dataspace.copernicus.eu/v1`, and Sentinel Hub-style OGC/Process APIs at `sh.dataspace.copernicus.eu`. These need a free CDSE account (OAuth client credentials) and have monthly processing-unit quotas.
  - Sentinel data license: free, full and open (Copernicus), attribution required. Landsat is public domain.
- **[unverified]** Raw STAC COGs need a tiler (TiTiler or similar) on the Node or Python side, or the Planetary Computer tiler, before Cesium can display them. The tiles themselves are not ready-made.
- **[unverified]** The keyless, global, CC BY alternative for a cloudless mosaic is the 2016 s2cloudless layer, or NASA GIBS daily MODIS/VIIRS true color (250 m–1 km).

### Gaps
- Microsoft Planetary Computer's 2026 status (API and Explorer changes) was not verified.
- CDSE quotas and rate limits were not verified.
- No confirmation that tiles.maps.eox.at serves the 2024 layer without a key.

## Protected areas: WDPA/Protected Planet, OECM, PAD-US, NPS, KBA

### Takeaway
WDPA/WD-OECM (Protected Planet) bars **commercial use without written permission from UNEP-WCMC**, and it defines commercial broadly enough to include some non-profit uses. It also bars redistribution and sublicensing, which affects serving it as a tile layer. **PAD-US 4.1** (USGS) is the US alternative, released as public domain. NPS and KBA terms were not verified.

### Cited Findings
- Protected Planet terms: no commercial use, where commercial is defined broadly to cover for-profit entities and possibly individuals and non-profits, decided case by case. No sublicensing or redistribution. Online use, including mobile apps, must link to protectedplanet.net. The required citation is "UNEP-WCMC and IUCN (year), Protected Planet: [database name]". Use is at your own risk — [Protected Planet T&Cs](https://protectedplanet.net/c/terms-and-conditions)
- The GEE catalog says commercial use needs prior written UNEP-WCMC permission, and describes the data as available for non-commercial research, education and nonprofit use — [GEE WDPA polygons](https://developers.google.com/earth-engine/datasets/catalog/WCMC_WDPA_current_polygons)
- PAD-US 4.1 is the latest version, with national and per-state GDB/KMZ downloads. Citation: USGS GAP 2024, DOI 10.5066/P96WBCHS — [USGS PAD-US download](https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download)
- PAD-US 4.1 feature services found online were hosted by third parties, not USGS — [example service](https://services9.arcgis.com/eNX73FDxjlKFtCtH/ArcGIS/rest/services/USVIODR_USGS_BaseData/FeatureServer/2)

### Inferences
- Because WDPA bars redistribution, pre-rendering WDPA vector tiles on your own server and serving them publicly is a gray area at best. Displaying through an approved service with the link and citation is safer. For commercial use, get written permission.
- **[unverified – prior knowledge]** The Protected Planet API (`https://api.protectedplanet.net/v3/`) needs a token requested by form, and is intended for non-commercial use. WD-OECM falls under the same terms. KBA data (keybiodiversityareas.org, via IBAT) is restricted: download needs a request or agreement, and commercial use goes through paid IBAT. The NPS Data API (`https://developer.nps.gov/api/v1/`, free key from api.data.gov at 1,000 requests/hour) gives park metadata. NPS boundaries are available as ArcGIS services or downloads from NPS IRMA as US government public domain.
- PAD-US public domain status is assumed **[unverified]**: USGS data releases are generally public domain.

### Gaps
- The Protected Planet API token process and rate limits for 2026 were not verified.
- KBA license text was not retrieved.
- No official USGS-hosted PAD-US REST endpoint was confirmed.
- The NPS boundary service URL was not found.

## Practical: ready-made web tiles for Cesium vs server-side processing

### Takeaway
Ready-made or near-ready tiles: GFW/GNW tile layers (key via proxy), WorldCover WMTS, EOX s2cloudless (non-commercial), and NASA GIBS. CSV or vector sources that need client- or proxy-side rendering: FIRMS points (render as Cesium billboards or points) and WDPA/PAD-US polygons (vector tiles or GeoJSON, subject to license). These need tilers or processing: STAC COGs (Sentinel-2/Landsat), Hansen bulk GeoTIFFs, and Dynamic World (GEE only).

### Cited Findings
- FIRMS is CSV over REST with a bounding box and 1–5 days per query, so a proxy can cache and re-serve it as GeoJSON — [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/)
- GFW Data API keys are bound to an Origin and sent as `x-api-key`, which suits a server-side proxy — [OpenEPI how-to](https://developer.openepi.io/how-tos/getting-started-using-global-forest-watch-data-api)
- EOX publishes WMTS layers with EPSG:3857 zoom 0–14 for the 2024 cloudless layer — [EOxMaps service page](https://osapiens.maps.eox.at/)
- Hansen data is distributed as GEE assets and GCS GeoTIFF tiles — [Earth Engine catalog](https://developers.google.com/earth-engine/datasets/catalog/UMD_hansen_global_forest_change_2024_v1_12)

### Inferences
- Suggested architecture: the Node proxy holds the GFW key, FIRMS MAP_KEY and CDSE credentials. It caches FIRMS CSV as GeoJSON (refresh every 15–30 min). It passes GFW and WorldCover tiles through with cache headers. It optionally runs TiTiler for STAC COGs.
- License triage for a commercial deployment: OK are NASA (FIRMS/GIBS), Copernicus Sentinel, Landsat, Hansen and most GFW datasets (CC BY), WorldCover, Meta CHM (CC BY) and PAD-US. Restricted are WDPA/OECM, KBA, EOX cloudless 2017+, Planet (GNW Horizon only), and GEE for commercial use **[some unverified]**.

### Gaps
- No live test of tile endpoints was done; URL templates in Inferences need verification.
