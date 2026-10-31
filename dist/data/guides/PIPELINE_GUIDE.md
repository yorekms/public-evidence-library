# Commodity pipelines · Public Data Workbench 0.6

The pipeline workspace makes reported movement, production, uses and economic connections visible while retaining what each source measures. Open the currently running local workspace (local research view), or run `start_pipelines.sh` / `start_pipelines.bat` from this workbench. A new launch prints its actual local port; 8770 identifies the process running during this delivery.

This is an additional workspace. **All 1,940 numerical series in 16 source collections, containing 341,857 retained observations, remain unchanged.** The sidebar keeps direct links to the full library with raised/3D maps and statistical models, energy/environment records, mines/plants/owners and company accounting parents. Previous editions and source packages remain available. Pipeline exports stay on this computer until deliberately shared; nothing is automatically uploaded into Civic Voice.

## A first session with Virginia coal

1. Open **Virginia coal**. The initial selection is 2024, Virginia as the reported origin, and outbound domestic distribution. Read the unit, source-row count and reporting boundary before comparing destinations. The available 2020–2024 ledger retains original consumer sector, transport and quarter fields.
2. Change **Reported consuming sector** or **Transport / channel**, then compare the source history. The total is a sum of available selected same-unit rows, not all Virginia coal extraction or exports. Move through actual offered years with arrows, the slider or **Play periods**.
3. Use **Select an endpoint** to center and zoom to a reported node, or click a map marker. Pan by dragging, zoom by scrolling or with the buttons, and use **Fit connections** to see the selected geographically drawable graph. Keyboard `+`, `−` and `Home` also control the map.
4. Open **Coal received by plants**. These are actual monthly receipt records to Virginia receiving plants, 2015–2025. A source may be a mine, loadout, preparation plant or blending terminal. Inspect original MSHA/EIA IDs and the available links into the retained facility reporting and ownership views.
5. Open **Coal exports at ports**. Choose 2024, inspect Norfolk–Newport News `1401`, and read the Census disclosure flags. The combined designation `5901` is NORFOLK/MOBILE/CHARLESTON and is not assigned to Virginia alone. Port exports do not identify the original mine or the foreign final user.
6. Save the view, then export both a figure and its companion evidence. Use CSV/JSON when you need the complete selected graph, including records that do not have drawable map endpoints.

**Virginia** selects the source's Virginia reporting area where available; if that pathway has no Virginia facet, the shortcut opens the domestic-coal Virginia view. **All places** broadens the current pathway. State and country account boundaries remain source-specific.

## What is loaded

There are **11 graph collections**, with economic accounts/model assets supplied separately. All are frozen acquired editions rather than a live reporting service.

| Pathway | Actual acquired period and evidence | Main interpretation boundary |
| --- | --- | --- |
| Domestic coal distribution | 2020–2024; 6,237 original detail rows, 309 aggregate references | State/region origin to receiving state; short tons; no foreign-export or individual-mine inference |
| Coal deliveries to Virginia plants | 2015–2025; 1,760 monthly source-facility receipt rows | Reported receipt source can be a terminal/loadout; purchases/receipts differ from extraction or consumption |
| U.S. coal customs-port exports | 2024 December cumulative Jan–Dec; 430 HS6/port/country rows | Gross vessel/air shipping kg and FAS USD are separate; disclosure can split value and weight between ports |
| U.S. coal international exports | 2024 HS2701; 63 partner connections | Selected exporter/product panel; customs net kg and FOB USD, not a shipment route |
| China aspirin-related exports | 2024 HS291822; 82 partner connections | Acid, salts and esters; not uniquely pure aspirin, tablets, manufacturers or purchasers |
| China rare-earth-compound exports | 2024 HS2846; 62 partner connections | Selected compound class; not all rare-earth extraction or global processing |
| EPA chemical manufacture/import references | 2020–2023 annual volume dimensions; 181,688 normalized edges | Pounds; combined manufacture/import boundary; activity/location references principally 2023 |
| EPA processing/product-use associations | 2023; 135,922 unweighted references | Reported sector/function/product category; no inferred customer or quantity allocation |
| FDA establishment references | Snapshot acquired 30 October 2026; 10,455 rows | Registered addresses/operations serving the U.S. market, including foreign establishments; no ingredient-specific output or geocoded factories |
| Aspirin ingredient/product references | Three retained openFDA results; seven associations | A bounded sample from 816 query matches, including mixtures; no sold quantities, factory identity or approval inferred |
| Global industry accounting flows | Actual 2020–2022 OECD accounts; 126,015 nonzero links for eight supplying industries | Million current USD; all 50 recipient industries summed within destination economy; monetary accounts, not cargo |

Counts represent source rows, annual reporting dimensions and graph references. Several references can describe one physical site, and different agencies may use different IDs for it. The three Comtrade panels are selected examples; FDA registration serves a defined market; CDR has reporting thresholds and confidential information. None is a complete global supply-chain census. World/All-States aggregate references are retained separately and are not added again to detail edges.

## Reading the map and flow diagram

Every curve joins reported endpoints or source reference categories. An arrow and moving particles express the source's connection direction. Curve shape is schematic; particle speed is presentation, with **no measured route, travel time, shipment frequency or real-time tracking**. The different source stages do not automatically form one uninterrupted mine → processor → port → foreign factory → product chain.

Measured line width follows the **square root of the selected value's absolute magnitude**; inspect the signed number in its tooltip, table and evidence. Width is a visual comparison, not literal cargo volume. Negative source/accounting values keep their sign rather than being clipped or converted into positive flows. Unquantified reference links are dashed and have no physical quantity. The selected measure and native unit remain next to the map and source records.

Country/state anchors are representative region points. Census port state anchors are not surveyed terminals. Facility points require source-supported coordinates and map eligibility. Annual EIA receiving-plant positions are preserved by year; MSHA receipt-source coordinates use a current master reference and do not reconstruct historical geography. FDA country markers count reported registration rows, not surveyed factory points. Importer offices and CDR never-at-site references do not automatically become chemical-production sites.

No invented geographic coordinates fill unresolved sites or statistical areas. For example, the retained Census/World Bank exact-ISO reference leaves Anguilla and Taiwan without an ISO3 join in this edition; the source codes/ISO2 remain available. UN Comtrade's `Other Asia, nes` retains its own literal identity. A blank map can mean that a valid reference graph has no eligible physical endpoints; inspect its diagram, selector and source table.

The display is deliberately bounded:

- **Connections shown** offers 40, 80, 200 or up to 1,000 geographically drawable connections, ordered by available absolute measure. The map states how many mapped and total selected connections exist. This is a display selection, not a random or statistically representative sample.
- The endpoint diagram shows up to 12 grouped connections. Reference views use their source-defined associations, without manufacturing a physical quantity.
- The selected source table previews up to 250 original graph rows. Endpoint detail previews up to 300 associated auxiliary rows. **Browse original auxiliary records** shows the first 100 matching the separate collection/search request; it is an auxiliary-source browser rather than a second copy of every active graph filter.
- CSV/JSON export the complete selected graph independently of map/table display caps. Original bulk bytes remain in the companion source package.

## Sources, filters, missingness and time

Choose one **Source pathway** at a time. Use place/direction, material/chemical, source-defined sector, transport/channel and text search to establish a meaningful population. Sector/channel controls are hidden when that source has too few distinct options. Counts distinguish original rows, grouped endpoint connections, available measurements and missing measurements. Grouping occurs only within the selected pathway, period, metric and explicit filters; stages and units are not pooled.

Open **Sources, definitions and geographic limits** for publisher links, source vintage, period meaning, reuse information and SHA-256 fingerprints. Original IDs, flags and fields remain inspectable. Cross-links use source-supported IDs where supplied. Similar names, a shared headquarters or a parent company's name do not establish a new facility/supplier link.

An unavailable or confidential quantity is not zero. CDR `CBI`, `NKRA`, ranges, bounds and conflicting dimensions remain unavailable; there is no range-midpoint imputation. Earlier CDR domestic/import splits are null because only 2023 supplies those separate measures. National totals are not added to site quantities. Unweighted use associations do not receive multiplied production volumes. Source zero values stay distinct where the source establishes them; the Census port source has disclosure/mode ambiguity, so zero amount literals remain raw while display metrics use available positive published amounts. No individual-port unit price is inferred.

The timeline offers each collection's actual acquired periods. Domestic coal covers five annual ledgers; receipts cover eleven; chemical production covers four; the current register and selected trade examples have a single period. Missing years are not filled or modeled. A snapshot year describes the acquired register, not verified production throughout that year. Histories describe a reporting population that can change; current reference labels do not prove historical site identity or a corporate transaction.

**Play periods** changes the actual source frame. **Pause motion / Animate direction** controls decorative direction particles independently. Equal playback intervals do not imply equal elapsed shipment time. Width scales remain fixed across the source periods under the selected filters. The quantity/model workspace retains its separate 3D-region animations and statistical tools; cartographic height there encodes data, not terrain.

## Save a view or export a figure

**Save view** downloads a small JSON file containing the collection, source fingerprint, period, metric, filters, selected endpoint and display limit. **Open view** checks that the matching pipeline source edition is installed before restoring it. This is separate from the numerical/model project's save format and from ownership/industry saved views. The file references built-in source content; it does not replace the dataset bundle or preserve every pan/zoom gesture.

| Export | What is included |
| --- | --- |
| PNG / SVG | A locally rendered map figure plus a separate JSON evidence/settings file. The renderer shows up to 80 mapped connections and states its coverage. Its framing/labels can differ from the browser canvas. |
| GIF | All 2–24 actual offered source periods, with fixed geographic framing/width scales and complete per-frame evidence. Each source frame is held for a presentation interval; particles do not become measured motion. Single-period sources offer stills, with GIF disabled. |
| CSV | All selected graph edge rows, or nodes for an edge-free reference collection; structured raw fields remain serialized in cells. Companion JSON evidence is also written. |
| JSON | Complete selected normalized graph, matched auxiliary records, source metadata, definitions, filters and fingerprints. This is evidence for that selection, not the complete original agency database. |

The map's screen display limit does not change the full selected data export. Source stage/quantity, missing flags, unmapped endpoints and original source fields remain inspectable. Exports are written under `exports/`, and download links appear after completion. Keep the figure with its evidence file. Source ZIPs/workbooks support further reconstruction and MATLAB/Python work beyond these views.

## Value added and conditional demand scenarios

Choose **Value added & scenarios** for a separate monetary accounting view. The actual acquired OECD 2025 edition supplies interface years **2020, 2021 and 2022**, **81 economic accounts** (80 economies plus rest of world), **50 industries**, and **12,150 baseline country-industry-year rows**. The eight-industry graph is a visual subset of intermediate deliveries; the numerical scenario uses the full **4,050-node** global system.

Select year, producing economy, industry and measure, then inspect the baseline comparison, country map and source components. Bars show up to 12 largest absolute country values; the complete country table remains below. Negative map values are warm brown, unavailable values gray, and positive values use the displayed square-root color scale for that year. Levels are **million current USD**: changes across years include inflation, exchange-rate and accounting effects, with no automatic real-price or purchasing-power correction.

ICIO output and value added differ from the separate national-IOT component source. Compensation, other taxes on production, consumption of fixed capital and net operating surplus are shown as source baselines; levels are not forced to reconcile across the two harmonized sources. Compensation is not household income distribution. Production taxes are not total fiscal tax-in/out. Operating surplus is not a named firm's net profit. These components are not allocated to asset owners or silently attached to scenario changes.

The scenario question is precise: **what fixed-coefficient accounting response follows from changing global net final demand for the selected producer country-industry's output by this percentage?** It does not change all demand inside the chosen country, gross output directly, supply capacity or an observed cargo flow. With source coefficients `Aᵢⱼ = Zᵢⱼ / xⱼ`, the model solves `Δx = (I − A)⁻¹ Δy`; value-added change uses the source ICIO value-added/output ratio. National compensation/tax/surplus components remain baseline evidence.

Enter a percentage from −100 to +100 and click **Calculate demand scenario**. Validity checks reject unavailable inputs, changed model hashes, unsuitable nonpositive baseline nodes and materially negative implied outputs. Zero change returns exact zero changes. Dense source-year arrays load only for a nonzero calculation, and factorization is cached. Baseline export does not trigger a hidden model scenario.

Published source accounts have balance imperfections. The app retains original output, final demand, value added and residuals, then holds those baseline residuals fixed for the marginal calculation. Model equation residuals are a separate diagnostic. Neither source data nor the implementation supplies a statistical uncertainty interval here. Fixed prices/coefficients omit substitution, capacity, inventory behavior, household distribution and economic adjustment. Results are conditional accounting scenarios, not forecasts, supply-shortage models, causal policy effects or company-profit estimates. Export the economic evidence JSON with its assumptions and complete results.

## Provenance, performance and deeper work

The companion source-package start guide (research-edition file) links coal (research-edition file), chemical/pharmaceutical/trade (research-edition file) and economic (research-edition file) source guides, original downloads, builders and independent verification. The installed manifest (research-edition file) identifies collection counts/years/hashes. Free sources retain publisher attribution and reuse conditions; OECD derived calculations do not imply publisher endorsement.

Large retained ownership/industry modules and new collections load when requested. Initial startup with dependencies present measured 5.71 seconds on the current Linux host. Loading a large CDR collection or a source-year model adds work; RAM depends on which collections have been opened. This is a host-specific observation rather than a universal memory/runtime promise. The launchers retain the earlier installation guidance; Linux execution is checked here, with clean Windows/macOS execution still outside this delivery's test scope.

Use the full numerical library for bounded correlation, regression and Bayesian regression questions, with statistical methods (research-edition file) and question framing (research-edition file). Use the retained resource guide (research-edition file), ownership guide (research-edition file), energy/environment guide (research-edition file) and 3D temporal-map methods (research-edition file) for their own data populations. A visual economic pattern can suggest a hypothesis; descriptive association or a fixed-coefficient model does not establish that an economic system caused it.

Source extraction checks, application tests and actual UI/export examples have separate receipts in the source package and workbench `qa/`. Validation is bounded to the checked files and current host. Keep those distinctions, source definitions and missingness visible when turning this research into a Civic Voice explanation or poll.
