# Commodity flows on the public site

The public flow viewer opens at `/workbench/pipelines.html?collection=trade_coal`. It restores the retained local workbench's directional map, endpoint diagram, period playback, filtering, source tables, endpoint inspection, and source-attached downloads in the public browser edition.

## Retained source coverage

| Collection | Native source periods | Source connection rows |
| --- | --- | ---: |
| Coal · reported domestic state flows | 2020–2024 (retained periods only) | 6,237 |
| Coal · reported deliveries to Virginia plants | 2015–2025 (retained periods only) | 1,760 |
| Coal · U.S. customs ports to countries | 2024 | 430 |
| Coal · international customs exports | 2024 | 63 |
| Aspirin-related chemicals · international customs exports | 2024 | 82 |
| Rare-earth compounds · international customs exports | 2024 | 62 |
| Chemicals · reported manufacture and imports | 2020–2023 (retained periods only) | 181,688 |
| Chemicals · reported processing and product uses | 2023 | 135,922 |
| Pharmaceuticals · registered establishment references | 2026 | 10,455 |
| Pharmaceuticals · ingredients and listed products | 2026 | 7 |
| Global industry accounting flows | 2020, 2021, 2022 | 126,015 |

The viewer reads all eleven retained source graph bundles. It verifies stored parts, reassembles original source files, and checks their original SHA-256 values before using them. The existing public source bundles, numerical catalogue, historical records, geometry and raised-map engines remain unchanged.

## Meaning of a connection

- Coal deliveries can connect reported source regions or mines with reported receiving plants. Consuming-sector and transport fields appear where the collection supplies them.
- Customs exports connect the reporting and partner areas in the retained source. They do not identify every physical route, intermediary, purchaser or final consumer. Rare-earth-compound exports are a different product stage from mine production or reserves.
- Chemical production/import and processing/use records retain their reported roles, categories, withheld quantities and reference associations. A use category alone does not establish a named final customer.
- Pharmaceutical establishment and product records describe registrations and listed associations. They do not prove a shipment or a particular ingredient supplier.
- Economic supply links describe monetary accounting relationships between economies and industries. They are separate from physical shipments and do not establish causal effects.

Separate ledgers are never stitched into a claimed complete source-to-end-user journey. Regional anchors are representative; facility locations require source coordinates for the selected period. Moving particles indicate direction, not transit time. Native zero and unavailable quantities remain distinct. Source periods and units are never silently combined.

The map displays a configurable number of connections for legibility. CSV and JSON downloads retain the complete selected source graph, including unmapped endpoints; figures include companion source evidence and settings. PNG and editable SVG are created in the browser. GIF rendering, matched ownership/environmental layers and economic model calculations remain available in the original local analytical workbench, linked beside the public viewer.

## Navigation and preservation

Commodity flows are linked from the main navigation, Home, the World maps heading, and the full 3D explorer. Relevant coal and rare-earth measures have clearly labeled links to the separate retained flow coverage. The general Commodity flows links resume the last supported flow selection in this tab; dedicated commodity and example links select their named source collection. The original commodity map selection and numerical-workbench view remain in their own navigation state; opening flows does not overwrite them. Saved flow views contain source fingerprints and settings, separately from full evidence exports.
