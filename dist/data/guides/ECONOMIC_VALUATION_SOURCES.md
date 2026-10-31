# Inflation and purchasing-power source companion

Prepared 31 October 2026 from free public World Bank APIs. This is an additive source package. It does not rewrite the existing OECD accounts, matrices, physical commodity records or source archives.

## Two different comparisons

**Common 2021 U.S.-dollar reporting values.** The downloaded U.S. GDP deflator is normalized to 2021. For an existing current-USD amount in year `t`, the reporting calculation is:

`adjusted = original × US GDP deflator(2021) / US GDP deflator(t)`

The original scale is retained: an original million-USD amount becomes a million-2021-USD reporting amount. The multiplier is common to all countries for a given year. It can be applied after an unchanged current-USD accounting solve, with its factor and source preserved. It must not be applied to percentages, input coefficients, ratios, tonnes, emissions or other nonmonetary quantities.

This adjusts the U.S.-dollar price basis only. It does not remove each country's inflation, exchange-rate changes or industry-specific price changes, and is not an industry-volume, household-cost-of-living or sector-PPP measure. Sector real-output comparisons require suitable sector price/volume data. The World Bank's [GDP-deflator definition](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/NY.GDP.DEFL.ZS) defines a GDP price index; its [constant-price methodology](https://datahelpdesk.worldbank.org/knowledgebase/articles/114968-how-do-you-derive-your-constant-price-series-for-t) describes using suitably detailed price indices.

**Published national GDP and GDP-per-person PPP context.** The package copies the World Bank's already adjusted `NY.GDP.MKTP.PP.KD` and `NY.GDP.PCAP.PP.KD` observations, expressed in constant 2021 international dollars. No local PPP conversion, population division, interpolation or inflation adjustment is applied to these values. Definitions: [GDP PPP](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/NY.GDP.MKTP.PP.KD), [GDP per person PPP](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/NY.GDP.PCAP.PP.KD).

These are national comparisons, separate from industry accounts. WDI GDP is a national market-price aggregate; ICIO value added uses the retained source basic-price accounts. Their levels are not forced to reconcile, and a sector share against PPP GDP is not inferred. The [World Bank's scope guidance](https://datahelpdesk.worldbank.org/knowledgebase/articles/114945-why-are-some-series-shown-in-purchasing-power-pari) limits WDI conversion factors to GDP/private-consumption comparisons rather than arbitrary sectors. The [ICP FAQ](https://www.worldbank.org/en/programs/icp/faq) distinguishes PPP macro comparisons from international trade and financial flows.

For that reason there is **no sector PPP conversion factor** in this package. Earlier raw downloads of country GDP deflators, PPP conversion factors and current GDP in local currency/USD are retained for provenance only. No currency bridge or synthetic sector purchasing power is computed from them.

## Coverage and missingness

- Native source vintage: World Development Indicators, last updated **8 October 2026** in the downloaded API headers.
- Source request years: **2000–2025**. Recent source estimates may be revised; a year label is not a claim of a final direct measurement.
- **217 nonaggregate countries/economies**, using World Bank country metadata to exclude regional/income aggregates. Aggregate rows remain in the raw JSON files.
- Two national context series contain **11,284 retained cells**: **10,202 numeric** and **1,082 unavailable**. Missing source values remain null/ineligible.
- **26 U.S. deflator indices and factors** are available for 2000–2025.
- All **79 exact World Bank matches** among the model's 80 named economies have GDP and per-person PPP values in each model year, 2020–2022. **TWN** has no exact World Bank country record; **ROW** is an aggregate, not an individual country. Both remain explicitly unavailable as national PPP context. No nearest-country or regional substitute is used.
- Country source reporting/fiscal-year conventions, national-account revisions, geographic changes and source vintages can differ from ICIO. A common published year label is not proof of identical twelve-month coverage. Native footnotes remain available; for example, Sudan's 2011 GDP source footnote distinguishes South Sudan.

The source methods include national statistics and staff estimates, and PPP construction includes benchmark comparisons, interpolation, extrapolation and estimation. Every downloaded national context record has a blank native `obs_status`; this does not identify which individual cells were estimated. The normalized metadata labels the series as publisher-adjusted national-account estimates and retains each original status and footnote. It does not claim unflagged cells are direct measurements.

## Exact factor examples

The API's native U.S. index is 100 in 2020; that native base is retained. Normalizing the reporting unit to 2021 produces:

| Source year | Native U.S. GDP deflator | 2021 reporting multiplier |
|---|---:|---:|
| 2020 | 100 | 1.04562972826319 |
| 2021 | 104.562972826319 | 1 |
| 2022 | 112.000017338401 | 0.933597827135942 |

Factors are locally calculated ratios of the published indices. They are not newly observed price data or published World Bank sector multipliers.

## Files and readback

- `factors.json`: normalized reporting factors, national PPP context records, country/model coverage, sources, formula and limitations.
- `macro_context.csv`: native GDP PPP and per-person PPP values with source/status fields.
- `us_deflator_factors.csv`: original U.S. indices and explicit calculated multipliers.
- `sources/`: thirteen untouched API response files, including country metadata, indicator metadata and the initial audit-only factor downloads.
- `SOURCE_INDEX.json`: exact request URLs, UTC retrieval timestamps, native API headers, row counts, byte counts and SHA-256 hashes.
- `SOURCE_REVIEW.json` and `INDEPENDENT_SOURCE_READBACK.json`: source integrity and numeric/row-accounting checks.
- `scripts/build_factors.py`: offline normalization from those frozen responses. It does not fetch or replace source bytes.

World Bank APIs used here require no API key or payment. Reuse remains subject to the publisher's dataset terms and any source-specific exceptions; original source organizations and URLs are retained in the metadata. The raw API unit strings can be blank, so normalized units come from the retained official indicator names/definitions, not guesses.
