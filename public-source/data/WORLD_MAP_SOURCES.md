# World map geography and rendering sources

These maps reuse the retained research atlas's native country outlines. Geometry is a cartographic reference, not a new measurement or a claim about disputed boundaries.

- Source: **Natural Earth country geography** — https://www.naturalearthdata.com/
- Retained scale/vintage: **Frozen 1:110m country outlines**.
- Source note: Country outlines, not locations of individual mines, farms or households.
- Natural Earth cartographic data are public domain; retain source attribution. This status is recorded in the preserved atlas attribution guide.
- Retained geometry: 177 features, exact native ISO3 feature identifiers, native Polygon/MultiPolygon coordinates. No country identifier is inferred from a name.
- Atlas source SHA-256: `ea72f7c4607128953d7a7a81b671d389fb648e8953ba6a524442720e0d0b3aa8`.
- `world-geometry.json` SHA-256: `f69ff0ee1ac93a45660812b612fc020af287d8a1fbc7984ffe03f9ec0d6da4bb`.
- This coarse boundary file omits some small islands and reporting jurisdictions. Their measurements remain in source tables/selectors/downloads; lack of a polygon is not a zero or a missing source observation.

Rendering uses the already bundled **D3 v7.9.0**, copyright 2010–2023 Mike Bostock, under its retained [ISC license](../vendor/D3-LICENSE.txt). The original distribution header is preserved. A D3 ring-orientation adapter may reverse display copies of polygon rings for spherical projection; original geometry bytes and measurements remain unchanged.

Source observations retain their own reporting areas, units, native years/periods, estimates and eligibility flags. A country outline does not locate an individual mine, farm or household. A global-energy record labeled “Latest available; year varies” is not a synchronized common-year survey. Country totals and customs statistics do not by themselves describe a physical shipment route.

Three world wheat histories now include every retained country/economy row in those native measures, rather than their earlier named-country subset. This does not assert coverage for every country, every year or every food commodity. The complete catalogue and larger local source warehouse remain separately identified.
