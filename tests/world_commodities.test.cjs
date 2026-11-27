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

  for (const item of [...pink.commodities, ...pink.indices]) {
    assert.ok(!item.unit.includes('$'), `Unit must use USD instead of $: ${item.unit}`);
    assert.equal(item.annual_nominal.length, pink.years.length, item.id);
    assert.equal(item.annual_real_2010.length, pink.years.length, item.id);
    assert.equal(item.monthly_nominal.length, pink.months.length, item.id);
  }

  const wti = pink.commodities.find(c => c.id === 'crude-oil-wti');
  assert.ok(wti);
  assert.equal(wti.annual_nominal[0], null);
  assert.equal(wti.monthly_nominal[0], null);
  assert.ok(typeof wti.annual_nominal.at(-1) === 'number' && wti.annual_nominal.at(-1) > 0);

  const brent = pink.commodities.find(c => c.id === 'crude-oil-brent');
  assert.ok(brent);
  assert.equal(brent.related_flow_collection, 'trade_crude_oil');
  assert.equal(brent.production_pairing.kind, 'retained-evidence');
  const stats = C.summarizePriceHistory(pink.years, brent.annual_nominal, brent.annual_real_2010, pink.months, brent.monthly_nominal);
  assert.equal(stats.firstAnnual.year, 1960);
  assert.equal(stats.latestAnnualNominal.year, 2025);
  assert.equal(stats.latestMonthly.period, '2026M10');
  assert.ok(stats.realPeak.value > stats.realTrough.value);

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

test('2020-2025 Critical Metals & Border-Reporting Register preserves secrecy flags, code 999, partial years, and non-additive bases', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data/commodities/critical-metals-register.json'), 'utf8'));
  assert.equal(C.verifyMetalsRegisterIntegrity(reg), true);

  // Verify SHA-256 of all 6 archived Nov 26 source packets
  for (const info of Object.values(reg.archived_packets)) {
    const diskBytes = fs.readFileSync(path.join(PUBLIC, info.url.replace(/^\//, '')));
    assert.equal(diskBytes.byteLength, info.bytes, info.file);
    assert.equal(sha256(diskBytes), info.sha256, info.file);
  }

  // Verify 2024 Argentina border asymmetry: 1 exporter-reported destination (47,609.12 t) vs 24 foreign importers (64,840.44 t)
  const argExp2024 = C.summarizeBorderPerspective(reg, 'arg-exporter', 2024);
  const argImp2024 = C.summarizeBorderPerspective(reg, 'arg-importer', 2024);
  const argIndec2024 = C.summarizeBorderPerspective(reg, 'arg-indec', 2024);
  assert.equal(argExp2024.mappedCount, 1);
  assert.ok(Math.abs(argExp2024.totalReportedTonnes - 47609.12) < 0.01);
  assert.equal(argImp2024.mappedCount, 24);
  assert.ok(Math.abs(argImp2024.totalReportedTonnes - 64840.444423) < 0.01);
  assert.ok(Math.abs(argImp2024.mapByIso.get('USA').value - 6778.706) < 0.01);
  assert.equal(argExp2024.mapByIso.get('USA'), undefined);

  // Verify INDEC 2022 100% withheld under code 999 -> 0 mapped geographic pins, 12 withheld ('s') destinations
  const argIndec2022 = C.summarizeBorderPerspective(reg, 'arg-indec', 2022);
  assert.equal(argIndec2022.mappedCount, 0);
  assert.equal(argIndec2022.withheldCount, 12);
  assert.ok(Math.abs(argIndec2022.unallocatedTonnes - 29872.05713) < 0.001);
  assert.equal(argIndec2024.mappedCount, 1);
  assert.ok(Math.abs(argIndec2024.unallocatedTonnes - 17906.54812) < 0.001);

  // Verify Chile 2025 COCHILCO vs Comtrade shift (259,571 t output; South Korea 44,350.11 t)
  const chlCoch2025 = C.summarizeBorderPerspective(reg, 'chl-cochilco', 2025);
  assert.ok(Math.abs(chlCoch2025.totalReportedTonnes - 225748.07) < 0.01);
  assert.ok(Math.abs(chlCoch2025.mapByIso.get('KOR').value - 44350.11) < 0.01);

  // Verify Chile fire-refined copper publisher dashes stay null in national_metal_series
  const fireRefined = reg.national_metal_series.filter(r => r.iso3 === 'CHL' && r.measure === 'Fire-refined');
  assert.ok(fireRefined.length >= 6 && fireRefined.some(r => r.tonnes === null));
});

test('Supplemental international commodity flow collections (13 bundles / 24 total) validate SHA-256 and query cleanly via PublicPipelineAPI', async () => {
  const manifestPath = path.join(PUBLIC, 'data/commodity-flows/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Commodity flows manifest must exist');
  const suppManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseTenIds = [
    'trade_crude_oil', 'trade_lng', 'trade_copper', 'trade_battery_metals',
    'trade_wheat', 'trade_maize', 'trade_rice', 'trade_soybeans', 'trade_coffee', 'trade_fertilizers',
  ];
  const nov26LithiumIds = [
    'trade_lithium_arg_chl_perspectives', 'trade_lithium_chile_cochilco', 'trade_lithium_argentina_indec',
  ];
  assert.deepEqual(suppManifest.collections.map(c => c.id), [...baseTenIds, ...nov26LithiumIds]);

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
  assert.equal(catalog.collections.length, 24, '11 original + 10 global commodity flows + 3 Nov-26 lithium audit flows');

  for (const cid of baseTenIds) {
    const qQty = await api.request('/api/pipelines/query', { collection: cid, metric: 'quantity' });
    assert.equal(qQty.collection, cid);
    assert.ok(qQty.counts.source_records > 20);
    assert.ok(!qQty.links.some(l => l.from_id === 'un_comtrade_area:0' || l.to_id === 'un_comtrade_area:0'));
    const qUsd = await api.request('/api/pipelines/query', { collection: cid, metric: 'value_usd' });
    assert.ok(qUsd.total > 0);
  }

  // Verify trade_lithium_arg_chl_perspectives keeps exporter_net_t and importer_net_t strictly separate
  const qArgImp = await api.request('/api/pipelines/query', {
    collection: 'trade_lithium_arg_chl_perspectives', year: '2024', focus: 'ARG', direction: 'outbound', metric: 'importer_net_t',
  });
  const qArgExp = await api.request('/api/pipelines/query', {
    collection: 'trade_lithium_arg_chl_perspectives', year: '2024', focus: 'ARG', direction: 'outbound', metric: 'exporter_net_t',
  });
  assert.equal(qArgImp.counts.measured, 24);
  assert.ok(Math.abs(qArgImp.total - 64840.444423) < 0.01);
  assert.equal(qArgExp.counts.measured, 1);
  assert.equal(qArgExp.counts.missing, 23);
  assert.ok(Math.abs(qArgExp.total - 47609.12) < 0.01);

  // Verify trade_lithium_argentina_indec reconciles 2022 100% code 999 while keeping code 999 map_eligible=false
  const qIndec22 = await api.request('/api/pipelines/query', {
    collection: 'trade_lithium_argentina_indec', year: '2022', metric: 'quantity',
  });
  assert.equal(qIndec22.counts.measured, 1); // Only code 999 has weight; 12 named destinations are Withheld (s) -> missing
  assert.equal(qIndec22.counts.missing, 12);
  assert.ok(Math.abs(qIndec22.total - 29872.05713) < 0.001);
  const node999 = qIndec22.nodes.find(n => n.id === 'indec_dest:999');
  assert.ok(node999 && node999.map_eligible === false && node999.geo_id === null);

  // Verify trade_lithium_chile_cochilco switches cleanly between COCHILCO physical and Comtrade net weight in 2025
  const qChlCoch = await api.request('/api/pipelines/query', {
    collection: 'trade_lithium_chile_cochilco', year: '2025', metric: 'quantity',
  });
  const qChlCom = await api.request('/api/pipelines/query', {
    collection: 'trade_lithium_chile_cochilco', year: '2025', metric: 'comtrade_net_t',
  });
  assert.ok(Math.abs(qChlCoch.total - 225748.07) < 0.01);
  assert.ok(Math.abs(qChlCom.total - 219514.83) < 0.01);
});
