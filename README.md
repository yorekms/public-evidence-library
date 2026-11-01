# Public Evidence Library

A read-only learning-first public companion linked to Civic Voice. The existing full research workbench and Civic Voice source/data are preserved separately.

The complete catalogue indexes7,811built-in measures in22collections. This public edition hosts290native measure views and104,483retained rows, including all original atlas, BEA, pension and fiscal histories, plus declared newer food/energy examples. Source files are in dist/data; source units/status/periods and selected-subset scope remain attached. No imported/user tables or participant records were included.

Open index.html through an HTTP server, not file://. Run tests with node --test tests/frontend_logic.test.cjs. The build is static, with no dependency installation or build step. .openai/hosting.json identifies the managed Sites deployment. The public app uses only staticGETrequests; optional notes stay in sessionStorage and download as explicitly unsubmitted private JSON.

Use scripts/build_public_data.py followed by scripts/add_original_public_collections.py with the current local registry running to reproduce source selection; review the declared paths/editions before rebuilding. Public source-fingerprint manifest: dist/data/snapshot-manifest.json. Full plan: LEARNING_AND_ECONOMIC_RESEARCH_PLAN.md. Local QA files are ignored by Git and are not published.


## Complete public collection and original 3D workspace

The complete retained source tree is preserved in `public-source/`. `dist/` is now generated Worker output, with unchanged public assets under `dist/client/`. Large `/full-data/` files are served from the managed R2 binding `BUCKET`, using an immutable SHA-256 allowlist. They are not pruned from the public collection or the preserved source tree.

Build the final read-only deployment with `python3 scripts/build_r2_release.py --mode final`. The bootstrap mode is solely for authenticated initial data ingestion; final releases compile ingestion off and have no upload secret. Existing public routes, the original 3D renderer, all previous data files, and source references are retained. Python-only analyses and media rendering remain available through the original local workbench links.

The full numerical export has 7,811 measures, 22 collections and 13,431,313 retained records. Its independent export and preservation receipts are in the adjacent `Public_Full_Explorer_2026-10-31/qa/` folder. `public-source/full-data/index.json` identifies every retained record part and checksum. Regeneration requires the original frozen source packs and the `ijson` Python package; legacy selected-subset builders are retained as history, not the full-data publication workflow.
