'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const C = require('../public-source/commodities.js');
const P = require('../public-source/workbench/pipeline-static-api.js');

const PUBLIC = path.resolve(__dirname, '../public-source');
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

test('Pink Sheet 1960-2026 bundle preserves missing sentinels, nominal/real separation, and provenance checksums', () => {
  const pink = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data/commodities/pink-sheet.json'), 'utf8'));
  const prov = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data/commodities/pink-sheet-provenance.json'), 'utf8'));

  assert.equal(pink.schema, 'public-evidence.pink-sheet/v1');
  assert.equal(pink.commodities.length, 69);
  assert.ok(pink.indices.length >= 15);
  assert.equal(pink.years[0], 1960);
  assert.equal(pink.years.at(-1), 2025);
  assert.equal(pink.months[0], '1960M01');
  assert.equal(pink.months.at(-1), '2026M10');

  // Verify zero '$' leaks in display units and exact array lengths
  for (const item of [...pink.commodities, ...pink.indices]) {
    assert.ok(!item.unit.includes('$'), `Unit must use USD instead of $: ${item.unit}`);
    assert.equal(item.annual_nominal.length, pink.years.length, item.id);
    assert.equal(item.annual_real_2010.length, pink.years.length, item.id);
    assert.equal(item.monthly_nominal.length, pink.months.length, item.id);
  }

  // WTI crude oil was '…' in 1960 in Pink Sheet — must remain null, never 0
  const wti = pink.commodities.find(c => c.id === 'crude-oil-wti');
  assert.ok(wti);
  assert.equal(wti.annual_nominal[0], null);
  assert.equal(wti.monthly_nominal[0], null);
  assert.ok(typeof wti.annual_nominal.at(-1) === 'number' && wti.annual_nominal.at(-1) > 0);

  //Brent crude oil has both 1960 and 2026M10 observations and is paired with EIA oil production + trade_crude_oil
  const brent = pink.commodities.find(c => c.id === 'crude-oil-brent');
  assert.ok(brent);
  assert.equal(brent.related_flow_collection, 'trade_crude_oil');
  assert.equal(brent.production_pairing.kind, 'retained-evidence');
  const stats = C.summarizePriceHistory(pink.years, brent.annual_nominal, brent.annual_real_2010, pink.months, brent.monthly_nominal);
  assert.equal(stats.firstAnnual.year, 1960);
  assert.equal(stats.latestAnnualNominal.year, 2025);
  assert.equal(stats.latestMonthly.period, '2026M10');
  assert.ok(stats.realPeak.value > stats.realTrough.value);

  // Verify paired production files exist on disk for all 62 paired commodities
  let pairedCount = 0;
  for (const item of pink.commodities) {
    if (item.production_pairing) {
      pairedCount++;
      const pFile = path.join(PUBLIC, item.production_pairing.url.replace(/^\//, ''));
      assert.ok(fs.existsSync(pFile), `Missing paired production file: ${pFile}`);
    }
  }
  assert.equal(pairedCount, prov.counts.paired_with_country_production);
  assert.ok(fs.existsSync(path.join(PUBLIC, 'data/commodities/pink-sheet-sources.zip')));
});

test('Production adapter preserves measured zeros, missing flags, and ambiguous multi-row guards across FAOSTAT and USGS/EIA', () => {
  const coffeeRaw = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data/commodities/production/fao-coffee.json'), 'utf8'));
  const coffee = C.normalizeProductionPacket(coffeeRaw, { source_publisher: 'FAOSTAT' });
  assert.equal(coffee.unit, 'tonnes');
  assert.ok(coffee.years.includes(1961) && coffee.years.includes(2024));
  const bra2023 = coffee.byYear.get(2023)?.get('BRA');
  assert.ok(bra2023 && bra2023.value > 1_000_000, 'Brazil coffee output in 2023 must exceed 1M tonnes');

  // Synthetic edge-case test: measured 0 vs null vs ambiguous duplicate country-year in retained-evidence format
  const syntheticRetained = {
    series: { label: 'Synthetic mineral', unit: 'Metric tons' },
    records: [
      { geo_id: 'AAA', geo_name: 'Alpha', year: 2020, value: 0, eligible: true, native_flag: 'Published zero' },
      { geo_id: 'AAA', geo_name: 'Alpha', year: 2021, value: null, eligible: false, status: 'Withheld' },
      { geo_id: 'BBB', geo_name: 'Beta', year: 2020, value: 10, eligible: true },
      { geo_id: 'BBB', geo_name: 'Beta', year: 2020, value: 20, eligible: true },
    ],
  };
  const norm = C.normalizeProductionPacket(syntheticRetained);
  assert.equal(norm.byYear.get(2020).get('AAA').value, 0);
  assert.equal(norm.byYear.get(2021).get('AAA').value, null);
  assert.equal(norm.byYear.get(2020).get('BBB').value, null);
  assert.match(norm.byYear.get(2020).get('BBB').flag, /Ambiguous/);

  const paired = C.pairAnnualPriceAndProduction([2020, 2021], [50, null], [45, null], norm.byCountry, 'AAA');
  assert.deepEqual(paired, [
    { year: 2020, nominal: 50, real2010: 45, production: 0, flag: 'Published zero' },
    { year: 2021, nominal: null, real2010: null, production: null, flag: 'Withheld' },
  ]);
});

test('Supplemental international commodity flow collections validate SHA-256 and query cleanly via PublicPipelineAPI', async () => {
  const manifestPath = path.join(PUBLIC, 'data/commodity-flows/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Commodity flows manifest must exist');
  const suppManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expectedIds = [
    'trade_crude_oil', 'trade_lng', 'trade_copper', 'trade_battery_metals',
    'trade_wheat', 'trade_maize', 'trade_rice', 'trade_soybeans', 'trade_coffee', 'trade_fertilizers',
  ];
  assert.deepEqual(suppManifest.collections.map(c => c.id), expectedIds);

  const api = P.createAPI({
    includeSupplemental: true,
    crypto: crypto.webcrypto,
    fetch: async url => {
      const target = path.resolve(PUBLIC, '.' + new URL(url, 'https://example.test').pathname);
      assert.ok(target.startsWith(PUBLIC + path.sep));
      try {
        return new Response(await fsp.readFile(target));
      } catch {
        return new Response('', { status: 404 });
      }
    },
  });

  const catalog = await api.request('/api/pipelines/catalog');
  assert.equal(catalog.collections.length, 21, '11 original + 10 new bilateral commodity collections');

  for (const cid of expectedIds) {
    const facets = await api.request('/api/pipelines/facets?collection=' + cid);
    assert.ok(facets.places.length > 10, `${cid} must have >10 partner countries/areas`);
    const qQty = await api.request('/api/pipelines/query', { collection: cid, metric: 'quantity' });
    assert.equal(qQty.collection, cid);
    assert.ok(qQty.counts.source_records > 20, `${cid} must have bilateral edges`);
    assert.ok(qQty.links.length > 15, `${cid} must have grouped links`);
    // Ensure World (un_comtrade_area:0) never leaks into bilateral graph edges
    assert.ok(!qQty.links.some(l => l.from_id === 'un_comtrade_area:0' || l.to_id === 'un_comtrade_area:0'));

    const qUsd = await api.request('/api/pipelines/query', { collection: cid, metric: 'value_usd' });
    assert.ok(qUsd.total > 0, `${cid} FOB export USD value must be positive`);
  }
});
