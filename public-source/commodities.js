/* World Bank Pink Sheet (1960–2026) price histories paired with FAOSTAT, USGS & EIA country production. */
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
    // Retained evidence packet (schema: public-evidence.supplementary-history/v1 or standard series packet)
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

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { normalizeProductionPacket, summarizePriceHistory, pairAnnualPriceAndProduction };
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

  function computeNiceCuts(values) {
    const pos = values.filter(v => finite(v) && v > 0).sort((a, b) => a - b);
    if (pos.length < 4) return { cuts: [1, 10, 100, 1000], labels: ['0 or ≤1', '1–10', '10–100', '100–1K', '>1K'] };
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
      // Break line cleanly whenever consecutive months have null values
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

    // Annual chart (Real + Nominal, Nominal only, or Real only)
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

  async function render() {
    const C = window.PublicEvidenceComponents;
    if (!C) return;
    const id = ++revision;
    const params = new URLSearchParams(location.search);
    byId('status').hidden = false;
    byId('status').textContent = 'Opening the 1960–2026 world commodity price and production collection…';
    byId('content').setAttribute('aria-busy', 'true');

    try {
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

      // Render starter pills
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
      const chosenYear = mapYears.includes(reqYear) ? reqYear : (prod ? (prod.years.includes(2022) && item.production_pairing.kind === 'retained-evidence' && !prod.years.includes(2024) ? prod.years.at(-1) : prod.years.at(-1)) : pink.years.at(-1));

      //Controls
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

      if (item.related_flow_collection) {
        const flowBanner = C.element('div', 'cm-flow-banner');
        flowBanner.append(
          C.element('span', '', `Bilateral trade pathway available: ${FLOW_LABELS[item.related_flow_collection] || item.related_flow_collection}. Separate customs ledger; physical trade weights and spot benchmarks have distinct coverage.`)
        );
        const flowLink = C.element('a', 'cm-flow-btn', 'Explore bilateral commodity flows →');
        flowLink.href = `/workbench/pipelines.html?collection=${encodeURIComponent(item.related_flow_collection)}`;
        flowBanner.append(flowLink);
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

        // Paired Synchronized History Charts (Price vs Selected Country Production)
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

        // Exportable Tables
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
