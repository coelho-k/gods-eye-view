# Biodiversity, Wildlife & Endangered-Species Data Sources for a CesiumJS Globe (as of Nov 2026)

Method note: Several official pages (gbif.org, iucnredlist.org, inaturalist.org help pages, birds.cornell.edu terms) returned Cloudflare/403 blocks to automated fetches on 2026-11-01. Where that happened I used (a) live API probes from this machine on 2026-11-01 (cited as the exact endpoint URL, "probed 2026-11-01"), (b) official docs mirrored on GitHub / techdocs, and (c) secondary sources, which are labelled as secondary.

## GBIF (occurrence API, maps API, license mix, coordinate uncertainty, rate limits, citation)

### Takeaway
GBIF is the best single backbone. It holds ~3.89 billion occurrence records. Its v2 Maps API serves CORS-open PNG raster and Mapbox Vector Tile (MVT) density tiles in EPSG:4326/3857 plus polar projections. The EPSG:4326 tiles (two at z0) match Cesium's geographic tiling scheme, and the PNGs fit a URL-template imagery layer. The catch is precision: only ~21% of georeferenced records state a coordinate uncertainty of ≤1 km, and ~17% of records are CC BY-NC. A commercial deployment therefore has to filter by license, and the app has to show uncertainty.

### Cited Findings
- Total occurrence count was 3,887,469,368, and records had been crawled as recently as 2026-10-31 — [GBIF API /v1/occurrence/search?limit=1, probed 2026-11-01](https://api.gbif.org/v1/occurrence/search?limit=1)
- License split across all occurrences: CC_BY_4_0 = 2,736,240,076; CC_BY_NC_4_0 = 675,506,795; CC0_1_0 = 475,722,497. These are the only three licenses present — [GBIF facet=license, probed 2026-11-01](https://api.gbif.org/v1/occurrence/search?limit=0&facet=license)
- Records with coordinates: 3,708,859,090. With stated coordinateUncertaintyInMeters 0–1000: 782,333,601. With 0–100 m: 435,806,716 (this count is not restricted to hasCoordinate) — [hasCoordinate=true](https://api.gbif.org/v1/occurrence/search?limit=0&hasCoordinate=true); [0–1000 m](https://api.gbif.org/v1/occurrence/search?limit=0&hasCoordinate=true&coordinateUncertaintyInMeters=0,1000); [0–100 m](https://api.gbif.org/v1/occurrence/search?limit=0&coordinateUncertaintyInMeters=0,100) (probed 2026-11-01)
- Data-quality issue flags: COORDINATE_ROUNDED on 1,822,903,549 records and COUNTRY_DERIVED_FROM_COORDINATES on 306,297,849 records — [GBIF facet=issue, probed 2026-11-01](https://api.gbif.org/v1/occurrence/search?limit=0&facet=issue&facet.limit=60)
- Occurrences can be filtered by Red List category. `iucnRedListCategory=CR` returns 5,708,885 records — [probed 2026-11-01](https://api.gbif.org/v1/occurrence/search?limit=0&iucnRedListCategory=CR)
- The Maps API serves MVT and PNG, including hexagon binning. The documented tile pattern is `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?srs=EPSG:3857&style=purpleYellow.point`. Supported SRS values are EPSG:3857, EPSG:4326 (two tiles at z0), EPSG:3575 (Arctic) and EPSG:3031 (Antarctic) — [gbif/maps README](https://raw.githubusercontent.com/gbif/maps/master/README.md)
- A live MVT tile, `.../density/0/0/0.mvt?srs=EPSG:3857&taxonKey=212`, returned HTTP 200 `application/x-protobuf` with `access-control-allow-origin: *` and `cache-control: public, max-age=1200`. The ETag showed the tile build was dated 2026-10-29 — [probed 2026-11-01](https://api.gbif.org/v2/map/occurrence/density/0/0/0.mvt?srs=EPSG:3857&taxonKey=212)
- Rate limits: GBIF publishes no fixed quota. Rapid search queries "may be rate limited, depending on our server load", which returns HTTP 429. GBIF asks integrators to set User-Agent to a URL or email address. If a scrape would take more than 15 minutes, GBIF says to use the download API instead, which "accepts up to 100,000 search parameters" and allows proper citation. Scripted use of www.gbif.org (as opposed to api.gbif.org) may be blocked — [GBIF API Reference](https://techdocs.gbif.org/en/openapi/)
- Citation: "Under the terms of the GBIF data user agreement, users who download data agree to cite a DOI" — [GBIF techdocs: Citation](https://techdocs.gbif.org/en/data-use/citation)
- An experimental SQL download API exists, and GBIF says "the implementation may change" — [GBIF API SQL Downloads](https://techdocs.gbif.org/en/data-use/api-sql-downloads)

### Inferences
- A browser can fetch GBIF tiles directly because CORS is `*`. Even so, routing them through the Node proxy with caching is polite (GBIF's own cache TTL is 20 minutes), and it also lets the app set an identifying User-Agent.
- The Maps API takes `taxonKey` and other occurrence filters. A commercial or ad-supported app therefore needs either a license filter (CC0 and CC BY only, dropping ~676M NC records) or a non-commercial footing.
- "Highly accurate" for GBIF realistically means a record with coordinateUncertaintyInMeters ≤100 m and no geospatial issue flags. That is **at most** ~12% of georeferenced records, an upper bound because the 100 m count was not filtered by flags or hasCoordinate. Most points should be drawn as density or hex bins, not as precise pins.
- GBIF is an aggregator of museum specimens, iNaturalist, eBird and survey data, so latency is days to weeks after the source publishes. It is not a real-time feed.

### Gaps
- I could not read the gbif.org data user agreement text directly because of a Cloudflare block. Wording on derived datasets and the derived-dataset DOI process was not verified.
- Whether CesiumJS can render GBIF's MVT tiles natively (versus only the PNG raster) was not checked.
- How GBIF handles source-generalized sensitive records is not verified. Publishers typically set `dataGeneralizations` / coordinate uncertainty themselves.

## IUCN Red List API v4 (token, terms, range maps)

### Takeaway
The Red List API is now v4. v3 is no longer supported by the main R client. It requires a registered token, and secondary sources consistently report that commercial use and redistribution are forbidden without a licence (IBAT for business). Range-map polygons are downloadable shapefiles under non-commercial terms. They are coarse "extent of occurrence"-style polygons, not locations.

### Cited Findings
- rredlist 1.0.0: "The API has been upgraded to v4 … This package no longer supports v3 of the IUCN Red List API" — [rOpenSci rredlist NEWS.md](https://raw.githubusercontent.com/ropensci/rredlist/master/NEWS.md)
- An unauthenticated call to `https://api.iucnredlist.org/api/v4/information/api_version` and `/api/v4/taxa/scientific_name?genus_name=Diceros&species_name=bicornis` returned HTTP 403 `{"error":"Forbidden"}`. This is consistent with a token requirement, though a Cloudflare block cannot be ruled out — [probed 2026-11-01](https://api.iucnredlist.org/api/v4/information/api_version)
- (Secondary) "use of the Red List API for commercial purposes is strictly forbidden", with commercial users pointed to IBAT. "By requesting a token, you are agreeing to abide by the Terms of Use". Tokens used for scraping "may [be] rate limited and/or revoked" — [iucnredlistrb (Ruby client) docs](https://www.ruby-toolbox.com/projects/iucnredlistrb); similar terms in [omnilab/iucn PHP README](https://packagist.org/packages/omnilab/iucn)
- (Secondary) The API is free for non-commercial research, education and conservation. Commercial use and bulk redistribution need IUCN permission and may incur a fee — [Jentic API listing](https://jentic.com/apis/iucnredlist)
- The official terms URL referenced by rredlist is https://www.iucnredlist.org/terms/terms-of-use — [rredlist refman](https://archive.linux.duke.edu/cran/web/packages/rredlist/refman/rredlist.html)
- Range-map downloads are shapefiles with taxonomic info, distribution status and Red List category. They are "made freely available to the public for non-commercial use", and commercial use goes through IBAT. Data Deficient species are not consistently mapped — [USGS ScienceBase catalog entry for IUCN spatial data](https://www.sciencebase.gov/catalog/item/553a7ac3e4b0a658d792c982)
- (Older secondary) The terms prohibit "commercial use and no reposting, sub-licencing and/or redistributing" — [UN-REDD species mapping training deck](https://un-redd.org/sites/default/files/2021-09/Intro_to_species_mapping.pdf)

### Inferences
- Showing IUCN range polygons as globe overlays (served from the app's own proxy or tiles) is very likely "redistribution". It would need an IUCN licence, or at minimum a strictly non-commercial use. Showing category badges (CR/EN/VU) through API lookups is lower risk, but is still under the token's non-commercial terms.
- GBIF's `iucnRedListCategory` filter offers a way to flag threatened taxa without redistributing IUCN spatial data.
- Range maps are generalized polygons that often over-predict occupancy. They show "where it could be", not "where it is".

### Gaps
- I could not read the current official IUCN Terms of Use or the v4 docs (Cloudflare 403). Exact rate limits, the token auth header format, and v4 endpoint list were not verified from a primary source.
- The current spatial-data download page and its licence wording are unverified for 2026.

## Movebank (live animal tracking)

### Takeaway
Movebank is the main global animal-tracking repository, and its REST API includes live-feed studies. Access is study-by-study and owner-controlled. In a Nov 2026 probe, even listing studies returned 401 without credentials, which conflicts with the docs. Rate limits are tight: 1 concurrent request per IP. Per-study licenses (CC0, CC BY, CC BY-NC or custom) and license-acceptance steps apply. Real-time public display is technically possible only for the subset of studies that owners make publicly downloadable. Ethically it should be generalized or delayed.

### Cited Findings
- Rate limit: "one concurrent request per IP and 20 concurrent requests total. A request remains active until the data transfer is complete" — [Movebank API docs (GitHub)](https://raw.githubusercontent.com/movebank/movebank-api-doc/master/movebank-api.md)
- Base endpoint: `https://www.movebank.org/movebank/service/direct-read?entity_type=event&study_id=…`. Token auth uses `direct-read?service=request-token`, then `&api-token=<TOKEN>`. JSON/JavaScript endpoints also exist — [Movebank API docs](https://raw.githubusercontent.com/movebank/movebank-api-doc/master/movebank-api.md)
- Access: "If no username and password are provided, results will be restricted to data that owners have made publicly available… To access tracking actual data, including for visualization on external websites, the user (or the public) needs permission to download data". Users may have to accept per-study license terms (via a `license-md5` parameter) — [Movebank API docs](https://raw.githubusercontent.com/movebank/movebank-api-doc/master/movebank-api.md)
- The API provides "reduced data profiles" (daily events, long-distance events, 30-day events, and **0.25-degree events**). The docs also warn about outliers (the `visible` attribute) and future timestamps coming from live tag feeds — [Movebank API docs](https://raw.githubusercontent.com/movebank/movebank-api-doc/master/movebank-api.md)
- **Conflict:** the docs say requests without credentials are "restricted to data that owners have made publicly available" ([Movebank API docs](https://raw.githubusercontent.com/movebank/movebank-api-doc/master/movebank-api.md)). That is contradicted by an unauthenticated `direct-read?entity_type=study` request returning **HTTP 401 Unauthorized** ([probed 2026-11-01](https://www.movebank.org/movebank/service/direct-read?entity_type=study)). In practice, plan on needing an account or token. Live-feed study counts could not be enumerated.
- Terms of use: users must follow each study's License Type/Terms and obtain owner permission, except "for studies that are publicly downloadable and have CC0, CC BY or CC BY-NC licenses". Citation is required for CC BY and CC BY-NC. Movebank does "not guarantee the completeness or accuracy" — [General Movebank Terms of Use](https://www.movebank.org/cms/movebank-content/general-movebank-terms-of-use)

### Inferences
- A proxy should poll each permitted study serially, because only one concurrent request per IP is allowed, and cache aggressively. Movebank cannot support a fan-out "live everything" globe.
- Latency equals the tag's fix and upload schedule plus import, which varies by study. Many GPS tags upload in batches (hours to days), so "real-time" is study-specific.
- The 0.25° (~28 km) reduced profile is a data-reduction feature, not a geoprivacy measure, but it *could be used* as a ready-made generalization for public display of tracks. Movebank's actual protection is owner permissions.
- Positional accuracy depends on the sensor. GPS is typically metres to tens of metres, while Argos/ICARUS classes are much coarser. Use the sensor_type and outlier attributes.

### Gaps
- I could not count how many public studies currently have live feeds because the endpoint needed auth. Sensor-specific accuracy figures were not sourced. Movebank's data policy page on sensitive species was not read.

## eBird API 2.0 and eBird Status & Trends

### Takeaway
eBird API 2.0 needs a free per-account key sent in the `x-ebirdapitoken` header. It returns recent sightings (1–30 days back) by region or within a radius of up to 50 km. eBird hides about 325 sensitive taxa from public site output. Status & Trends abundance rasters are downloadable with an access key under the eBird Products Terms of Use.

### Cited Findings
- "most endpoints … require a key, which is tied to your eBird account… The key should be included in a request header called 'x-ebirdapitoken'. Alternatively … a request parameter named 'key'". The Terms of Use link is https://www.birds.cornell.edu/home/ebird-api-terms-of-use/ — [eBird API 2.0 Postman docs](https://documenter.getpostman.com/view/664302/S1ENwy59)
- `GET {baseUrl}/data/obs/geo/recent?lat=&lng=` returns "recent observations (up to 30 days ago)… within a radius of up to 50 kilometers". The `back` parameter takes 1–30 (default 14), and `maxResults` takes 1–10000. Responses include `obsValid`, `obsReviewed` and `locationPrivate` fields — [eBird API 2.0 Postman docs](https://documenter.getpostman.com/view/664302/S1ENwy59)
- An unauthenticated `https://api.ebird.org/v2/data/obs/US-NY/recent` returned HTTP 403 — [probed 2026-11-01](https://api.ebird.org/v2/data/obs/US-NY/recent?maxResults=1)
- eBird keeps a global sensitive-species list of about 325 taxa whose locations are hidden — [Audubon](https://www.audubon.org/magazine/ebird-now-censoring-sightings-325-risk-species). Hidden records are kept out of checklist views (except for the observers), "hidden from all site-level output", and shown "only at grid-cell level on species maps". Reviewers still see them — [eBird Minnesota regional post](https://ebird.org/region/US-MN-001/post/sensitive-species-hidden-in-ebird-minnesota)
- Status & Trends data products (ranges, abundance, environmental associations) are accessed through the `ebirdst` R package, which "requires an access key tied to your eBird username" obtained by "agreeing to our updated eBird Products Terms of Use" — [eBird S&T download page](https://science.ebird.org/en/status-and-trends/download-data)

### Inferences
- Latency is likely minutes to hours after a checklist is submitted, since this is a "recent observations" API. That is an inference; no stated latency was found.
- An app would proxy eBird calls server-side to keep the key secret. A "recent notable observations" layer is the most "live" biodiversity feed available.
- eBird data quality is driven by regional reviewer filters (`obsReviewed`, `obsValid`). Unreviewed rarities may be wrong.
- Status & Trends rasters are modelled relative abundance, not observations. They are good for a globe heatmap, but they are model outputs with their own uncertainty.

### Gaps
- The text of the API Terms of Use (commercial use, caching, rate limits) could not be fetched (403). No sourced rate limit exists.
- **Not confirmed:** how the API itself returns sensitive species (omitted, or generalized).
- Status & Trends raster resolutions and licence were not verified in this session.
- The "~325 taxa" count comes from older Audubon coverage. The 2026 sensitive-species count is unverified.

## iNaturalist API (rate limits, research grade, obscuration, license, map tiles)

### Takeaway
iNaturalist's public API (v1 is stable; v2 is live with `fields=` selection) is CORS-open and needs no key for reads. Its practical rate guidance is ~1 request/s, 60/min and 10k/day. It serves PNG/UTFGrid map tiles. Threatened taxa are auto-obscured. The API still returns a lat/lng for those records, but with a ~31 km public positional accuracy. Licenses are per-observation, and most are CC BY-NC.

### Cited Findings
- v2 is live. `https://api.inaturalist.org/v2/observations?fields=id,geoprivacy,taxon_geoprivacy,obscured,location,positional_accuracy` returned `total_results` 397,538,530 — [probed 2026-11-01](https://api.inaturalist.org/v2/observations?per_page=1&fields=id,geoprivacy,taxon_geoprivacy,obscured,location,positional_accuracy)
- v1 observations responses include `quality_grade`, `license_code` (e.g., "cc-by-nc"), `taxon_geoprivacy`, `positional_accuracy` and `public_positional_accuracy`. They are served with `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=300` — [v1 /observations, probed 2026-11-01](https://api.inaturalist.org/v1/observations?per_page=1&taxon_id=43151&quality_grade=research)
- Obscuration of threatened taxa: research-grade, obscured records for rhinos (taxon 43341) returned 11,644 results. For *Ceratotherium simum* and *Diceros bicornis michaeli* the API returned `obscured: true`, `taxon_geoprivacy: "obscured"` and `public_positional_accuracy: 31451` (m), while still supplying a `location` lat,lng — [probed 2026-11-01](https://api.inaturalist.org/v1/observations?per_page=2&taxon_id=43341&obscured=true&quality_grade=research)
- Map tiles: `https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png`, `/v1/points/{z}/{x}/{y}.png` and `/v1/grid/{z}/{x}/{y}.grid.json` (UTFGrid) all returned 200 with `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=3600` — [probed 2026-11-01](https://api.inaturalist.org/v1/grid/0/0/0.png)
- Rate limits: the pyinaturalist client encodes iNat's recommended practices as `REQUESTS_PER_SECOND = 1`, `REQUESTS_PER_MINUTE = 60`, `REQUESTS_PER_DAY = 10000` — [pyinaturalist constants.py](https://raw.githubusercontent.com/pyinat/pyinaturalist/main/pyinaturalist/constants.py). Forum reports mention a documented 100/min throttle versus a requested 60/min — [iNat forum](https://forum.inaturalist.org/t/discrepancy-between-documented-rate-limit-observed-rate-limit/8612). Search results are capped at ~10,000 records per query — [iNat forum](https://forum.inaturalist.org/t/api-to-retrieve-photo-metadata/15616/2)
- Official Recommended Practices page: https://www.inaturalist.org/pages/api+recommended+practices (Cloudflare-blocked during this session).

### Inferences
- `public_positional_accuracy` = 31,451 m exactly matches the diagonal of a 0.2° cell: 0.2° × 111.195 km = 22.24 km, and × √2 = 31.45 km. This is consistent with iNat obscuring to a 0.2° grid cell. Obscured records **must be drawn as an uncertainty cell or circle, never as a pin**, because a pin at the returned point creates false precision. It could also mislead users into searching the wrong place, or wrongly suggest exact locations.
- "Research grade" (community ID agreement plus date, location and media) is good for common, photogenic taxa. It is weaker for cryptic groups such as insects and fungi. It says nothing about location precision; check `positional_accuracy`.
- Proxy architecture: per-IP limits all land on the Node proxy. Movebank allows 1 concurrent request per IP, iNat (per pyinaturalist) 60/min and 10k/day, and GBIF returns 429 under load. GBIF and iNat tiles are `Access-Control-Allow-Origin: *`, so tiles can go browser-direct and spread load across clients. The proxy is needed for keyed or credentialed calls (eBird key, IUCN token, Movebank credentials) and for cached server-side aggregation.
- The 10k/day cap means a public app should not have each client hit the API heavily. Prefer tiles (cacheable) or GBIF's iNat research-grade export for bulk data.
- Most observations are CC BY-NC. Commercial use requires filtering by `license=cc0,cc-by` or similar.

### Gaps
- I could not read the official iNat API terms and recommended-practices page (403). The official current numbers and terms on commercial use and media are unverified. v1 deprecation timelines for v2 are unverified.
- The official geoprivacy help page was not fetched. The 0.2° cell is computed from the 31,451 m value, not read from iNat policy text, and whether the returned point is randomized within the cell is unverified.

## Other sources: Map of Life, OBIS, Wildlife Insights, Arbimon/RFCx, SMART, EarthRanger, Zooniverse

### Takeaway
Of these sources, only EarthRanger and SMART offer true real-time operational data, and both are private, protected-area ranger systems that require org credentials. Wildlife Insights publishes camera-trap data with location blurring and embargoes. The others were not verified this session.

### Cited Findings
- EarthRanger (Allen Institute for AI): the API gives programmatic access to tracking data, observations and events. It uses OAuth2 tokens, including long-lived tokens from the Admin portal, sent as a Bearer token to `/api/v1.0` endpoints on each deployment's own domain. A Python client (`er-client`) exists — [EarthRanger API help](https://earthranger-support.helpjuice.com/en_US/earthranger-api)
- SMART Connect → EarthRanger integration via Gundi: it runs on a 30-minute cycle, does not handle movement data, deletes or attachments, and requires a service-user token — [EarthRanger: Receiving data from SMART Connect](https://earthranger-support.helpjuice.com/receiving-data-from-smart-connect)
- Wildlife Insights: data providers retain ownership. Publicly downloadable data are protected by "obfuscating (blurring) the exact location of any deployment… removing all images of humans… and limiting access to embargoed data". Registered users can browse and download from the Explore page — [Wildlife Insights FAQ](https://www.wildlifeinsights.org/faq)
- Wildlife Insights' AI model is trained on "over 35 million images across 1,295 species" — [Wildlife Insights AI](https://www.wildlifeinsights.org/about-wildlife-insights-ai)

### Inferences
- EarthRanger and SMART data are operational security data for protected areas (ranger patrols, collared rhinos and elephants). They are not public sources and should not be put on a public globe.
- Wildlife Insights is suitable for aggregated detections per blurred deployment. Latency follows the upload and processing cycles (weeks to months).

### Gaps
- **Map of Life:** API, license and resolution not verified this session.
- **OBIS:** not verified (marine is covered by another researcher).
- **Rainforest Connection / Arbimon:** API and licence documentation were not found in one combined search, and not verified.
- **SMART:** whether a public data API exists was not verified. The only sourced access path is per-agency SMART Connect servers, via the EarthRanger integration doc.
- **Zooniverse:** the API and the licence of project outputs were not verified.
- **Wildlife Insights:** no public API docs were found. Licence options and embargo durations were not verified.

## Sensitive species: geoprivacy practices, poaching risk, implications for a "God's Eye" live app

### Takeaway
Every major provider generalizes sensitive locations: GBIF guidance uses 0.1° (~10 km) and 0.01° (~1 km) tiers, iNat ~31 km, eBird grid cells only, and Wildlife Insights blurring. Movebank relies on owner permissions. Peer-reviewed opinion documents poaching shortly after location publication. A public "live tracking" globe for endangered animals would undo these protections and should not exist. Display has to be aggregated, generalized and delayed.

### Cited Findings
- Chapman (2020), *Current Best Practices for Generalizing Sensitive Species Occurrence Data*, GBIF Secretariat, DOI 10.15468/doc-5jp4-5g10. It explicitly covers "tracking data" — [GBIF docs](https://docs.gbif.org/sensitive-species-best-practices/master/en/)
- Chapman's decision tree:
  - Ask whether precise locations finer than 0.1° (~10 km) would expose the taxon to "disturbance and exploitation". If so, it is Category 2, and data go "to the public with the georeference denatured to 0.1 degrees (~10 km)", with finer data "supplied … under the conditions of a written data agreement".
  - Next tier is 0.01° (~1 km), for threats "such as collection or deliberate damage".
  - Category 1 data may be supplied only "under strict Licence conditions or as presence in a large region".
  - Source: [GBIF docs](https://docs.gbif.org/sensitive-species-best-practices/master/en/)
- Lindenmayer & Scheele, "Do not publish", *Science* 356(6340):800, 26 May 2017 (secondary summaries). More than 20 newly described reptile species were thought to have been targeted by collectors using published locations. Poaching was documented within months of taxonomic descriptions. The authors propose that permits not auto-upload endangered-species locations to databases — [ANU news](https://science.anu.edu.au/news-events/news/scientists-urged-keep-rare-species-habitat-secret); [ScienceDaily](https://sciencedaily.com/releases/2017/05/170525141549.htm)
- Counterpoint: secrecy is not the same as restricted access. Data can be held but not shared publicly — [Mental Floss summarizing reactions](https://www.mentalfloss.com/animals/should-scientists-battle-poachers-keeping-animal-locations-secret)
- Platform implementations:
  - iNat: rhino records obscured to ~31 km accuracy — [probe](https://api.inaturalist.org/v1/observations?per_page=2&taxon_id=43341&obscured=true&quality_grade=research)
  - eBird: ~325 taxa hidden, grid-cell display only — [Audubon](https://www.audubon.org/magazine/ebird-now-censoring-sightings-325-risk-species)
  - Wildlife Insights: deployment blurring and embargoes — [WI FAQ](https://www.wildlifeinsights.org/faq)
  - Movebank: owner-controlled permissions (its 0.25° reduced profile is a data-reduction feature that could be repurposed for generalization) — [Movebank API docs](https://raw.githubusercontent.com/movebank/movebank-api-doc/master/movebank-api.md)

### Inferences
- A "God's Eye" app that shows live positions of collared rhinos, elephants, pangolins or raptors would give poachers a targeting tool. It would contradict the GBIF guidance and the owner terms (Movebank, EarthRanger). EarthRanger exists precisely to keep such positions within anti-poaching teams.
- Safe design rules:
  - Never draw obscured records as pins. Render `public_positional_accuracy` or `coordinateUncertaintyInMeters` as circles or cells.
  - Apply ≥0.1° generalization plus a time delay (e.g., days to weeks) for any Red List CR/EN/VU taxon or any eBird/iNat-flagged sensitive taxon, even if the source is less strict.
  - Show density tiles and hex bins rather than individuals.
  - Exclude live tracking for threatened species entirely.
  - Do not re-identify obscured points by combining sources. Triangulating iNat, eBird and GBIF copies is a known leak vector, and this is an inference.

### Gaps
- I did not obtain the primary text of Lindenmayer & Scheele (paywalled). The figures above come from secondary press coverage.
- No peer-reviewed quantification was found of poaching caused specifically by real-time tracking leaks (e.g., hacking of collar data). It was not researched within budget.

## What can and cannot be known accurately (absence, bias, range maps)

### Takeaway
Occurrence data are presence-only and opportunistic. Missing points do not mean absence, density maps mostly show observer effort, and range maps are coarse polygons. "Highly accurate" holds only per record (an expert-verified ID with small stated uncertainty). It does not hold for "where a species is now".

### Cited Findings
- Only ~782M of ~3.71B georeferenced GBIF records state an uncertainty of ≤1 km, and 1.82B are flagged COORDINATE_ROUNDED — [GBIF probes, 2026-11-01](https://api.gbif.org/v1/occurrence/search?limit=0&facet=issue&facet.limit=60)
- Hidden eBird checklists "cannot be used for scientific analysis" — [eBird privacy news](https://ebird.org/news/privacy-in-ebird-and-how-to-protect-your-data?tagId=170)
- IUCN range maps do not consistently cover Data Deficient species, and subspecies are sometimes folded into parent polygons — [USGS ScienceBase](https://www.sciencebase.gov/catalog/item/553a7ac3e4b0a658d792c982)
- Movebank does "not guarantee the completeness or accuracy" of its data, and live feeds can carry false timestamps — [Movebank terms](https://www.movebank.org/cms/movebank-content/general-movebank-terms-of-use); [API docs](https://raw.githubusercontent.com/movebank/movebank-api-doc/master/movebank-api.md)

### Inferences
- GBIF and iNat density layers largely reflect roads, cities, wealthy countries and charismatic taxa. The UI should label them "observations recorded", not "where animals are".
- Sensitive-species obscuration also biases the maps deliberately. Threatened species will look more diffuse and displaced than they really are.
- Modelled products (eBird Status & Trends) correct for effort but are estimates with uncertainty.

### Gaps
- No peer-reviewed citizen-science ID-accuracy statistics (e.g., iNat research-grade error rates by taxon) were sourced this session. That needs a follow-up literature search.
