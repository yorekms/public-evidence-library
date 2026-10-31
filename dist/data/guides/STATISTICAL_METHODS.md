# Statistical methods and interpretation boundaries

This first version provides transparent **association analysis**: Pearson and Spearman correlation, a one-explanatory-variable linear regression with an intercept, and an analytical Bayesian linear regression. It does not decide which economic, social or anthropological explanation is true. The question, included observations, source definitions, alignment, transformations, statistical assumptions and uncertainty must be assessed together.

The implementation is `workbench/models.py`; its public entry point is `analyze(records, request)`. The function reads normalized records in memory and returns JSON-compatible numerical results. It does not fetch data, read arbitrary files, save results, alter source observations or contact a service. Non-finite computed diagnostics become `null`, never invalid JSON or an invented zero.

## Units of observation and exact alignment

Each source record identifies a series, native place/unit identifier, scope, source year, reporting-period label, numeric value or missingness, unit and source/status fields. Two series must share a native scope. A state figure cannot be joined to a county or plan figure simply because their identifiers happen to match. All records within each selected series must also have one declared unit and scope.

Cross-section mode selects one common numeric year and joins by the native unit identifier. If exactly one common year exists, an omitted year may be resolved to that year; multiple common years require an explicit choice. Distinct source years are not paired implicitly. An explicitly undated cross-section is allowed only when both series lack numeric year labels and each has one reporting-period label; it is labelled undated and makes no matched-year claim. Numeric year equality does not ensure identical fiscal calendars, survey windows, populations or upstream revisions. Those source definitions remain necessary to interpretation.

Annual time-series mode selects **one native unit**, joins by actual integer calendar-year keys, and does not pool multiple places. The supported nonnegative lag is zero to five years. A lag of `L` pairs `x(t−L)` with `y(t)`. It never shifts by the previous available row: missing 2012 does not make 2011 a one-year predecessor of 2013.

First differences are available only in annual time-series mode. They use `x(t−L)−x(t−L−1)` and `y(t)−y(t−1)` only when both complete paired years exist. Gaps are not interpolated, annualized or treated as consecutive. The transformed unit is explicitly a one-calendar-year change, not a percentage growth rate. A difference in a regional price index is not automatically local inflation.

Duplicate place/year records raise a readable error. The engine does not sum, average, choose the latest row or collapse duplicate tiers behind the user's back. Missing/non-finite values are excluded by complete-case rules; published zero remains zero. The registry may separately mark source values ineligible for modeling while retaining their original/raw representation.

Sample accounting includes original selected row counts, finite counts, common keys, complete pairs before transformation, unmatched keys on each side, missing matched pairs, and differencing losses. `candidate_key_count` is the union of native-unit/year keys present on either side after alignment. `excluded` is that union minus final modeled pairs; the reason counts expose why observations were excluded.

## Correlation

Both variables must vary. Correlation requires at least three complete pairs. Pearson's product-moment correlation and its two-sided null p-value come from SciPy. With at least four pairs, the engine supplies a 95% Fisher-transformation interval using `atanh(r) ± 1.95996 / sqrt(n−3)` and transforms the endpoints back with `tanh`. This is an independent-pair approximation; at three pairs, the interval remains unavailable. A perfect retained linear relation has the limiting interval at its correlation endpoint, without implying that the source data or model are validated.

Spearman's rank correlation and its two-sided approximate p-value come from SciPy. **A Pearson Fisher interval is not reused as a Spearman interval.** SciPy cautions that its asymptotic Spearman p-value is accurate only for very large samples and suggests permutation methods for smaller samples. This release displays that limitation; it does not invent a permutation design that assumes geographic or serial exchangeability. Rank correlation can describe a monotonic association even when a straight-line model is inappropriate.

Correlation p-values do not give the probability that a null hypothesis is true. Temporal correlation summaries do not adjust their p-values or Fisher intervals for autocorrelation. A common trend, revisions, source construction or omitted variables can produce a strong association without the hypothesized relationship.

References: [SciPy Pearson correlation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html), [SciPy Spearman correlation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html).

## Frequentist linear regression

The model is `y = intercept + slope × x + residual`. It requires at least five complete pairs and nonconstant x and y. Numerical fitting uses sample-centered/scaled x and y; coefficients, covariance and fitted bands are then transformed back to the original source units. This avoids poor numerical conditioning when, for example, x is a large currency total. Standardization here does not change the underlying ordinary least-squares association.

For cross-sections, statsmodels supplies **HC3 heteroskedasticity-robust covariance**. For consecutive annual time series, it supplies **Bartlett-kernel HAC covariance**, with the finite-sample covariance correction enabled. The maximum lag is `min(10, n−3, max(1, floor(4(n/100)^(2/9))))`; it is retained in the result. Coefficient tests and 95% intervals use a t reference with `n−2` degrees of freedom. These are approximate robust intervals, particularly with small n.

HAC assumes a correctly ordered equally spaced retained series. This release **rejects a HAC regression with gaps among retained years** instead of silently treating adjacent available rows as adjacent calendar years. Correlation and the explicitly independent-error Bayesian model may still describe gapped pairs, with limitations shown. A later calendar-aware or explicit dynamic model would require an additional reviewed method.

The fitted line is displayed only across the observed x range. Its band is a confidence band for the fitted mean. The engine does not label a residual-variance plug-in band as a heteroskedasticity/HAC-robust future-observation prediction interval. If x=0 lies outside the observed range, the intercept is labelled as an extrapolated model parameter rather than an observed baseline.

HC3 does not account for spatial clustering, shared investment pools, errors in x, survey-design uncertainty, endogeneity or source-model uncertainty. HAC covariance does not turn a levels regression into a stationary dynamic model. Included source point estimates are not weighted by their published margins of error, and their source uncertainty is not propagated through this regression.

Reference: [statsmodels robust covariance options](https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.RegressionResults.get_robustcov_results.html).

## Analytical Bayesian linear regression

This is a conjugate two-coefficient **Normal–Inverse-Gamma** model, not an MCMC sampler or a hierarchical, spatial, autoregressive or causal model. Its likelihood assumes independent Gaussian residuals with one common unknown variance. A Bayesian label does not remove the need to assess these assumptions.

Using complete-case sample means and sample standard deviations (`ddof=1`), define `z_x=(x−mean_x)/sd_x` and `z_y=(y−mean_y)/sd_y`. Let `X` have an intercept column and a `z_x` column. The prior is:

- `z_y | beta, sigma² ~ Normal(X beta, sigma² I)`.
- `beta | sigma² ~ Normal(m0, sigma² V0)`.
- `sigma² ~ InverseGamma(a0, b0)` with **shape** `a0` and **scale** `b0`.
- `m0=[0, mean]`, so the configurable `mean` is the standardized slope prior mean; the standardized intercept prior mean is zero.
- `V0=scale² I`. The configurable coefficient `scale` is conditional on residual standard deviation; it is not an unconditional raw-dollar standard deviation.

Defaults are slope mean0, coefficient scale10, inverse-gamma shape2 and scale2. All four parameters are retained in the output. Unsupported prior fields and nonpositive/non-finite scales are rejected. Priors are defined **after sample standardization**: changing the retained sample changes the prior induced in original source units. Users seeking a fixed scientific prior in raw units need a future explicit raw-unit-prior interface.

Writing `Lambda0=V0⁻¹`, the posterior parameters are:

`Lambda_n = Lambda0 + X'X`

`V_n = Lambda_n⁻¹`

`m_n = V_n (Lambda0 m0 + X'z_y)`

`a_n = a0 + n/2`

`b_n = b0 + ((z_y−X m_n)'(z_y−X m_n) + (m_n−m0)' Lambda0 (m_n−m0))/2`.

The final expression is the equivalent residual/prior-error form, used to reduce cancellation. Marginal coefficients are Student t with `2a_n` degrees of freedom, center `m_n`, and scale matrix `(b_n/a_n)V_n`. The engine applies the full affine transformation—including intercept/slope covariance—to return coefficients and 95% credible intervals in original units.

For a design row `g`, the posterior mean-response scale squared is `(b_n/a_n) g V_n g'`. The posterior predictive scale squared adds residual observation variation: `(b_n/a_n)(1 + g V_n g')`. Both use Student-t quantiles and are transformed back to y's original units. **Mean credible bands and observation predictive bands have different labels.** Neither is a future guarantee, especially when sampling or temporal assumptions fail. The plotted grid remains inside the observed x range.

The output also retains posterior parameters, transformations, an illustrative prior-predictive interval at mean x, and the fraction of training observations inside their own fitted 95% posterior predictive bands. This last quantity is an **in-sample descriptive check**, not held-out accuracy, calibrated predictive coverage, or a posterior-predictive p-value.

References: [Author's posterior derivation in The Book of Statistical Proofs](https://statproofbook.github.io/P/blr-post.html), [Kevin Murphy's Gaussian conjugacy technical report](https://www.cs.ubc.ca/~murphyk/Papers/bayesGauss.pdf).

## Diagnostics, reproducibility and what remains unimplemented

Regression results include original points, fitted values, residuals, in-sample RMSE and MAE, maximum absolute residual, residual sums of squares and R². For consecutive annual residual series, the engine reports Durbin–Watson and, when defined, lag-one residual correlation. At n≥10, an exploratory Ljung–Box statistic is added at `min(5,max(1,n//5))` lags. It uses `model_df=0` and is explicitly not claimed to have established finite-sample calibration after this regression. Gapped annual series are not fed to row-adjacency annual autocorrelation diagnostics.

R² describes in-sample association. It is not the proportion of a social outcome caused by x. A small p-value, large coefficient, narrow interval or strong posterior belief cannot establish causal direction. Selection, missingness, common causes, common trends, measurement definitions, revisions and the decision to try many comparisons remain part of the analysis. A temporal lag alone is not a causal identification strategy.

The first version does not supply panel fixed/random effects, cluster/spatial covariance, unit-root/cointegration tests, seasonal/monthly models, automatic lag selection, causal identification, multivariable regression, measurement-error models, automated Bayesian prior selection, MCMC, or out-of-sample forecasting. These are deliberate method boundaries visible in the saved analysis settings and notes.

All routines are deterministic; there is no hidden random sampling, optimizer seed or model-selection search in this engine. Source data, question, sample accounting, transformations, priors, fitting covariance and interval types should travel with any exported figure or analysis record. No multiple-testing correction is silently applied. An analyst should distinguish a question specified before inspecting the data from exploratory comparisons selected afterward.

Diagnostic references: [statsmodels Durbin–Watson](https://www.statsmodels.org/stable/generated/statsmodels.stats.stattools.durbin_watson.html), [statsmodels Ljung–Box](https://www.statsmodels.org/stable/generated/statsmodels.stats.diagnostic.acorr_ljungbox.html).

## Bounded verification

`python3 -m unittest discover -s tests -p test_models.py -v` exercises21 focused cases. They include a known slope/intercept, an independently computed HC3 sandwich covariance, a hand-derived orthogonal conjugate posterior, credible versus predictive widths, prior sensitivity, raw-unit scaling, exact lag keys with missing years, consecutive-year differences, source-unit/scope/duplicate rejection, complete-case accounting with a genuine zero, strict JSON, nonmutation of inputs and invalid priors.

These tests establish the implemented formulas and guards in the tested Python stack. They do not validate the scientific interpretation of a particular public-data question, other operating systems, the application UI, or any unimplemented model family.
