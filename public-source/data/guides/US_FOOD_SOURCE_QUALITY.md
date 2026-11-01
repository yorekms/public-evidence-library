# U.S. agricultural histories: source-quality rules

Research date: 30 October 2026, America/New_York. This is a source and implementation review, not a new fitted model or a claim that every state, county and commodity is observed every year.

## Actual public source and dates

The official [NASS large-dataset page](https://www.nass.usda.gov/datasets/) currently lists the 30 October 2026 crop and animal/product snapshots at approximately 1.05 GB and 442.51 MB compressed. Their rows are a retained database edition, including previously revised historical values; the download date is separate from the reference year. The page also lists separate Census editions. Do not claim all Census rows are contained in a sector download until actual row coverage is checked.

[Official Quick Stats glossary](https://quickstats.nass.usda.gov/src/glossary.pdf), January 2015, defines the symbols below. The [2022 Census report introduction](https://www.nass.usda.gov/Publications/AgCensus/2022/Full_Report/Volume_1,_Chapter_1_US/usintro.pdf) independently corroborates D/H/L/NA/X/Z. The glossary's statement restricting CV availability to the 2012 Census is historical and must not be repeated as current scope.

## Numeric values, suppression and precision

| Native text | Meaning | Safe treatment |
|---|---|---|
| `(D)` | Withheld to avoid disclosing an individual operation's data | Retain text; numeric value null/ineligible. |
| `(NA)` | Not available | Null, not zero. |
| `(S)` | Insufficient reports to establish an estimate | Null/ineligible with its specific status. |
| `(X)` | Not applicable | Null, distinct from missing or withheld. |
| `(Y)` | Less than the publication’s displayed precision | Preserve the bounded-small-value text; null/ineligible rather than zero. Verified in the USDA NASS Livestock Slaughter report below, matching actual cattle-slaughter source rows. |
| `(Z)` | Less than half the rounding unit | Preserve its inequality status; do not convert to numeric zero. Do not derive a numeric upper bound without establishing the publication's rounding unit. |
| `(H)` | CV/GCV at least 99.95%, or standard error at least 99.95% of the mean | A precision marker, not a measured production amount. Keep the native CV field separate. |
| `(L)` | CV/GCV below 0.05%, or standard error below 0.05% of the mean | Preserve native bounded precision; do not replace by zero uncertainty. |
| Numeric `0` | Actual published numeric zero | Retain numeric zero. |
| Blank CV | No supplied precision statistic | Do not infer zero error, infinite error, or an interval. |

The official [NASS Livestock Slaughter report, June 2014](https://www.reginfo.gov/public/do/DownloadDocument?objectID=49393401), pp. 6–13, defines `(Y)` as below the displayed precision. Actual annual cattle/calf commercial-slaughter rows in the acquired bulk use this symbol (for example Iowa 2013 and Alaska 2018); it is preserved rather than assigned a number.

Keep the acquired bulk columns `VALUE` and `CV_%` verbatim alongside any parsed finite number (the Quick Stats interface uses the display labels Value and CV (%)). Published CV is relative standard error, rather than a confidence interval. No interval should be manufactured merely because CV exists. Survey/Census rows are published NASS statistical values; the source does not supply FAOSTAT-style per-row A/E/I flags, so do not invent them.

## Survey, Census and methodology changes

The [Census of Agriculture](https://www.nass.usda.gov/AgCensus/) occurs every five years. Its [2022 Methodology Appendix A](https://www.nass.usda.gov/Publications/AgCensus/2022/Full_Report/Volume_1,_Chapter_1_US/usappxa.pdf), especially pp. A-6–A-11, describes editing, imputation, undercoverage/nonresponse/misclassification adjustments and precision estimation. Census-source values are not automatically unadjusted direct observations or error-free counts. Keep `source_desc=SURVEY` and `source_desc=CENSUS` in separate series.

The [row-crop county methodology report, 5 June 2026](https://www.nass.usda.gov/Publications/Methodology_and_Data_Quality/County_Estimates_Row_Crops/06_2026/rcceqm26.pdf) covers 2024/2025 quality tables. It states that model-based county estimates entered the process with the **2020 crop year**: Bayesian small-area models use surveys and standard errors, FSA/RMA administrative acreage and soil-productivity information. Production is derived from estimated yield and harvested acreage, with county estimates benchmarked to official state estimates. Revised state totals can lead to recreated county estimates. This supports labeling published county estimates and a potential methodological break; it does not justify applying the 2026 model retrospectively to every historical row. County and state figures are linked through benchmarking, so comparisons must not assume statistical independence merely because separate rows exist.

## Annual periods and revisions

[Annual crop methodology, 4 February 2026](https://www.nass.usda.gov/Publications/Methodology_and_Data_Quality/Crop_Production/02_2026/cranqm26.pdf) distinguishes December-survey annual summaries from in-season forecasting and describes subsequent revision opportunities. Its report publication year differs from the 2024/2025 crop years in its tables. The [12 August 2026 CAPS announcement](https://www.nass.usda.gov/Newsroom/2026/08-12-2026.php) schedules the resulting county estimates for December. Therefore an October snapshot cannot be called complete final 2026 county production merely because `year=2026` appears somewhere.

Retain `freq_desc`, `reference_period_desc`, `begin_code`, `end_code`, `year`, `load_time` and any week-ending/date fields. Annual frequency alone does not make calendar-year flows, crop years, marketing years, point-in-time inventories and forecasts interchangeable. `load_time` is database provenance; do not label it the farm measurement date or infer final/preliminary status from it. The [Quick Stats corrections log](https://www.nass.usda.gov/Corrections/?log=QS) includes actual changes from DEC/monthly chicken inventory to FIRST OF DEC/point-in-time, illustrating why period and frequency must be retained.

The actual crop profile also contains `(O)` and `(1)` value strings. The general glossary and publications reviewed here do not establish a safe universal interpretation for them. Preserve the exact native symbols, use a null numeric value and an explicit unresolved-source-symbol status, and exclude them from numerical comparison until the matching source footnote is verified. Do not interpret `(O)` as zero or `(1)` as numeric one.

The [official 9 October 2026 citrus forecast](https://www.nass.usda.gov/Statistics_by_State/Florida/Publications/Citrus/Citrus_Forecast/2026-27/26%20Oct%2009%20Forecast.pdf), p. 1, explicitly labels the forward column as forecast production for the **2026–2027 season**. This supports retaining native year-2027 citrus records with an explicit forward-season forecast label; they are not completed 2027 calendar-year production. It does not authorize assigning the same calendar convention to unrelated commodities. The table also shows different pounds per box by commodity and state, so boxes and tons must remain distinct native units without a single conversion factor.

## Safe native dimensions and geography

Implementation recommendation: retain every defining native dimension when constructing a series: source, sector/group/commodity, class, production and utilization practice, statistic category, unit, domain/category, frequency/reference period and aggregation level. A short description alone must not collapse genuinely different categories. Treat duplicate native identities as a diagnostic; do not silently average or pick a row. Keep production, harvested acres, yield, inventories and sales separate; do not sum component/total or irrigated/non-irrigated source groups together.

Join states/counties by exact native ANSI/FIPS identifiers, not names. Preserve special combined-county, historical, invalid and unmatched codes in their own retained records. Current polygons do not reconstruct historical boundaries; Connecticut's county-equivalent changes and Virginia's independent-city identities require explicit mapping coverage. Never infer a missing county from a state total or spread suppressed values among counties.

## Existing application constraints found read-only

The existing pack loader rejects duplicate series/place/year rows and requires source hashes, finite-or-null values, explicit units/scope/status and eligibility. `app.js` has explicit allowed-map lists for `us_states`, `world`, `virginia`; a new `us_counties` scope needs corresponding support and a readable name. Its projection fallback already uses Albers USA. Saved-project restore's total 5,000-series guard must accommodate additional **verified built-ins** while preserving user-import limits and canonical built-in validation.
