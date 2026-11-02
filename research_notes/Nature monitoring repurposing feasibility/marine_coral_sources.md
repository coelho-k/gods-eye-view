# Open Data Sources for Coral Reef & Marine Ecosystem Monitoring (CesiumJS globe + Node proxy), as of Nov 2026

Research date: 2026-11-01. About 28 tool calls. Where a figure came only from a search snippet and not a fetched primary page, it says so.

---

## 1. NOAA Coral Reef Watch (CRW): 5 km SST, HotSpot, DHW, BAA, outlooks, virtual stations

### Takeaway
CRW is the easiest source to integrate and the most authoritative one. It is free US-government data in daily 0.05° NetCDF, with ERDDAP mirrors that serve PNG/NetCDF/JSON subsets (ERDDAP also exposes WMS). What it measures is **heat stress**, not bleaching. Peer-reviewed validations show that standard DHW is only a moderately skilled predictor of observed bleaching. Skill in one 2026 study is close to chance at reefs whose climatological maximum is ≥29–30 °C, and those reefs are the majority of reef pixels.

### Cited Findings
**Products and resolution**
- Version 3.1 runs 1985–present, with full release on 1 Aug 2018. Resolution is "0.05 degree exactly" (~5 km). Products are SST (CoralTemp), SST Anomaly, HotSpot, DHW, single-day BAA, 7-day-max BAA, 7-day SST Trend, year-to-date/monthly/annual composites, Regional Virtual Stations, the 4-Month Outlook, and the 365-day Max Alert Area. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- CRW itself says the single-day BAA "does not consistently and adequately identify" heat stress and recommends the 7-day-max BAA instead. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- **Deprecated:** the 50 km heritage products were retired 30 Apr 2020 and are archive-only. v3.1 replaced v3.0 because v3.0 had SST errors in some regions in 2013–2016. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- **Alert scale changed:** CRW added Bleaching Alert Levels 3–5 on 15 Dec 2023. Level 2 is 8–12 DHW, Level 3 is 12–16 DHW ("multi-species mortality"), Level 4 is 16–20 DHW ("severe, >50% of corals"), and Level 5 is >20 DHW ("near complete mortality, >80%"). This comes from secondary coverage plus NOAA ICRI briefing slides. — [EcoWatch](https://www.ecowatch.com/noaa-coral-reef-watch-new-alerts-climate-change.html); [Manzello ICRI slides 2024](https://icriforum.org/wp-content/uploads/2024/03/3.-ICRI_14MAR2024_MANZELLO.pdf)
- DHW definition: 1 °C above the normal maximum for 7 days accumulates 1 DHW (°C-weeks). The variable is `CRW_DHW`, in units of "Celsius weeks". — [EcoWatch](https://www.ecowatch.com/noaa-coral-reef-watch-new-alerts-climate-change.html); [PacIOOS ERDDAP FGDC metadata](https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.fgdc)

**Latency**
- Processing runs daily at midday US Eastern and produces data for the previous day, so latency is about 1 day. Single-day and 7-day composites update daily. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)

**Access endpoints (exact)**
- HTTPS NetCDF: `https://www.star.nesdis.noaa.gov/pub/socd/mecb/crw/data/5km/v3.1_op/nc/v1.0/daily/{baa5-max-7d|baa5|hs|dhw|ssta|sst|sst-trend-7d}/`. The same tree has `image_plain/daily/` and `image_browse/daily/`, and there is an FTP mirror at `ftp://ftp.star.nesdis.noaa.gov/pub/socd/mecb/crw/data/5km/v3.1_op/`. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- Climatology lives at `https://www.star.nesdis.noaa.gov/pub/sod/mecb/crw/data/5km/v3.1_op/climatology/nc/`. The path uses `sod`, not `socd`. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- PacIOOS ERDDAP has the **full time series**: `https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.html`, with THREDDS at `https://pae-paha.pacioos.hawaii.edu/thredds/satellite.html?dataset=dhw_5km`. PacIOOS also has a Marine Heatwave product, `mhw_5km_lon360`. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php); [PacIOOS mhw info](https://pae-paha.pacioos.hawaii.edu/erddap/info/mhw_5km_lon360/index.html)
- CoastWatch West Coast ERDDAP: `https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.html`. **Changed in Jan 2024:** this dataset now holds only the latest 3 years, because the full aggregation was hard to serve. The catalog sends users to PacIOOS for the full record. — [search snippet of CoastWatch catalog via data.gov/ERDDAP](https://coastwatch.pfeg.noaa.gov/erddap/info/NOAA_DHW/index.html)
- NCEI archive (HTTP, FTP, THREDDS): `https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.nodc:CRW-5km-HeatStressProducts`. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- The CRW product page does not list a WMS endpoint. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- **4-Month Outlook:** NCEP CFSv2 ensemble at **0.5°** (not 5 km), updated weekly (usually Tuesday). It uses 112 ensemble members for weeks 1–5, 49 for weeks 6–12, and 28 for weeks 13–36. Composites are published at 60% and 90% probability. NetCDF4 is at `https://www.star.nesdis.noaa.gov/pub/socd/mecb/crw/data/outlook/v5/nc/v1/outlook`. Skill "declines as lead time increases" and is relatively higher in the central-eastern tropical Pacific, the central-eastern Indian Ocean and the Caribbean, especially during ENSO. The page gives no numeric skill, and it still describes the heritage alert scale (up to Level 2). — [CRW Outlook page](https://coralreefwatch.noaa.gov/satellite/bleachingoutlook_cfs/outlook_cfs.php)
- **Virtual Stations:** "219 Station Total (with 5 duplicated Stations in overlapping regions)", plus single-pixel stations in US jurisdictions. Each has a plain-text time series at `https://coralreefwatch.noaa.gov/product/vs/data/<station_name>.txt`, which contains SST, HotSpot and DHW, plus multi-year PNGs at `/data/vs/ts_figures/ts_multi_year/vs_ts_multiyr_<station>.png`. Latest data was dated 29 Oct 2026 when fetched, which confirms the stations are still operational. Virtual Station alerts still use the old scale that stops at Level 2. — [CRW VS data page](https://coralreefwatch.noaa.gov/product/vs/data.php)

**License and terms**
- NOAA product disclaimer: `http://www.star.nesdis.noaa.gov/star/productdisclaimer.php`. Citation guidance: `https://coralreefwatch.noaa.gov/satellite/docs/recommendations_crw_citation.php`. NOAA "does not endorse" third-party platforms that carry CRW data. — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)
- Methodology references: Liu et al. 2014 (Remote Sensing) and Skirving et al. 2020 ([doi:10.3390/rs12233856](https://doi.org/10.3390/rs12233856)). — [CRW 5km product page](https://coralreefwatch.noaa.gov/product/5km/index.php)

**Validated skill against observed bleaching**
- **DeCarlo 2020 (PeerJ):** the dataset is 100 reef sites, 1982–2016, n=3,500 observations including absences. The standard DHW (1 °C cutoff, 12-week window) had a maximum Equitable Threat Score of **0.150** at an optimal threshold of **6.3 °C-weeks**. For comparison, weather-forecast ETS is about 0.4 for next-day rain and about 0.15 for rain a week ahead. Dropping the 1 °C cutoff and using a 9-week window gave ETS 0.169. Adding El Niño and regional thresholds gave ETS 0.218. Caveat: the study computed DHW from OISSTv2, not CRW's own product. — [DeCarlo 2020, PeerJ/PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7337031/)
- **Coral Reefs 2024 follow-up:** reports about a 70% global gain in forecast skill from a 0.4 °C cutoff, an 11-week window and a 3 DHW threshold. This is from a search snippet only and was not fetched. — [Coral Reefs s00338-024-02512-w](https://link.springer.com/10.1007/s00338-024-02512-w)
- **South China Sea, Frontiers 2024:** lowering the DHW threshold from 4 to 1.86 °C-weeks raised the Peirce Skill Score from 0.17 to 0.66 and the AUC from 0.58 to 0.83. Snippet only. — [Frontiers Mar Sci 2024](https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2024.1438087/pdf)
- **Fukui, Frontiers in Marine Science, 24 Jul 2026:**
  - Global Coral Bleaching Database (7,286 records, 51 countries): DHW AUC for any bleaching falls from 0.705 (climatological SST <27 °C) to **0.568** (≥29 °C) and **0.513** (>30 °C, near chance). In the ≥29 °C band, the DHW ≥4 alert had sensitivity **0.055**.
  - 63.4% of reef cells have a maximum monthly mean ≥29 °C.
  - Japan panel: **24 of 26 severe (≥50%) bleaching observations occurred below 4 DHW**. NOAA's operational DHW configuration gave AUC 0.753, while a simple "days ≥30 °C" metric gave 0.912. Swapping the SST product (MUR vs CoralTemp) changed AUC by only about 0.02.
  - Caveats: the Japan panel is small (effective n≈48), and the 30 °C threshold is calibrated to Japan.
  - — [Fukui 2026, Front. Mar. Sci. doi:10.3389/fmars.2026.1835611](https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2026.1835611/full)

### Inferences
- **What "highly accurate" means here:** CoralTemp SST and the derived DHW are accurate as gridded ocean-surface temperature metrics. A DHW or BAA pixel means "accumulated anomalous heat over ~5 km of ocean". It does **not** mean "this reef bleached". The UI should label these layers as *heat stress* or *bleaching risk*, never as bleaching observed. False negatives are common on hot-climatology reefs, and false alarms occur too.
- A 5 km pixel blends lagoon, reef and open water. Reef-scale microclimates, upwelling, depth and turbidity shading are invisible to it. The SST is a blended satellite skin/foundation product, so it does not represent temperature at the depth of the corals.
- Cloud cover is handled through CoralTemp's gap-filled blending, so there are no holes. The cost is that cloudy-period values are partly interpolated or analysed rather than observed. This is an inference from how CoralTemp is built and was not quoted from a source here.
- For a CesiumJS globe, the simplest path is the ERDDAP griddap `.png`/`.transparentPng` image request for a lat/lon box and date. It can be draped as a `SingleTileImageryProvider`, or tiled through the Node proxy. ERDDAP also exposes WMS at `/erddap/wms/<datasetID>/request`. That WMS path is a standard ERDDAP feature, but I did not verify it live for `dhw_5km` or `NOAA_DHW`. Use PacIOOS for history and CoastWatch for recent data.
- Virtual-station `.txt` files are tiny and ideal for click-to-chart point popups.

### Gaps
- I found no quantitative skill score for the 4-Month Outlook. The CRW page links to a CFSv2 skill assessment that I did not fetch.
- I did not quantify CoralTemp SST accuracy (bias/RMSD against buoys). Skirving et al. 2020 should be checked for it.
- I did not verify whether CRW publishes an official WMS/WMTS of its own, beyond Google Earth KMZ and NOAA View.

---

## 2. Allen Coral Atlas (ACA)

### Takeaway
ACA provides global 5 m shallow-reef geomorphic and benthic maps, annual 10 m turbidity, 10 m bathymetry and seagrass. Maps are CC BY 4.0 (mosaic imagery is NC). It runs a public GeoServer WMS/WFS that works directly as Cesium imagery. Accuracy is moderate: a self-reported 60–90% overall by region, an independent check found 20–67%, and coral and algae are merged into one class. The maps are static (2018–2020 imagery basis, revised 2022) and stop at 10–15 m depth.

### Cited Findings
- **Layers:** PlanetScope mosaic (3.125 m pixels), geomorphic zonation and benthic composition, bathymetry (10 m), reef extent (5 m), annual turbidity (10 m; replaced the quarterly product on 14 Mar 2024), global seagrass extent (10 m; 2019–2020 and 2023–2024), bleaching monitoring, and CRW 5 km overlays. — [ACA Methods](https://allencoralatlas.org/methods/)
- **Depth limits:** mapping covers reef areas shallower than about 20 m. Geomorphic classes are mapped to about 15 m and benthic classes to about 10 m. Latitude coverage is 30°N–30°S. — [ACA Methods](https://allencoralatlas.org/methods/); [ACA Resources/FAQ](https://allencoralatlas.org/resources)
- **Accuracy:** ACA states overall accuracy "between 60-90%", varying by region. It depends on habitat complexity, depth, turbidity, mosaic quality, satellite-derived depth and reference data. Coral and algae are combined into one benthic class "because they are spectrally similar with current imagery". The 2021 maps were revised in 2022. — [ACA Resources/FAQ](https://allencoralatlas.org/resources)
- **Lyons et al. 2024** (Cell Reports Sustainability, doi:10.1016/j.crsus.2024.100030): about 78,000 geomorphic and about 57,000 benthic validation points, with average accuracy of about **69% (geomorphic)** and **66% (benthic)**, varying by region. It gives global shallow coral reef area as 348,361 km² and coral habitat as 80,213 km² (95% CI 46,237–106,319). These figures come via secondary citation and snippets; the paper itself was not fetched. — [arXiv 2510.16730 citing Lyons 2024](https://arxiv.org/pdf/2510.16730); [DOAJ record](https://doaj.org/article/908b29ae0a284a89928494c5bbebf626)
- **Independent validation in New Caledonia (Coral Reefs 2024):** the 6-class benthic product, tested at 0–10 m against in-situ photos, had overall accuracy of **20–67%** depending on site and evaluation method. — [Living Oceans Foundation summary](https://livingoceansfoundation.org/publication/evaluation-of-the-allen-coral-atlas-benthic-habitat-map-product-for-new-caledonia-using-representative-habitat-observations-from-a-multi‑species-fishery-assessment)
- **Bleaching monitoring:** Sentinel-2-based, triggered when NOAA reaches Alert Level 1 or higher, processed bi-weekly while a region is under alert, and stopped at "No Stress" or DHW ≤0.5. This describes the method "as of April 2023". — [ACA Methods](https://allencoralatlas.org/methods/). The underlying method is Kennedy et al., Remote Sensing 12(19) (doi:10.3390/rs12193219). It was validated in the main Hawaiian Islands, but I did not retrieve accuracy figures. — [Crossref](https://api.crossref.org/works/10.3390%2FRS12193219)
- **Access:**
  - WMS: `https://allencoralatlas.org/geoserver/ows?service=wms&version=2.0.0&request=GetCapabilities`
  - WFS: `https://allencoralatlas.org/geoserver/ows?service=wfs&version=2.0.0&request=GetCapabilities`
  - Metadata: `https://allencoralatlas.org/mapping/maps`
  - Downloads need a free login, are limited to 5 million km² per area, and are kept for 30 days.
  - — [ACA Resources/FAQ](https://allencoralatlas.org/resources)
  - Google Earth Engine asset `ACA/reef_habitat/v2_0`: 5 m geomorphic and benthic maps from 2018–2020 PlanetScope composites. — [GEE catalog](https://developers.google.com/earth-engine/datasets/catalog/ACA_reef_habitat_v2_0)
- **License:**
  - Maps, bathymetry and statistics: "© 2018-2023 Allen Coral Atlas Partnership", **CC BY 4.0**.
  - Satellite Coral Reef Mosaic: © 2021 Planet Labs, **CC BY-NC-SA 4.0** (the page also writes "BY-SA-NC").
  - Reproducing or publishing the *entire* global habitat dataset requires prior written consent from ASU.
  - API and service use is subject to the ACA Terms of Use, which I did not read.
  - Screenshot credit: "Image credit: Allen Coral Atlas".
  - — [ACA Resources/FAQ](https://allencoralatlas.org/resources)
  - The GEE catalog credits the Partnership and Vulcan, Inc. (2023), so attribution wording varies by source. — [GEE catalog](https://developers.google.com/earth-engine/datasets/catalog/ACA_reef_habitat_v2_0)

### Inferences
- ACA works well as a static "where are reefs and what type" basemap through WMS → Cesium `WebMapServiceImageryProvider`, fetched directly or through the proxy. It is not a live condition feed.
- **What "accurate" means here:** the maps are reliable for reef presence and broad geomorphic zones. Benthic classes are only moderately reliable. The maps cannot tell live coral from algae, cannot tell present-day coral cover, and see nothing below about 10–15 m or outside 30°N–30°S, which excludes reefs in places such as Bermuda and parts of Japan and Australia.
- Commercial use of the map layers appears allowed under CC BY 4.0. Commercial use of the imagery mosaic is not. The "whole dataset republication needs consent" clause matters if the proxy would mirror everything.

### Gaps
- I could not confirm whether the bleaching-monitoring product is still actively produced in 2026, or find its accuracy figures.
- I did not read the ACA Terms of Use for GeoServer rate limits.
- I did not read the primary Lyons 2024 validation tables.

---

## 3. Global Fishing Watch (GFW)

### Takeaway
GFW API v3 provides AIS fishing effort and vessel presence (4Wings tiles and reports), events, vessel identity and SAR vessel detections, all with a **72-hour delay**. It requires a personal bearer token that must not be exposed client-side, so it must go through the Node proxy. It is **non-commercial only (CC BY-NC 4.0)** and requires "Powered by Global Fishing Watch" attribution.

### Cited Findings
- **License:** "Global Fishing Watch APIs are only available for non-commercial purposes." — [GFW API docs](https://globalfishingwatch.org/our-apis/documentation)
- "The Services are available for noncommercial use only in accordance with the CC BY-NC 4.0 license." An app must not be "intended (primarily or materially) for or directed towards commercial advantage". GFW may revoke access. — [GFW license & rate limits](https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits)
- **Attribution:** "Powered by Global Fishing Watch.", linked to globalfishingwatch.org. Bibliographies use "Copyright [year], Global Fishing Watch, Inc." — [GFW license & rate limits](https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits)
- **Rate limits:** 50,000 requests/day and 1,500,000/month per user across all tokens. Exceeding them returns HTTP 429, with a 24 h block (daily) or a 30-day block (monthly). Responses carry an `x-ratelimit-daily-remaining-requests` header. Each user can have up to 5 tokens. "Tokens must not be shared or included in publicly accessible web interfaces." — [GFW license & rate limits](https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits)
- **APIs:**
  - 4Wings: apparent fishing activity as map tiles or area reports; also used for dark-vessel detections.
  - Vessels: identity across registries and AIS.
  - Events: encounters, loitering, port visits, fishing.
  - Insights: risk indicators, AIS-off events.
  - Bulk-download.
  - — [GFW API docs](https://globalfishingwatch.org/our-apis/documentation)
- **Latency (API):** AIS Fishing Effort, AIS Vessel Presence, fishing, port, loitering and encounter events, Insights, AIS-Off events and **SAR Vessel Detections** all have a "72 hour delay". SAR Fixed Infrastructure has a "3 months delay". Sentinel-2 vessel detections and VIIRS night lights are not in the API (VIIRS is map-only). — [GFW Data Availability](https://globalfishingwatch.org/global-fishing-watch-data-availability/)
- The Sentinel-1 SAR download-portal dataset (May 2024 release) covers 2017 to about 5 days before the current date, matched to AIS. — [GFW platform update May 2024](https://globalfishingwatch.org/platform-update/2024-may-data-download-portal-new-dataset-released-featuring-vessel-detections-from-sentinel-1-sar/)
- The SAR methodology and global dark-fleet findings are in Paolo et al. 2024, Nature. I did not fetch the accuracy numbers. — [Nature s41586-023-06825-8](https://www.nature.com/articles/s41586-023-06825-8.pdf)

### Inferences
- The Node proxy must hold the token and cache aggressively. At 50k requests/day, tile-heavy globe panning by many users could exhaust the quota.
- **What "accurate" means here:**
  - "Apparent fishing effort" is a machine-learning inference from AIS tracks, not a verified catch.
  - It is blind to vessels without AIS or with AIS switched off.
  - SAR fills some of that gap but only images part of the ocean, mostly near coasts, at Sentinel-1 revisit rates, and it misses small vessels.
  - A 72 h delay means this is near-real-time monitoring, not live tracking.
- A commercial deployment of the app would need a separate agreement or would have to drop GFW.

### Gaps
- I did not confirm the exact base URL. It is believed to be `https://gateway.api.globalfishingwatch.org/v3/`, but this needs verifying in the v3 reference.
- I did not confirm the gridded fishing-effort resolution (believed to be 0.01°/0.1°) or the SAR detection size limits and accuracy.

---

## 4. Marine Protected Areas: WDPA / Protected Planet, MPAtlas

### Takeaway
WDPA is the authoritative global protected-areas layer, but its API and downloads are **non-commercial**. Commercial users are sent to IBAT. **The API changed recently:** WDPA and WD-OECM were merged on 1 Nov 2025, and API v3 was scheduled for removal on 1 May 2026, so v4 is now the version to use. MPAtlas adds protection-level assessments on top of WDPA but has no documented public API.

### Cited Findings
- "The API is not available for commercial use." Commercial use is defined broadly as any use by or for a commercial entity, revenue-generating or not, and such users are pointed to IBAT. WDPA and WD-OECM were merged on 1 Nov 2025. "v3 will be taken down on 1st May 2026". v4 has its own documentation ("What's New in v4"). A key is requested at `https://api.protectedplanet.net/request`. — [Protected Planet API](https://api.protectedplanet.net/)
- Bulk downloads are available as Shapefile, CSV and GDB on protectedplanet.net. — [Protected Planet API](https://api.protectedplanet.net/)
- Derived works must cite WDPA and link to Protected Planet. Snippet only. — [Protected Planet T&C](https://protectedplanet.net/c/terms-and-conditions)
- WDPA polygons are also in GEE as `WCMC/WDPA/current/polygons`. — [GEE WDPA](https://developers.google.com/earth-engine/datasets/catalog/WCMC_WDPA_current_polygons)
- ACA's citation form: "UNEP-WCMC and IUCN (2023), Protected Planet: The World Database on Protected Areas (WDPA)". — [ACA Resources](https://allencoralatlas.org/resources)
- **MPAtlas** (Marine Conservation Institute) is built on WDPA plus independent review and corrections, and reports "highly protected" subsets. Its data-use terms include a liability waiver and a request to send copies of published analyses to info@mpatlas.org. Full shapefiles are directed to WDPA. — [MCI data use](https://marine-conservation.org/data-use/); [MPAtlas download page (cached)](https://old.mpatlas.org/data/download/)

### Inferences
- Filter WDPA to `MARINE` ∈ {1,2} for the marine subset (a standard WDPA attribute; not verified in this session). Convert the polygons to 3D Tiles or vector tiles server-side, because the global polygon set is large.
- **What "accurate" means here:** WDPA gives legal designation boundaries as reported by governments. It does not show enforcement or actual protection level. MPAtlas's protection-level assessments address the "paper park" problem.

### Gaps
- I found no v4 API base URL, rate limits or token terms.
- I found no MPAtlas API or explicit license.

---

## 5. OBIS (Ocean Biodiversity Information System)

### Takeaway
OBIS has an open, keyless REST API (`api.obis.org/v3`) with occurrence, grid and tile endpoints, plus a full GeoParquet export on AWS Open Data (Oct 2025). Licenses are **per dataset** (CC0, CC BY or CC BY-NC). The AWS registry labels the whole export CC BY-NC 4.0, so commercial use needs per-record license filtering.

### Cited Findings
- The API is documented at `https://api.obis.org` and includes `https://api.obis.org/v3/occurrence`. The `year` parameter was removed in v3. — [robis docs](https://www.stat.ethz.ch/CRAN/web/packages/robis/refman/robis.html); [pyobis occurrences](https://iobis.github.io/pyobis/occurrences.html)
- Gridded endpoint: `https://api.obis.org/occurrence/grid/{res}`, where res is the Geohash precision. — [OBIS gridded notebook](https://iobis.github.io/notebook-gridded-data)
- pyobis `tile()` returns occurrences aggregated by zoom-dependent Geohash as GeoJSON or **MVT**. I did not confirm the URL pattern. — [pyobis](https://iobis.github.io/pyobis/occurrences.html)
- Full export: the S3 bucket `s3://obis-open-data` (us-east-1) is listable without an account (`aws s3 ls --no-sign-request`). It is GeoParquet, announced 16 Oct 2025, and the AWS registry lists it as CC BY-NC 4.0 with weekly updates. — [AWS Registry](https://registry.opendata.aws/obis/); [OBIS parquet release](https://obis.org/2025/10/16/parquet-release/)
- On the OBIS forum, users are told to rely on the per-record/EML "license" field rather than a blanket license. — [OBIS discourse](https://obis.discourse.group/t/license-on-obis-snapshot-data/97)

### Inferences
- OBIS occurrence records are presence-only and heavily biased toward sampling effort. Absence of points does not mean absence of species. Coordinate precision varies by record.
- The MVT tile endpoint is a good fit for a Cesium vector or imagery overlay through the proxy.

### Gaps
- I found no published OBIS API rate limits. I did not see the official OBIS access manual page because the URL returned 404.

---

## 6. Other sources: Copernicus Marine, NASA PACE/Ocean Color, ReefCloud, Reef Check/AGRRA, tracking (OBIS-SEAMAP, Whale Alert)

### Takeaway
- **Copernicus Marine** offers a keyless catalog-wide WMTS and free (attribution-required) global SST and chlorophyll products.
- **NASA PACE OCI** provides free L3 chlorophyll (v3.1, NRT and science quality).
- **In-situ reef survey networks** (ReefCloud, Reef Check, AGRRA) are the only sources of *actual* coral cover and bleaching. Their access is fragmented and licenses are often unclear or restricted.
- **Animal tracking** (OBIS-SEAMAP) is per-dataset, often permission-required, and no redistribution is allowed without consent unless the data are CC0.

### Cited Findings
**Copernicus Marine (CMEMS)**
- Catalog-wide WMTS: `https://wmts.marine.copernicus.eu/teroWmts?service=WMTS&version=1.0.0&request=GetCapabilities`. Per-dataset paths have the form `/teroWmts/<PRODUCT_ID>/<DATASET_ID>?...`, and the service supports GetCapabilities and GetTile. — [CMEMS help: WMTS](https://help.marine.copernicus.eu/en/articles/6478168-how-to-use-wmts-to-visualize-data); [CopernicusMarine R source](https://rdrr.io/cran/CopernicusMarine/src/R/cms_wmts.r)
- The Copernicus Marine Toolbox offers subsetting and download "without data size limit". — [CMEMS programmatic access](https://help.marine.copernicus.eu/en/articles/4794731-which-programmatic-access-services-are-available)
- **License:** free of charge. Derivative products must carry "Generated using E.U. Copernicus Marine Service Information" (with product DOIs). Redistribution needs the credit "E.U. Copernicus Marine Service Information". The FAQ applies attribution to "scientific, commercial, etc." uses, which implies commercial use is permitted. I could not open the full licence text because of a TLS error. — [CMEMS cite FAQ](https://marine.copernicus.eu/faq/cite-cmems-products-cmems-credit/); [CMEMS licence](https://eds.hub.copernicus.eu/licences/CMEMS-licence); [Mercator T&C](https://mercator-ocean.eu/en/?p=7281)

**NASA PACE OCI**
- v3.1 is the current full-mission reprocessing (Mar 2024–present), and "data products are free to all". — [PLUG Jan 2026 slides](https://pace.oceansciences.org/docs/mckibben_2026_01_20-PLUG-Meeting-Winter2026.pdf)
- An NRT L3 mapped chlorophyll product (v3.1) exists from 2024-03-05. — [NASA Earthdata listing via search](https://data.nasa.gov/dataset/pace-oci-level-3-global-mapped-apparent-visible-wavelength-avw-data-version-3-1)
- OPeNDAP files follow the pattern `https://oceandata.sci.gsfc.nasa.gov/opendap/PACE_OCI/L3SMI/YYYY/MMDD/PACE_OCI.YYYYMMDD.L3m.DAY.CHL.V3_0.chlor_a.0p1deg.nc` (0.1° example). A 4 km (4320×8640) grid also exists. — [OB.DAAC OPeNDAP](https://oceandata.sci.gsfc.nasa.gov/opendap/PACE_OCI/L3SMI/2024/0401/PACE_OCI.20240401.L3m.DAY.CHL.V3_0.chlor_a.0p1deg.nc.dmr.html); [OCI L3m structure](https://oceancolor.gsfc.nasa.gov/images/data/pace/txt/OCI_Level-3m_CHL_Data_Structure.txt)

**ReefCloud (AIMS)**
- An open-access, ML-based platform for extracting data from reef images. The data.gov.au licence field reads "Not Specified", and sharing is set per dataset. I found no public API. — [data.gov.au ReefCloud](https://data.gov.au/data/dataset/reefcloud); [ICRI](https://icriforum.org/reef-cloud-launched-open-access-coral-reef-monitoring-tool/)

**Reef Check**
- Global data is now viewed through **Aqualink**, a free, open-source nonprofit tool and the official Global Reef Tracker partner. Surveys go back to 1997 (update dated 29 Apr 2026). Reef Check's own Global Reef Tracker is "under construction", and data otherwise requires request forms. — [Reef Check/Aqualink 2026](https://www.reefcheck.org/latest-reef-check-coral-reef-data-available-on-aqualink/); [Global Reef Tracker](https://reefcheck.org/global-reef-tracker)
- Reef Check Australia requires a signed custom licence and a fee. — [Reef Check Australia](https://www.reefcheckaustralia.org/data)
- Fukui 2026 excluded Reef Check records from its global analysis because they "performed at chance level" for DHW validation. — [Fukui 2026](https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2026.1835611/full)

**AGRRA**
- Covers more than 2,000 Caribbean reef areas in 29 countries through the Data Explorer dashboards, plus expert-reviewed bleaching and SCTLD reports. An older data release was "Restricted… prior agreement". — [BCO-DMO/AGRRA](https://osprey.bco-dmo.org/node/882171); [AGRRA Database record](https://dataportal.gov.tc/dataset/agrra-database)

**OBIS-SEAMAP (Duke)**
- Sharing policy is set per dataset. CC BY and CC BY-NC datasets can be downloaded directly, while "permission required" datasets have downloads disabled. Users may not redistribute data without the consent of OBIS-SEAMAP and the providers unless the data are CC0. Downloads come as CSV, shapefile or geodatabase. — [OBIS-SEAMAP Terms](https://seamap.env.duke.edu/content/termsofuse); [Download help](https://seamap.env.duke.edu/help/download_main)

### Inferences
- CMEMS WMTS is probably the lowest-friction way to get global SST and chlorophyll tiles into Cesium (`WebMapTileServiceImageryProvider`). Optical chlorophyll (CMEMS or PACE) has cloud gaps in daily L3 products, so use gap-filled L4 or 8-day composites for a smooth globe.
- In optically shallow reef waters, ocean-colour chlorophyll is unreliable because bottom reflectance contaminates the signal. It indicates the offshore water environment, not reef condition.
- Any "confirmed bleaching" layer must come from in-situ surveys (AGRRA, Reef Check via Aqualink, ReefCloud, CRW reports). These are sparse, lagged by weeks to months, and have heterogeneous licensing. Redistributing them through the proxy needs per-source permission.
- OBIS-SEAMAP tracks cannot be mirrored or redistributed in the app without consent unless they are CC0. Linking out or using the OBIS (CC0/CC BY) subset is safer.

### Gaps
- **Whale Alert:** no information found on its API or terms. It appears to have no public API, but this is unverified.
- I did not obtain the CMEMS full licence commercial clause verbatim (TLS failure). I believe it permits commercial use, but the clause should be checked.
- I did not confirm whether the legacy CMEMS endpoints (MOTU/OPeNDAP at `nrt.cmems-du.eu`) have been retired. I believe they were replaced by the Toolbox/ARCO services in 2024, but this is unverified.
- I found no PACE NRT latency figure and did not confirm whether PACE layers are in NASA GIBS/Worldview. GIBS is the keyless WMTS that is easiest for Cesium.
- I found no ReefCloud API and could not verify AGRRA's current license.

---

## 7. Cross-cutting limitations (cloud, pixel scale, depth, ground truth)

### Takeaway
None of these sources directly observes coral health at reef scale in near real time. Satellite products observe the water (temperature, colour, turbidity) or the static habitat. Actual bleaching and mortality come only from field surveys, which are sparse and lagged.

### Cited Findings
- CRW products are 5 km (0.05°) pixels. — [CRW](https://coralreefwatch.noaa.gov/product/5km/index.php)
- The CRW outlook is 0.5°. — [CRW Outlook](https://coralreefwatch.noaa.gov/satellite/bleachingoutlook_cfs/outlook_cfs.php)
- ACA benthic mapping reaches about 10 m depth and geomorphic about 15 m. It merges coral and algae and covers 30°N–30°S only. — [ACA Resources](https://allencoralatlas.org/resources)
- DHW skill decreases sharply on warm-climatology reefs (AUC 0.513 above 30 °C), and most severe bleaching in Japan occurred below the 4 DHW warning threshold. — [Fukui 2026](https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2026.1835611/full)
- Standard DHW reaches ETS of about 0.15, comparable to a week-ahead rain forecast. — [DeCarlo 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7337031/)
- Sentinel-2 has a 5-day revisit and 10 m resolution, which is relevant to ACA's bleaching monitoring. — [Xu et al. 2021 Front. Mar. Sci.](https://www.frontiersin.org/articles/10.3389/fmars.2021.584263/pdf)
- GFW: 72 h delay, AIS-dependent. SAR products cover only part of the ocean. — [GFW Data Availability](https://globalfishingwatch.org/global-fishing-watch-data-availability/)

### Inferences
- **Recommended UI wording:**
  - CRW: "Heat stress (NOAA CRW, ~5 km, updated daily, 1-day lag)". Avoid "bleaching".
  - ACA: "Mapped habitat (5 m, 2018–20 imagery, ~60–90% accuracy, ≤10–15 m depth)".
  - GFW: "Apparent fishing (AIS-derived, 72 h lag; non-commercial)".
- **License matrix for a commercial-capable app:**
  - Safe: CRW (public domain US gov), CMEMS (free, attribution), ACA maps (CC BY 4.0), PACE (free), and OBIS records filtered to CC0/CC BY.
  - Non-commercial only: GFW, WDPA/Protected Planet API, ACA imagery mosaic, OBIS CC BY-NC records, and some OBIS-SEAMAP datasets.
- **Proxy requirements:** keep tokens server-side (GFW explicitly forbids exposing them in web UIs; WDPA uses a key). Cache daily rasters (CRW updates once a day), and respect rate limits (GFW: 50k/day).

### Gaps
- I found no single peer-reviewed study validating CRW 5 km SST accuracy at reef scale against in-situ loggers. Skirving et al. 2020 should be consulted.
