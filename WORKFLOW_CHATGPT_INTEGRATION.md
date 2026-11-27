# ChatGPT Research → Public Evidence Library Integration Workflow

**Updated:** 27 November 2026  
**Repository:** `/Users/yorek_mac/Documents/Public_Evidence_Library/Public_Learning_Library_2026-10-31`  
**GitHub (`origin`):** https://github.com/yorekms/public-evidence-library  
**ChatGPT Sites Target:** https://public-evidence-library-yorek.yorekms.chatgpt.site/ (`appgprj_6ae637e1f5988191a1330acb2d178649`)

---

## 1. Why ChatGPT Research Isn't Automatically Live on the Website

When you ask ChatGPT (or the macOS Codex app) to research new commodity sources, it saves verified deliverables in **two staging places** rather than directly editing this website checkout:

1. **Google Drive (`yorekms@gmail.com`):**
   - Research checkpoint Google Docs (e.g. `Public Evidence Library — world commodities progress and source register — 26 November 2026`)
   - Curated multi-tab Google Sheets workbooks (e.g. `Public Evidence Library — Chile, Argentina and DR Congo metal statistics, 2020–2025`)
   - Source `.zip` packets and reference `.pdf` maps/figures
2. **Local Codex Workspace (`~/Documents/Codex/YYYY-MM-DD/<chat-folder>/`):**
   - Python extraction scripts (`collect.py`, `argentina_comparison.py`, `customs_build.py`)
   - Unmodified source `.zip` archives with `manifest.json` / `checksums.sha256`

Meanwhile:
- **This Mac Git checkout + GitHub (`yorekms/public-evidence-library`)** holds the integrated website (`public-source/`), reproducible data builders (`scripts/`), automated source-integrity tests (`tests/`), and Cloudflare Worker/R2 release compiler (`scripts/build_r2_release.py`).
- **ChatGPT Sites (`https://public-evidence-library-yorek.yorekms.chatgpt.site/`)** remains pinned to whichever release (`v41`) was last published inside ChatGPT's Sites project (`appgprj_6ae637e1f5988191a1330acb2d178649`) until a new deployment bundle is uploaded there (or hosted directly via Cloudflare R2/Workers).

---

## 2. Repeatable 4-Step Integration Workflow

Whenever you run a new research session in ChatGPT:

### Step 1 — Stage Unmodified Source Packets into `public-source/data/`
- Copy ChatGPT's unmodified `.zip` source packets (including upstream URLs and SHA-256 manifests) and exported `.xlsx` workbooks into a versioned directory under `public-source/data/commodities/` or `public-source/data/commodity-flows/`.
- Keep every single file `<= 20 MB` so both standard GitHub Git (no Git LFS middleman) and Cloudflare Worker/R2 assets accept them cleanly.
- Large upstream bulk zips (such as `420 MB` FAOSTAT `Trade_DetailedTradeMatrix`) belong in `~/Documents/Public_Evidence_Library/source_cache/` (outside Git, never in ephemeral `/tmp`), while exact extracted slices and SHA-256 checksums are archived inside committed `.zip` files (`pink-sheet-sources.zip`, `faostat-production-sources.zip`, `comtrade-raw-sources.zip`).

### Step 2 — Run Reproducible Python Builders (`scripts/`)
All three commodity builders rebuild deterministically from committed source archives by default (zero network or `/tmp` dependency), and accept `--refresh-upstream` when you want to pull newer upstream vintages into `~/Documents/Public_Evidence_Library/source_cache/`:

```sh
cd ~/Documents/Public_Evidence_Library/Public_Learning_Library_2026-10-31

# 1. World Bank Pink Sheet (1960–2026) + 27 FAOSTAT country production series
~/Documents/Public_Evidence_Library/.venv/bin/python scripts/build_pink_sheet_and_production.py

# 2. 10 multi-year global bilateral commodity flow bundles (2020–2024)
~/Documents/Public_Evidence_Library/.venv/bin/python scripts/build_international_commodity_flows.py

# 3. 2020–2025 Critical Metals & Border-Reporting Register + 3 lithium flow bundles
~/Documents/Public_Evidence_Library/.venv/bin/python scripts/build_critical_metals_register.py
```

### Step 3 — Enforce Non-Imputation & Source-Integrity Checks
Every new dataset integrated from ChatGPT research must pass five non-negotiable checks in `tests/`:
1. **`Missing != 0`:** Publisher dashes (`-`), ellipses (`…`), and statistical secrecy symbols (`s`) stay `null`, never `0` or interpolated.
2. **Partial sub-annual series stay partial:** e.g. Argentina's `7/12` disclosed months in `2023` never become a fabricated annual national total.
3. **Separate mass bases never sum:** e.g. Chile's lithium carbonate product weight (`250,605 t`) and elemental `Li` content (`47,114 t Li`) are never added.
4. **Separate reporting borders never sum:** Exporter-reported and foreign importer-reported customs weights appear as distinct selectable `metrics`, never combined edges.
5. **Unallocated confidential pools stay unmapped:** e.g. INDEC code `999` reconciles national export totals to `0.001 kg` while keeping `map_eligible: false` so no fake geographic pin or arc is drawn.

Run the full verification suite:
```sh
node --test tests/*.test.cjs
~/Documents/Public_Evidence_Library/.venv/bin/python -m unittest discover -s tests -p "test_*.py" -v
~/Documents/Public_Evidence_Library/.venv/bin/python scripts/build_r2_release.py --mode final
```

### Step 4 — Commit, Push to GitHub, and Publish
1. Push to GitHub (`git push origin main`).
2. Preview locally at `http://127.0.0.1:8088/commodities.html?lens=metals-audit` and `http://127.0.0.1:8088/workbench/pipelines.html?collection=trade_lithium_arg_chl_perspectives`.
3. To update the public `chatgpt.site` URL (`appgprj_6ae637e1f5988191a1330acb2d178649`), point ChatGPT in that Sites project to `https://github.com/yorekms/public-evidence-library` (`main` branch) and ask it to pull the latest commits from `public-source/` and publish `v42` (or deploy `dist/` directly to your own Cloudflare R2 + Worker).
