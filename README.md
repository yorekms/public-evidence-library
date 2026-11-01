# Public Evidence Library

A public, source-attached data library linked to Civic Voice. It retains the complete original collection and adds historical food, energy and raw-material records. The existing local analytical workbench and Civic Voice remain separate.

The current catalogue contains **8,756 measures in 25 collections**, with **13,853,146 retained normalized records**. It includes every original **7,811 measure, 22 collection and 13,431,313 record**. Existing maps, source files, source identifiers, missing values and source flags are preserved. Additional country histories use the same public color maps and original 3D renderer.

## Historical expansion — 1 November 2026

The additive source register is `public-source/data/historical-resources-manifest.json`; the human-readable guide and original download links are `public-source/data/HISTORICAL_RESOURCES.md`.

- Eight World Bank WDI food and agricultural measures add 111,104 country/territory records, including FAO-source food, crop and livestock production indices, cereal production, area and yield, and fertilizer measures. Overall food reporting coverage is 1961–2024; each series retains its native unit and definition.
- Twenty-seven WDI energy measures add 195,300 country/territory records for energy use, electricity, fuel mix, access and efficiency. Periods differ by indicator; the source register records their exact reporting extent.
- Nine hundred and ten USGS mineral-production series add 115,429 country/source-year records for 1990–2022. Exact commodity, form, form detail, physical basis and unit remain separate. The displayed history selects the latest publisher-table vintage for each exact country/source-year/dimension cell. Every source table identifier and note is retained; the complete original 462,845-row CSV preserves all alternative vintages, aggregates and historical geographies.

All 36 new original-source archives are downloadable. World Bank aggregate accounts and empty API cells outside each indicator's numeric reporting extent stay in the original response archives. Within-range missing cells remain in displayed records. Historical geographies are not reassigned to successor states. No local interpolation, carry-forward, zero filling, averaging or numerical unit conversion supplies a map value.

The import is reproducible with `python3 scripts/add_historical_resources.py`. It appends new historical sources and refreshes only its own supplemental metadata on repeat runs. Original numerical source packs and earlier evidence files remain intact. Tests are `node --test tests/*.test.cjs` and `python3 -m unittest discover -s tests -p 'test_historical_resources.py'`.

## Map layout

The World maps page uses a compact collection, commodity, country and year selector dock immediately above the existing map. On larger screens it stays under the site header while the map is in view; narrow screens use two compact rows. The year slider, playback, color/3D switch, camera controls, zoom, source observations and downloads remain available. Lengthy definitions and reading guidance are expandable below the map. Changing a commodity retains a compatible country/year and keeps the document tall while its source loads to avoid losing the map viewport.

## Source and deployment layout

`public-source/` contains the retained public assets and complete source tree. `dist/` is generated Worker output, with static assets in `dist/client/`. Large `/full-data/` files remain served from the managed R2 binding `BUCKET` through their immutable SHA-256 allowlist. The historical supplement uses separate static evidence files, losslessly gzipped only in the generated deployment to fit the hosting package limit. The Worker returns the same logical JSON URLs with gzip transport headers; every one of the 945 decoded files is checked against its complete source bytes. The preserved public-source files remain plain JSON; the full explorer's source adapter merges new definitions without replacing the original full-data index or source parts.

Build with `python3 scripts/build_r2_release.py --mode final`. Final releases compile ingestion off and have no upload secret. `.openai/hosting.json` identifies the existing Sites deployment; preserve its public audience. `dist/` and local `qa/` receipts are ignored by Git. The earlier `build_public_data.py` and `add_original_public_collections.py` are retained historical subset-export helpers, not the current full-library rebuild workflow.

Serve `public-source/` through HTTP for local preview. Python-only analyses and media rendering still use the original local workbench. The public library makes no claim that these analyses or new causal/economic models have been run. Optional notes stay in the browser tab and are downloaded only by explicit user action.

## Verification receipts

The 1 November baseline, original-file hashes, source parsing audit, browser review, tests and publication readback are retained in `qa/historical_expansion_2026-11-01/`. Preservation verification distinguishes unchanged numerical/renderer files from deliberately updated catalogue metadata and interface files. The earlier compact-export snapshot manifest is labeled as a historical snapshot; current coverage is in the full-data index plus the historical supplement register.
