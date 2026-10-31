# Connected ownership and environmental context

These **additive derived files** support the flow-map context API without instantiating the full retained ownership and industrial workspaces. Original bundles remain unchanged under `data/ownership`, `data/industry`, and `data/pipelines`; the full original research views remain available.

Run `python3 data/pipeline_context/rebuild_context.py` from the workbench to regenerate the index from those bundled sources. The build requires no network access. The manifest records the exact SHA-256 of all eight acquired input bundles and the coal-receipt reference bundle, plus the compressed derivative hashes. The build uses source IDs and original source fields, not geographic proximity or name matching. The generated files use deterministic compact JSON and gzip with fixed modification-time metadata; the manifest's build timestamp is intentionally refreshed.

## Indexed scope

- Global Energy Monitor public coal/iron mine and processing-map observations and their reported owner/operator/parent roles, at their actual publisher snapshot dates.
- MSHA coal operations plus every exact MSHA reference in the retained coal receipts. Current mine-master names, coordinates, commodities and status are reference metadata dated **2026-10-23**. The dated operator/controller history is separately retained. This inventory includes historical, abandoned and closed references; it is **not a count of active mines or current production**.
- **Virginia** EIA annual plant references and associated generator roles, **2015–2025**. The full national EIA source files and original industry workspace are retained; the connected overlay's compact EIA scope is Virginia. Generator ownership stays attached to the original generator ID and does not become a plant equity stake.
- National retained U.S. GHGRP direct reporter observations **2010–2023**, and Virginia TRI facility/chemical reports **2015–2024**. The presence of TRI data for2024 does not create GHGRP2024 values. Each TRI metric/chemical/native-unit combination has a separate selector; source rows with repeated dimensions remain separate.
- GLEIF certified GEM-to-LEI asset links, acquired accounting-parent snapshot relations, and reporting exceptions. Snapshot dates, GEM asset-role observations, certified mapping dates, and current legal-identity reference dates remain independent.

## Joins and time selections

Exact flow-supplied `industry_asset_id` and `ownership_asset_id` values locate retained source references. EIA-to-GHGRP associations use only the retained publisher identifier crosswalk, keeping its publication date, unknown validity interval and `allocation_allowed: false` flag. CDR references can associate with TRI/GHGRP reporters only through an exact shared **12-digit FRS identifier**, preserving leading zeros and all matches. Shared IDs associate reporting references; they do not establish identical facility, chemical, annual or emissions boundaries.

CDR domestic/foreign/standardized parent fields refer to **2023**. Those unresolved source-reported names appear only when2023 ownership or explicitly opted-in latest context is selected. They are never backfilled into2020–2022 chemical quantities. Names, addresses, common countries and proximity do not resolve a legal owner or create a facility link.

A year choice uses exact annual records and the latest retained publisher snapshot **within that same calendar year per asset/source**. Actual day/month timestamps remain attached; differing intra-year snapshot roles are not merged. MSHA history is screened at December31 of the selected year, bounded by the acquired cutoff. Interval ends are inclusive for display, with the original source's unspecified boundary convention noted. No nearest year is substituted. Consequently, a2026 year-end screen can be unavailable after the October2026 cutoff; **latest** instead uses the actual source cutoff.

**Latest ownership** is an explicit separate mode. It selects the latest retained observation per asset/source, with differing source dates retained. It is neither an as-of history nor a universal current-ownership census. EPA latest parent references are indexed separately from the selected environmental year, so changing an environmental comparison year does not silently change the opted-in latest parent observation.

## Map and export boundaries

A source-matched endpoint and an independent regional context point have separate markers and fields. Regional inventory uses exact source country/state filters. The default automatic coal filter follows coal source classes only; an explicit material filter or owner/site search changes the context selection independently of the flow records. Context inventories do not establish suppliers, customers or that a selected shipment visited a site.

Interactive inventory displays use a deterministic country-and-source round-robin sample, with full selection and displayed counts reported. This is a geographic/source coverage sample, not a production, environmental or market-share ranking. Context and endpoint display caps do not truncate `PipelineContext.evidence()` exports.

Coordinates require source points and source eligibility. U.S. current-state bounding envelopes provide the same coarse display check as the retained ownership workspace. Regional centroids are never substituted for a missing facility point. Source report-year and current-reference location dates remain visible.

Environmental values remain original eligible numbers or unavailable values, in their original units. Zero is preserved. Source chemical rows and repeated dimensions remain inspectable. Reported mass, GHG emissions, releases, exposure, toxicity, health outcomes and life-cycle impacts are different quantities. No reported percentage is multiplied by output, traded tonnes, emissions, wages, taxes, cash flows or economic-model results. The API supplies no owner-attributed footprint, invented chain mass balance, cost-benefit estimate or causal economic result.

## Checks

`tests/test_pipeline_context.py` contains synthetic source-boundary regressions for exact crosswalks, missing years, date selection, many-to-many FRS associations, CDR2023-only parents, generator scope, no owner allocation, TRI zero/duplicate rows, source tampering, MSHA cutoff, and complete evidence versus displayed samples. Actual-source review receipts are recorded separately in `qa/`.
