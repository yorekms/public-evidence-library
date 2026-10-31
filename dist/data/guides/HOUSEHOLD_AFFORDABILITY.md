# Household affordability: definitions, comparisons and research use

This supplement adds household income, consumption and consumer-price evidence to the existing public library and local economic models. Each measure retains its original source period, units, status, price basis and source references. The normalized packet is an additive supplement; the original numerical catalogue and source modules remain intact.

## What the measures mean

| Measure | Interpretation and denominator | Coverage with numerical values |
| --- | --- | --- |
| PIP median and mean household income | National survey income per person per day, already expressed by the World Bank in constant 2021 PPP international dollars. Income definitions retain source harmonization limits. | 1,161 survey reporting years in 70 economies, with two statistics per survey |
| PIP median and mean household consumption | National survey consumption per person per day, already expressed in constant 2021 PPP international dollars. Consumption and income remain separate welfare concepts. | 770 survey reporting years in 121 economies, with two statistics per survey |
| OECD median and mean disposable household income | Annual current-national-currency income per equivalent household member. The selected method divides household income by the square root of household size. Disposable income accounts for direct taxes, contributions and cash transfers according to the source definition. | 612 country-years in 45 economies, with two statistics per year |
| OECD income at national 2021 prices | The same original equivalised income rebased with the same country's CPI. This is a labeled analyst calculation, retaining the original currency. | 612 country-years in 45 economies, with two statistics per year |
| National-account household consumption per person at PPP | Published household and nonprofit-institution consumption total in constant 2021 international dollars, divided by same-year population. This is an average and includes national-account imputations such as owner-occupied housing services. | 4,025 values in 176 economies |
| Household-consumption price-level index | A broad national household-consumption price level relative to the United States, set to 100 in each year. This supports spatial price comparisons. | 4,853 values in 208 economies |
| National consumer price index (CPI) | Published CPI with 2010 = 100. Its change describes national consumer-price inflation; index levels do not rank countries by living costs. | 4,721 values in 192 economies |
| National CPI rebased to 2021 = 100 | A calculated within-country price index relative to that country's 2021 level. | 4,523 values in 178 economies |

The observed span is 2000–2025; available years vary by source and country. Missing values and missing survey years remain unavailable. These data do not provide a universal minimum-needs budget or a guarantee of what a particular household can purchase. A local budget also depends on household size, housing tenure, location, healthcare, public services, debt and the goods actually purchased.

## Price bases and exact calculations

**Published PPP survey welfare.** PIP's income and consumption estimates already use constant 2021 PPP. The interface copies the published mean and median without applying another inflation or PPP adjustment. Per-person daily values are kept in their original units; they are not relabeled as annual equivalised disposable income.

**National-account consumption per person.**

```text
consumption per person = published household/NPISH consumption total
                         in constant 2021 international dollars
                         / same-country, same-year population
```

Both source inputs and their exact row references are retained. A missing input or nonpositive population produces an unavailable calculated value. NPISH means nonprofit institutions serving households.

**Within-country disposable income at 2021 prices.**

```text
income in national 2021 prices = original current-national-currency income
                                 × national CPI(2021) / national CPI(income year)
```

This calculation uses the same country, original income reporting year and positive finite CPI indices. The original income and both CPI inputs, multiplier, base year, currency code and source references are retained. A national CPI is an approximation for the price change experienced by the represented income population; household-specific inflation can differ. Cross-country PPP conversion is not applied to these OECD income series.

**National CPI rebasing.** The calculation is `100 × national CPI(year) / national CPI(2021)`. A result of 110 describes a price level about 10% above that country's 2021 level. Different countries' rebased CPI levels describe their different inflation paths, not the relative cost of the same basket across countries.

**Spatial consumption price levels.** The published price-level index has the United States = 100 each year. A value of 80 indicates a broad price level around 20% below the U.S. reference in that year. The index combines PPP and exchange-rate information. Its temporal movement is a change in relative international price levels and exchange rates; national CPI remains the inflation measure. Published PPP histories may incorporate benchmark observations, annual Eurostat–OECD work, interpolation, extrapolation or imputation. Source methods and footnotes remain available.

## Survey dates, definitions and estimates

PIP is frozen at version `20260922_2021_01_02_PROD`. The selected data are national surveys with `estimation_type=survey`, `is_interpolated=false` and no local gap filling. Survey data may still use source estimation, grouped distributions or harmonization. The native integer `reporting_year` is used for country/year views, and the exact `survey_year` is displayed and exported. Tanzania's 2018 reporting record has survey year 2017.92; rounding that date would incorrectly change the source period.

PIP income and consumption remain separate. Comparability groups and spells are retained. Lines do not bridge missing years, duplicate cells or known comparability-group breaks; fractional survey dates remain actual points. The Python temporal comparison refuses a known or unresolved required comparability break.

The OECD selection uses `METH2012` and current definition `D_CUR` without stitching in older methods. The complete original CSV, including older definitions, is retained with an exclusion ledger. Currency codes, provisional/native status flags and source dimensions remain attached. Median and mean are separate; annual income per equivalent household member is distinct from survey income per person per day.

All survey and compiled national-account values have estimation limits. A blank native status field does not establish direct measurement. Sampling confidence intervals are not provided in this frozen aggregate packet; none are fabricated. Analysts should consider survey/source comparability and estimation uncertainty when specifying models.

## Use with the economic models

The local panel follows the selected model country and source year exactly. If a household measure is absent for that year, it displays unavailable rather than choosing a neighboring survey, regional average or GDP-per-person substitute. Existing original and common-dollar accounting results remain separate from household context.

The evidence download includes selected household histories, exact-year observations, native fields, definitions, adjustment inputs, source packet hash and copies of any loaded original model baseline/scenario. No source coefficient or industry solve is changed. Translating an industry demand change into household income, prices or distributional effects requires an explicit additional economic model and evidence.

For personal research, run Python from the current workbench folder:

```python
from workbench.household_affordability import HouseholdAffordability

h = HouseholdAffordability('/absolute/path/to/current/workbench')
context = h.context('USA', 2022)
comparison = h.compare('pip::income::median_2021ppp_daily', 'USA', 'CAN', 2022)
change = h.change('pip::income::median_2021ppp_daily', 'USA', 2020, 2022)
panel = h.model_panel(
    countries=['USA', 'CAN', 'MEX'], years=[2020, 2021, 2022],
    series_ids=['pip::income::median_2021ppp_daily', 'wdi::PA.NUS.PRVT.PLI'])
attached = h.attach_to_model(original_economic_evidence)
```

The panel retains every requested country/year and unavailable cell by default. `complete_cases=True` is an explicit optional filter and reports excluded rows. A panel is descriptive research input; regression, temporal correlation, Bayesian inference or causal estimation still requires a stated outcome, unit of analysis, design, uncertainty model and confounder strategy.

The command-line helper preserves the complete original economic evidence:

```sh
python3 -m workbench.household_affordability --data /absolute/path/to/household.json --input /absolute/path/to/original-economic-evidence.json --output /absolute/path/to/new-household-context-evidence.json
```

It refuses to overwrite an existing output file, including source packets and original evidence. Country and year default to the original model result, or can be specified explicitly with `--country` and `--year`.

## Sources and reproduction

Free official sources: [World Bank Poverty and Inequality Platform methodology](https://datanalytics.worldbank.org/PIP-Methodology/), [World Bank household consumption at constant PPP](https://data.worldbank.org/indicator/NE.CON.PRVT.PP.KD), [household-consumption price levels](https://data.worldbank.org/indicator/PA.NUS.PRVT.PLI), [national CPI](https://data.worldbank.org/indicator/FP.CPI.TOTL), and [OECD Income Distribution Database](https://www.oecd.org/en/data/datasets/income-and-wealth-distribution-database.html).

The retained source modules are `wdi_household_module.json` and `income_sources/income_packet.json`. The installed interface/research packet is `household.json`. The full WDI module also preserves current local-currency/USD consumption totals, published constant-2015-USD consumption per person, population, consumption PPP factors, official exchange rates and nominal per-person derivatives. Source index files record exact retrieval URLs, native response headers, hashes and versions. Acquisition and normalization scripts are in `scripts/` and `income_sources/`.

Independent readback receipts in `qa/` compare native values and source years with archived raw source bytes and recompute derived values independently of the builder. The public source ZIP includes the originals, metadata, source modules, selections, scripts and readback receipts. Earlier research collections, GDP/PPP data, model inputs, interfaces and release archives are retained.
