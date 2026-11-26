/* Household access collections. All measurements are read from the published source packets. */
(() => {
  'use strict';
  const {element,button,panel,note,json,selectControl,metrics,records,sourcePanel,mapPanel} = window.PublicEvidenceComponents;
  const dataPath = '/data/water-food/';
  const el = id => document.getElementById(id);
  const numeric = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = (v, digits = 1) => numeric(v) ? v.toLocaleString('en-US',{maximumFractionDigits:digits}) : 'Unavailable';
  const pct = (r, key) => numeric(r?.[key]) ? (r.qualifiers?.[key] || fmt(r[key]))+'%' : 'Unavailable';
  const gapText = n => numeric(n) ? (n>0?'+':'')+fmt(n)+' pp' : 'Unavailable';
  const waterServices = {safe:'Safely managed',basic:'At least basic'};
  const residences = {total:'National',urban:'Urban',rural:'Rural',gap:'Urban minus rural'};
  const blue = ['#d8eaed','#a9d5db','#77b6c4','#3c829b','#1e526d'];
  const green = ['#e2efcf','#c4dc9e','#92bc75','#598b50','#2e5837'];
  const divergent = ['#6a4526','#ad7649','#e6ccab','#dcebea','#83babe','#33747d'];
  let generation = 0;

  function choose(key, options, fallback, params) {
    const value = params.get(key);
    return options.includes(value) ? value : fallback;
  }
  function change(fields) {
    const url = new URL(location.href);
    for (const [k,v] of Object.entries(fields)) url.searchParams.set(k,v);
    if (url.href !== location.href) history.pushState(null,'',url);
    render();
  }
  const options = object => Object.entries(object);
  const range = (first,last) => d3.range(first,last+1);
  function grid(left,right) {
    const node = element('div','hr-grid'); node.append(left,right); return node;
  }
  function selectedMap(settings, labelFor) {
    const box = mapPanel(settings);
    if (labelFor) {
      const shapes = box.querySelectorAll('.hr-map path title');
      settings.geometry.features.forEach((feature,i)=>{
        shapes[i].textContent = feature.name+' · '+labelFor(feature.id);
      });
    }
    return box;
  }
  function seriesChart(rows, service, selectedYear) {
    const box = element('figure','access-series');
    box.append(element('figcaption','','Population with '+waterServices[service].toLowerCase()+' drinking water (%)'));
    const W=780,H=200,left=42,right=23,top=12,bottom=26;
    const svg=d3.create('svg').attr('viewBox',[0,0,W,H]).attr('role','img').attr('aria-label','National, urban and rural coverage over time on a shared zero to 100 percent scale. Values appear in the annual table.');
    const x=d3.scaleLinear(d3.extent(rows,r=>r.year),[left,W-right]), y=d3.scaleLinear([0,100],[H-bottom,top]);
    for (const p of [0,25,50,75,100]) {
      svg.append('line').attr('x1',left).attr('x2',W-right).attr('y1',y(p)).attr('y2',y(p)).attr('stroke','#d5dfd3');
      svg.append('text').attr('x',left-6).attr('y',y(p)+4).attr('text-anchor','end').text(p);
    }
    for (const yr of rows.map(r=>r.year).filter((v,i,a)=>i===0||v===a.at(-1)||(v%5===0 && v<a.at(-1)-1))) {
      svg.append('text').attr('x',x(yr)).attr('y',H-4).attr('text-anchor','middle').text(yr);
    }
    svg.append('line').attr('x1',x(selectedYear)).attr('x2',x(selectedYear)).attr('y1',top).attr('y2',H-bottom).attr('stroke','#778478').attr('stroke-dasharray','2,3');
    const legend=element('div','hr-legend');
    for (const [key,color,dash] of [['total','#2d4858',''],['urban','#007471','6,3'],['rural','#915826','2,3']]) {
      const path=d3.line().defined(r=>numeric(r[service]?.[key])).x(r=>x(r.year)).y(r=>y(r[service][key]));
      svg.append('path').datum(rows).attr('d',path).attr('stroke',color).attr('stroke-dasharray',dash).attr('stroke-width',2.6).attr('fill','none');
      for (const row of rows.filter(r=>numeric(r[service]?.[key]))) {
        svg.append('circle').attr('cx',x(row.year)).attr('cy',y(row[service][key])).attr('r',row.year===selectedYear?4:1.8).attr('fill',color)
          .append('title').text(residences[key]+' · '+row.year+' · '+pct(row[service],key));
      }
      const item=element('span'),swatch=element('i','hr-key');swatch.style.background=color;
      item.append(swatch,document.createTextNode(residences[key]));legend.append(item);
    }
    box.append(svg.node(),legend);return box;
  }

  async function water(params) {
    const [data,geometry] = await Promise.all([json(dataPath+'water.json'),json('/workbench/data/map-geometry/world.json')]);
    const years=range(data.startYear,data.endYear);
    const year=Number(choose('year',years.map(String),String(data.endYear),params));
    const service=choose('service',Object.keys(waterServices),'safe',params);
    const residence=choose('residence',Object.keys(residences),'gap',params);
    const countries=new Map(data.countries.map(c=>[c.iso3,c]));
    const country=countries.get(params.get('country'))||countries.get(data.defaultCountry);
    const rowsByYear=new Map(country.rows.map(row=>[row.year,row]));
    const current=new Map(data.countries.map(c=>[c.iso3,c.rows.find(row=>row.year===year)?.[service]]));
    const here=current.get(country.iso3);
    const update=overrides=>change({view:'water',country:country.iso3,year,service,residence,...overrides});
    const controls=element('div','hr-controls access-controls');
    selectControl(controls,'Country or area','water-country',data.countries.map(c=>[c.iso3,c.name]).sort((a,b)=>a[1].localeCompare(b[1])),country.iso3,country=>update({country}));
    selectControl(controls,'Service level','water-service',options(waterServices),service,service=>update({service}));
    selectControl(controls,'Map comparison','water-residence',options(residences),residence,residence=>update({residence}));
    selectControl(controls,'Year','water-year',[...years].reverse().map(y=>[y,y]),year,year=>update({year}));
    const isGap=residence==='gap';
    const available=data.countries.filter(c=>numeric(current.get(c.iso3)?.[residence]));
    const valueLabel=code=>isGap?gapText(current.get(code)?.gap):pct(current.get(code),residence);
    const map=selectedMap({
      title:residences[residence]+(isGap?' coverage gap':' coverage')+' · '+year,
      hint:isGap?'Positive values mean a larger share of the urban population has the selected service. Negative values mean rural coverage is higher.':'Share of the '+(residence==='total'?'national':residence)+' population using '+waterServices[service].toLowerCase()+' drinking water.',
      geometry,year,cameraKey:"water",floor:isGap?-100:0,ceiling:100,selected:country.iso3,lookup:id=>({id:countries.has(id)?id:null,value:current.get(id)?.[residence],display:valueLabel(id)}),
      cuts:isGap?[-20,-5,0,5,20]:[25,50,75,90],labels:isGap?['Below −20','−20 to <−5','−5 to <0','0 to <5','5 to <20','20 pp or more']:['Under 25%','25–<50%','50–<75%','75–<90%','90–100%'],
      palette:isGap?divergent:blue,unit:isGap?'pp':'%',onPick:country=>update({country})
    },valueLabel);
    map.append(note(fmt(available.length,0)+' countries and areas have '+(isGap?'both residence estimates':'an estimate for this selection')+'. The table also includes areas without a map polygon.'));
    const side=panel(country.name+' · '+year);
    side.append(element('h3','',waterServices[service]+' drinking water'),metrics([
      ['National population',pct(here,'total')],['Urban population',pct(here,'urban')],['Rural population',pct(here,'rural')],['Urban minus rural',gapText(here?.gap)]
    ]),note(service==='safe'?'An improved source on the premises, available when needed and free from contamination.':'An improved source within a round trip of 30 minutes, including queuing. This level includes safely managed service.'));
    const yearly=years.map(y=>rowsByYear.get(y)||{year:y});
    const history=panel(country.name+' through time','hr-history');
    history.append(seriesChart(yearly,service,year),note('Each series uses its own population as the denominator. Missing estimates leave a gap in the line.'));
    const byCountry=records('Country comparison · '+year,['Country or area','ISO3','Year','Service level','National (%)','Urban (%)','Rural (%)','Urban minus rural (pp)'],
      [...data.countries].sort((a,b)=>(current.get(b.iso3)?.[residence]??-Infinity)-(current.get(a.iso3)?.[residence]??-Infinity)||a.name.localeCompare(b.name)).map(c=>{
        const r=current.get(c.iso3);return [c.name,c.iso3,year,waterServices[service],...['total','urban','rural'].map(k=>report(r,k)),round(r?.gap)];
      }), 'drinking-water-'+service+'-'+year+'.csv');
    const annual=records('Annual records for '+country.name,['Country or area','Year','Service level','National (%)','Urban (%)','Rural (%)','Urban minus rural (pp)'],
      yearly.map(row=>[country.name,row.year,waterServices[service],...['total','urban','rural'].map(k=>report(row[service],k)),round(row[service]?.gap)]),
      'drinking-water-'+country.iso3+'-'+service+'.csv');
    const sources=sourcePanel('The WHO/UNICEF Joint Monitoring Programme publishes household drinking-water estimates by country, residence and year. Tables retain its <1 and >99 labels. Gaps use the underlying estimates for urban and rural residents in the same year. The complete CSV includes source precision and display labels.',[
      ['Download all drinking-water data (CSV)',dataPath+'water.csv',true],['Collection methods',dataPath+'water-provenance.json'],
      ['Original JMP global workbook','https://washdata.org/media/4671/download'],['Drinking-water service definitions','https://washdata.org/topics/drinking-water']
    ]);
    return [controls,grid(map,side),history,annual,byCountry,sources];
  }
  function round(value) { return numeric(value)?Number(value.toFixed(2)):null; }
  function report(record,key) { return record?.qualifiers?.[key]??round(record?.[key]); }
  const methodNames={driving:'Driving distance',straight:'Straight-line distance'};
  const mileLabel=n=>n+(n===1?' mile':' miles');
  function foodHistory(tract,data) {
    const box=panel('Distance to a SNAP-authorized retailer','hr-history');
    box.append(note('Estimated share of tract residents living farther than each distance.'));
    for(const [i,miles] of data.thresholds.entries()) {
      const group=element('div','access-bars');
      group.append(element('h3','',mileLabel(miles)));
      for(const key of data.methods) {
        const value=tract[key].share[i];
        const row=element('div','access-bar-row');
        const rail=element('div','access-bar-rail'), fill=element('div','access-bar-fill '+key);
        if (numeric(value)) fill.style.width=value+'%';
        rail.append(fill);
        row.append(element('span','',methodNames[key]),rail,element('strong','',numeric(value)?fmt(value,2)+'%':'Unavailable'));
        group.append(row);
      }
      box.append(group);
    }
    return box;
  }
  function zoomGeometry(pack,features) {
    const left=d3.min(features,f=>f.bounds[0][0]), right=d3.max(features,f=>f.bounds[1][0]);
    const bottom=d3.min(features,f=>f.bounds[0][1]), top=d3.max(features,f=>f.bounds[1][1]);
    const ratio=Math.min(98/(right-left),48/(top-bottom));
    const dx=(100-(right-left)*ratio)/2, dy=(50-(top-bottom)*ratio)/2;
    if(features.length===pack.features.length) return pack;
    return {bounds:[[0,0],[100,50]],features:features.map(f=>({...f,polygons:f.polygons.map(poly=>poly.map(ring=>
      ring.map(([x,y])=>[(x-left)*ratio+dx,(y-bottom)*ratio+dy]))) }))};
  }
  const countyGeometries=new Map();
  async function food(params) {
    const [data,geo]=await Promise.all([json(dataPath+'food.json'),json(dataPath+'food-geometry.json')]);
    const counties=new Map(data.tracts.map(t=>[t.countyFips,t.county]));
    const tractsByID=new Map(data.tracts.map(t=>[t.geoid,t]));
    const chosen=tractsByID.get(params.get('tract'));
    const county=choose('county',[...counties.keys()],chosen?.countyFips||'51001',params);
    const local=data.tracts.filter(t=>t.countyFips===county);
    const tract=chosen?.countyFips===county?chosen:local[0];
    const method=choose('method',data.methods,'driving',params);
    const miles=Number(choose('miles',data.thresholds.map(String),'1',params));
    const i=data.thresholds.indexOf(miles);
    const metric=choose('metric',['share','count'],'share',params);
    const extent=choose('extent',['county','state'],'county',params);
    const isShare=metric==='share';
    const update=overrides=>change({view:'food',county,tract:tract.geoid,method,miles,metric,extent,...overrides});
    const pickTract=id=>update({tract:id,county:tractsByID.get(id).countyFips});
    const controls=element('div','hr-controls access-controls access-food-controls');
    selectControl(controls,'County or independent city','food-county',[...counties].sort((a,b)=>a[1].localeCompare(b[1])),county,c=>update({county:c,tract:data.tracts.find(t=>t.countyFips===c).geoid,extent:'county'}));
    const names=new Map(geo.features.map(f=>[f.id,f.name]));
    selectControl(controls,'Census tract','food-tract',local.map(t=>[t.geoid,names.get(t.geoid)]),tract.geoid,pickTract);
    selectControl(controls,'Distance method','food-method',options(methodNames),method,method=>update({method}));
    selectControl(controls,'Farther than','food-distance',data.thresholds.map(m=>[m,mileLabel(m)]),miles,miles=>update({miles}));
    selectControl(controls,'Map measure','food-metric',[['share','Share of residents (%)'],['count','Number of residents']],metric,metric=>update({metric}));
    selectControl(controls,'Map area','food-extent',[['county','Selected county or city'],['state','All Virginia tracts']],extent,extent=>update({extent}));
    const geoKey=extent==='state'?'state':county;
    if(!countyGeometries.has(geoKey)) countyGeometries.set(geoKey,extent==='state'?geo:zoomGeometry(geo,geo.features.filter(f=>f.county===county)));
    const geometry=countyGeometries.get(geoKey);
    const map=selectedMap({
      title:(extent==='state'?'Virginia':tract.county)+' · '+mileLabel(miles),
      hint:(isShare?'Share':'Estimated number')+' of residents living farther than '+mileLabel(miles)+' from a SNAP-authorized retailer by '+methodNames[method].toLowerCase()+'. Select a tract for its figures.',
      geometry,period:String(data.year),cameraKey:"food-"+geoKey,ceiling:isShare?100:d3.max(data.tracts,t=>t[method][metric][i]),selected:tract.geoid,lookup:id=>({id,value:tractsByID.get(id)?.[method][metric][i]}),
      cuts:isShare?[Number.MIN_VALUE,25,50,75]:[Number.MIN_VALUE,500,1500,3000],labels:isShare?['0%','Above 0–<25%','25–<50%','50–<75%','75–100%']:['0','1–499','500–1,499','1,500–2,999','3,000 or more'],
      palette:green,unit:isShare?'%':'people',onPick:pickTract
    });
    const side=panel(names.get(tract.geoid));
    side.append(note(tract.county+' · GEOID '+tract.geoid),metrics([
      ['2020 tract population',fmt(tract.population,0)],['Tract classification',tract.urban===1?'Urban':tract.urban===0?'Rural':'Unavailable'],
      ['Residents beyond '+mileLabel(miles),fmt(tract[method].count[i],0)],
      ['Share of tract population',numeric(tract[method].share[i])?fmt(tract[method].share[i],2)+'%':'Unavailable']
    ]),note(methodNames[method]+' to the nearest SNAP-authorized food retailer in the June 2025 directory.'));
    if (tract.population===0) side.append(note('The census recorded zero residents in this tract, so a population percentage is unavailable.'));
    const thresholdRows=data.thresholds.flatMap((m,index)=>data.methods.map(k=>[
      tract.county,tract.geoid,m,methodNames[k],tract.population,tract[k].count[index],tract[k].share[index],tract[k].lowAccess[index]
    ]));
    const details=records('All distances for this tract',['County or city','Tract GEOID','Miles','Distance method','2020 population','Residents beyond distance','Share (%)','USDA low-access flag'],
      thresholdRows,'food-access-'+tract.geoid+'.csv');
    details.append(note('USDA’s low-access flag applies its population criterion to urban tracts at 0.5 or 1 mile and rural tracts at 10 or 20 miles. The people and percentage columns are available across distances.'));
    const table=records('Tracts in '+tract.county,['County or city','Tract GEOID','Distance method','Miles','2020 population','Residents beyond distance','Share (%)'],
      local.map(t=>[t.county,t.geoid,methodNames[method],miles,t.population,t[method].count[i],t[method].share[i]]),'food-access-'+county+'-'+method+'-'+miles+'mi.csv');
    const sources=sourcePanel('USDA estimated retailer access using June 2025 store locations and the spatial distribution of the 2020 Census population. Driving distance follows the road network. Straight-line distance measures geographic separation. The estimates describe how close residents live to an authorized retailer.',[
      ['Download all Virginia records (CSV)',dataPath+'food.csv',true],['Virginia source tables (ZIP)',dataPath+'food-source.zip',true],
      ['Collection methods',dataPath+'food-provenance.json'],['Boundary source',dataPath+'food-geometry-provenance.json'],
      ['USDA Food Access Research Atlas','https://www.ers.usda.gov/data-products/food-access-research-atlas/download-the-data']
    ]);
    return [controls,grid(map,side),foodHistory(tract,data),details,table,sources];
  }

  async function render() {
    const revision=++generation;
    const params=new URLSearchParams(location.search);
    const isFood=params.get('view')==='food';
    const title=isFood?'Virginia food access':'Household drinking water';
    el('heading').textContent=title;
    document.title=title+' · Public Evidence Library';
    el('intro').textContent=isFood?'Explore distances to stores that accept SNAP across Virginia’s 2,186 census tracts. Compare road-network and straight-line estimates for the same population.'
      :'Compare national, urban and rural drinking-water coverage from 2000 through 2024. Select a country to see how access changed.';
    for (const [key,active] of [['water',!isFood],['food',isFood]]) {
      const tab=el('tab-'+key);
      if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
    }
    const status=el('status'),content=el('content'),focus=document.activeElement?.id;
    status.hidden=false;status.textContent='Opening the collection…';content.setAttribute('aria-busy','true');
    try {
      const nodes=await (isFood?food(params):water(params));
      if(revision!==generation)return;
      content.replaceChildren(...nodes); status.hidden=true;
      if(focus)el(focus)?.focus({preventScroll:true});
    }catch(error){
      if(revision!==generation)return;
      content.replaceChildren();status.replaceChildren(document.createTextNode('The collection could not open. '),button('Try again',render));
      console.error(error);
    }finally{if(revision===generation)content.removeAttribute('aria-busy');}
  }
  window.addEventListener('popstate',render);
  render();
})();
