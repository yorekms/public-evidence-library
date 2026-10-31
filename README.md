# Public Evidence Library

A read-only learning-first public companion linked to Civic Voice. The existing full research workbench and Civic Voice source/data are preserved separately.

The complete catalogue indexes7,811built-in measures in22collections. This public edition hosts290native measure views and104,483retained rows, including all original atlas, BEA, pension and fiscal histories, plus declared newer food/energy examples. Source files are in dist/data; source units/status/periods and selected-subset scope remain attached. No imported/user tables or participant records were included.

Open index.html through an HTTP server, not file://. Run tests with node --test tests/frontend_logic.test.cjs. The build is static, with no dependency installation or build step. .openai/hosting.json identifies the managed Sites deployment. The public app uses only staticGETrequests; optional notes stay in sessionStorage and download as explicitly unsubmitted private JSON.

Use scripts/build_public_data.py followed by scripts/add_original_public_collections.py with the current local registry running to reproduce source selection; review the declared paths/editions before rebuilding. Public source-fingerprint manifest: dist/data/snapshot-manifest.json. Full plan: LEARNING_AND_ECONOMIC_RESEARCH_PLAN.md. Local QA files are ignored by Git and are not published.
