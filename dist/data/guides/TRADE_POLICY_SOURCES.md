# Government conditions and observed trade: source guide

This edition adds country/economy policy context to the commodity-flow workbench. It preserves source definitions, dates, original values, uncertainty and missingness. It does not estimate a government policy's causal effect on a shipment, infer who ultimately benefits, or convert a country tariff average into a product price increase.

The frozen source acquisition date is **30 October 2026**. The installed collection contains **161,376 source country/year rows**, including publisher missing values; **13 metric choices**; **662 WTO agreement references**, **359 separately reported agreement changes**, **3,886 typed agreement date events**, and **2,419 unique quantitative-restriction number/version references**. The 244 jurisdiction references include economies, territories, historical source territories and named trade blocs. This count is not a count of sovereign countries, complete measurement coverage, or areas that necessarily have a map polygon.

## Measured series

| Choice | Source identifier | Actual published periods retained | Countries/economies with at least one numeric source value |
|---|---|---|---:|
| Applied, import-weighted tariff average: all products | TM.TAX.MRCH.WM.AR.ZS | 1988–2022 | 189 |
| Applied, simple tariff average: all products | TM.TAX.MRCH.SM.AR.ZS | 1988–2022 | 189 |
| MFN, import-weighted tariff average: all products | TM.TAX.MRCH.WM.FN.ZS | 1988–2022 | 189 |
| MFN, simple tariff average: all products | TM.TAX.MRCH.SM.FN.ZS | 1988–2022 | 190 |
| Applied, import-weighted tariff average: manufactured products | TM.TAX.MANF.WM.AR.ZS | 1988–2022 | 189 |
| Applied, import-weighted tariff average: primary products | TM.TAX.TCOM.WM.AR.ZS | 1988–2022 | 189 |
| Bound, simple tariff average | TM.TAX.MRCH.BR.ZS | 1995–2022 | 161 |
| Tariff binding coverage | TM.TAX.MRCH.BC.ZS | 1995–2022 | 162 |
| Merchandise imports, current USD | TM.VAL.MRCH.CD.WT | 1960–2025 | 208 |
| Merchandise exports, current USD | TX.VAL.MRCH.CD.WT | 1960–2025 | 208 |
| Government effectiveness: absolute score | GOV_WGI_GE.SC, World Bank API source 3 | 1996–2025: 27 actual periods | 214 |
| Regulatory quality: absolute score | GOV_WGI_RQ.SC, World Bank API source 3 | 1996–2025: 27 actual periods | 214 |
| Political stability: absolute score | GOV_WGI_PV.SC, World Bank API source 3 | 1996–2025: 27 actual periods | 216 |

These are each series' available periods across all source jurisdictions, not a promise that every country is measured in every period. The API publishes an exact `years` list per metric. WGI has 1996, 1998, 2000 and annual data from 2002 onward; missing intervening early years are not generated. A missing selected year returns unavailable, never a nearest-year value. Genuine zero values remain zero. Tariff/nominal-trade legends have one fixed source-wide domain per metric; WGI uses 0–100.

## Tariff concepts and the observed trade outcomes

The World Bank WDI downloads retain each indicator's official metadata, underlying source organization, country identifier, decimal precision, observation status, footnote and source update date. Tariffs remain in percent; import/export values remain in current U.S. dollars. [World Bank weighted-applied tariff metadata](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/TM.TAX.MRCH.WM.AR.ZS/~/home), [World Bank merchandise imports](https://data.worldbank.org/indicator/TM.VAL.MRCH.CD.WT), [World Bank merchandise exports](https://data.worldbank.org/indicator/TX.VAL.MRCH.CD.WT).

An applied tariff average, most-favoured-nation (MFN) average, legal binding average and binding coverage answer different questions. MFN is the standard non-discriminatory tariff concept; a bound tariff is a committed ceiling rather than the rate necessarily charged. Binding coverage is a share of lines with commitments, not a tariff rate. Import weighting also changes when the product mix changes. Coverage and valuation differences can affect annual comparisons. These aggregates cannot establish the rate for coal, a pharmaceutical molecule, a particular partner, a company, or an individual shipment. The source's effective-applied tariff definition can use MFN where applied information is unavailable; its metadata also describes conversion of specific duties where possible.

Trade outcomes are separately observed merchandise values. They are affected by prices, exchange rates, coverage and many possible economic conditions. Their presence beside policy data does not identify a policy response or a causal mechanism. U.S. national policy context can accompany a Virginia flow; no Virginia tariff, treaty or governance score is fabricated.

## Explicit unresolved source conflict: U.S. 2019 applied tariffs

The World Bank WDI source reports **13.78% weighted-applied** and **8.7% simple-applied** for the United States in 2019. The weighted cell was independently read in the all-country JSON, individual country/year JSON and official bulk CSV. The official [WITS United States 2019 summary](https://wits.worldbank.org/CountryProfile/en/Country/USA/Year/2019/Summarytext) reports **1.58 weighted** and **2.94 simple**. The extraction does not resolve the methodology/vintage discrepancy.

Both WDI original values remain available in `reported_value` and in the immutable original downloads. Both points have `eligible:false`, `value:null`, `plot_value:null`, the flag `unresolved_cross_source_discrepancy`, a visible explanation and the independent WITS reference. Maps and history lines leave a gap; neither source replaces the other. This is a point-level quarantine, not an assertion that every other cross-source cell has been adjudicated.

## Governance uncertainty and source vintage

All three governance choices use the **WGI 2026 update**, World Bank API source 3, with a source update of 25 September 2026. This vintage recalculates the historical series back to 1996. It supplies absolute 0–100 scores alongside governance estimates in statistical units. [WGI current source and usage advisory](https://www.worldbank.org/en/publication/worldwide-governance-indicators), [WGI methodology and uncertainty](https://www.worldbank.org/en/publication/worldwide-governance-indicators/documentation), [WGI time-series FAQ](https://www.worldbank.org/en/publication/worldwide-governance-indicators/frequently-asked-questions).

The workbench retains the published 90% score interval, the separately published statistical-unit estimate and its standard error, and the number of sources. It never treats the statistical-unit standard error as score points. WGI summarizes perceptions from surveys and expert assessments; changing sources and uncertainty constrain small comparisons. It is contextual evidence, not a definitive government rating, direct trade restriction or causal impact estimate. Older percentile-rank series are not mixed into this score series.

Nine source jurisdictions have blank publisher code fields. Their exact source names are explicitly matched through a reviewed name reference, with the original blank identifiers and literal source names retained. They remain separate observations. Unknown identities would receive explicit unresolved source keys, not a guessed map location.

## WTO regional trade agreements

The source is the public [WTO all-agreement XLSX export](https://rtais.wto.org/UI/ExportAllRTAList.aspx), linked from the [WTO RTA dataset](https://data.wto.org/en/dataset/ext_rta). Both workbook sheets, every nonblank row and original field are retained. Signature, notification, goods/services entry into force, inactive dates and change events are typed separately. A source date of 9999 is treated as an unknown placeholder, not an actual event.

For example, the USMCA record retains its signature of 30 November 2018, notification of 16 September 2020, and goods/services entry of 1 July 2020. General agreement dates may differ from a particular party's entry date. The specific entry/exit and change fields remain inspectable.

Original/current signatory lists are document associations. The workbench does not expand the EU or other named blocs into their current members, backcast present membership, count every notification as a separate intervention, or reconstruct a complete historical bilateral legal regime from a current list. The historical Yugoslavia source name remains explicitly unresolved. A shared party-list reference on a flow is not proof of a preferential product rate.

## WTO quantitative restrictions, product and partner scope

The source is the actual public, unfiltered **Export QRs** workbook from the [WTO QR portal](https://qr.wto.org/en/qrs), described by the [WTO QR dataset](https://data.wto.org/dataset/ext_qr). No account or API key was used. The reusable download script executes the same anonymous public export action as the website. The original XLSX is retained byte-for-byte, and a second successful public download was compared row-for-row.

The export has 2,419 unique QR number/version references from **62 named reporting jurisdictions**, not complete worldwide restriction coverage. Source measure codes, legal text, responsible agencies, exact HS version, product lines, affected/non-affected partner text, notification symbols, and in-force/end fields are preserved. Suffix X identifies export-side codes; other reported restriction codes describe imports, with the source's voluntary-export-restraint category retained as export-side context. The [WTO notification instructions](https://qr.wto.org/en/how-to-notify) define those categories and explain the excluded measure families.

The workbook does not supply a separate notification date; it remains null. A notification symbol does not become a fabricated date. Its in-force/end fields are source reporting intervals, not automatically the first enactment or final legal termination. An open end is only an open reference at the acquired snapshot. Queries never extend it past that snapshot. Blank or missing references do not mean there are no restrictions.

QR source coverage excludes other government instruments, including SPS/TBT measures, automatic licensing, tariff-rate quotas and export taxes. This collection also does not supply a complete sanctions, subsidy, investment-screening, export-control or customs-administration ledger. No synthetic all-policy score fills those gaps.

The flow overlay uses exact country identifiers and source-reported direction only: import context belongs to the destination, export context to the origin. It deliberately does not claim an exact product/partner match. A later product test must establish the HS revision and compatible product code, conditions, partner exceptions, relevant date and legal text. Physical trade geography by itself does not establish legal applicability.

## Reproducibility and tested limits

Original downloads, SHA-256 receipts, normalization, excluded aggregate references and independent readback are in the sibling folder `Ridgeway_Global_Trade_Policy_2026-10-30`. `START_HERE.md` gives rebuild commands. Installed `data/trade_policy/manifest.json` fingerprints the installed bundle and its 45 actual source dependencies.

`qa/TRADE_POLICY_ACTUAL_SOURCE_REVIEW.json` records reconciliation of every retained WDI cell, every WGI score and all companion uncertainty fields, all RTA/change raw fields and events, every QR raw record, the independent U.S. 2019 discrepancy checks, and byte-identical installation. `tests/test_trade_policy.py` checks source boundaries, direction, missingness, fixed concepts, temporal separation, source cutoff and tampering. These checks establish faithful extraction and behavior within that scope; they do not establish publisher completeness, legal applicability, economic causality or frontend quality.

World Bank attribution and its CC BY 4.0 terms are retained. WTO material retains WTO attribution and applicable copyright/permissions; it is not relicensed under the software's license. No paid data, account creation or acceptance of a separate agreement was used.
