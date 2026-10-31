# U.S. state and county food histories: sources and interpretation

This addition uses the official USDA National Agricultural Statistics Service (NASS) Quick Stats public bulk files dated **30 October 2026**. The downloads require no account or API key. They are frozen source editions, rather than a live updating service. The preparation adds country-wide U.S. state and county records; Virginia is one included state, not the geographic limit.

## Find the data in the workbench

Open the numerical library at [local research view]  and choose one of the four **U.S. food** collections in **Dataset collection**. Clear an earlier search if it does not apply, then search for corn, wheat, milk, eggs or another commodity. Measure labels retain **SURVEY estimate** or **CENSUS reported/adjusted**, the native reference period, and state/county scope.

Use the existing **Flat map**, **Time series** and source table to compare county data. Choose a named place with its state abbreviation and actual source year. County maps use the separately retained 2025 Census outlines; historic or unresolved identifiers remain in the table rather than receiving a guessed polygon. Shapes outside the existing U.S. display projection likewise remain in the records.

State data also use the existing raised-region view. Its initial window is bounded to 80 calendar frames for long histories; its source-year controls and the ordinary time-series view retain the full history. Nationwide counties exceed the existing 500-region 3D bound, so their existing flat-map and time views are used. The addition does not generate a new figure or animation.

The source CSV download preserves all available row fields, including native CV text, publication load time, source-record numbers, unresolved symbols and duplicate raw-value variants. Series metadata and the raw publisher files retain the full native source dimensions. Model matching remains separate from the selected source's exploration years.

## Actual installed scope

| Collection | Distinct native measures | Retained observations | Actual source-year range across the collection |
|---|---:|---:|---|
| U.S. food · crop production, area and yield · states | 2,871 | 582,531 | 1866–2027; the title explicitly includes season forecasts |
| U.S. food · crop production, area and yield · counties | 1,455 | 8,392,040 | 1909–2025 |
| U.S. food · animal products and inventories · states | 347 | 280,404 | 1866–2026 |
| U.S. food · animal products and inventories · counties | 116 | 1,614,521 | 1919–2026 |
| **Total** | **4,789** | **10,869,496** | Exact source periods; no interpolated observations |

The raw sources contain **34,152,339 records**. The documented physical food selection has **10,869,533 source records**. Thirty-six duplicate extra records are identical across all 39 source fields; one additional record differs only by the equivalent numeric text `28.70` versus `28.7`, with all other 38 fields identical. These represent one measurement per native identity, with every original source-record number retained; the formatting case also retains both original value strings. **10,869,496 observations plus 37 duplicate references equals the 10,869,533 selected source records.** There is no averaging, summing or preferred-revision selection.

All 50 states appear in the selected source population. Publisher “Other States,” “New England,” “Other/Combined Counties” and similar source groups are retained with explicit source identities and are excluded from state/county model eligibility. Counts of source place identifiers are not counts of distinct current physical counties. Country-wide coverage does not mean that every county has every commodity or year.

There are **4,594 measures with more than one source year** and 195 native combinations with one source year. The latter are retained rather than inventing earlier values. Census measures have their actual reporting years and gaps; they are not made into annual observations. Historical source county codes can lack a current boundary.

## What was selected

From the crop file, the normalized workbench includes the source food-related field-crop, vegetable, fruit and tree-nut groups, excluding named nonfood cotton, tobacco, hemp, guar, castor-bean, broomcorn and jojoba items. Physical **production, harvested area, bearing area and yield** are retained. Source class, production practice, utilization practice and unit remain distinct. Broad source groups and component crops must not be summed indiscriminately. Forage and feed-related crops are part of the agricultural food-system context, rather than direct human food consumption.

From the animal/product file, the selection covers livestock, poultry, dairy, aquaculture and honey where the selected physical statistics exist. Physical **production, slaughter quantities, calf/pig crop, hatchings and inventories** retain their exact native measure labels. Nonfood equine, wool, mohair, mink, fox and similar excluded categories are not silently described as food output. Animal sales, monetary values and every other Quick Stats statistical category are not part of this bounded normalized selection; the complete original files remain retained.

The source constraints are `AGG_LEVEL_DESC=STATE/COUNTY`, `SOURCE_DESC=SURVEY/CENSUS`, and the source total domain (`DOMAIN_DESC=TOTAL`, `DOMAINCAT_DESC=NOT SPECIFIED`). Annual flow/area/yield measures use the native `ANNUAL` and `YEAR` fields. Inventories additionally retain separate native point references `FIRST OF JAN`, `FIRST OF DEC` and `END OF DEC`. Native frequency and reference-date combinations are part of the measure identity. Monetary and percentage measures are excluded from this physical-quantity addition.

The full native identity comprises source program, sector, group, commodity, class, production practice, utilization practice, statistic, unit, short description, domain/domain category, aggregation level, frequency, reference period, begin/end code and week-ending field. A checked hash names each identity; it does not merge similar labels. Every original source field remains available in the immutable raw file, located by the row’s 1-based logical tab-delimited source-record number (header counts as record 1).

## Read the numbers and source status

**SURVEY** series are published NASS survey estimates. **CENSUS** series are Census of Agriculture reported/adjusted statistics, which can include coverage/nonresponse adjustment and other uncertainty. Neither source program is assigned an invented “official/imputed” code borrowed from FAOSTAT. The programs remain separate series even when their commodity and unit labels look alike.

The source `CV_%` field is retained separately, including its original blank/NUL and symbolic representations. Missing CV is not zero uncertainty. H/L are source precision-bound symbols, not measured production values. A CV is not silently converted into a new confidence interval.

`(D)` withheld, `(NA)` unavailable, `(S)` insufficient reports and `(X)` not applicable remain nonnumeric/ineligible. `(Z)` means less than half the unit shown; `(Y)` denotes less than the level of precision shown in the relevant livestock publication. **Neither becomes a numeric zero.** Original `(O)` and `(1)` strings found in historical bean records remain explicitly unresolved source symbols and nonnumeric/ineligible; no universal meaning is guessed. Genuine numeric zeros remain numeric zeros.

Source publication/revision information remains attached through `LOAD_TIME`, original source-row references, the exact bulk-file fingerprint and retained CV/value fields. A data-load timestamp is not the production or inventory date. The acquired snapshot does not reconstruct all past revision vintages.

For covered row crops, NASS introduced model-based county estimates for crop year 2020, combining administrative/survey information and benchmarking to state estimates. Comparisons across that point retain the method-history limitation. The workbench does not manufacture a harmonized earlier model series. Read the official June 2026 county-estimates methodology for scope and uncertainty.

## Crop seasons and current-year estimates

A native `YEAR` can be a reporting/crop-season label rather than a completed calendar year. The state crop collection’s **2027** entries are citrus season forecasts: the October 2026 official report labels forecast production for the **2026–27** season. The dataset title, row status and source reference identify that fact. These rows do not establish completed calendar-2027 production. Annual 2026 survey values can also be preliminary or forecasts; their status says so.

BOXES and TONS remain separate citrus units. Box weights can vary by commodity and state, so no single box-to-ton factor is imposed. All other native NASS units—bushels, pounds, hundredweight, acres, head, eggs, operations and their source ratios—remain source units. They are not silently converted into FAOSTAT tonnes or added across incompatible bases.

Inventory points are stocks at a stated source date; they are not annual production flows. Yield is a ratio, harvested/bearing area is land area, and production is output. They remain separate choices. The records locate source reporting units, not individual farms, owners, shipments, household consumption or causal effects.

## County geography and preservation

State records use the source state/territory abbreviation when it identifies a real reporting unit. County records use the exact native `STATE_ANSI` plus `COUNTY_ANSI` pair when present. County display names include the state abbreviation, preserving the original name without adding a possibly incorrect “County” suffix to cities or boroughs.

Missing ANSI identifiers retain a namespaced NASS geography key and original code fields; no county FIPS is guessed from a name. Numeric measurements remain inspectable, but unresolved county identities are ineligible for county-unit modeling. Source other/combined areas are likewise retained and ineligible. An exact historical five-digit county identity remains a measurement even if the current map has no outline for it. That is mapping missingness, not a numeric zero or an invented allocation to new counties.

The separate county geometry addition uses its own official Census source and vintage. Current outlines do not reconstruct historical borders; Connecticut’s historical counties versus newer planning regions are one relevant mismatch. Place eligibility, map availability and original NASS observations retain their separate meanings.

All existing workbench data and source archives are preserved. These four source namespaces are additive. The prior global FAOSTAT histories, snapshots, resource ledgers, ownership, environmental reporting, social/economic data and statistical tools remain available. No new figure, animation, economic scenario or causal model was generated for this data addition.

## Official primary references and verification

- [NASS public bulk data](https://www.nass.usda.gov/datasets/): current-day anonymous download index; exact downloaded filenames/hashes are retained separately.
- [Quick Stats glossary](https://quickstats.nass.usda.gov/src/glossary.pdf): source fields, definitions and special symbols.
- [2022 Census of Agriculture introduction](https://www.nass.usda.gov/Publications/AgCensus/2022/Full_Report/Volume_1,_Chapter_1_US/usintro.pdf): program population, confidentiality, methods and quality.
- [June 2026 county row-crop methodology](https://www.nass.usda.gov/Publications/Methodology_and_Data_Quality/County_Estimates_Row_Crops/06_2026/rcceqm26.pdf): model-based county-estimate method and revisions.
- [October 2026 citrus forecast](https://www.nass.usda.gov/Statistics_by_State/Florida/Publications/Citrus/Citrus_Forecast/2026-27/26%20Oct%2009%20Forecast.pdf): 2026–27 forecast labels and commodity/state box weights.
- [Officially archived June 2014 livestock slaughter report](https://www.reginfo.gov/public/do/DownloadDocument?objectID=49393401): the applicable `(Y)` precision symbol.

The independent streaming verifier re-read all 34,152,339 original tab-delimited records and compared every selected normalized observation with its exact publisher record, source dimensions, geography identifiers, raw value, CV and load timestamp. **358,693,368 field checks passed with zero failures.** Exact and Decimal-format duplicate accounting is separately inspectable. These checks establish file/row fidelity and documented handling; they do not validate causal claims or establish a complete agricultural census of every commodity, farm or year.

Source acquisition and rebuild folder (research-edition file) · County geography source (research-edition file) · Detailed source quality (research-edition file).
