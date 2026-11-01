# World data and economic-model comparability audit

Prepared 2026-10-31T20:06:55.196414+00:00. This is a read-only audit of the installed public map evidence, complete 22-collection catalogue, and retained economic-model metadata and runtime gate. Seven exact retained crop-production histories were promoted to the public subset separately; no new source acquisition, local imputation, numerical unit conversion or model rebuilding occurred. No scenario was run.

The public world maps now contain **118 measures and 63,722 native source rows**. Of these, **62,413 rows have eligible numeric values**, 1,309 are unavailable/nonnumeric, and 3,040 are genuine numeric zeros. All 118 evidence-file hashes match the frozen snapshot manifest. Across the whole public reading interface, 297 measures contain 155,198 native rows; the complete 7,811-measure / 22-collection catalogue is byte-unchanged.

Temporal coverage needs careful wording:

- **100 measures are ordinary single-year snapshots.**
- **Eight are latest-available country snapshots.** Their native observation years can differ between countries; seven contain more than one numeric year without being longitudinal panels.
- **Ten are actual annual histories**, listed below. Source years and country coverage remain native; a country can have fewer years than the collection.

| Native measure | Source years | Retained rows | Native places |
|---|---:|---:|---:|
| Wheat · production (tonnes) · annual history | 1961–2024 | 6,968 | 124 |
| Soya beans · production (tonnes) · annual history | 1961–2024 | 5,867 | 117 |
| Oil palm fruit · production (tonnes) · annual history | 1961–2024 | 2,755 | 44 |
| Rice · production (tonnes) · annual history | 1961–2024 | 7,473 | 141 |
| Seed cotton, unginned · production (tonnes) · annual history | 1961–2024 | 5,963 | 99 |
| Maize (corn) · production (tonnes) · annual history | 1961–2024 | 9,565 | 174 |
| Coffee, green · production (tonnes) · annual history | 1961–2024 | 5,176 | 83 |
| Cocoa beans · production (tonnes) · annual history | 1961–2024 | 3,844 | 62 |
| Wheat and products · food available for people (thousand tonnes) · annual history | 2010–2023 | 2,397 | 177 |
| Wheat and products · production (thousand tonnes) · annual history | 2010–2023 | 1,657 | 126 |

These are real publisher-derived numbers, including real publisher estimates. Among FAO-labeled rows, **34,896 are official figures (A), 6,379 were imputed by the receiving agency (I), 6,200 are estimated (E), 2,913 come from an external organization (X), and 1,277 are missing (M)**. Other native statuses remain separately counted in the JSON. “No imputation by this interface” is accurate; “no imputed source values” would be inaccurate. A generic published/reported/numeric status does not establish direct measurement or absence of upstream estimation.

The maps retain native units and source values. Their fixed color scale changes visual encoding, not the numerical data. Quantity totals, source-defined percentages and nominal current U.S. dollars are not a universal comparable metric. Cross-country or temporal analyses require explicit alignment of reporting year, geographic population, commodity/industry definitions, units, denominators and source vintage. Unmapped reporting economies remain in the selector, table and downloads. Missing observations are not zero.

## Existing economic model

The installed monetary model uses **OECD ICIO 2025 regular tables**, specifically `2020_SML.csv`, `2021_SML.csv` and `2022_SML.csv`. Its scope is **80 named economies plus a rest-of-world account, 50 industries and 4,050 country-industry nodes**. Units are **million current U.S. dollars at basic prices**. All three installed model hashes match their manifests. Separate OECD national IOT 2025 accounts provide employee-compensation and other value-added components; differences from ICIO levels are retained.

The implemented demand response is `Δx = (I − A)⁻¹ Δy`, with fixed input coefficients and prices and retained source balance residuals. It is a conditional accounting model. It does not automatically estimate causal policy effects, prices, physical supply constraints, household welfare or who receives profits. Current-dollar changes include price and exchange-rate changes; they are not PPP or inflation-adjusted buying power.

**The environmental demand scenario remains disabled:** 214 of 243 country-year reconstructions exceeded the propagated source-rounding bound. Official descriptive OECD production/final-demand footprint accounts for 1995–2022 remain separately available. No fitted correction or new environmental scenario was introduced.

The complete local catalogue already includes 228 global food-production history definitions and 854 global food-balance history definitions. Their presence locally does not mean all of their records are currently hosted on the public world-map page.

Machine-readable details: [world-comparability.json](/data/world-comparability.json). It contains all 118 measure-level year/unit/status/coverage entries, 22 collection summaries, source URLs, model-file hashes and the exact compatibility-gate result. The promotion receipt remains in the local research project’s QA folder. Original local source values and datasets were not changed.
