# Essential consumption, household resources and source-aligned comparisons

This addition has two distinct purposes: estimate how much aggregate household income remains after selected consumption categories, and expose wider international food, housing, energy and healthcare evidence. Original source values, price bases, classifications, countries, years, flags and source coordinates remain available. All new estimates are labeled; unavailable cells stay unavailable.

## What enters the selected-category estimate

| Component | Source definition | Boundary |
| --- | --- | --- |
| Food | COICOP CP01: food and non-alcoholic beverages | Restaurant services are outside this category. |
| Housing excluding home energy | CP04 minus CP045, calculated from additive current-price amounts | Includes rent and imputed owner-occupied housing services, water and other housing services. Dwelling purchases and mortgage principal are outside consumption. |
| Home energy | CP045: electricity, gas and other home fuels | Included once; transport fuel is outside this category. |
| Healthcare consumption | CP06 in the household-consumption accounts | It is distinct from out-of-pocket healthcare and public/NPISH social transfers in kind. Source financing conventions matter. |
| Disposable household income | Household-only S14, B6G received for gross or B6N received for net | Direct taxes and transfers are already reflected. Gross/net here refer to consumption of fixed capital, not before/after income taxes. |
| Resident household consumption | S14 P3 paid | Covers resident households; it supplies the total to which domestic category shares are allocated. |

The basket is a documented selection, not a complete minimum-needs budget. Other consumption, household investment, saving, debt and distributional differences remain relevant. A national aggregate is not a median household cash balance. The earlier OECD equivalised median income and PIP daily per-person welfare measures retain different populations and denominators; they are not used in this subtraction.

## Domestic and resident consumption are different

Eurostat's consumption-purpose tables follow the domestic concept: purchases inside the territory include nonresidents and exclude residents' purchases abroad. Household disposable income and sector consumption follow residents. The interface therefore does not directly subtract domestic categories from resident income.

The central estimate makes a visible assumption: residents have the same category mix as domestic household consumption. Let D be total domestic household consumption, E the sum of selected nonoverlapping domestic categories, R resident household consumption and I the selected household disposable-income measure:

```text
selected domestic share = E / D
estimated resident essentials = R × E / D
estimated remaining resources = I − R × E / D
estimated remaining share (%) = 100 × (I − R × E / D) / I
```

All inputs must match country, reporting year, household-only S14 sector, additive current-million-EUR units and the applicable classification. Income accounting item and transaction direction are checked explicitly. Missing inputs, ambiguous rows, zero income, nonadditive chain-linked volumes, classification mismatches and an invalid category partition yield unavailable results. Negative remainders are retained rather than clamped to zero.

Housing uses CP04 − CP045. Selecting both housing and home energy therefore equals CP04, not CP04 plus energy again. This subtraction is permitted only for additive current-price/share units. Source chain-linked volume histories are retained in the full category module and are excluded from this calculation.

Amounts remain current million EUR, with their original source unit labels preserved. Same-year spending-to-income shares support comparisons of relative resource use; nominal monetary amounts retain their year-specific prices. No GDP deflator or household PPP factor is silently applied to these accounts.

For Germany in 2023, COICOP 2018 and gross disposable income, the retained inputs are:

| Input or result | Current million EUR |
| --- | ---: |
| Original household disposable income, I | 2,663,282 |
| Original resident household consumption, R | 2,215,130 |
| Original domestic household consumption total, D | 2,161,230 |
| Selected domestic categories, E | 888,767 |
| Estimated resident selected essentials | 910,932.4064 |
| Estimated remaining resources | 1,752,349.5936 |

The estimated remainder is 65.7966% of gross disposable household income, for all other consumption and saving under the allocation assumption. This is not an observation that each German household has that percentage of cash available.

## Conditional allocation ranges

Where source aggregates agree, separate travel flows constrain the unknown allocation of resident and nonresident purchases across categories. Let A be resident purchases abroad and F nonresident purchases on the domestic territory:

```text
resident total = domestic total + A − F
lower selected resident cost = max(0, E − F)
upper selected resident cost = min(R, E + A)
```

Remaining-resource bounds reverse these cost bounds. They are allocation constraints conditional on the recorded accounts, not confidence intervals, a distribution of household budgets, or a complete representation of source uncertainty.

The optional range is available only if the FCS domestic/national totals match the category/sector totals and its internal identity agrees within an absolute 1e−8 million EUR. This is a numerical identity check, not a revision adjustment or a statement of measurement precision. Every discrepancy remains in the source evidence. An incoherent bridge disables the range while retaining the explicitly assumed proportional point estimate.

Germany 2023 passes these strict checks and yields 63.4165%–67.8174% remaining. France 2023's recorded cross-table totals do not pass; its range is unavailable. Neither source is forced to balance.

## Coverage and classifications

Available source years span 2000–2025; completeness varies. COICOP means Classification of Individual Consumption According to Purpose. Its 2018 and 1999 editions are separate datasets.

| Classification / income basis | Default four-category point estimates | Economies with estimates | Strict allocation ranges |
| --- | ---: | ---: | ---: |
| COICOP 2018 / gross | 678 | 28 | 134 |
| COICOP 2018 / net | 678 | 28 | 134 |
| COICOP 1999 / gross | 668 | 30 | 39 |
| COICOP 1999 / net | 656 | 29 | 38 |

The curated packet has 1,976 country/year/classification ledgers across a source union of 38 economies. The full Eurostat category module retains 68 series and 61,880 records, including original current currencies, per-person amounts, published shares and source volume histories. The income module retains 34 series and 30,472 cells, including native-currency and combined-sector contexts. Only the documented S14 current-EUR inputs enter the allocation.

No nearest-year substitution, missing-year interpolation or classification stitching is performed. Connecting history lines stop at unavailable years and native break/definition-change flags; the original available points remain visible. Provisional or estimated flags remain attached. Sampling/statistical uncertainty intervals are not supplied in this packet.

## Wider global context and the United States

The separate global packet contains fourteen measures and 22,086 retained records:

- WHO/WDI out-of-pocket healthcare per person in current USD and current PPP international dollars, plus OOP as a share of total current health expenditure. Numerical coverage is 2000–2024 in 193 economies; native 2025 missing cells are retained.
- FAO/World Bank least-cost healthy-diet benchmarks in current PPP and original national currency, plus the published modeled unaffordability percentage. Numerical coverage spans 2017–2025: PPP diet costs in 167 economies, national-currency costs in 174 and unaffordability in 146.
- Four domestic category-share histories for U.S./Canada/UK COICOP 1999 and Japan COICOP 2018, kept as eight separate series. U.S. and Japanese source years are 2000–2024; Canada/UK are 2000–2025. There are 408 selected share observations, derived from 510 original category/total cells.

These global series have `residual_eligible=false`. They are not added to the four-category estimate or subtracted from PIP/OECD household income. Current PPP costs are not constant-2021 PPP welfare values. OOP's spending-share denominator is total current healthcare expenditure, not household income.

Healthy-diet costs are modeled least-cost benchmarks for a representative person at 2,330 kcal/day, not actual household food spending or an individual dietary prescription. The source's unaffordability series incorporates its own income/basic-nonfood model. Its retained long metadata definition contains an energy-sufficient/healthy-diet wording inconsistency; the selected-metric note and source guide flag it rather than silently resolving it.

For the U.S. in 2022, the source-derived domestic-consumption shares are approximately 6.8934% food, 16.3782% housing excluding home energy, 2.0136% home energy and 20.3352% healthcare purpose. These are shares of reported domestic household expenditure, not resident income or cash bills. National financing conventions are particularly important for the healthcare comparison. The U.S. income remainder remains unavailable in this release because a compatible resident-income source set has not been supplied.

## Research workflow

The local model panel follows the selected model country and year exactly. Original economic coefficients, nominal results, price-reporting views and earlier household datasets remain intact. Changing essentials controls does not calculate an industry demand scenario.

JSON evidence exports contain original ledgers and source coordinates, selected categories, gross/net basis, derived estimates, source-coherence residuals, histories, source packet hashes and copies of currently loaded original model baseline/scenario results. CSV history exports keep unavailable results and original-input JSON fields.

From the existing workbench folder:

```python
from workbench.essentials_costs import EssentialsCosts

e = EssentialsCosts('/absolute/path/to/current/workbench')
report = e.estimate('DEU', 2023, classification='COICOP 2018',
                    income_basis='gross',
                    selected_categories=['food', 'housing', 'energy', 'healthcare'])
panel = e.panel(['DEU', 'FRA'], [2020, 2021, 2022],
                classification='COICOP 2018', income_basis='gross')
attached = e.attach_to_model(original_economic_evidence)
```

The panel retains requested rows and missingness by default. `complete_cases=True` is an explicit optional filter with row accounting. Original model evidence is copied; the helper does not change coefficients, rerun an industry solve or infer a household causal effect.

```sh
python3 -m workbench.essentials_costs --data /absolute/path/to/budget.json --input /absolute/path/to/original-economic-evidence.json --output /absolute/path/to/new-essentials-evidence.json
```

The CLI refuses to overwrite an existing file. See `--help` for classification, income-basis and selected-category options. Global source records are available as JSON/CSV for additional designs; they retain their distinct denominators and price bases.

## Sources, originals and verification

Official source definitions: [Eurostat COICOP 2018 domestic consumption](https://ec.europa.eu/eurostat/cache/metadata/en/nama_10_cp18_esms.htm), [Eurostat sector accounts](https://ec.europa.eu/eurostat/databrowser/view/nasa_10_nf_tr/default/table?lang=en), [national/domestic household consumption bridge](https://ec.europa.eu/eurostat/databrowser/view/nama_10_fcs/default/table?lang=en), [OECD household consumption by purpose](https://data-explorer.oecd.org/), [WHO/WDI household out-of-pocket healthcare](https://data.worldbank.org/indicator/SH.XPD.OOPC.PC.CD), and [World Bank Food Prices for Nutrition](https://www.worldbank.org/en/programs/icp/brief/foodpricesfornutrition).

Original acquisition modules remain `categories_module.json`, `income_alignment/income_module.json`, `global_context/global_context_module.json` and `oecd_categories_probe.json`. The curated installed packets are `budget.json` and `global_context.json`; exact hashes are in their manifests. For raw global context references, `source_record_base=global_context` resolves the original module-relative file in the source ZIP; added OECD references use the ZIP root.

Independent receipts in `qa/` verify source bytes and fields, source-aligned extraction, the allocation arithmetic and source preservation. The combined audit recomputes all 59,280 nonempty category/basis/ledger combinations independently. These checks establish faithful implementation, not the empirical truth of the proportional-allocation assumption, precision of compiled source accounts or a validated causal economic model. Earlier editions, source archives and public comparison data are preserved.
