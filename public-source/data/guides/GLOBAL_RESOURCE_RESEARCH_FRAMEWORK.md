# A research framework for resources, control and economic outcomes

The long-term question is how material movement, organizational control and local consequences fit together in the world economy. Virginia is a useful place to inspect individual records, while global country and facility inventories provide a wider frame. The workbench should help define and test explanations; attractive maps alone cannot decide which economic model explains the observations.

This document is a research design and acquisition roadmap. Its proposed analyses are not results of this release. The implemented interfaces and verified source scope are described in the connected-impact guide (research-edition file), the pipeline guide (research-edition file) and the current release manifest.

## Keep three kinds of evidence connected and distinct

1. **Physical and reported reference records:** quantities, native units, source and destination roles, reporting stages, actual years, measurement flags and unknown destinations. A country trade record, a state distribution estimate and a named plant receipt are different observations.
2. **Organizations and reporting boundaries:** asset operator, reported equity owner, reported U.S. or foreign parent, accounting-consolidating parent, relationship share and actual observation date. These describe different institutional arrangements.
3. **Outcomes and models:** source environmental reporting, monetary industry accounts, local economic outcomes, and explicitly conditional calculations. A reported environmental quantity is an observation within a program population. An economic scenario is a model output under stated assumptions.

The architecture should preserve an inspectable evidence path from a plotted point to an identifier, a source row and the acquired file fingerprint. It should also show where that path stops. Matching place names, country membership, a shared company address or geographic proximity is insufficient to create a new shipment or ownership link.

GLEIF's Level 2 records concern accounting-consolidating parents, and its reporting exceptions have several possible meanings. The interface therefore retains those roles and exceptions instead of using a universal “controller” field. [GLEIF relationship definitions](https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-who-owns-whom), [GLEIF exceptions](https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-reporting-exceptions-2-1-format).

## A small set of answerable questions

| Research question | Measurement and comparison | Data/design still needed for a defensible result |
| --- | --- | --- |
| Where does a resource enter, change form, accumulate and leave? | Stage-specific production, input, output, trade and stock-change quantities in a documented material balance | Consistent commodity definitions, moisture/grade basis, conversion yields, waste, stocks, re-exports and geographic/time boundaries. Preserve an unexplained residual. |
| How concentrated is control at each stage? | Separately examine operators, equity owners and accounting parents, with coverage and unknown shares | A defined market and denominator; dated ownership shares; treatment of joint ventures; verified asset-to-parent paths. Source inventory counts are not market shares. |
| Do localities hosting extraction or processing receive the economic benefits? | Compare local wages, jobs, value added, taxes, infrastructure, household incomes and public services with local source reporting | Compatible local observations, commuting/household denominators, transfers, prices and a design separating resource effects from pre-existing regional differences. National industry value added cannot be assigned to a particular mine. |
| Which consumers depend on distant resource stages? | Partner shares, stage bottlenecks, import dependence, concentration and network substitution possibilities | More complete bilateral coverage, processing conversion, stockpiles and substitutability. A selected-exporter panel cannot represent all global trade. |
| Are reported environmental loads shifting between producer and consumer regions? | Separately measure production-based reporting and model-based consumption footprints | Compatible environmental extensions, trade/industry classifications, source years and reporting population. An imported tonne does not carry a measured emissions factor merely because a plant is mapped nearby. |
| Do changes in ownership or policy precede changes in resource outcomes? | Event histories, pre-trends and comparison units | Actual effective dates, enough pre/post periods, plausible comparison units, anticipation/spillover checks and reasons for treatment assignment. Correlation remains descriptive without identification. |
| Which economic model explains outcomes outside the period used to fit it? | Predeclared forecasts or comparative predictions against held-out outcomes | Competing models with genuinely different predictions, matching information sets, uncertainty, benchmarks and explicit failure criteria. An accounting identity is not an independent predictive test. |

## Follow stages without filling the gaps

A useful stage vocabulary is **extraction → preparation/refining → transport/trade → transformation → final use → waste/recovery**. These are research roles, not proof that every selected source contains all seven stages. A loadout, blending terminal or preparation facility must retain its reported role rather than automatically become an extraction mine. A customs partner is a reported trade counterpart rather than a verified final consumer.

For a Virginia coal example, inspect the state distribution ledger, the selected source-facility-to-plant receipts, and the separate Norfolk–Newport News customs records. Those sources support different views. They do not establish a complete mine-to-port-to-foreign-plant chain or a closed material balance. Link an individual source facility only when its identifier is present and supported. Keep missing stages and unresolved endpoints visible.

For chemicals and pharmaceuticals, chemical identity, reported manufacture/import, industrial use category, establishment registration, listed product and bilateral customs class should each retain its own meaning. A registered establishment is not proof that it made a particular ingredient in a given year, and a reported use association is not a customer shipment. Broader global tracing will require additional verified manufacturing and trade links.

## Time is part of the relationship

Record at least the physical reporting period, ownership observation or effective interval, environmental reporting year, crosswalk vintage, company-parent snapshot and download/revision date. A flow in 2024 can be viewed alongside 2023 environmental reporting, but that comparison must say “different years.” Choosing a 2026 ownership snapshot does not reconstruct 2024 ownership. An unavailable year stays unavailable.

Trend interpretation also requires consistent source populations. New reporters, changed thresholds, corrections and changed chemical coverage can alter source totals. A disappearance from an inventory can reflect reporting scope rather than closure or zero activity. Keep a stable-panel sensitivity analysis separate from a source-universe total.

## Environmental interpretation

The present U.S. environmental sources are reporting inventories. GHGRP direct-emitter records do not represent every source or a whole company's emissions, and TRI quantities alone do not determine exposure or health risk. Comparisons should retain the program population, chemical, release category and native unit. [EPA GHGRP scope](https://www.epa.gov/ghgreporting/what-ghgrp), [EPA TRI factors, revised 2025](https://www.epa.gov/system/files/documents/2025-09/factors-to-consider_fall-2025.pdf).

An emissions intensity needs a compatible numerator and denominator: the same reporting period and physical production boundary, a documented geographic/industry mapping, a defensible treatment of co-products, and transparent missingness. A many-to-many plant correspondence alone does not provide those conditions. No automatic facility intensity or owner-attributed environmental footprint is inferred by this release.

The 0.8 edition now acquires OECD's official 1995–2022 greenhouse-gas footprint accounts and origin allocations. These distinguish production, final demand and trade perspectives. The independent environmental extension did not reconcile sufficiently at country level with the retained economic model, so environmental demand simulation remains unavailable. Official descriptive accounts are usable; local exposure, climate damages and distributional incidence remain separate research needs. See the new global guide (research-edition file) and retained compatibility diagnostic. [OECD greenhouse-gas footprint indicators](https://www.oecd.org/en/data/datasets/greenhouse-gas-footprint-indicators.html).

## Use economic models as explicit, competing explanations

The retained **input–output accounting model** is implemented. Its demand response is

`Δx = (I − A)⁻¹ Δy`,

where `A` is the retained source-year monetary input-coefficient matrix, `Δy` is the specified final-demand change, and `Δx` is the conditional output response. It preserves the source's stated residual treatment. Country-industry value added can be propagated using its own source coefficients. The current model holds technology/input shares fixed; it does not solve substitution, prices, capacity limits, household behavior or employment. The acquired regular matrix has 80 economies plus a rest-of-world account, not facility-level transactions. [OECD ICIO definitions](https://www.oecd.org/en/data/datasets/inter-country-input-output-tables.html).

The following are **future analysis designs**, not additional fitted models in this release:

| Model family | A question it could address | What would distinguish its assessment from the present demand calculation? |
| --- | --- | --- |
| Capacity-constrained network or optimization model | Which stages bind under a disruption, and what feasible routes remain? | Explicit capacity, stocks, route and substitution constraints; compare predicted bottlenecks with observed disruptions. |
| Behavioral equilibrium model | How might prices, substitution, trade and welfare adjust? | Estimated or externally defended elasticities, market-clearing assumptions and household detail; sensitivity to those choices. |
| Dynamic or agent-based model | How do investment, inventories, firm decisions and networks change through time? | Calibrated decision rules and time dynamics; predict held-out adjustment paths, not only a fitted snapshot. |
| Econometric or quasi-experimental model | Did a particular policy, ownership change or shock cause an outcome? | A plausible identification strategy, confounder analysis, pre-trends, comparison units and uncertainty. |
| Environmentally extended input–output model | Which demand categories are associated with production emissions across borders? | Compatible industry environmental extensions and explicit producer/consumer allocation rules; validated units and residuals. |
| Distributional incidence model | Who receives income, bears costs or changes real purchasing power? | Household, labor, fiscal and price data, with transparent incidence assumptions and local coverage. |

A fair model assessment starts by declaring the outcome, unit of analysis, sample, information cutoff, benchmark, counterfactual, loss/fit measure and uncertainty method. Separate model calibration from validation, and compare models on the same held-out observations. Report where a model fails and whether conclusions change under plausible definitions or missing-data treatments. Do not rank broad economic ideologies using a single selected map.

## A reusable analysis record

For each project, save:

- The precise question, proposed mechanism and competing explanation.
- The observed outcome, denominator, geography and native time resolution.
- Source editions, original file hashes, exact joins and unresolved links.
- Inclusion/exclusion rules, reporting coverage, missingness and transformations.
- The model or descriptive comparison, equations and assumptions.
- The comparison/counterfactual and conditions needed for causal language.
- Prespecified validation, uncertainty and sensitivity checks.
- The figure, complete selected records, numerical result and limits of interpretation.

This gives global exploration a cumulative research structure: each new source increases the questions that can be tested without erasing earlier evidence or quietly turning a visual association into a conclusion.
