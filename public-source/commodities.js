/* World Bank Pink Sheet (1960–2026) price histories paired with FAOSTAT, USGS & EIA country production,
 * plus the 2020–2025 Critical Metals & Border-Reporting Source Register (BGS, COCHILCO, INDEC, CTCPM & UN Comtrade). */
(() => {
  'use strict';
  const finite = v => typeof v === 'number' && Number.isFinite(v);

  /* Pure data helpers exported for deterministic Node unit testing. */
  function normalizeProductionPacket(raw, meta = {}) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid production packet.');
    if (raw.schema === 'public-evidence.commodity-production/v1') {
      const byIso = new Map((raw.countries || []).map(c => [c.iso3, c]));
      const byYear = new Map();
      const byCountry = new Map();
      for (const row of raw.rows || []) {
        const [iso3, year, val, flag] = row;
        const cleanVal = finite(val) ? val : null;
        if (!byYear.has(year)) byYear.set(year, new Map());
        byYear.get(year).set(iso3, { iso3, geo_id: byIso.get(iso3)?.geo_id || iso3, name: byIso.get(iso3)?.name || iso3, year, value: cleanVal, flag: flag || '' });
        if (!byCountry.has(iso3)) byCountry.set(iso3, []);
        byCountry.get(iso3).push({ year, value: cleanVal, flag: flag || '' });
      }
      for (const arr of byCountry.values()) arr.sort((a, b) => a.year - b.year);
      const years = [...byYear.keys()].sort((a, b) => a - b);
      return {
        title: raw.title || meta.title || 'Country production',
        unit: raw.unit || meta.unit || 'tonnes',
        publisher: meta.source_publisher || raw.domain || 'FAOSTAT',
        years,
        countries: [...byIso.values()].sort((a, b) => a.name.localeCompare(b.name)),
        byYear,
        byCountry,
        flags: raw.flags || {},
      };
    }
    if (Array.isArray(raw.records)) {
      const cellGroups = new Map();
      const countriesMap = new Map();
      for (const rec of raw.records) {
        const yr = Number(rec.year);
        const iso = String(rec.geo_id || '').trim();
        if (!Number.isInteger(yr) || !iso) continue;
        const key = iso + ':' + yr;
        if (!cellGroups.has(key)) cellGroups.set(key, []);
        cellGroups.get(key).push(rec);
        if (!countriesMap.has(iso)) {
          countriesMap.set(iso, { iso3: iso, geo_id: iso === 'XKX' ? 'KOS' : iso, name: rec.geo_name || iso });
        }
      }
      const byYear = new Map();
      const byCountry = new Map();
      for (const [key, grp] of cellGroups.entries()) {
        const [iso, yrStr] = key.split(':');
        const year = Number(yrStr);
        let cleanVal = null;
        let flag = '';
        if (grp.length === 1) {
          const r = grp[0];
          const eligible = r.eligible !== false;
          cleanVal = eligible && finite(r.value) ? r.value : null;
          flag = r.native_flag || r.status || '';
        } else {
          flag = 'Ambiguous multiple source rows';
        }
        if (!byYear.has(year)) byYear.set(year, new Map());
        byYear.get(year).set(iso, { iso3: iso, geo_id: countriesMap.get(iso).geo_id, name: countriesMap.get(iso).name, year, value: cleanVal, flag });
        if (!byCountry.has(iso)) byCountry.set(iso, []);
        byCountry.get(iso).push({ year, value: cleanVal, flag });
      }
      for (const arr of byCountry.values()) arr.sort((a, b) => a.year - b.year);
      const years = [...byYear.keys()].sort((a, b) => a - b);
      return {
        title: raw.series?.label || meta.title || 'Country production',
        unit: (raw.series?.unit || meta.unit || '').replace(/^\$/, 'USD '),
        publisher: meta.source_publisher || raw.dataset?.title || 'Retained public source',
        years,
        countries: [...countriesMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
        byYear,
        byCountry,
        flags: {},
      };
    }
    throw new Error('Unsupported production packet format.');
  }

  function summarizePriceHistory(years, nominal, real2010, months, monthly) {
    const validNom = years.map((y, i) => ({ year: y, value: nominal[i] })).filter(r => finite(r.value));
    const validReal = years.map((y, i) => ({ year: y, value: real2010[i] })).filter(r => finite(r.value));
    const validMon = (months || []).map((m, i) => ({ period: m, value: monthly?.[i] ?? null })).filter(r => finite(r.value));
    let realPeak = null, realTrough = null;
    for (const r of validReal) {
      if (!realPeak || r.value > realPeak.value) realPeak = r;
      if (!realTrough || r.value < realTrough.value) realTrough = r;
    }
    return {
      firstAnnual: validNom[0] || null,
      latestAnnualNominal: validNom.at(-1) || null,
      latestAnnualReal: validReal.at(-1) || null,
      latestMonthly: validMon.at(-1) || null,
      realPeak,
      realTrough,
      annualCount: validNom.length,
      monthlyCount: validMon.length,
    };
  }

  function pairAnnualPriceAndProduction(pinkYears, nominal, real2010, prodByCountry, iso3) {
    const cRows = prodByCountry?.get(iso3) || [];
    const prodMap = new Map(cRows.map(r => [r.year, r]));
    const allYears = [...new Set([...pinkYears, ...cRows.map(r => r.year)])].sort((a, b) => a - b);
    const pIdx = new Map(pinkYears.map((y, i) => [y, i]));
    return allYears.map(year => {
      const idx = pIdx.get(year);
      const p = prodMap.get(year);
      return {
        year,
        nominal: idx !== undefined && finite(nominal[idx]) ? nominal[idx] : null,
        real2010: idx !== undefined && finite(real2010[idx]) ? real2010[idx] : null,
        production: p && finite(p.value) ? p.value : null,
        flag: p?.flag || '',
      };
    });
  }

  function summarizeBorderPerspective(register, viewKey, year) {
    if (!register || register.schema !== 'public-evidence.critical-metals-register/v1') {
      throw new Error('Unsupported critical-metals register schema.');
    }
    const yr = Number(year);
    if (viewKey === 'arg-indec') {
      const ann = register.argentina_indec_customs_2020_2025.annual.find(r => r.year === yr) || null;
      const rows = register.argentina_indec_customs_2020_2025.destinations.filter(r => r.year === yr);
      const mapByIso = new Map();
      for (const r of rows) {
        if (r.iso3 && finite(r.net_weight_t)) {
          mapByIso.set(r.iso3, { iso3: r.iso3, geo_id: r.iso3, name: r.destination_indec, value: r.net_weight_t, status: r.weight_status, fob_band: r.fob_band });
        }
      }
      return {
        origin: 'ARG',
        year: yr,
        title: `Argentina lithium carbonate · INDEC national customs (NCM 28369100) · ${yr}`,
        unit: 'tonnes',
        publisher: 'INDEC COMEX (published named destinations on map; code 999 unallocated)',
        mapByIso,
        mappedCount: mapByIso.size,
        withheldCount: rows.filter(r => r.weight_status === 'Withheld (s)').length,
        unallocatedTonnes: ann?.indec_confidential_999_net_t ?? null,
        totalReportedTonnes: ann?.indec_total_net_t ?? null,
        namedPublishedTonnes: ann?.indec_named_net_t ?? null,
        rows,
      };
    }
    if (viewKey === 'chl-cochilco') {
      const ann = register.chile_lithium_2020_2025.annual.find(r => r.year === yr) || null;
      const rows = register.chile_lithium_2020_2025.destinations.filter(r => r.year === yr);
      const mapByIso = new Map();
      for (const r of rows) {
        if (r.partner_iso3 && finite(r.cochilco_exports_t)) {
          mapByIso.set(r.partner_iso3, {
            iso3: r.partner_iso3,
            geo_id: r.partner_iso3,
            name: r.partner_iso3 === 'TWN' ? 'Taiwan' : (r.comtrade_destination || r.cochilco_destination),
            value: r.cochilco_exports_t,
            status: r.cochilco_exports_t === 0 ? 'Published zero' : 'Published',
          });
        }
      }
      const otros = rows.find(r => !r.partner_iso3);
      return {
        origin: 'CHL',
        year: yr,
        title: `Chile lithium carbonate · COCHILCO physical export volumes · ${yr}`,
        unit: 'tonnes',
        publisher: 'COCHILCO (33 named destinations on map; Otros retained in total)',
        mapByIso,
        mappedCount: [...mapByIso.values()].filter(r => r.value > 0).length,
        withheldCount: 0,
        unallocatedTonnes: otros?.cochilco_exports_t ?? 0,
        totalReportedTonnes: ann?.exports_cochilco_t ?? null,
        namedPublishedTonnes: [...mapByIso.values()].reduce((acc, r) => acc + r.value, 0),
        rows,
      };
    }
    const [origPrefix, side] = viewKey.split('-');
    const origin = origPrefix === 'chl' ? 'CHL' : 'ARG';
    const isImporter = side === 'importer';
    const ann = register.arg_chl_border_comparison_2020_2025.annual.find(r => r.year === yr && r.origin_iso3 === origin) || null;
    const rows = register.arg_chl_border_comparison_2020_2025.routes.filter(r => r.year === yr && r.origin_iso3 === origin);
    const mapByIso = new Map();
    for (const r of rows) {
      const v = isImporter ? r.importer_net_t : r.exporter_net_t;
      if (r.destination_iso3 && finite(v)) {
        mapByIso.set(r.destination_iso3, {
          iso3: r.destination_iso3,
          geo_id: r.destination_iso3,
          name: r.destination_iso3 === 'TWN' ? 'Taiwan' : r.destination_name,
          value: v,
          status: r.record_coverage,
        });
      }
    }
    return {
      origin,
      year: yr,
      title: `${origin === 'ARG' ? 'Argentina' : 'Chile'} lithium carbonate · ${isImporter ? "Importing economies' records" : 'Exporter-reported records'} (UN Comtrade HS 283691) · ${yr}`,
      unit: 'tonnes',
      publisher: isImporter ? 'UN Comtrade (foreign reporting importers, excluding reimports)' : 'UN Comtrade (exporter-reported customs table)',
      mapByIso,
      mappedCount: mapByIso.size,
      withheldCount: rows.length - mapByIso.size,
      unallocatedTonnes: null,
      totalReportedTonnes: isImporter ? (ann?.foreign_importer_sum_net_t ?? null) : (ann?.exporter_world_net_t ?? null),
      namedPublishedTonnes: mapByIso.size ? [...mapByIso.values()].reduce((acc, r) => acc + r.value, 0) : null,
      rows,
    };
  }

  function verifyMetalsRegisterIntegrity(register) {
    for (const r of register.argentina_indec_customs_2020_2025.annual) {
      if (Math.abs((r.indec_named_net_t + r.indec_confidential_999_net_t) - r.indec_total_net_t) > 1e-5) {
        throw new Error(`INDEC annual reconciliation failed for ${r.year}`);
      }
    }
    for (const c of register.drc_monthly_checks) {
      if (!finite(c.difference_t) || Math.abs(c.difference_t) > 0.025) {
        throw new Error(`DRC monthly-vs-annual check out of bounds: ${c.year} ${c.metal}`);
      }
    }
    const arg2023 = register.arg_chl_border_comparison_2020_2025.annual.find(r => r.origin_iso3 === 'ARG' && r.year === 2023);
    if (!arg2023 || arg2023.national_production_t !== null) {
      throw new Error('Argentina 2023 partial-year (7/12 months) national production must stay null.');
    }
    const suppressedMonths = register.arg_chl_border_comparison_2020_2025.argentina_monthly_production.filter(m => m.carbonate_t === null);
    if (suppressedMonths.length !== 41) {
      throw new Error(`Expected 41 confidential INDEC monthly positions, got ${suppressedMonths.length}`);
    }
    if (register.china_imports_2020_2025) {
      const m24 = register.china_imports_2020_2025.argentina_china_monthly_2024;
      if (m24[0]?.net_kg !== null) {
        throw new Error('January 2024 Argentina-China INDEC monthly weight must stay null (Withheld).');
      }
      const sum11 = m24.slice(1).reduce((acc, m) => acc + (m.net_kg || 0), 0);
      if (Math.abs(sum11 - 47609122) > 0.01) {
        throw new Error('Eleven disclosed 2024 INDEC Argentina-China months must equal 47,609,122 kg.');
      }
    }
    return true;
  }

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        normalizeProductionPacket,
        summarizePriceHistory,
        pairAnnualPriceAndProduction,
        summarizeBorderPerspective,
        verifyMetalsRegisterIntegrity,
      };
    }
    return;
  }

  const STARTERS = [
    ['crude-oil-brent', 'Brent Crude Oil'],
    ['liquefied-natural-gas-japan', 'LNG (Japan)'],
    ['coal-australian', 'Coal'],
    ['copper', 'Copper'],
    ['nickel', 'Nickel'],
    ['aluminum', 'Aluminum'],
    ['gold', 'Gold'],
    ['wheat-us-hrw', 'Wheat (US HRW)'],
    ['maize', 'Maize (Corn)'],
    ['rice-thai-5', 'Rice (Thai 5%)'],
    ['soybeans', 'Soybeans'],
    ['coffee-arabica', 'Coffee (Arabica)'],
    ['cocoa', 'Cocoa'],
    ['urea', 'Urea (Nitrogen)'],
    ['dap', 'DAP (Phosphate)'],
    ['potassium-chloride', 'Potash (KCl)'],
  ];

  const FLOW_LABELS = {
    trade_crude_oil: 'Crude petroleum bilateral exports (2020–2024)',
    trade_lng: 'LNG bilateral exports (2020–2024)',
    trade_coal: 'International coal exports',
    trade_copper: 'Copper ores & refined cathodes exports (2020–2024)',
    trade_battery_metals: 'Critical battery metals (Li, Co, Ni) exports (2020–2024)',
    trade_wheat: 'Wheat bilateral exports (2020–2024)',
    trade_maize: 'Maize bilateral exports (2020–2024)',
    trade_rice: 'Rice bilateral exports (2020–2024)',
    trade_soybeans: 'Soybeans bilateral exports (2020–2024)',
    trade_coffee: 'Coffee bilateral exports (2020–2024)',
    trade_fertilizers: 'Mineral & chemical fertilizers exports (2020–2024)',
  };

  const PALETTES = {
    Energy: ['#f2e5bd', '#dfb968', '#be8731', '#8a5519', '#52300b'],
    'Metals & Minerals': ['#dcece8', '#9fd0c5', '#55a696', '#247567', '#12463d'],
    'Precious Metals': ['#f5ecd2', '#e5ca78', '#c79c36', '#946b17', '#5d4009'],
    Fertilizers: ['#e4ecd7', '#b8d19c', '#7fa962', '#4c7b38', '#294c1c'],
    default: ['#e1edce', '#bcd69b', '#86b367', '#508748', '#295434'],
  };

  const byId = id => document.getElementById(id);
  const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });
  const fmt = v => (finite(v) ? numFmt.format(v) : 'Unavailable');
  let revision = 0;
  const prodCache = new Map();
  let metalsCache = null;

  function setParams(changes) {
    const url = new URL(location.href);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === undefined || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, String(v));
    }
    if (url.href !== location.href) history.pushState(null, '', url);
    render();
  }

  async function loadProduction(pairing, C) {
    if (!pairing?.url) return null;
    if (!prodCache.has(pairing.url)) {
      prodCache.set(
        pairing.url,
        C.json(pairing.url).then(raw => normalizeProductionPacket(raw, pairing)).catch(err => {
          prodCache.delete(pairing.url);
          throw err;
        })
      );
    }
    return prodCache.get(pairing.url);
  }

  async function loadMetalsRegister(C) {
    if (!metalsCache) {
      metalsCache = C.json('/data/commodities/critical-metals-register.json').catch(err => {
        metalsCache = null;
        throw err;
      });
    }
    return metalsCache;
  }

  function computeNiceCuts(values) {
    const pos = values.filter(v => finite(v) && v > 0).sort((a, b) => a - b);
    if (pos.length < 4) return { cuts: [10, 100, 1000, 10000], labels: ['>0 to <10', '10 to <100', '100 to <1K', '1K to <10K', '10K or more'] };
    const q = p => d3.quantileSorted(pos, p) || 1;
    const raw = [q(0.2), q(0.45), q(0.7), q(0.9)];
    const roundNice = v => {
      if (v <= 0) return 1;
      const mag = Math.pow(10, Math.floor(Math.log10(v)));
      const norm = v / mag;
      const step = norm < 1.5 ? 1 : norm < 3.5 ? 2.5 : norm < 7.5 ? 5 : 10;
      return step * mag;
    };
    const cuts = [];
    for (const r of raw) {
      const c = roundNice(r);
      if (!cuts.length || c > cuts[cuts.length - 1]) cuts.push(c);
      else cuts.push(cuts[cuts.length - 1] * 2);
    }
    const labels = [
      'Under ' + compactFmt.format(cuts[0]),
      compactFmt.format(cuts[0]) + '–<' + compactFmt.format(cuts[1]),
      compactFmt.format(cuts[1]) + '–<' + compactFmt.format(cuts[2]),
      compactFmt.format(cuts[2]) + '–<' + compactFmt.format(cuts[3]),
      compactFmt.format(cuts[3]) + ' or more',
    ];
    return { cuts, labels };
  }

  function renderLensTabs(C, activeLens) {
    const host = byId('lens-tabs');
    if (!host) return;
    host.replaceChildren();
    const defs = [
      ['prices', 'World Pink Sheet & Country Output (1960–2026)'],
      ['metals-audit', 'Critical Metals & Border-Reporting Audit (2020–2025)'],
    ];
    for (const [id, label] of defs) {
      const btn = C.button(label, () => setParams({ lens: id === 'prices' ? null : id }));
      btn.className = 'cm-lens-tab';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(activeLens === id));
      host.append(btn);
    }
  }

  function renderPriceChart(C, item, pink, basis, selectedYear) {
    const wrap = C.element('div');
    const isMonthly = basis === 'monthly';
    const width = 720, height = 250, left = 60, right = 20, top = 16, bottom = 32;
    const svg = d3.create('svg')
      .attr('class', 'cm-chart-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', `${item.name} price history (${item.unit})`);

    const readout = C.element('div', 'cm-hover-readout', 'Hover over the chart to inspect exact source periods and values.');

    if (isMonthly) {
      const pts = pink.months.map((m, i) => ({
        idx: i,
        period: m,
        yearFrac: Number(m.slice(0, 4)) + (Number(m.slice(5, 7)) - 0.5) / 12,
        value: item.monthly_nominal[i],
      }));
      const valid = pts.filter(p => finite(p.value));
      if (!valid.length) {
        wrap.append(C.note('No monthly observations are published for this series.'));
        return wrap;
      }
      const x = d3.scaleLinear().domain(d3.extent(pts, p => p.yearFrac)).range([left, width - right]);
      const y = d3.scaleLinear().domain([0, d3.max(valid, p => p.value) * 1.06 || 1]).nice().range([height - bottom, top]);
      for (const tick of y.ticks(5)) {
        svg.append('line').attr('x1', left).attr('x2', width - right).attr('y1', y(tick)).attr('y2', y(tick)).attr('stroke', '#e1e8dc');
        svg.append('text').attr('x', left - 7).attr('y', y(tick) + 4).attr('text-anchor', 'end').attr('font-size', 12).attr('fill', '#485b4c').text(compactFmt.format(tick));
      }
      for (const yr of [1960, 1970, 1980, 1990, 2000, 2010, 2020, 2026]) {
        if (yr >= pts[0].yearFrac - 1 && yr <= pts.at(-1).yearFrac + 1) {
          svg.append('text').attr('x', x(yr)).attr('y', height - 8).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#485b4c').text(yr);
        }
      }
      if (finite(selectedYear)) {
        svg.append('line').attr('x1', x(selectedYear + 0.5)).attr('x2', x(selectedYear + 0.5)).attr('y1', top).attr('y2', height - bottom).attr('stroke', '#6a7c6d').attr('stroke-dasharray', '3,3');
      }
      svg.append('path')
        .datum(pts)
        .attr('d', d3.line().defined(p => finite(p.value)).x(p => x(p.yearFrac)).y(p => y(p.value)))
        .attr('fill', 'none').attr('stroke', '#1f6f5f').attr('stroke-width', 1.75);

      const cursor = svg.append('line').attr('y1', top).attr('y2', height - bottom).attr('stroke', '#b45309').attr('stroke-width', 1.2).attr('visibility', 'hidden');
      const dot = svg.append('circle').attr('r', 4).attr('fill', '#b45309').attr('visibility', 'hidden');
      svg.append('rect').attr('x', left).attr('y', top).attr('width', width - left - right).attr('height', height - top - bottom)
        .attr('fill', 'transparent')
        .on('mousemove', event => {
          const [mx] = d3.pointer(event);
          const yf = x.invert(mx);
          const nearest = d3.least(pts, p => Math.abs(p.yearFrac - yf));
          if (!nearest) return;
          cursor.attr('x1', x(nearest.yearFrac)).attr('x2', x(nearest.yearFrac)).attr('visibility', 'visible');
          if (finite(nearest.value)) {
            dot.attr('cx', x(nearest.yearFrac)).attr('cy', y(nearest.value)).attr('visibility', 'visible');
            readout.textContent = `${nearest.period} · Nominal: ${fmt(nearest.value)} ${item.unit}`;
          } else {
            dot.attr('visibility', 'hidden');
            readout.textContent = `${nearest.period} · Unavailable in publisher source`;
          }
        })
        .on('mouseleave', () => { cursor.attr('visibility', 'hidden'); dot.attr('visibility', 'hidden'); });

      const key = C.element('div', 'cm-series-key');
      const s1 = C.element('span');
      const sw1 = C.element('i', 'cm-swatch'); sw1.style.background = '#1f6f5f';
      s1.append(sw1, document.createTextNode(`Monthly nominal price (${item.unit}, 1960M01–2026M10)`));
      key.append(s1);
      wrap.append(svg.node(), key, readout);
      return wrap;
    }

    const showNom = basis === 'both' || basis === 'nominal';
    const showReal = (basis === 'both' || basis === 'real') && item.annual_real_2010.some(finite);
    const rows = pink.years.map((yr, i) => ({
      year: yr,
      nom: item.annual_nominal[i],
      real: item.annual_real_2010[i],
    }));
    const allVals = rows.flatMap(r => [showNom ? r.nom : null, showReal ? r.real : null]).filter(finite);
    if (!allVals.length) {
      wrap.append(C.note('No annual observations are available for this selection.'));
      return wrap;
    }
    const x = d3.scaleLinear().domain(d3.extent(pink.years)).range([left, width - right]);
    const y = d3.scaleLinear().domain([0, d3.max(allVals) * 1.08 || 1]).nice().range([height - bottom, top]);

    for (const tick of y.ticks(5)) {
      svg.append('line').attr('x1', left).attr('x2', width - right).attr('y1', y(tick)).attr('y2', y(tick)).attr('stroke', '#e1e8dc');
      svg.append('text').attr('x', left - 7).attr('y', y(tick) + 4).attr('text-anchor', 'end').attr('font-size', 12).attr('fill', '#485b4c').text(compactFmt.format(tick));
    }
    for (const yr of pink.years.filter(yr => yr === pink.years[0] || yr === pink.years.at(-1) || yr % 10 === 0)) {
      svg.append('text').attr('x', x(yr)).attr('y', height - 8).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#485b4c').text(yr);
    }
    if (finite(selectedYear) && selectedYear >= pink.years[0] && selectedYear <= pink.years.at(-1)) {
      svg.append('line').attr('x1', x(selectedYear)).attr('x2', x(selectedYear)).attr('y1', top).attr('y2', height - bottom)
        .attr('stroke', '#4d6353').attr('stroke-width', 1.4).attr('stroke-dasharray', '4,3');
    }
    if (showNom) {
      svg.append('path').datum(rows)
        .attr('d', d3.line().defined(r => finite(r.nom)).x(r => x(r.year)).y(r => y(r.nom)))
        .attr('fill', 'none').attr('stroke', '#c68424').attr('stroke-width', 2.2);
    }
    if (showReal) {
      svg.append('path').datum(rows)
        .attr('d', d3.line().defined(r => finite(r.real)).x(r => x(r.year)).y(r => y(r.real)))
        .attr('fill', 'none').attr('stroke', '#1f6f5f').attr('stroke-width', 2.6);
    }
    const cursor = svg.append('line').attr('y1', top).attr('y2', height - bottom).attr('stroke', '#204b3b').attr('stroke-width', 1.2).attr('visibility', 'hidden');
    svg.append('rect').attr('x', left).attr('y', top).attr('width', width - left - right).attr('height', height - top - bottom)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mousemove', event => {
        const [mx] = d3.pointer(event);
        const yr = Math.round(x.invert(mx));
        const row = rows.find(r => r.year === yr);
        if (!row) return;
        cursor.attr('x1', x(row.year)).attr('x2', x(row.year)).attr('visibility', 'visible');
        const parts = [`${row.year}`];
        if (showReal) parts.push(`Real (2010 USD): ${fmt(row.real)} ${item.unit}`);
        if (showNom) parts.push(`Nominal: ${fmt(row.nom)} ${item.unit}`);
        readout.textContent = parts.join(' · ');
      })
      .on('click', event => {
        const [mx] = d3.pointer(event);
        const yr = Math.round(x.invert(mx));
        if (yr >= 1960 && yr <= 2025) setParams({ year: yr });
      })
      .on('mouseleave', () => cursor.attr('visibility', 'hidden'));

    const key = C.element('div', 'cm-series-key');
    if (showReal) {
      const s = C.element('span');
      const sw = C.element('i', 'cm-swatch'); sw.style.background = '#1f6f5f';
      s.append(sw, document.createTextNode(`Real 2010 constant USD (${item.unit})`));
      key.append(s);
    }
    if (showNom) {
      const s = C.element('span');
      const sw = C.element('i', 'cm-swatch'); sw.style.background = '#c68424';
      s.append(sw, document.createTextNode(`Nominal current USD (${item.unit})`));
      key.append(s);
    }
    wrap.append(svg.node(), key, readout);
    return wrap;
  }

  function renderSmallHistory(C, title, rows, chosenYear, color, unit) {
    const fig = C.element('figure', 'hr-chart');
    fig.append(C.element('figcaption', '', title));
    const valid = rows.filter(r => finite(r.value));
    if (!valid.length) {
      fig.append(C.note('No source values in this period.'));
      return fig;
    }
    const width = 550, height = 165, left = 58, right = 18, top = 14, bottom = 29;
    const svg = d3.create('svg').attr('role', 'img').attr('aria-label', `${title}, ${unit}`).attr('viewBox', `0 0 ${width} ${height}`);
    const years = rows.map(r => r.year);
    const x = d3.scaleLinear().domain(d3.extent(years)).range([left, width - right]);
    const y = d3.scaleLinear().domain([0, d3.max(valid, r => r.value) * 1.06 || 1]).nice().range([height - bottom, top]);
    for (const v of y.ticks(3)) {
      svg.append('line').attr('x1', left).attr('x2', width - right).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', '#d8e0d3');
      svg.append('text').attr('x', left - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(compactFmt.format(v));
    }
    for (const yr of years.filter(yr => yr === years[0] || yr === years.at(-1) || (yr % 10 === 0 && yr < years.at(-1) - 2))) {
      svg.append('text').attr('x', x(yr)).attr('y', height - 5).attr('text-anchor', 'middle').text(yr);
    }
    if (finite(chosenYear) && chosenYear >= years[0] && chosenYear <= years.at(-1)) {
      svg.append('line').attr('x1', x(chosenYear)).attr('x2', x(chosenYear)).attr('y1', top).attr('y2', height - bottom).attr('stroke', '#627365').attr('stroke-dasharray', '3,3');
    }
    svg.append('path').datum(rows)
      .attr('d', d3.line().defined(r => finite(r.value)).x(r => x(r.year)).y(r => y(r.value)))
      .attr('stroke', color).attr('stroke-width', 2.4).attr('fill', 'none');
    for (const r of valid) {
      if (r.year === chosenYear) {
        svg.append('circle').attr('cx', x(r.year)).attr('cy', y(r.value)).attr('r', 4.8).attr('fill', color)
          .append('title').text(`${r.year} · ${fmt(r.value)} ${unit}`);
      }
    }
    fig.append(svg.node());
    return fig;
  }

  function renderIndecCustomsChart(C, annualRows, selectedYear) {
    const wrap = C.element('div');
    const width = 620, height = 248, left = 54, right = 138, top = 20, bottom = 28;
    const svg = d3.create('svg')
      .attr('class', 'cm-chart-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', 'Argentina INDEC lithium carbonate exports 2020–2025: published named weights vs. confidential code 999');

    const defs = svg.append('defs');
    const pat = defs.append('pattern')
      .attr('id', 'indec-999-hatch')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 8).attr('height', 8)
      .attr('patternTransform', 'rotate(45)');
    pat.append('rect').attr('width', 8).attr('height', 8).attr('fill', '#e2b76b');
    pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 8).attr('stroke', '#8a5519').attr('stroke-width', 2.2);

    const maxTot = d3.max(annualRows, r => r.indec_total_net_t) || 110000;
    const x = d3.scaleLinear().domain([0, maxTot * 1.05]).range([left, width - right]);
    const y = d3.scaleBand().domain(annualRows.map(r => String(r.year))).range([top, height - bottom]).padding(0.32);

    for (const tick of [0, 20000, 40000, 60000, 80000, 100000]) {
      if (tick <= maxTot * 1.05) {
        svg.append('line').attr('x1', x(tick)).attr('x2', x(tick)).attr('y1', top - 4).attr('y2', height - bottom).attr('stroke', '#e1e8dc');
        svg.append('text').attr('x', x(tick)).attr('y', height - 8).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#485b4c')
          .text(tick === 0 ? '0' : `${tick / 1000}k`);
      }
    }
    svg.append('text').attr('x', width - 82).attr('y', 14).attr('text-anchor', 'end').attr('font-size', 11).attr('font-weight', 700).attr('fill', '#354c3e').text('Total t');
    svg.append('text').attr('x', width - 8).attr('y', 14).attr('text-anchor', 'end').attr('font-size', 11).attr('font-weight', 700).attr('fill', '#354c3e').text('Code 999');

    const readout = C.element('div', 'cm-hover-readout', 'Click any year bar to synchronize the border map above.');

    for (const r of annualRows) {
      const py = y(String(r.year));
      const bh = y.bandwidth();
      const g = svg.append('g').style('cursor', 'pointer')
        .on('mouseenter', () => {
          readout.textContent = `${r.year} INDEC NCM 28369100 · Total: ${fmt(r.indec_total_net_t)} t (${fmt(r.indec_named_net_t)} t across ${r.named_destinations_with_weight} named + ${fmt(r.indec_confidential_999_net_t)} t under code 999; ${r.named_destinations_weight_withheld} named destinations withheld 's')`;
        })
        .on('click', () => setParams({ auditYear: r.year }));

      if (r.year === selectedYear) {
        g.append('rect').attr('x', 4).attr('y', py - 3).attr('width', width - 8).attr('height', bh + 6)
          .attr('fill', '#edf4eb').attr('rx', 3);
      }
      g.append('text').attr('x', left - 8).attr('y', py + bh / 2 + 4).attr('text-anchor', 'end')
        .attr('font-size', 12.5).attr('font-weight', r.year === selectedYear ? 700 : 600).attr('fill', '#1f3b2e').text(r.year);

      const wNamed = x(r.indec_named_net_t) - left;
      const w999 = x(r.indec_named_net_t + r.indec_confidential_999_net_t) - x(r.indec_named_net_t);
      if (wNamed > 0) {
        g.append('rect').attr('x', left).attr('y', py).attr('width', wNamed).attr('height', bh).attr('fill', '#155e4d');
      }
      if (w999 > 0) {
        g.append('rect').attr('x', left + wNamed).attr('y', py).attr('width', w999).attr('height', bh)
          .attr('fill', 'url(#indec-999-hatch)').attr('stroke', '#8a5519').attr('stroke-width', 0.6);
      }
      g.append('text').attr('x', width - 82).attr('y', py + bh / 2 + 4).attr('text-anchor', 'end')
        .attr('font-size', 12).attr('font-weight', 700).attr('fill', '#1f3b2e').text(numFmt.format(Math.round(r.indec_total_net_t)));
      g.append('text').attr('x', width - 8).attr('y', py + bh / 2 + 4).attr('text-anchor', 'end')
        .attr('font-size', 12).attr('fill', '#5a4622').text((r.confidential_share * 100).toFixed(1) + '%');
    }

    const key = C.element('div', 'cm-series-key');
    const s1 = C.element('span');
    const sw1 = C.element('i', 'cm-swatch-box'); sw1.style.background = '#155e4d';
    s1.append(sw1, document.createTextNode('Published weight for named destinations'));
    const s2 = C.element('span');
    const sw2 = C.element('i', 'cm-swatch-box'); sw2.style.background = '#e2b76b';
    s2.append(sw2, document.createTextNode('Destination withheld (INDEC code 999)'));
    key.append(s1, s2);

    wrap.append(svg.node(), key, readout);
    return wrap;
  }

  function renderMonthlySeriesWithGaps(C, pts, unit, label, suppressedNote) {
    const wrap = C.element('div');
    const width = 620, height = 248, left = 56, right = 18, top = 18, bottom = 30;
    const svg = d3.create('svg')
      .attr('class', 'cm-chart-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', label);

    const valid = pts.filter(p => finite(p.value));
    const x = d3.scaleLinear().domain([0, pts.length - 1]).range([left, width - right]);
    const y = d3.scaleLinear().domain([0, (d3.max(valid, p => p.value) || 1) * 1.08]).nice().range([height - bottom, top]);

    // Shade contiguous missing/confidential blocks so missing != 0 is visually unmistakable
    let blockStart = null;
    for (let i = 0; i <= pts.length; i++) {
      const missing = i < pts.length && !finite(pts[i].value);
      if (missing && blockStart === null) blockStart = i;
      if (!missing && blockStart !== null) {
        const x0 = x(Math.max(0, blockStart - 0.4));
        const x1 = x(Math.min(pts.length - 1, i - 0.6));
        svg.append('rect').attr('x', x0).attr('y', top).attr('width', Math.max(3, x1 - x0)).attr('height', height - top - bottom)
          .attr('fill', '#f3ede0');
        blockStart = null;
      }
    }

    for (const tick of y.ticks(5)) {
      svg.append('line').attr('x1', left).attr('x2', width - right).attr('y1', y(tick)).attr('y2', y(tick)).attr('stroke', '#e1e8dc');
      svg.append('text').attr('x', left - 6).attr('y', y(tick) + 4).attr('text-anchor', 'end').attr('font-size', 11.5).attr('fill', '#485b4c').text(compactFmt.format(tick));
    }
    pts.forEach((p, idx) => {
      if (p.period.endsWith('01')) {
        svg.append('text').attr('x', x(idx)).attr('y', height - 8).attr('text-anchor', 'start').attr('font-size', 11.5).attr('fill', '#485b4c').text(p.period.slice(0, 4));
      }
    });

    svg.append('path')
      .datum(pts.map((p, idx) => ({ ...p, idx })))
      .attr('d', d3.line().defined(p => finite(p.value)).x(p => x(p.idx)).y(p => y(p.value)))
      .attr('fill', 'none').attr('stroke', '#1f6f5f').attr('stroke-width', 2.2);

    for (const p of pts.map((d, idx) => ({ ...d, idx })).filter(d => finite(d.value))) {
      svg.append('circle').attr('cx', x(p.idx)).attr('cy', y(p.value)).attr('r', 2.8).attr('fill', '#1f6f5f');
    }

    const readout = C.element('div', 'cm-hover-readout', suppressedNote);
    const cursor = svg.append('line').attr('y1', top).attr('y2', height - bottom).attr('stroke', '#b45309').attr('stroke-width', 1.2).attr('visibility', 'hidden');
    svg.append('rect').attr('x', left).attr('y', top).attr('width', width - left - right).attr('height', height - top - bottom)
      .attr('fill', 'transparent')
      .on('mousemove', event => {
        const [mx] = d3.pointer(event);
        const idx = Math.max(0, Math.min(pts.length - 1, Math.round(x.invert(mx))));
        const p = pts[idx];
        cursor.attr('x1', x(idx)).attr('x2', x(idx)).attr('visibility', 'visible');
        readout.textContent = finite(p.value)
          ? `${p.period} · ${fmt(p.value)} ${unit} (${p.status})`
          : `${p.period} · Unavailable / suppressed (${p.status}) — never plotted as zero`;
      })
      .on('mouseleave', () => cursor.attr('visibility', 'hidden'));

    const key = C.element('div', 'cm-series-key');
    const s1 = C.element('span');
    const sw1 = C.element('i', 'cm-swatch'); sw1.style.background = '#1f6f5f';
    s1.append(sw1, document.createTextNode(`Published monthly ${unit}`));
    const s2 = C.element('span');
    const sw2 = C.element('i', 'cm-swatch-box'); sw2.style.background = '#f3ede0';
    s2.append(sw2, document.createTextNode('Suppressed / publisher dash interval (kept null)'));
    key.append(s1, s2);

    wrap.append(svg.node(), key, readout);
    return wrap;
  }

  function renderChinaOriginsChart(C, originsRows, selectedYear) {
    const wrap = C.element('div');
    const width = 620, height = 252, left = 54, right = 148, top = 20, bottom = 28;
    const svg = d3.create('svg')
      .attr('class', 'cm-chart-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', "China's lithium carbonate imports by origin, 2020–2025 (metric tonnes, HS 283691)");

    const maxTot = d3.max(originsRows, r => r.world_imports_t) || 250000;
    const x = d3.scaleLinear().domain([0, maxTot * 1.04]).range([left, width - right]);
    const y = d3.scaleBand().domain(originsRows.map(r => String(r.year))).range([top, height - bottom]).padding(0.32);

    for (const tick of [0, 50000, 100000, 150000, 200000, 250000]) {
      if (tick <= maxTot * 1.04) {
        svg.append('line').attr('x1', x(tick)).attr('x2', x(tick)).attr('y1', top - 4).attr('y2', height - bottom).attr('stroke', '#e1e8dc');
        svg.append('text').attr('x', x(tick)).attr('y', height - 8).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#485b4c')
          .text(tick === 0 ? '0' : `${tick / 1000}k`);
      }
    }
    svg.append('text').attr('x', width - 86).attr('y', 14).attr('text-anchor', 'end').attr('font-size', 11).attr('font-weight', 700).attr('fill', '#354c3e').text('World t');
    svg.append('text').attr('x', width - 6).attr('y', 14).attr('text-anchor', 'end').attr('font-size', 11).attr('font-weight', 700).attr('fill', '#354c3e').text('ARG share');

    const readout = C.element('div', 'cm-hover-readout', 'From 2024 to 2025, arrivals into China from Argentina rose 57.5% while arrivals from Chile fell 16.9%.');

    for (const r of originsRows) {
      const py = y(String(r.year));
      const bh = y.bandwidth();
      const g = svg.append('g').style('cursor', 'pointer')
        .on('mouseenter', () => {
          readout.textContent = `${r.year} China imports · World: ${fmt(r.world_imports_t)} t — Chile: ${fmt(r.from_chile_t)} t (${(r.chile_share * 100).toFixed(1)}%), Argentina: ${fmt(r.from_argentina_t)} t (${(r.argentina_share * 100).toFixed(1)}%), Other: ${fmt(r.other_origins_t)} t`;
        })
        .on('click', () => setParams({ auditYear: r.year }));

      if (r.year === selectedYear) {
        g.append('rect').attr('x', 4).attr('y', py - 3).attr('width', width - 8).attr('height', bh + 6).attr('fill', '#edf4eb').attr('rx', 3);
      }
      g.append('text').attr('x', left - 8).attr('y', py + bh / 2 + 4).attr('text-anchor', 'end')
        .attr('font-size', 12.5).attr('font-weight', r.year === selectedYear ? 700 : 600).attr('fill', '#1f3b2e').text(r.year);

      let curX = left;
      for (const [val, col] of [[r.from_chile_t, '#12645e'], [r.from_argentina_t, '#c68a3b'], [r.other_origins_t, '#b8c6cb']]) {
        const w = Math.max(0, x(val) - left);
        if (w > 0) {
          g.append('rect').attr('x', curX).attr('y', py).attr('width', w).attr('height', bh).attr('fill', col);
          curX += w;
        }
      }
      g.append('text').attr('x', width - 86).attr('y', py + bh / 2 + 4).attr('text-anchor', 'end')
        .attr('font-size', 12).attr('font-weight', 700).attr('fill', '#1f3b2e').text(numFmt.format(Math.round(r.world_imports_t)));
      g.append('text').attr('x', width - 6).attr('y', py + bh / 2 + 4).attr('text-anchor', 'end')
        .attr('font-size', 12).attr('fill', '#7c5116').text((r.argentina_share * 100).toFixed(1) + '%');
    }

    const key = C.element('div', 'cm-series-key');
    for (const [lbl, col] of [['Chile', '#12645e'], ['Argentina', '#c68a3b'], ['Other origins (world minus CHL & ARG)', '#b8c6cb']]) {
      const s = C.element('span');
      const sw = C.element('i', 'cm-swatch-box'); sw.style.background = col;
      s.append(sw, document.createTextNode(lbl));
      key.append(s);
    }
    wrap.append(svg.node(), key, readout);
    return wrap;
  }

  async function renderMetalsAudit(C, params, worldGeo, reqId) {
    const reg = await loadMetalsRegister(C);
    if (reqId !== revision) return null;
    verifyMetalsRegisterIntegrity(reg);

    byId('starter-pills').replaceChildren();
    const auditViews = [
      ['arg-importer', "Argentina · Foreign importing economies' records (UN Comtrade)"],
      ['arg-exporter', 'Argentina · Exporter-reported records (UN Comtrade)'],
      ['arg-indec', 'Argentina · National customs published routes (INDEC NCM 28369100)'],
      ['chl-cochilco', 'Chile · COCHILCO physical export volumes (33 destinations)'],
      ['chl-exporter', 'Chile · Exporter-reported records (UN Comtrade)'],
      ['chl-importer', "Chile · Foreign importing economies' records (UN Comtrade)"],
    ];
    const chosenView = auditViews.some(([k]) => k === params.get('auditView')) ? params.get('auditView') : 'arg-importer';
    const years = [2020, 2021, 2022, 2023, 2024, 2025];
    const chosenYear = years.includes(Number(params.get('auditYear'))) ? Number(params.get('auditYear')) : 2024;
    const drcMetals = ['Cobalt', 'Copper', 'Zinc'];
    const chosenDrcMetal = drcMetals.includes(params.get('drcMetal')) ? params.get('drcMetal') : 'Cobalt';

    // Quick preset pills for the 26 November research highlights
    const presets = [
      ['Argentina 2024 · Importer-reported (24 partners)', { auditView: 'arg-importer', auditYear: 2024 }],
      ['Argentina 2024 · Exporter-reported (1 partner)', { auditView: 'arg-exporter', auditYear: 2024 }],
      ['Argentina 2022 · INDEC 100% code 999', { auditView: 'arg-indec', auditYear: 2022 }],
      ['Argentina 2025 · INDEC 102,842 t surge', { auditView: 'arg-indec', auditYear: 2025 }],
      ['Chile 2025 · COCHILCO vs. Comtrade shift', { auditView: 'chl-cochilco', auditYear: 2025 }],
    ];
    const startersEl = byId('starter-pills');
    for (const [label, patch] of presets) {
      const b = C.button(label, () => setParams(patch));
      b.className = 'cm-pill';
      b.setAttribute('aria-pressed', String(chosenView === patch.auditView && chosenYear === patch.auditYear));
      startersEl.append(b);
    }

    const controls = C.element('div', 'hr-controls');
    C.selectControl(controls, 'Lithium carbonate border ledger', 'cm-audit-view', auditViews, chosenView,
      v => setParams({ auditView: v, auditDest: null }));
    C.selectControl(controls, 'Reporting year', 'cm-audit-year', [...years].reverse().map(y => [y, y]), chosenYear,
      y => setParams({ auditYear: y }));

    const perspective = summarizeBorderPerspective(reg, chosenView, chosenYear);
    const rankedDests = [...perspective.mapByIso.values()]
      .filter(r => finite(r.value) && r.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const chosenDest = perspective.mapByIso.has(params.get('auditDest'))
      ? params.get('auditDest')
      : (rankedDests[0]?.iso3 || perspective.origin);

    const posVals = rankedDests.map(r => r.value);
    const { cuts, labels } = computeNiceCuts(posVals);

    const mapBox = C.mapPanel({
      title: perspective.title,
      hint: `${perspective.publisher}. Switch the border ledger above to see how statistical disclosure rules and partner attribution change mapped destinations without ever summing exporter and importer ledgers.`,
      geometry: worldGeo,
      year: chosenYear,
      cameraKey: 'metals-audit-' + perspective.origin,
      ceiling: Math.max(d3.max(posVals) || 1000, 50000),
      selected: chosenDest,
      lookup: geoId => {
        const rec = perspective.mapByIso.get(geoId);
        return rec ? { id: rec.iso3, value: rec.value } : undefined;
      },
      cuts,
      labels,
      palette: PALETTES['Metals & Minerals'],
      unit: 'tonnes',
      onPick: iso3 => setParams({ auditDest: iso3 }),
    });

    // Side panel: Cross-ledger comparison for the active origin & year
    const side = C.panel(`${perspective.origin === 'ARG' ? 'Argentina' : 'Chile'} border & production reconciliation · ${chosenYear}`);
    if (perspective.origin === 'ARG') {
      const acAnn = reg.arg_chl_border_comparison_2020_2025.annual.find(r => r.origin_iso3 === 'ARG' && r.year === chosenYear);
      const custAnn = reg.argentina_indec_customs_2020_2025.annual.find(r => r.year === chosenYear);
      side.append(C.metrics([
        ['INDEC national customs total', custAnn ? `${fmt(custAnn.indec_total_net_t)} t` : 'Unavailable'],
        ['INDEC named vs. code 999', custAnn ? `${fmt(custAnn.indec_named_net_t)} t named · ${fmt(custAnn.indec_confidential_999_net_t)} t (${(custAnn.confidential_share * 100).toFixed(1)}%) code 999` : 'Unavailable'],
        ['INDEC withheld destinations', custAnn ? `${custAnn.named_destinations_weight_withheld} named countries ('s')` : '0'],
        ['UN Comtrade exporter world', acAnn?.exporter_world_net_t !== null ? `${fmt(acAnn.exporter_world_net_t)} t (${acAnn.export_destinations_with_weight} named)` : 'No exporter rows published'],
        ['UN Comtrade foreign importers', acAnn ? `${fmt(acAnn.foreign_importer_sum_net_t)} t (${acAnn.foreign_importers_with_weight} reporters)` : 'Unavailable'],
        ['INDEC national production', acAnn?.national_production_t !== null ? `${fmt(acAnn.national_production_t)} t (${acAnn.national_status})` : `Unavailable (${acAnn?.national_status || ''})`],
        ['BGS carbonate production', acAnn?.bgs_production_t !== null ? `${fmt(acAnn.bgs_production_t)} t (${acAnn.bgs_status})` : 'Not yet published for 2025'],
      ]));
    } else {
      const chlAnn = reg.chile_lithium_2020_2025.annual.find(r => r.year === chosenYear);
      const acAnn = reg.arg_chl_border_comparison_2020_2025.annual.find(r => r.origin_iso3 === 'CHL' && r.year === chosenYear);
      side.append(C.metrics([
        ['COCHILCO carbonate output', chlAnn ? `${fmt(chlAnn.production_cochilco_t)} t` : 'Unavailable'],
        ['BGS carbonate output', chlAnn?.production_bgs_t !== null ? `${fmt(chlAnn.production_bgs_t)} t` : '2020–2024 edition'],
        ['COCHILCO physical exports', chlAnn ? `${fmt(chlAnn.exports_cochilco_t)} t` : 'Unavailable'],
        ['UN Comtrade exporter net', chlAnn ? `${fmt(chlAnn.exports_comtrade_net_t)} t` : 'Unavailable'],
        ['COCHILCO minus Comtrade', chlAnn ? `+${fmt(chlAnn.export_gap_t)} t (+${(chlAnn.gap_fraction_of_comtrade * 100).toFixed(2)}%)` : 'Unavailable'],
        ['UN foreign importers sum', acAnn ? `${fmt(acAnn.foreign_importer_sum_net_t)} t (${acAnn.foreign_importers_with_weight} reporters)` : 'Unavailable'],
        ['China share (COCHILCO / UN)', chlAnn ? `${(chlAnn.china_share_cochilco * 100).toFixed(1)}% / ${(chlAnn.china_share_comtrade * 100).toFixed(1)}%` : 'Unavailable'],
      ]));
    }

    if (rankedDests.length) {
      side.append(C.element('h3', '', `Largest mapped destinations (${chosenYear})`));
      const topList = C.element('ol', 'hr-top');
      for (const r of rankedDests.slice(0, 6)) {
        const li = C.element('li');
        const b = C.button('', () => setParams({ auditDest: r.iso3 }));
        b.append(C.element('span', '', r.name), C.element('span', '', `${fmt(r.value)} t`));
        li.append(b);
        topList.append(li);
      }
      side.append(topList);
    } else {
      const msg = C.element('div', 'cm-callout-note',
        `Zero destination weights were disclosed in this ledger for ${chosenYear}. Switch to "Foreign importing economies' records" above to inspect the partner shipments reported on the importing side.`);
      side.append(msg);
    }

    const mapGrid = C.element('div', 'hr-grid');
    mapGrid.append(mapBox, side);

    // Banner linking directly to the 3 new 3D Flow Globe collections in pipelines.html
    const flowBanner = C.element('div', 'cm-flow-banner');
    flowBanner.append(
      C.element('span', '', 'Open these 2020–2025 lithium carbonate ledgers in the 3D Orthographic Flow Globe Studio (each keeps reporting sides strictly separate):')
    );
    const flowBtns = C.element('div', 'cm-flow-actions');
    for (const [cid, lbl, primary] of [
      ['trade_lithium_arg_chl_perspectives', 'ARG & CHL Exporter vs. Importer Globe →', true],
      ['trade_lithium_china_imports', 'China Import Origins (2020–2025) →', false],
      ['trade_lithium_argentina_indec', 'Argentina INDEC Code 999 Ledger →', false],
      ['trade_lithium_chile_cochilco', 'Chile COCHILCO vs. Comtrade →', false],
    ]) {
      const a = C.element('a', primary ? 'cm-flow-btn' : 'cm-flow-btn secondary', lbl);
      const mode = cid === 'trade_lithium_china_imports' ? '2d' : 'globe';
      a.href = `/workbench/pipelines.html?collection=${cid}&year=${chosenYear}&mapView=${mode}`;
      flowBtns.append(a);
    }
    flowBanner.append(flowBtns);

    // Section 2A (27 Nov addition): China Lithium Carbonate Imports by Origin (2020-2025) + 2024 Argentina-China Monthly Check
    let chinaDuo = null;
    if (reg.china_imports_2020_2025) {
      const chnOrigPanel = C.panel("China's lithium carbonate imports by origin · HS 283691 (2020–2025)");
      chnOrigPanel.append(
        C.note("China's import records show Argentina's share rising from 19.8% in 2024 (46,508.8 t) to 30.1% in 2025 (73,239.7 t, +57.5%) while Chile's share fell from 78.2% (183,634.0 t) to 62.8% (152,551.0 t, −16.9%). Chile SUBREI separately identifies USD 1,205.0M of 2025 exports to China under SACH 28369130 (one tariff grade within HS 283691)."),
        renderChinaOriginsChart(C, reg.china_imports_2020_2025.origins, chosenYear)
      );

      const chnCheckPanel = C.panel('Argentina → China 2024 monthly disclosure check · Narrowing the 2,380-tonne gap');
      chnCheckPanel.append(
        C.note('In INDEC’s monthly 2024 NCM 28369100 query for destination 310 (China), January 2024 is flagged confidential ("Withheld", kept null). The eleven disclosed months (Feb–Dec 2024) sum to 47,609,122 kg and USD 406,031,369.05 FOB — within 2 kg and USD 0.00 of Argentina’s annual UN Comtrade record (47,609,120 kg), whereas INDEC’s annual destination release published 49,989,122 kg (USD 434,853,587.85).'),
        renderMonthlySeriesWithGaps(
          C,
          reg.china_imports_2020_2025.argentina_china_monthly_2024.map(m => ({
            period: m.period,
            value: m.net_t,
            status: m.disclosure + (m.fob_usd ? ` · USD ${numFmt.format(m.fob_usd)} FOB` : ''),
          })),
          'tonnes',
          'Argentina monthly exports to China in 2024 (NCM 28369100, tonnes)',
          'January 2024 is confidential (null); Feb–Dec 2024 sum to 47,609.122 t (USD 406,031,369.05 FOB).'
        )
      );
      const chkWrap = C.element('div', 'table-wrap');
      const chkTbl = C.element('table', 'hr-table');
      const chkHead = C.element('thead');
      const chkTrH = C.element('tr');
      for (const h of ['2024 Argentina → China series', 'Net weight (kg)', 'FOB value (USD)', 'Coverage']) chkTrH.append(C.element('th', '', h));
      chkHead.append(chkTrH);
      const chkBody = C.element('tbody');
      for (const c of reg.china_imports_2020_2025.argentina_china_2024_checks) {
        const tr = C.element('tr');
        tr.append(
          C.element('td', '', c.series),
          C.element('td', '', numFmt.format(c.net_kg)),
          C.element('td', '', numFmt.format(c.fob_usd)),
          C.element('td', '', c.coverage)
        );
        chkBody.append(tr);
      }
      chkTbl.append(chkHead, chkBody);
      chkWrap.append(chkTbl);
      chnCheckPanel.append(chkWrap);

      chinaDuo = C.element('div', 'cm-audit-duo');
      chinaDuo.append(chnOrigPanel, chnCheckPanel);
    }

    // Section 2: Argentina INDEC Customs Disclosure (2020-2025) + Monthly Mining Output (72 months)
    const argCustomsPanel = C.panel('Argentina lithium carbonate exports · INDEC published routes vs. confidential code 999 (2020–2025)');
    argCustomsPanel.append(
      C.note('INDEC COMEX NCM 28369100 reconciled to 0.001 kg and USD 0.01. In 2021 and 2022, INDEC named 17 and 12 destinations respectively while withholding 100% of individual weights under statistical secrecy ("s") and allocating the entire product weight to confidential destination code 999.'),
      renderIndecCustomsChart(C, reg.argentina_indec_customs_2020_2025.annual, chosenYear)
    );

    const argMonthlyPanel = C.panel('Argentina monthly lithium carbonate production · INDEC Cuadro 7 (2020M01–2025M12)');
    argMonthlyPanel.append(
      C.note('41 monthly positions (2020M01–2023M05) carry INDEC confidentiality symbol "s" and remain null. Because 2023 has only 7/12 disclosed months, no national annual sum is fabricated for 2023; complete provisional 12-month sums begin in 2024 (64,806.9 t) and 2025 (105,431.8 t, +62.7%).'),
      renderMonthlySeriesWithGaps(
        C,
        reg.arg_chl_border_comparison_2020_2025.argentina_monthly_production.map(m => ({
          period: m.period,
          value: m.carbonate_t,
          status: m.publication_status + (m.year_provisional ? ' · provisional*' : ''),
        })),
        'tonnes',
        'Argentina monthly lithium carbonate output (tonnes, 2020M01–2025M12)',
        'Hover over any month (2020M01–2025M12) to inspect INDEC disclosed tonnage or confidentiality status.'
      )
    );
    const argDuo = C.element('div', 'cm-audit-duo');
    argDuo.append(argCustomsPanel, argMonthlyPanel);

    // Section 3: DR Congo CTCPM Monthly/Annual Metal Exports (2020-2024) + BGS 2020-24 Basis Comparison
    const drcPanel = C.panel(`DR Congo monthly export tonnages · CTCPM Table 35 (${chosenDrcMetal}, 2020–2024)`);
    const drcCtrls = C.element('div', 'cm-starters');
    for (const mName of drcMetals) {
      const b = C.button(`DR Congo · ${mName}`, () => setParams({ drcMetal: mName }));
      b.className = 'cm-pill';
      b.setAttribute('aria-pressed', String(chosenDrcMetal === mName));
      drcCtrls.append(b);
    }
    const drcMonthlyRows = reg.national_metal_series
      .filter(r => r.iso3 === 'COD' && r.frequency === 'Monthly' && r.metal === chosenDrcMetal)
      .sort((a, b) => a.period.localeCompare(b.period));
    drcPanel.append(
      drcCtrls,
      C.note('All 15 annual CTCPM Table 35 totals (2020–2024 across Copper, Cobalt and Zinc) agree within 0.02 tonnes with the sum of numeric months. Five 2024 Zinc months carry publisher dashes and remain null. For 2024 cobalt, CTCPM Table 35 reports 198,777.21 t, the Ministry landing page shows 139,840 t, and BGS reports 200,253 t of mined cobalt — all three are preserved without forced reconciliation.'),
      renderMonthlySeriesWithGaps(
        C,
        drcMonthlyRows.map(r => ({ period: r.period, value: r.tonnes, status: `${r.status} · ${r.source_id}` })),
        'tonnes',
        `DR Congo monthly ${chosenDrcMetal} exports (tonnes, 2020-01 to 2024-12)`,
        'Hover over any month (2020-01 to 2024-12) to inspect CTCPM Table 35 tonnage or publisher dash status.'
      )
    );

    const bgsPanel = C.panel('BGS World Mineral Production 2020–24 · Product weight vs. contained metal basis');
    bgsPanel.append(
      C.note('British Geological Survey (2026 edition). Chile’s lithium carbonate product weight (250,605 t in 2024) and elemental lithium content in that carbonate (47,114 t Li) describe the same physical output on two weight bases and must never be added together.')
    );
    const bgsTableWrap = C.element('div', 'table-wrap');
    const bgsTbl = C.element('table', 'hr-table');
    const bgsThead = C.element('thead');
    const bgsTrH = C.element('tr');
    for (const h of ['Series & country', 'Weight basis', '2020', '2021', '2022', '2023', '2024']) {
      bgsTrH.append(C.element('th', '', h));
    }
    bgsThead.append(bgsTrH);
    const bgsTbody = C.element('tbody');
    for (const s of reg.bgs_selected_2020_2024.series) {
      const tr = C.element('tr');
      tr.append(
        C.element('td', '', `${s.country} · ${s.commodity}`),
        C.element('td', '', `${s.basis} (${s.unit})`)
      );
      s.values.forEach((v, idx) => {
        const fl = s.flags[idx] || '';
        tr.append(C.element('td', '', `${fl}${numFmt.format(v)}`));
      });
      bgsTbody.append(tr);
    }
    bgsTbl.append(bgsThead, bgsTbody);
    bgsTableWrap.append(bgsTbl);
    bgsPanel.append(bgsTableWrap, C.note('An asterisk (*) marks a BGS estimate. Source: BGS World Mineral Production 2020–24, pp. 15 & 44.'));

    const drcBgsDuo = C.element('div', 'cm-audit-duo');
    drcBgsDuo.append(drcPanel, bgsPanel);

    // Section 4: Chile Copper Stage & Vintage Table + Exportable Source Tables
    const chlCopperRows = reg.national_metal_series.filter(r => r.iso3 === 'CHL' && r.metal === 'Copper');
    const acYearRoutes = reg.arg_chl_border_comparison_2020_2025.routes.filter(r => r.year === chosenYear);
    const indecYearRows = reg.argentina_indec_customs_2020_2025.destinations.filter(r => r.year === chosenYear);

    const sections = [
      controls,
      mapGrid,
      flowBanner,
      ...(chinaDuo ? [chinaDuo] : []),
      argDuo,
      drcBgsDuo,
      ...(reg.china_imports_2020_2025 ? [
        C.records(
          'China lithium carbonate routes · National exports vs. China-reported imports (2020–2025)',
          ['Year', 'Origin', 'National exports to China (t)', 'National publisher', 'UN exporter net (t)', 'China-reported UN imports (t)', 'WITS imports (t)', 'National minus China (t)', 'Disclosure'],
          reg.china_imports_2020_2025.bilateral_comparison.map(r => [
            r.year, r.origin_iso3, r.national_exports_t, r.national_publisher, r.un_exporter_net_t,
            r.china_un_imports_net_t, r.wits_imports_t, r.national_minus_china_t, r.national_disclosure,
          ]),
          'china-lithium-carbonate-route-comparison-2020-2025.csv'
        ),
      ] : []),
      C.records(
        `Argentina & Chile bilateral border comparison in ${chosenYear} · Exporter vs. Foreign Importer net weight (HS 283691)`,
        ['Year', 'Origin', 'Destination ISO3', 'Partner economy', 'Exporter-reported (t)', 'Foreign importer-reported (t)', 'Reporting coverage'],
        acYearRoutes.map(r => [r.year, r.origin_iso3, r.destination_iso3, r.destination_name, r.exporter_net_t, r.importer_net_t, r.record_coverage]),
        `lithium-border-comparison-${chosenYear}.csv`
      ),
      C.records(
        `Argentina INDEC customs destinations in ${chosenYear} · NCM 28369100 (including withheld 's' & FOB bands)`,
        ['Year', 'INDEC code', 'Destination (INDEC)', 'ISO3', 'Net weight (t)', 'FOB value (USD)', 'Disclosure status', 'FOB band if withheld'],
        indecYearRows.map(r => [r.year, r.indec_code, r.destination_indec, r.iso3 || '—', r.net_weight_t, r.fob_usd, r.weight_status, r.fob_band || '']),
        `argentina-indec-lithium-${chosenYear}.csv`
      ),
      C.records(
        'Chile copper production by stage & publication vintage (COCHILCO bulletins, Yearbook & BGS, 2020–2025)',
        ['Period', 'Stage / measure', 'Source value', 'Source unit', 'Metric tonnes Cu', 'Status', 'Source ID', 'Table / locator'],
        chlCopperRows.map(r => [r.period, r.measure, r.source_value, r.source_unit, r.tonnes, r.status, r.source_id, r.locator]),
        'chile-copper-stages-vintages-2020-2025.csv'
      ),
      C.records(
        'DR Congo monthly-vs-annual export checks · CTCPM Table 35 (2020–2024)',
        ['Year', 'Metal', 'Numeric months', 'Sum of numeric months (t)', 'Printed annual (t)', 'Difference (t)', 'Source ID'],
        reg.drc_monthly_checks.map(c => [c.year, c.metal, c.numeric_months, c.sum_numeric_months_t, c.printed_annual_t, c.difference_t, c.source_id]),
        'drc-ctcpm-monthly-annual-checks-2020-2024.csv'
      ),
      C.sourcePanel(
        'Compiled 26 November 2026 across national statistical and geological offices: Chile COCHILCO (producción y exportaciones físicas de carbonato de litio 1996–2025, Boletín Mensual Dec 2024 & Sept 2026 Table 16, Anuario 2005–2024 & 2000–2025), Argentina INDEC (Índice de producción industrial minero Cuadro 7 & COMEX NCM 28369100 annual databases and portal queries), DR Congo CTCPM (Statistiques Minières Exercice 2024 Tables 32–35 & Ministry of Mines), British Geological Survey (World Mineral Production 2020–24, 2026), and UN Comtrade (HS 283691 annual exporter and mirror-importer queries). Every publisher dash, confidentiality symbol ("s"), and unallocated code 999 pool is retained literally without imputation.',
        [
          ['Chile lithium carbonate source packet (ZIP)', '/data/commodities/metals-2020-2025/Chile_lithium_carbonate_2020-2025.zip', true],
          ['Argentina & Chile two-border source packet (ZIP)', '/data/commodities/metals-2020-2025/Argentina_Chile_lithium_carbonate_2020-2025.zip', true],
          ['Argentina INDEC NCM 28369100 customs packet (ZIP)', '/data/commodities/metals-2020-2025/Argentina_lithium_carbonate_customs_2020-2025.zip', true],
          ['China lithium carbonate import origins & 2024 check packet (ZIP)', '/data/commodities/metals-2020-2025/China_lithium_carbonate_sources_2020-2025.zip', true],
          ['13-tab Metal Statistics Workbook 2020–2025 (XLSX)', '/data/commodities/metals-2020-2025/metals_statistics_2020-2025.xlsx', true],
          ['China 2020–2025 lithium carbonate imports chart (PDF)', '/data/commodities/metals-2020-2025/China_lithium_carbonate_imports_2020-2025.pdf', true],
          ['2024 Argentina export-vs-import border map (PDF)', '/data/commodities/metals-2020-2025/Argentina_lithium_trade_map_2024.pdf', true],
          ['Argentina 2020–2025 INDEC disclosure chart (PDF)', '/data/commodities/metals-2020-2025/Argentina_lithium_carbonate_customs_2020-2025.pdf', true],
          ['National metal series flat extract (CSV.GZ)', '/data/commodities/critical-metals-register.csv.gz', true],
          ['Complete JSON register & SHA-256 manifest', '/data/commodities/critical-metals-register.json'],
        ]
      ),
    ];
    return sections;
  }

  async function render() {
    const C = window.PublicEvidenceComponents;
    if (!C) return;
    const id = ++revision;
    const params = new URLSearchParams(location.search);
    const activeLens = params.get('lens') === 'metals-audit' ? 'metals-audit' : 'prices';
    renderLensTabs(C, activeLens);

    byId('status').hidden = false;
    byId('status').textContent = activeLens === 'metals-audit'
      ? 'Opening the 2020–2025 national critical-metals and border-reporting register…'
      : 'Opening the 1960–2026 world commodity price and production collection…';
    byId('content').setAttribute('aria-busy', 'true');

    try {
      if (activeLens === 'metals-audit') {
        const worldGeo = await C.json('/workbench/data/map-geometry/world.json');
        if (id !== revision) return;
        const sections = await renderMetalsAudit(C, params, worldGeo, id);
        if (!sections || id !== revision) return;
        byId('content').replaceChildren(...sections);
        byId('status').hidden = true;
        return;
      }

      const [pink, worldGeo] = await Promise.all([
        C.json('/data/commodities/pink-sheet.json'),
        C.json('/workbench/data/map-geometry/world.json'),
      ]);
      if (id !== revision) return;

      const allItems = [...pink.commodities, ...pink.indices];
      const groups = ['All groups', ...new Set(allItems.map(x => x.group))];
      const chosenGroup = groups.includes(params.get('group')) ? params.get('group') : 'All groups';
      const filteredItems = chosenGroup === 'All groups' ? allItems : allItems.filter(x => x.group === chosenGroup);
      const item = filteredItems.find(x => x.id === params.get('commodity'))
        || allItems.find(x => x.id === params.get('commodity'))
        || filteredItems.find(x => x.id === 'crude-oil-brent')
        || filteredItems[0];

      const startersEl = byId('starter-pills');
      startersEl.replaceChildren();
      for (const [sid, slabel] of STARTERS) {
        if (!allItems.some(x => x.id === sid)) continue;
        const b = C.button(slabel, () => setParams({ group: null, commodity: sid, country: null }));
        b.className = 'cm-pill';
        b.setAttribute('aria-pressed', String(item.id === sid));
        startersEl.append(b);
      }

      const allowedBases = ['both', 'monthly', 'real', 'nominal'];
      const basis = allowedBases.includes(params.get('basis')) ? params.get('basis') : 'both';

      const prod = item.production_pairing ? await loadProduction(item.production_pairing, C) : null;
      if (id !== revision) return;

      const mapYears = prod?.years?.length ? prod.years : pink.years;
      const reqYear = Number(params.get('year'));
      const chosenYear = mapYears.includes(reqYear) ? reqYear : (prod ? prod.years.at(-1) : pink.years.at(-1));

      const controls = C.element('div', 'hr-controls');
      C.selectControl(controls, 'Commodity group', 'cm-group', groups.map(g => [g, g]), chosenGroup,
        nextGroup => {
          const firstInGroup = nextGroup === 'All groups' ? item.id : (allItems.find(x => x.group === nextGroup)?.id || item.id);
          setParams({ group: nextGroup === 'All groups' ? null : nextGroup, commodity: firstInGroup, country: null });
        });
      C.selectControl(controls, 'Benchmark series', 'cm-commodity', filteredItems.map(x => [x.id, `${x.name} (${x.unit})`]), item.id,
        nextId => setParams({ commodity: nextId, country: null }));
      C.selectControl(controls, 'Price series view', 'cm-basis', [
        ['both', 'Annual · Real 2010 USD & Nominal (1960–2025)'],
        ['monthly', 'Monthly · Nominal USD (1960M01–2026M10)'],
        ['real', 'Annual · Real 2010 USD only'],
        ['nominal', 'Annual · Nominal USD only'],
      ], basis, nextBasis => setParams({ basis: nextBasis }));
      C.selectControl(controls, prod ? 'Production map year' : 'Reference year', 'trade-year', [...mapYears].reverse().map(y => [y, y]), chosenYear,
        nextYr => setParams({ year: nextYr }));

      const summary = summarizePriceHistory(pink.years, item.annual_nominal, item.annual_real_2010, pink.months, item.monthly_nominal);
      const pricePanel = C.panel(`${item.name} · World Bank Pink Sheet (1960–2026)`);
      if (item.description) pricePanel.append(C.note(`Benchmark specification: ${item.description}`));
      pricePanel.append(renderPriceChart(C, item, pink, basis, chosenYear));

      if (item.related_flow_collection || item.group === 'Metals & Minerals') {
        const flowBanner = C.element('div', 'cm-flow-banner');
        const labelTxt = item.related_flow_collection
          ? `Bilateral trade pathway available: ${FLOW_LABELS[item.related_flow_collection] || item.related_flow_collection}. Separate customs ledger; physical trade weights and spot benchmarks have distinct coverage.`
          : 'National critical-metal statistics & border-reporting audit available (Chile COCHILCO, Argentina INDEC, DR Congo CTCPM & BGS, 2020–2025).';
        flowBanner.append(C.element('span', '', labelTxt));
        const actions = C.element('div', 'cm-flow-actions');
        if (item.related_flow_collection) {
          const flowLink = C.element('a', 'cm-flow-btn', 'Explore bilateral commodity flows →');
          flowLink.href = `/workbench/pipelines.html?collection=${encodeURIComponent(item.related_flow_collection)}`;
          actions.append(flowLink);
        }
        if (item.group === 'Metals & Minerals') {
          const auditBtn = C.button('2020–2025 Critical Metals & Border Audit →', () => setParams({ lens: 'metals-audit' }));
          auditBtn.className = item.related_flow_collection ? 'cm-flow-btn secondary' : 'cm-flow-btn';
          actions.append(auditBtn);
        }
        flowBanner.append(actions);
        pricePanel.append(flowBanner);
      }

      const statsSide = C.panel('Benchmark summary');
      const yearIdx = pink.years.indexOf(chosenYear);
      const selNom = yearIdx >= 0 ? item.annual_nominal[yearIdx] : null;
      const selReal = yearIdx >= 0 ? item.annual_real_2010[yearIdx] : null;
      statsSide.append(C.metrics([
        ['Category', item.group],
        ['Reporting unit', item.unit],
        [chosenYear + ' nominal price', finite(selNom) ? `${fmt(selNom)} ${item.unit}` : 'Unavailable'],
        [chosenYear + ' real (2010 USD)', finite(selReal) ? `${fmt(selReal)} ${item.unit}` : 'Unavailable'],
        ['Latest annual (' + (summary.latestAnnualNominal?.year || '—') + ')', summary.latestAnnualNominal ? `${fmt(summary.latestAnnualNominal.value)} ${item.unit}` : 'Unavailable'],
        ['Latest monthly (' + (summary.latestMonthly?.period || '—') + ')', summary.latestMonthly ? `${fmt(summary.latestMonthly.value)} ${item.unit}` : 'Unavailable'],
        ['Real 2010 USD peak', summary.realPeak ? `${fmt(summary.realPeak.value)} (${summary.realPeak.year})` : 'Unavailable'],
        ['Real 2010 USD trough', summary.realTrough ? `${fmt(summary.realTrough.value)} (${summary.realTrough.year})` : 'Unavailable'],
      ]));
      statsSide.append(C.note(`${pink.annual_vintage}. ${pink.monthly_vintage}.`));

      const priceLayout = C.element('div', 'cm-price-layout');
      priceLayout.append(pricePanel, statsSide);

      const sections = [controls, priceLayout];

      if (prod) {
        const yearMap = prod.byYear.get(chosenYear) || new Map();
        const ranked = [...yearMap.values()].filter(r => finite(r.value)).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
        const defaultCountry = ranked[0]?.iso3 || prod.countries[0]?.iso3 || 'USA';
        const chosenCountry = prod.countries.some(c => c.iso3 === params.get('country')) ? params.get('country') : defaultCountry;

        C.selectControl(controls, 'Producing country', 'partner', prod.countries.map(c => [c.iso3, c.name]), chosenCountry,
          nextIso => setParams({ country: nextIso }));

        const allPositiveVals = [];
        for (const ym of prod.byYear.values()) {
          for (const r of ym.values()) if (finite(r.value)) allPositiveVals.push(r.value);
        }
        const yearVals = ranked.map(r => r.value);
        const { cuts, labels } = computeNiceCuts(yearVals.length >= 4 ? yearVals : allPositiveVals);
        const palette = PALETTES[item.group] || PALETTES.default;
        const byGeoId = new Map();
        for (const r of yearMap.values()) {
          if (r.geo_id) byGeoId.set(r.geo_id, r);
        }

        const mapBox = C.mapPanel({
          title: `${prod.title} · ${chosenYear}`,
          hint: `Physical output in ${prod.unit} (${prod.publisher}). Select any producing country on the map or list to pair its output history beside the world price.`,
          geometry: worldGeo,
          year: chosenYear,
          cameraKey: 'commodity-' + item.id,
          ceiling: d3.max(allPositiveVals) || 1,
          selected: chosenCountry === 'XKX' ? 'KOS' : chosenCountry,
          lookup: geoId => {
            const rec = byGeoId.get(geoId);
            return rec ? { id: rec.iso3, value: rec.value } : undefined;
          },
          cuts,
          labels,
          palette,
          unit: prod.unit,
          onPick: iso3 => setParams({ country: iso3 }),
        });

        const countryMeta = prod.countries.find(c => c.iso3 === chosenCountry);
        const countryName = countryMeta?.name || chosenCountry;
        const countryYearRec = yearMap.get(chosenCountry);
        const worldListedSum = ranked.length ? d3.sum(ranked, r => r.value) : null;
        const shareStr = finite(countryYearRec?.value) && finite(worldListedSum) && worldListedSum > 0
          ? ((countryYearRec.value / worldListedSum) * 100).toFixed(2) + '% of listed country sum'
          : 'Unavailable';

        const prodSide = C.panel(`${countryName} · ${chosenYear}`);
        prodSide.append(C.metrics([
          ['Selected country output', finite(countryYearRec?.value) ? `${fmt(countryYearRec.value)} ${prod.unit}` : 'Unavailable'],
          ['Share of listed countries', shareStr],
          ['Countries with numeric value', `${ranked.length}`],
          ['Sum of listed countries', finite(worldListedSum) ? `${fmt(worldListedSum)} ${prod.unit}` : 'Unavailable'],
        ]));
        if (countryYearRec?.flag) {
          const fDesc = prod.flags?.[countryYearRec.flag];
          prodSide.append(C.note(`Source flag: ${countryYearRec.flag}${fDesc ? ' · ' + fDesc : ''}`));
        }
        prodSide.append(C.element('h3', '', `Largest listed producers in ${chosenYear}`));
        const topList = C.element('ol', 'hr-top');
        for (const r of ranked.slice(0, 8)) {
          const li = C.element('li');
          const b = C.button('', () => setParams({ country: r.iso3 }));
          b.append(C.element('span', '', r.name), C.element('span', '', `${fmt(r.value)} ${prod.unit}`));
          li.append(b);
          topList.append(li);
        }
        prodSide.append(topList);

        const prodGrid = C.element('div', 'hr-grid');
        prodGrid.append(mapBox, prodSide);
        sections.push(prodGrid);

        const pairedRows = pairAnnualPriceAndProduction(pink.years, item.annual_nominal, item.annual_real_2010, prod.byCountry, chosenCountry);
        const minOverlapYear = Math.max(pink.years[0], prod.years[0] || pink.years[0]);
        const maxOverlapYear = Math.min(pink.years.at(-1), prod.years.at(-1) || pink.years.at(-1));
        const windowRows = pairedRows.filter(r => r.year >= Math.min(1960, minOverlapYear) && r.year <= Math.max(2025, maxOverlapYear));

        const pairedPanel = C.panel(`Paired history · World benchmark price vs. ${countryName} production`, 'hr-history');
        const chartsGrid = C.element('div', 'hr-charts');
        const useReal = item.annual_real_2010.some(finite);
        chartsGrid.append(
          renderSmallHistory(
            C,
            `${item.name} · ${useReal ? 'Real 2010 USD' : 'Nominal USD'} (${item.unit})`,
            windowRows.map(r => ({ year: r.year, value: useReal ? r.real2010 : r.nominal })),
            chosenYear,
            '#1f6f5f',
            item.unit
          ),
          renderSmallHistory(
            C,
            `${countryName} physical output · ${prod.unit}`,
            windowRows.map(r => ({ year: r.year, value: r.production })),
            chosenYear,
            '#996923',
            prod.unit
          )
        );
        pairedPanel.append(
          chartsGrid,
          C.note(item.production_pairing.note || 'Each chart keeps its own native unit and vertical scale. Missing years remain unjoined gaps without interpolation.')
        );
        sections.push(pairedPanel);

        sections.push(
          C.records(
            `Producing countries in ${chosenYear} · ${prod.title}`,
            ['Country / area', 'ISO3', 'Year', `Production (${prod.unit})`, 'Source flag / status'],
            [...yearMap.values()]
              .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name))
              .map(r => [r.name, r.iso3, r.year, r.value, r.flag || '']),
            `commodity-producers-${item.id}-${chosenYear}.csv`
          ),
          C.records(
            `Annual world price & ${countryName} production (1960–2025)`,
            ['Year', `Nominal price (${item.unit})`, `Real 2010 USD price (${item.unit})`, `${countryName} production (${prod.unit})`, 'Production source flag'],
            pairedRows.map(r => [r.year, r.nominal, r.real2010, r.production, r.flag]),
            `commodity-paired-${item.id}-${chosenCountry}.csv`
          )
        );
      } else {
        sections.push(
          C.records(
            `Annual world benchmark history · ${item.name} (1960–2025)`,
            ['Year', `Nominal (${item.unit})`, `Real 2010 USD (${item.unit})`],
            pink.years.map((yr, i) => [yr, item.annual_nominal[i], item.annual_real_2010[i]]),
            `pink-sheet-annual-${item.id}.csv`
          )
        );
      }

      if (basis === 'monthly') {
        sections.push(
          C.records(
            `Monthly nominal world price history · ${item.name} (1960M01–2026M10)`,
            ['Month', `Nominal price (${item.unit})`],
            pink.months.map((m, i) => [m, item.monthly_nominal[i]]),
            `pink-sheet-monthly-${item.id}.csv`
          )
        );
      }

      sections.push(
        C.sourcePanel(
          'World benchmark commodity prices and price indices come from the World Bank Commodity Price Data (The Pink Sheet, annual release updated September 2, 2026; monthly release updated November 3, 2026). Paired country physical output histories come from FAOSTAT Crops & Livestock (QCL) and Fertilizers by Nutrient (RFN) for agricultural and nutrient series, USGS Mineral Commodity Summaries / Minerals Yearbook for metals and minerals, and EIA International Energy Statistics for fossil fuels. Missing symbols stay null; separate publishers and market stages are never merged into synthetic balances.',
          [
            ['Annual Pink Sheet CSV (GZIP)', '/data/commodities/pink-sheet-annual.csv.gz', true],
            ['Monthly Pink Sheet CSV (GZIP)', '/data/commodities/pink-sheet-monthly.csv.gz', true],
            ['Original World Bank Excel workbooks (ZIP)', '/data/commodities/pink-sheet-sources.zip', true],
            ['FAOSTAT country production CSV (GZIP)', '/data/commodities/faostat-production.csv.gz', true],
            ['FAOSTAT source extract & flags (ZIP)', '/data/commodities/faostat-production-sources.zip', true],
            ['2020–2025 Critical Metals & Border Audit →', '/commodities.html?lens=metals-audit'],
            ['Provenance & SHA-256 checksums', '/data/commodities/pink-sheet-provenance.json'],
            ['World Bank Commodity Markets', 'https://www.worldbank.org/en/research/commodity-markets'],
          ]
        )
      );

      byId('content').replaceChildren(...sections);
      byId('status').hidden = true;
    } catch (err) {
      if (id !== revision) return;
      byId('content').replaceChildren();
      byId('status').replaceChildren(
        document.createTextNode('The world commodities collection could not open: ' + err.message + ' '),
        C.button('Try again', render)
      );
      console.error(err);
    } finally {
      if (id === revision) byId('content').removeAttribute('aria-busy');
    }
  }

  window.addEventListener('popstate', render);
  window.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})();
