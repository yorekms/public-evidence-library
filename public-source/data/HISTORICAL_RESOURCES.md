# Historical food, energy and raw-material sources

Added 1 November 2026. Existing maps, source collections and retained observations remain available. These histories contain source records, source estimates and unavailable cells; no missing values have been imputed by the library.

| Collection | Measures | Country/territory records | Source years |
| --- | ---: | ---: | --- |
| World Bank WDI · food, crops and livestock · annual country histories | 8 | 111,104 | 1961–2024 |
| World Bank WDI · energy, electricity and fuel mix · annual country histories | 27 | 195,300 | 1990–2025 |
| USGS mineral production · annual country histories · 1990–2022 | 910 | 115,429 | 1990–2022 |

## Meaning and comparison limits

World Bank food histories include the FAO food, crop and livestock production volume indices (2014–2016 = 100), cereal tonnes, cereal area and yield, and fertilizer-use indicators. An index is separate from commodity tonnage. Energy histories include use per person, electricity generation shares by fuel, renewable electricity, access, intensity and imports. Published percentages, energy-equivalent units and physical units stay distinct. Source definitions and original-provider attribution accompany every measure.

World Bank API observation-status and footnote fields are preserved. Country nulls within each indicator’s numerical reporting-year extent remain unavailable. API cells outside that extent and regional/income/world aggregates remain in each original response archive. An empty observation-status field does not establish that the value is a direct measurement or has no uncertainty.

USGS Minerals Yearbook histories cover 1990–2022. Each exact commodity, commodity form, form detail, unit and material basis is a separate measure. The map history selects the latest publication vintage per source year and country, retaining that source table ID, publication year, original quantity and all table/statistic notes. It does not average revisions. If multiple rows remain in the same latest publication vintage, the cell is unavailable for mapping and all competing rows stay attached. A missing latest value is not replaced by an older numerical value.

USGS source codes -111 (reported below half a unit), -222 (withheld) and -333 (unavailable) are not negative production and are not measured zeros. They remain unavailable, with the literal source code and its explanation retained. Estimates, revisions and rounding notes remain attached. Production is separate from reserves, capacity, consumption and shipments.

Historical countries and aggregate regions are not assigned to modern successor states. Country/territory labels without retained map polygons remain available through the country selector and source table. The geography register documents every original USGS country label and the exact alias or table-only treatment.

## Source register and original downloads

- [Machine-readable source register, coverage, checksums and row accounting](/data/historical-resources-manifest.json)
- [USGS country/territory crosswalk and table-only geography accounting](/data/historical-sources/usgs-country-crosswalk.json)
- [USGS primary release and methodology](https://doi.org/10.5066/P13DFA65) — published 15 October 2026, CC0 1.0 Universal.
- [World Bank WDI source catalogue](https://databank.worldbank.org/source/world-development-indicators)
- [World Bank dataset use terms](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets)

Every ZIP is reversible packaging of unmodified publisher download bytes. The USGS archive includes the complete 462,845-row CSV with every publication vintage, aggregate and historical country, together with publisher XML metadata and ScienceBase release metadata. WDI archives include the complete API response, original indicator metadata and country/aggregate classification metadata. Original byte lengths and SHA-256 checksums are in the source register.

- [wdi-AG.PRD.FOOD.XD.zip](/data/historical-sources/wdi-AG.PRD.FOOD.XD.zip)
- [wdi-AG.PRD.CROP.XD.zip](/data/historical-sources/wdi-AG.PRD.CROP.XD.zip)
- [wdi-AG.PRD.LVSK.XD.zip](/data/historical-sources/wdi-AG.PRD.LVSK.XD.zip)
- [wdi-AG.PRD.CREL.MT.zip](/data/historical-sources/wdi-AG.PRD.CREL.MT.zip)
- [wdi-AG.LND.CREL.HA.zip](/data/historical-sources/wdi-AG.LND.CREL.HA.zip)
- [wdi-AG.YLD.CREL.KG.zip](/data/historical-sources/wdi-AG.YLD.CREL.KG.zip)
- [wdi-AG.CON.FERT.ZS.zip](/data/historical-sources/wdi-AG.CON.FERT.ZS.zip)
- [wdi-AG.CON.FERT.PT.ZS.zip](/data/historical-sources/wdi-AG.CON.FERT.PT.ZS.zip)
- [wdi-EG.CFT.ACCS.RU.ZS.zip](/data/historical-sources/wdi-EG.CFT.ACCS.RU.ZS.zip)
- [wdi-EG.CFT.ACCS.UR.ZS.zip](/data/historical-sources/wdi-EG.CFT.ACCS.UR.ZS.zip)
- [wdi-EG.CFT.ACCS.ZS.zip](/data/historical-sources/wdi-EG.CFT.ACCS.ZS.zip)
- [wdi-EG.EGY.PRIM.PP.KD.zip](/data/historical-sources/wdi-EG.EGY.PRIM.PP.KD.zip)
- [wdi-EG.ELC.ACCS.RU.ZS.zip](/data/historical-sources/wdi-EG.ELC.ACCS.RU.ZS.zip)
- [wdi-EG.ELC.ACCS.UR.ZS.zip](/data/historical-sources/wdi-EG.ELC.ACCS.UR.ZS.zip)
- [wdi-EG.ELC.ACCS.ZS.zip](/data/historical-sources/wdi-EG.ELC.ACCS.ZS.zip)
- [wdi-EG.ELC.COAL.ZS.zip](/data/historical-sources/wdi-EG.ELC.COAL.ZS.zip)
- [wdi-EG.ELC.FOSL.ZS.zip](/data/historical-sources/wdi-EG.ELC.FOSL.ZS.zip)
- [wdi-EG.ELC.HYRO.ZS.zip](/data/historical-sources/wdi-EG.ELC.HYRO.ZS.zip)
- [wdi-EG.ELC.LOSS.ZS.zip](/data/historical-sources/wdi-EG.ELC.LOSS.ZS.zip)
- [wdi-EG.ELC.NGAS.ZS.zip](/data/historical-sources/wdi-EG.ELC.NGAS.ZS.zip)
- [wdi-EG.ELC.NUCL.ZS.zip](/data/historical-sources/wdi-EG.ELC.NUCL.ZS.zip)
- [wdi-EG.ELC.PETR.ZS.zip](/data/historical-sources/wdi-EG.ELC.PETR.ZS.zip)
- [wdi-EG.ELC.RNEW.ZS.zip](/data/historical-sources/wdi-EG.ELC.RNEW.ZS.zip)
- [wdi-EG.ELC.RNWX.KH.zip](/data/historical-sources/wdi-EG.ELC.RNWX.KH.zip)
- [wdi-EG.ELC.RNWX.ZS.zip](/data/historical-sources/wdi-EG.ELC.RNWX.ZS.zip)
- [wdi-EG.FEC.RNEW.ZS.zip](/data/historical-sources/wdi-EG.FEC.RNEW.ZS.zip)
- [wdi-EG.GDP.PUSE.KO.PP.zip](/data/historical-sources/wdi-EG.GDP.PUSE.KO.PP.zip)
- [wdi-EG.GDP.PUSE.KO.PP.KD.zip](/data/historical-sources/wdi-EG.GDP.PUSE.KO.PP.KD.zip)
- [wdi-EG.IMP.CONS.ZS.zip](/data/historical-sources/wdi-EG.IMP.CONS.ZS.zip)
- [wdi-EG.USE.COMM.CL.ZS.zip](/data/historical-sources/wdi-EG.USE.COMM.CL.ZS.zip)
- [wdi-EG.USE.COMM.FO.ZS.zip](/data/historical-sources/wdi-EG.USE.COMM.FO.ZS.zip)
- [wdi-EG.USE.COMM.GD.PP.KD.zip](/data/historical-sources/wdi-EG.USE.COMM.GD.PP.KD.zip)
- [wdi-EG.USE.CRNW.ZS.zip](/data/historical-sources/wdi-EG.USE.CRNW.ZS.zip)
- [wdi-EG.USE.ELEC.KH.PC.zip](/data/historical-sources/wdi-EG.USE.ELEC.KH.PC.zip)
- [wdi-EG.USE.PCAP.KG.OE.zip](/data/historical-sources/wdi-EG.USE.PCAP.KG.OE.zip)
- [usgs-world-production-1990-2022-all-vintages.zip](/data/historical-sources/usgs-world-production-1990-2022-all-vintages.zip)


## Earlier history extension — 1 November 2026

The preserved collections above now have additional earlier energy and material histories. See [Earlier energy and raw-material histories](/data/EARLY_HISTORIES.md) for country energy production from 1900, U.S. crude oil from 1859, USGS commodity histories from 1900, and separate sparse historical energy benchmarks from 1635. [Combined inventory and source checksums](/data/early-histories-manifest.json).
