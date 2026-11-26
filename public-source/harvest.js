/* Public, source-attached food and agriculture explorers. */
(() => {
  'use strict';
  const base = '/data/wheat-weather/';
  const byId = id => document.getElementById(id);
  const cache = new Map();
  const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
  const compact = new Intl.NumberFormat('en-US', {notation: 'compact', maximumSignificantDigits: 3});
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const display = value => finite(value) ? number.format(value) : 'Unavailable';
  const tones = {
    wheat: ['#f2e7be', '#e4c267', '#c69a35', '#94681e', '#603e14'],
    rain: ['#dceef2', '#acd8e0', '#75b7c7', '#3a859d', '#205669'],
    yield: ['#e1edce', '#c0d69f', '#8db56e', '#588c4e', '#2d5939']
  };
  const blank = '#dbdfd8';
  let revision = 0;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function link(label, href, download = false) {
    const node = element('a', '', label);
    node.href = href;
    if (download) node.download = '';
    return node;
  }
  function button(label, action) {
    const node = element('button', '', label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function panel(title, extraClass = '') {
    const box = element('section', 'hr-panel ' + extraClass);
    box.append(element('h2', '', title));
    return box;
  }
  function note(text) { return element('p','hr-note',text); }
  function json(url) {
    if (!cache.has(url)) cache.set(url, fetch(url).then(response => {
      if (!response.ok) throw new Error('Source file unavailable (' + response.status + ').');
      return response.json();
    }).catch(error => { cache.delete(url); throw error; }));
    return cache.get(url);
  }
  function selectControl(parent, title, id, options, selected, action) {
    const label = element('label', '', title);
    const select = element('select');
    select.id = id;
    for (const [value, name] of options) select.add(new Option(name, String(value)));
    select.value = String(selected);
    select.addEventListener('change', () => action(select.value));
    label.append(select);
    parent.append(label);
  }
  function setParams(changes) {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (url.href !== location.href) history.pushState(null, '', url);
    render();
  }
  function getYear(params, years, fallback) {
    const year = Number(params.get('year'));
    return years.includes(year) ? year : fallback;
  }
  function metrics(entries) {
    const list = element('dl', 'hr-metrics');
    for (const [label, value] of entries) {
      const row = element('div');
      row.append(element('dt', '', label), element('dd', '', value));
      list.append(row);
    }
    return list;
  }
  function records(title, headers, rows, filename, formatCell = value => value ?? 'Unavailable') {
    const box = panel(title, 'hr-records');
    const table = element('table');
    const heading = table.createTHead().insertRow();
    headers.forEach(label => {
      const cell = element('th', '', label); cell.scope = 'col'; heading.append(cell);
    });
    const body = table.createTBody();
    for (const record of rows) {
      const row = body.insertRow();
      record.forEach(value => {row.insertCell().textContent = formatCell(value);});
    }
    const scroll = element('div','hr-table-scroll');
    scroll.setAttribute('role','region'); scroll.setAttribute('aria-label',title); scroll.tabIndex = 0;
    scroll.append(table);
    if (rows.length) box.append(scroll);
    else box.append(note('The source contains no matching records for this selection.'));
    const actions = element('div','hr-downloads');
    if (rows.length) actions.append(button('Download this table (CSV)', () => {
      const csv = d3.csvFormatRows([headers, ...rows.map(row => row.map(value => value ?? ''))]);
      const url = URL.createObjectURL(new Blob([csv + '\r\n'], {type:'text/csv;charset=utf-8'}));
      const a = link('', url, true); a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    box.append(actions);
    return box;
  }
  function sourcePanel(text, links) {
    const box = panel('Sources and downloads', 'hr-sources');
    const actions = element('div', 'hr-downloads');
    for (const [label, href, download] of links) actions.append(link(label,href,download));
    box.append(note(text),actions);
    return box;
  }
  function mapPanel(settings) {
    const {title,hint,geometry,lookup,selected,cuts,labels,palette,unit,onPick}=settings;
    const box = panel(title);
    box.append(note(hint));
    const [[left, bottom],[right, top]] = geometry.bounds;
    const scale = 7.5;
    const height = (top-bottom)*scale;
    const svg = d3.create('svg').attr('class','hr-map').attr('role','img')
      .attr('aria-label',title + '. Use the place selector for keyboard access.')
      .attr('viewBox',[-6,-6,(right-left)*scale+12,height+12].join(' '));
    const path = feature => feature.polygons.flatMap(polygon => polygon.map(ring =>
      ring.map(([x,y],idx) => (idx ? 'L' : 'M') + ((x-left)*scale).toFixed(2) + ',' + ((top-y)*scale).toFixed(2)).join('')+'Z'
    )).join('');
    for (const feature of geometry.features) {
      const data = lookup(feature.id);
      const value = data?.value;
      const fill = finite(value) ? (data.color || palette[d3.bisectRight(cuts,value)]) : blank;
      const shape = svg.append('path').attr('d',path(feature)).attr('fill',fill).attr('fill-rule','evenodd')
        .attr('stroke','#fffef7').attr('stroke-width',.65);
      shape.append('title').text(feature.name + ' · ' + (data?.display || (finite(value) ? display(value)+' '+unit : 'Unavailable')));
      if (data?.id) shape.attr('data-action','select').on('click',() => onPick(data.id));
    }
    const focus = geometry.features.find(feature => feature.id === selected);
    if (focus) svg.append('path').attr('d',path(focus)).attr('fill','none').attr('stroke','#152b2b')
      .attr('stroke-width',2.1).attr('pointer-events','none');
    const legend = element('div','hr-legend');
    [...labels,'Unavailable'].forEach((label,index) => {
      const entry = element('span'), key = element('i','hr-key');
      key.style.backgroundColor = palette[index] || blank; key.setAttribute('aria-hidden','true');
      entry.append(key,document.createTextNode(label)); legend.append(entry);
    });
    box.append(svg.node(),legend);
    return window.EvidenceMapViews.enhance(box,svg.node(),legend,settings);
  }
  function chart(title, rows, chosenYear, color, unit) {
    const fig = element('figure','hr-chart');
    fig.append(element('figcaption','',title));
    const values = rows.filter(row => finite(row.value));
    if (!values.length) { fig.append(note('No values in this period.')); return fig; }
    const width=550, height=155, left=55, right=18, top=13, bottom=29;
    const svg = d3.create('svg').attr('role','img').attr('aria-label',title+' by year, '+unit+'. Exact values are in the tables.')
      .attr('viewBox','0 0 '+width+' '+height);
    const years = rows.map(row => row.year);
    const x = d3.scaleLinear().domain(d3.extent(years)).range([left,width-right]);
    const y = d3.scaleLinear().domain([0,d3.max(values,row=>row.value)||1]).nice().range([height-bottom,top]);
    const ticks = y.ticks(3);
    for(const value of ticks){
      svg.append('line').attr('x1',left).attr('x2',width-right).attr('y1',y(value)).attr('y2',y(value)).attr('stroke','#d8e0d3');
      svg.append('text').attr('x',left-6).attr('y',y(value)+4).attr('text-anchor','end').text(compact.format(value));
    }
    for(const year of years.filter(year=>year===years[0] || year===years.at(-1) || year%5===0 && year<years.at(-1)-1)){
      svg.append('text').attr('x',x(year)).attr('y',height-5).attr('text-anchor','middle').text(year);
    }
    svg.append('line').attr('x1',x(chosenYear)).attr('x2',x(chosenYear)).attr('y1',top).attr('y2',height-bottom)
      .attr('stroke','#627365').attr('stroke-dasharray','3,3');
    svg.append('path').datum(rows)
      .attr('d',d3.line().defined(row=>finite(row.value)).x(row=>x(row.year)).y(row=>y(row.value)))
      .attr('stroke',color).attr('stroke-width',2.5).attr('fill','none');
    for (const row of values) {
      svg.append('circle').attr('cx',x(row.year)).attr('cy',y(row.value)).attr('r',row.year===chosenYear?5:3)
        .attr('fill',color).append('title').text(row.year+' · '+display(row.value)+' '+unit);
    }
    fig.append(svg.node()); return fig;
  }
  function flagText(code, dictionary) {
    return code ? (dictionary?.[code] ? code + ' · ' + dictionary[code] : String(code)) : '';
  }
  async function wheat(params) {
    const [index, geometry] = await Promise.all([
      json(base+'wheat-index.json'), json('/workbench/data/map-geometry/world.json')
    ]);
    const reporter = index.reporters.includes(params.get('reporter')) ? params.get('reporter') : index.defaultReporter;
    const year = getYear(params,index.years,index.defaultYear);
    const data = await json(base+'wheat/'+encodeURIComponent(reporter)+'.json');
    const name = code => index.areas[code]?.name || code;
    const destination = name(reporter);
    const allPartners = [...new Set(data.imports.map(row=>row[1]))].sort((a,b)=>name(a).localeCompare(name(b)));
    const annual = data.imports.filter(row=>row[0]===year).sort((a,b)=>(b[2]??-1)-(a[2]??-1)||name(a[1]).localeCompare(name(b[1])));
    const partner = allPartners.includes(params.get('partner')) ? params.get('partner') : (annual.find(row=>finite(row[2]))?.[1] ?? allPartners[0]);
    const byPartner = new Map(annual.map(row=>[row[1],row]));
    const numericRows = annual.filter(row=>finite(row[2]));
    const pick = code=>setParams({view:'wheat',reporter,year,partner:code});
    const controls = element('div','hr-controls');
    selectControl(controls,'Importing country or area','reporter',index.reporters.map(code=>[code,name(code)]).sort((a,b)=>a[1].localeCompare(b[1])),reporter,
      value=>setParams({view:'wheat',reporter:value,year,partner:null}));
    selectControl(controls,'Trade year','trade-year',[...index.years].reverse().map(value=>[value,value]),year,
      value=>setParams({view:'wheat',reporter,year:value,partner:params.get('partner')}));
    selectControl(controls,'Supplier history','partner',allPartners.map(code=>[code,name(code)]),partner,pick);
    const geoToPartner = new Map(allPartners.filter(code=>index.areas[code]?.iso3).map(code=>[index.areas[code].iso3,code]));
    const map = mapPanel({
      title:'Wheat suppliers to '+destination+' · '+year,
      hint:'Color shows tonnes imported from each supplier. Select a supplier on the map to see its history.',
      geometry, year, cameraKey:"wheat", ceiling:d3.max(data.imports,r=>r[2]), selected:index.areas[partner]?.iso3,
      lookup:id=>{const code=geoToPartner.get(id);return {id:code,value:byPartner.get(code)?.[2]};},
      cuts:[Number.MIN_VALUE,10000,100000,1000000],
      labels:['0 t','Under 10,000','10,000–<100,000','100,000–<1m','1m t or more'],
      palette:tones.wheat,unit:'tonnes',onPick:pick
    });
    const side = panel(destination+' · '+year);
    const total = numericRows.length ? d3.sum(numericRows,row=>row[2]) : null;
    const domestic = data.production.find(row=>row[0]===year);
    side.append(metrics([
      ['Sum of listed quantities',finite(total)?display(total)+' t':'Unavailable'],
      ['Suppliers with a quantity',numericRows.length],
      ['Domestic wheat production',finite(domestic?.[1]) ? display(domestic[1])+' t' : 'Unavailable']
    ]));
    if (domestic?.[2]) side.append(note('Production source: '+flagText(domestic[2],index.productionFlags)+(domestic[3]?' · '+domestic[3]:'')));
    side.append(element('h3','','Largest listed suppliers'));
    const top = element('ol','hr-top');
    for (const row of numericRows.slice(0,5)) {
      const li=element('li'), b=button('',()=>pick(row[1]));
      const supplier = element('span','',name(row[1]));
      if (row[3] && row[3]!=='A') supplier.append(element('small','hr-flag',flagText(row[3],index.flags)));
      b.append(supplier,element('span','',display(row[2])+' t'));
      li.append(b); top.append(li);
    }
    side.append(top);
    if (!numericRows.length) side.append(note('No supplier quantities available for this year.'));
    const grid = element('div','hr-grid'); grid.append(map,side);
    const historyPanel = panel('Trade and production histories','hr-history');
    const history = new Map(data.imports.filter(row=>row[1]===partner).map(row=>[row[0],row]));
    const production = new Map(data.production.map(row=>[row[0],row]));
    const charts = element('div','hr-charts');
    const timeline = index.years.map(y=>({year:y,value:history.get(y)?.[2]}));
    const productionSeries = index.years.map(y=>({year:y,value:production.get(y)?.[1]}));
    charts.append(chart((partner?name(partner):'Supplier')+' to '+destination+' · tonnes',timeline,year,'#996923','tonnes'),
      chart('Wheat grown in '+destination+' · tonnes',productionSeries,year,'#35704e','tonnes'));
    historyPanel.append(charts,note('Each chart has its own scale. Gaps mark years without a source value.'));
    const partnerTable = records('Suppliers to '+destination+' in '+year,['Importer','Year','Supplier','Import tonnes','FAO trade flag'],
      annual.map(row=>[destination,year,name(row[1]),row[2],flagText(row[3],index.flags)]),'wheat-imports-'+reporter+'-'+year+'.csv');
    const yearsTable = records('Annual records for this selection',['Importer','Year','Supplier','Import tonnes','FAO trade flag','Production tonnes','FAO production flag','Production note'],
      index.years.map(y=>{const imp=history.get(y),prod=production.get(y);return [destination,y,partner?name(partner):'',imp?.[2],flagText(imp?.[3],index.flags),prod?.[1],flagText(prod?.[2],index.productionFlags||index.flags),prod?.[3]];}),
      'wheat-history-'+reporter+'-'+(partner||'none')+'.csv');
    const sources = sourcePanel('FAOSTAT’s Detailed Trade Matrix identifies the importing area and its trading partner for wheat grain. The displayed sum covers available bilateral quantities, including source-imputed values. Individual flags appear in the tables. Domestic production comes from FAOSTAT’s crops and livestock production data. The tables include suppliers outside the map geometry.',[
      ['Download wheat data (ZIP)',base+'wheat-imports.zip',true],
      ['Methods and source files',base+'wheat-provenance.json'],
      ['FAO trade matrix','https://www.fao.org/faostat/en/#data/TM'],
      ['FAO crop production','https://www.fao.org/faostat/en/#data/QCL']
    ]);
    return [controls,grid,historyPanel,partnerTable,yearsTable,sources];
  }

  async function weather(params) {
    const [data, geometry] = await Promise.all([
      json(base+'weather.json'), json('/workbench/data/map-geometry/virginia.json')
    ]);
    const places = new Map(data.counties.map(county=>[county.fips,county]));
    const county = places.get(params.get('county')) || places.get('51061') || data.counties[0];
    const years = d3.range(data.startYear,data.endYear+1);
    const year = getYear(params,years,data.endYear);
    const field = params.get('measure')==='yield' ? 'yield' : 'rain';
    const rain = field==='rain';
    const selected = county.rows.find(row=>row.year===year);
    const change = overrides=>setParams({view:'weather',county:county.fips,year,measure:field,...overrides});
    const controls = element('div','hr-controls');
    selectControl(controls,'Virginia county or city','county',data.counties.map(c=>[c.fips,c.name]).sort((a,b)=>a[1].localeCompare(b[1])),county.fips,
      value=>change({county:value}));
    selectControl(controls,'Harvest year','harvest-year',[...years].reverse().map(y=>[y,y]),year,value=>change({year:value}));
    selectControl(controls,'Map measure','map-measure',[['rain','Summer precipitation'],['yield','Corn grain yield']],field,value=>change({measure:value}));
    const map = mapPanel({
      title:(rain?'Summer precipitation':'Corn grain yield')+' · '+year,
      hint:rain?'June, July and August precipitation in inches. Select a county or city to see its harvest history.':
        'Annual corn grain yield in bushels per acre. Select a county or city to see its harvest history.',
      geometry,year,cameraKey:"weather",ceiling:d3.max(data.counties,c=>d3.max(c.rows,r=>r[field])),selected:county.fips, lookup:id=>{
        const place=places.get(id);return {id:place?.fips,value:place?.rows.find(row=>row.year===year)?.[field]};
      },
      cuts:rain?[6,10,14,18]:[50,90,130,170],labels:rain?['Under 6','6–<10','10–<14','14–<18','18 in or more']:
        ['Under 50','50–<90','90–<130','130–<170','170 bu/acre or more'],
      palette:tones[field],unit:rain?'inches':'bu/acre',onPick:id=>change({county:id})
    });
    const side=panel(county.name+' · '+year);
    const withUnit = (v,u)=>finite(v)?display(v)+' '+u:'Unavailable';
    side.append(metrics([['Summer precipitation',withUnit(selected?.rain,'in')],['Corn grain yield',withUnit(selected?.yield,'bu/acre')],
      ['Years with both measures',county.pairedYears+' of '+years.length]]));
    side.append(element('h3','','Summer by month'),metrics([['June',withUnit(selected?.jun,'in')],['July',withUnit(selected?.jul,'in')],['August',withUnit(selected?.aug,'in')]]));
    if (!finite(selected?.yield)) side.append(note(selected?.yieldStatus||'No yield value for this year.'));
    const grid = element('div','hr-grid'); grid.append(map,side);
    const historyPanel = panel(county.name+' through time','hr-history');
    const charts = element('div','hr-charts');
    charts.append(chart('Summer precipitation · inches',county.rows.map(row=>({year:row.year,value:row.rain})),year,'#29728c','inches'),
      chart('Corn grain yield · bushels per acre',county.rows.map(row=>({year:row.year,value:row.yield})),year,'#40774f','bu/acre'));
    historyPanel.append(charts,note('The charts share the same years and use separate vertical scales. Gaps mark unavailable observations.'));
    const countyTable = records('Annual records for '+county.name,['County or city','County FIPS','Year','June (in)','July (in)','August (in)','Summer total (in)','Corn grain yield (bu/acre)','USDA source status'],
      county.rows.map(row=>[county.name,county.fips,row.year,row.jun,row.jul,row.aug,row.rain,row.yield,row.yieldStatus]),'county-weather-corn-'+county.fips+'.csv');
    const sources = sourcePanel('Summer precipitation is the sum of three monthly NOAA county estimates. All three months are required. Corn yield is the USDA NASS annual survey estimate for corn harvested for grain. Irrigation, heat and other growing conditions can also affect yield.',[
      ['Download all county records (CSV)',base+'weather.csv',true],['Methods and source files',base+'weather-provenance.json'],
      ['NOAA Virginia source rows (GZIP)',base+'weather-sources/virginia-noaa-2000-2024.txt.gz',true],
      ['NOAA county climate data','https://doi.org/10.7289/V5M32STR'],['USDA Quick Stats','https://quickstats.nass.usda.gov/']
    ]);
    return [controls,grid,historyPanel,countyTable,sources];
  }

  async function render() {
    const id = ++revision;
    const params = new URLSearchParams(location.search);
    const isWeather = params.get('view')==='weather';
    const title = isWeather?'County weather and corn yield':'World wheat trade';
    document.title=title+' · Public Evidence Library';
    byId('heading').textContent=title;
    byId('intro').textContent=isWeather?'Compare summer precipitation with annual corn yields across Virginia counties and independent cities, 2000–2024.':
      'Explore the countries supplying wheat to each importing area, and compare those imports with domestic wheat production, 2010–2024.';
    for (const [tab,active] of [['weather',isWeather],['wheat',!isWeather]]) {
      if (active) byId('tab-'+tab).setAttribute('aria-current','page');
      else byId('tab-'+tab).removeAttribute('aria-current');
    }
    byId('status').hidden=false;
    byId('status').textContent='Opening the collection…';
    byId('content').setAttribute('aria-busy','true');
    const focus = document.activeElement?.id;
    try {
      const nodes = await (isWeather?weather(params):wheat(params));
      if (id!==revision) return;
      byId('content').replaceChildren(...nodes);
      byId('status').hidden=true;
      if (focus) byId(focus)?.focus({preventScroll:true});
    } catch (error) {
      if (id!==revision) return;
      byId('content').replaceChildren();
      byId('status').replaceChildren(document.createTextNode('The collection could not open. '),button('Try again',render));
      console.error(error);
    } finally { if(id===revision) byId('content').removeAttribute('aria-busy'); }
  }
  // The access collections use the same table, download and map controls.
  if (document.currentScript?.hasAttribute('data-components-only')) {
    window.PublicEvidenceComponents = Object.freeze({
      element, button, panel, note, json, selectControl, metrics, records, sourcePanel, mapPanel
    });
    return;
  }
  window.addEventListener('popstate',render);
  render();
})();
