(() => {
  'use strict';
  const {element,button,panel,note,json,selectControl,metrics,records,sourcePanel,mapPanel}=window.PublicEvidenceComponents;
  const base='/data/rent-freight/';
  const finite=n=>typeof n==='number' && Number.isFinite(n);
  const fmt=(n,places=1)=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:places}):'Unavailable';
  const pct=n=>finite(n)?fmt(n)+'%':'Unavailable';
  const id=key=>document.getElementById(key);
  const blue=['#dcebef','#b5d5db','#82b8c4','#488d9e','#205d75'];
  const powerTrade=['#884727','#d0a589','#eeeee7','#88bac3','#276779'];
  const brown=['#f4e9ce','#e8cd98','#c79f65','#a7733a','#734324'];
  let epoch=0;
  function change(values) {
    const url=new URL(location.href);
    for(const [key,value] of Object.entries(values)){
      if(value===null)url.searchParams.delete(key);else url.searchParams.set(key,value);
    }
    if(url.href!==location.href)history.pushState(null,'',url);
    render();
  }
  function choose(params,key,allowed,fallback){return allowed.includes(params.get(key))?params.get(key):fallback;}
  function grid(...panels){const root=element('div','hr-grid');root.append(...panels);return root;}
  function controls(){return element('div','hr-controls rf-controls');}
  function sortedOptions(names){return Object.entries(names).sort((a,b)=>a[1].localeCompare(b[1]));}
  function contextLink(label,topic){const a=element('a','rf-link',label);a.href='/rent-freight.html?view=world&topic='+topic;return a;}
  function bar(label,value,denominator,text,burden=false){
    const row=element('div','rf-bar');row.dataset.burden=String(burden);
    const track=element('div','rf-rail'),fill=element('div','rf-fill');
    fill.style.width=finite(value)&&denominator>0?Math.min(100,100*value/denominator)+'%':'0%';
    track.append(fill);row.append(element('span','',label),track,element('strong','',text));return row;
  }
  const rentMeasures={share50:'50% or more of income',share30:'30% or more of income'};
  async function rent(params){
    const data=await json(base+'rent.json');
    const counties=new Map(data.counties.map(c=>[c.geoid,c]));
    const requested=counties.get(params.get('county'));
    const state=choose(params,'state',Object.keys(data.states),requested?.state||'51');
    const places=data.counties.filter(c=>c.state===state).sort((a,b)=>a.name.localeCompare(b.name));
    const county=requested?.state===state?requested:places[0];
    const measure=choose(params,'measure',Object.keys(rentMeasures),'share50');
    const threshold=measure==='share50'?50:30;
    const bucket=threshold===50?'burden50':'burden30';
    const geo=await json(base+'counties/'+state+'.json');
    const update=extra=>change({view:'rent',state,county:county.geoid,measure,...extra});
    const form=controls();
    selectControl(form,'State or territory','rent-state',sortedOptions(data.states),state,next=>update({state:next,county:null}));
    selectControl(form,'County or equivalent','rent-county',places.map(c=>[c.geoid,c.name]),county.geoid,next=>update({county:next}));
    selectControl(form,'Gross rent threshold','rent-threshold',Object.entries(rentMeasures),measure,next=>update({measure:next}));
    const map=mapPanel({title:data.states[state]+' · '+data.period,hint:'Share of renter-occupied units spending '+rentMeasures[measure]+' on gross rent, among those with a computed ratio.',
      geometry:geo,period:data.period,cameraKey:"rent-"+state,ceiling:100,selected:county.geoid,lookup:key=>({id:key,value:counties.get(key)?.[measure]}),cuts:[10,20,30,40],labels:['Under 10%','10–<20%','20–<30%','30–<40%','40% or more'],palette:brown,unit:'%',onPick:key=>update({county:key})});
    const summary=panel(county.name+' · '+data.states[state]);
    const margin=county[measure+'Moe'];
    summary.append(element('h3','',rentMeasures[measure]),metrics([
      ['Share with computed ratio',pct(county[measure])],['90% margin of error',finite(margin)?'±'+fmt(margin,1)+' percentage points':'Unavailable'],
      ['Units at or above threshold',fmt(county[bucket],0)],['Units with a computed ratio',fmt(county.computed,0)],
      ['Ratio not computed',fmt(county.estimates[10],0)],['All renter-occupied units',fmt(county.estimates[0],0)]
    ]),note('The survey combines responses from 2020 through 2024. Each value describes that five-year period.'));
    const distribution=panel('How gross rent compares with household income','hr-history');
    distribution.append(note('Estimated renter-occupied units in '+county.name+'. Each bar uses units with a computed ratio as its denominator.'));
    const bars=element('div','rf-bars');
    for(let k=1;k<=9;k++)bars.append(bar(data.lines[k].label,county.estimates[k],county.computed,fmt(county.estimates[k],0),k>=(threshold===50?9:6)));
    distribution.append(bars);
    const table=records('Source estimates for '+county.name,['County FIPS','Period','Census line','Rent as a share of household income','Estimated units','90% margin (units)'],
      data.lines.map((line,k)=>[county.geoid,data.period,line.id,line.label,county.estimates[k],county.moes[k]]),'rent-source-'+county.geoid+'.csv');
    const comparisons=records('County comparison · '+data.states[state],['County or equivalent','FIPS','Period','Computed ratio (units)','Ratio not computed (units)','At or above threshold (units)','Threshold (%)','Share (%)','90% margin (percentage points)'],
      [...places].sort((a,b)=>(b[measure]??-1)-(a[measure]??-1)).map(c=>[c.name,c.geoid,data.period,c.computed,c.estimates[10],c[bucket],threshold,rounded(c[measure]),rounded(c[measure+'Moe'])]),'rent-counties-'+state+'-'+threshold+'.csv');
    const sources=sourcePanel('The Census Bureau’s American Community Survey table B25070 reports gross rent as a percentage of household income. The 50% threshold is included within the 30% threshold. Source count margins and derived share margins use 90% confidence. Percentages are unavailable where the computed denominator is zero.',[
      ['All county estimates (CSV)',base+'rent.csv',true],['Source and calculation methods',base+'rent-provenance.json'],['County boundaries',base+'rent-geometry-provenance.json'],['Census table definitions','https://api.census.gov/data/2024/acs/acs5/groups/B25070.html']
    ]);
    sources.append(contextLink('Compare housing-cost trends in European countries','housing'));
    return [form,grid(map,summary),distribution,table,comparisons,sources];
  }
  const rounded=n=>finite(n)?Number(n.toFixed(4)):null;
  function freightSums(rows){
    return {weight:d3.fsum(rows,r=>r[3]),value:d3.fsum(rows,r=>r[4]),cells:rows.length};
  }
  function endpointLines(map,geo,anchor,partners,inbound){
    const svg=d3.select(map.querySelector('.hr-map')), markerID='freight-map-arrow';
    const marker=svg.append('defs').append('marker').attr('id',markerID).attr('viewBox','0 0 10 10')
      .attr('refX',9).attr('refY',5).attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto-start-reverse');
    marker.append('path').attr('d','M0 0L10 5L0 10Z').attr('fill','#613f26');
    const [[left,],[,top]]=geo.bounds, centers=new Map(geo.features.map(f=>[f.id,[(f.centroid[0]-left)*7.5,(top-f.centroid[1])*7.5]]));
    const g=svg.append('g').attr('class','rf-map-flow').attr('aria-hidden','true');
    for(const code of partners){
      const first=centers.get(inbound?code:anchor),last=centers.get(inbound?anchor:code);
      if(!first||!last||code===anchor)continue;
      const [x1,y1]=first,[x2,y2]=last;
      g.append('path').attr('d','M'+x1+','+y1+' Q'+((x1+x2)/2)+','+((y1+y2)/2-Math.min(38,Math.abs(x2-x1)*.16))+' '+x2+','+y2)
        .attr('fill','none').attr('stroke','#613f26').attr('stroke-width',1.65).attr('marker-end','url(#'+markerID+')');
    }
    const point=centers.get(anchor);
    if(point)g.append('circle').attr('cx',point[0]).attr('cy',point[1]).attr('r',3).attr('fill','#fff7e3').attr('stroke','#472c1d').attr('stroke-width',1.4);
  }
  async function freight(params) {
    const [data,geo]=await Promise.all([json(base+'freight.json'),json('/workbench/data/map-geometry/us_states.json')]);
    const state=choose(params,'state',Object.keys(data.states),'51');
    const commodity=choose(params,'commodity',['all',...Object.keys(data.commodities)],'02');
    const mode=choose(params,'mode',['all',...Object.keys(data.modes)],'all');
    const metric=choose(params,'metric',['weight','value'],'weight');
    const inbound=params.get('direction')!=='out',direction=inbound?'in':'out';
    const scope=choose(params,'scope',['all','interstate'],'interstate');
    const partner=choose(params,'partner',['all',...Object.keys(data.states).filter(s=>scope==='all'||s!==state)],'all');
    const commodities=commodity==='all'?Object.keys(data.commodities):[commodity];
    const chunks=await Promise.all(commodities.map(c=>json(base+'freight/'+c+'.json')));
    const stateName=data.states[state],partnerName=partner==='all'?'All partners':data.states[partner];
    const selectedRows=chunks.flat().filter(r=>(inbound?r[1]:r[0])===state && (mode==='all'||r[2]===mode) && (scope==='all'||r[0]!==r[1]));
    const partnerOf=r=>r[inbound?0:1];
    const totals=d3.rollup(selectedRows,freightSums,partnerOf);
    const ordered=[...totals.entries()].sort((a,b)=>b[1][metric]-a[1][metric]||data.states[a[0]].localeCompare(data.states[b[0]]));
    const selected=partner==='all'?selectedRows:selectedRows.filter(r=>partnerOf(r)===partner);
    const pair=freightSums(selected);
    const lookup=new Map(Object.entries(data.postal).map(([code,usps])=>[usps,code]));
    const update=extra=>change({view:'freight',state,commodity,mode,metric,direction,scope,partner,...extra});
    const form=controls(),stateOptions=sortedOptions(data.states);
    selectControl(form,'Focus state','freight-state',stateOptions,state,state=>update({state,partner:'all'}));
    selectControl(form,'Direction','freight-direction',[['in','Inbound to state'],['out','Outbound from state']],direction,direction=>update({direction}));
    selectControl(form,'Commodity','freight-commodity',[['all','All commodities'],...Object.entries(data.commodities).sort(([a],[b])=>Number(a)-Number(b))],commodity,commodity=>update({commodity}));
    selectControl(form,'Transport mode','freight-mode',[['all','All modes'],...Object.entries(data.modes)],mode,mode=>update({mode}));
    selectControl(form,'Metric','freight-metric',[['weight','Weight'],['value','Value']],metric,metric=>update({metric}));
    selectControl(form,'Flow coverage','freight-scope',[['all','Include within-state'],['interstate','Interstate only']],scope,scope=>update({scope,partner:'all'}));
    selectControl(form,inbound?'Origin for detail':'Destination for detail','freight-partner',[['all','All partner states'],...stateOptions.filter(([code])=>scope==='all'||code!==state)],partner,partner=>update({partner}));
    const unit=metric==='weight'?'thousand short tons':'million 2022 dollars';
    const lines=partner==='all'?ordered.filter(([s,v])=>s!==state&&v[metric]>0).slice(0,5).map(([s])=>data.postal[s]):
      (totals.get(partner)?.[metric]>0?[data.postal[partner]]:[]);
    const map=mapPanel({title:(inbound?'Freight into ':'Freight from ')+stateName+' · 2022',
      hint:'Color shows '+unit+' by '+(inbound?'origin':'destination')+'. Select a partner for its modal breakdown.',
      geometry:geo,year:2022,cameraKey:'freight',
      flows:lines.map(code=>({from:inbound?code:data.postal[state],to:inbound?data.postal[state]:code})),
      selected:data.postal[partner==='all'?state:partner],
      lookup:usps=>{const code=lookup.get(usps);return {id:scope==='interstate'&&code===state?null:code,value:totals.get(code)?.[metric]};},
      cuts:[Number.MIN_VALUE,10,100,1000],labels:['Zero','Above 0–<10','10–<100','100–<1,000','1,000 or more'],palette:blue,unit,onPick:partner=>update({partner})});
    endpointLines(map,geo,data.postal[state],lines,inbound);
    map.append(note(partner==='all'?'Arrows connect state centers for up to five largest interstate partners. Actual routes can differ.':'The arrow connects the selected interstate pair when it has a positive estimate. Within-state flows appear in the totals.'));
    const side=panel(partner==='all'?stateName+' · '+(inbound?'inbound':'outbound'):(inbound?partnerName+' to '+stateName:stateName+' to '+partnerName));
    const commodityName=data.commodities[commodity]||'All commodities',modeName=data.modes[mode]||'All modes';
    const amount=(n,d=2)=>pair.cells?fmt(n,d):'No published row';
    side.append(element('h3','',commodityName+' · '+modeName),metrics([
      ['Weight (thousand short tons)',amount(pair.weight)],['Value (million 2022 dollars)',amount(pair.value)],['Source flow records',fmt(pair.cells,0)]
    ]));
    const intra=totals.get(state);
    if(partner==='all'&&scope==='all')side.append(note(intra?'Within-state movements contribute '+fmt(intra[metric])+' '+unit+' to this selection.':'This selection has no published within-state record.'));
    side.append(element('h3','','Largest interstate partners'));
    const list=element('ol','hr-top');
    for(const [s,v] of ordered.filter(([s,v])=>s!==state&&v[metric]>0).slice(0,5)){
      const li=element('li'),b=button('',()=>update({partner:s}));b.append(element('span','',data.states[s]),element('span','',fmt(v[metric],2)));li.append(b);list.append(li);
    }
    side.append(list,note('Partners are ranked in '+unit+'.'));
    const modeTotals=[...d3.rollup(selected,freightSums,r=>r[2])].sort((a,b)=>b[1][metric]-a[1][metric]);
    const breakdown=records('Freight by mode · '+partnerName,['Year','Focus state','Direction','Partner','Commodity','Mode','Thousand short tons','Million 2022 dollars','Source records'],
      modeTotals.map(([k,v])=>[2022,stateName,inbound?'Inbound':'Outbound',partnerName,commodityName,data.modes[k],Number(v.weight.toFixed(6)),Number(v.value.toFixed(6)),v.cells]),'freight-modes-'+state+'-'+partner+'.csv');
    const comparison=records(inbound?'Origin states':'Destination states',['Year','Origin','Destination','Commodity','Mode','Thousand short tons','Million 2022 dollars','Source records'],
      ordered.map(([s,v])=>[2022,inbound?data.states[s]:stateName,inbound?stateName:data.states[s],commodityName,modeName,Number(v.weight.toFixed(6)),Number(v.value.toFixed(6)),v.cells]),'freight-partners-'+state+'-'+direction+'.csv');
    const sources=sourcePanel('The Freight Analysis Framework estimates domestic freight movement using survey and administrative data. Weight is in thousands of U.S. short tons. Value is in millions of 2022 dollars. A gray state has no published record for the filters. The download retains source-reported zeros.',[
      ['Download domestic flows and code tables (ZIP)',base+'freight-domestic.zip',true],['Source and methods',base+'freight-provenance.json'],['BTS Freight Analysis Framework','https://www.bts.gov/faf']
    ]);
    sources.append(contextLink('Compare rail freight across countries and years','rail'));
    return [form,grid(map,side),breakdown,comparison,sources];
  }
  const economyBase = '/data/economy/';
  const sectors = [
    {topic:'agriculture-employment', name:'Agriculture', workerTopic:'agriculture-per-worker', workerCode:'NV.AGR.EMPL.KD', outputTopic:'agriculture-output', outputCode:'NV.AGR.TOTL.ZS', color:'#39724b', dash:'', code:'SL.AGR.EMPL.ZS',
      definition:'Agriculture includes farming, forestry and fishing.'},
    {topic:'employment', name:'Industry', workerTopic:'industry-per-worker', workerCode:'NV.IND.EMPL.KD', outputTopic:'industry-output', outputCode:'NV.IND.TOTL.ZS', color:'#9c582e', dash:'7,3', code:'SL.IND.EMPL.ZS',
      definition:'Industry includes manufacturing, mining and quarrying, construction and utilities.'},
    {topic:'services-employment', name:'Services', workerTopic:'services-per-worker', workerCode:'NV.SRV.EMPL.KD', outputTopic:'services-output', outputCode:'NV.SRV.TOTL.ZS', color:'#296b96', dash:'2,3', code:'SL.SRV.EMPL.ZS',
      definition:'Services include activities such as trade, transport, finance, education, health and public administration.'}
  ];
  const employmentTopics = Object.fromEntries(sectors.map(sector => [sector.topic, {
    sector, sourceBundle:sector.topic === 'employment' ? 'employment' : 'employment-sectors', code:sector.code, name:'Employment in ' + sector.name.toLowerCase() + ' (% of total employment)',
    shortName:sector.name + ' employment (%)', pair:['VNM','BRA'], kind:'share',
    unit:'% of total employment', mapUnit:'% of employment', changeUnit:'percentage points',
    hint:'ILO modeled estimate of the share of employed people working in ' + sector.name.toLowerCase() + '.',
    definition:sector.definition + ' Each person is classified by the economic activity of their workplace.',
    cuts:[10,20,30,40], labels:['Under 10%','10–<20%','20–<30%','30–<40%','40% or more']
  }]));
  const outputTopics = Object.fromEntries(sectors.map(sector => [sector.outputTopic, {
    outputSector:sector, sourceBundle:'sector-output', code:sector.outputCode, name:sector.name + ' value added (% of GDP)',
    shortName:sector.name + ' output (% of GDP)', pair:['VNM','BRA'], kind:'share',
    unit:'% of GDP', mapUnit:'% of GDP', changeUnit:'percentage points',
    hint:'Share of GDP from value added in ' + sector.name.toLowerCase() + '.',
    definition:sector.definition + ' Value added is the value of production after subtracting goods and services used in production.',
    cuts:employmentTopics[sector.topic].cuts, labels:employmentTopics[sector.topic].labels
  }]));
  const workerUnit = 'constant 2015 US$ per worker';
  const productivityTopics = Object.fromEntries(sectors.map(sector => [sector.workerTopic, {
    workerSector:sector, sourceBundle:'sector-productivity', code:sector.workerCode, name:sector.name + ' output per worker', pair:['VNM','BRA'],
    kind:'money', unit:workerUnit, mapUnit:workerUnit, changeUnit:workerUnit,
    hint:'Annual value added per person employed in ' + sector.name.toLowerCase() + ', at 2015 prices.',
    definition:sector.definition + ' Value added is the value of production after subtracting inputs purchased from other producers. The denominator includes employees and self-employed workers in this sector.',
    cuts:[5000,15000,35000,75000], labels:['Under $5,000','$5,000–<15,000','$15,000–<35,000','$35,000–<75,000','$75,000 or more']
  }]));
  const rateGroups = [
    {key:'total',name:'Total',population:'population',force:'labor force',color:'#454e4b',dash:'2,3'},
    {key:'women',name:'Women',population:'female population',force:'female labor force',color:'#256d69',dash:''},
    {key:'men',name:'Men',population:'male population',force:'male labor force',color:'#995324',dash:'7,3'}
  ];
  const rateFamilies = [
    {slug:'employment-rate', name:'Employment rate', title:'Employment rates', panelId:'employment-rates',
      youthCodes:['SL.EMP.1524.SP.ZS','SL.EMP.1524.SP.FE.ZS','SL.EMP.1524.SP.MA.ZS'],
      codes:['SL.EMP.TOTL.SP.ZS','SL.EMP.TOTL.SP.FE.ZS','SL.EMP.TOTL.SP.MA.ZS'], bundle:'employment-rates',
      status:'employed', action:'were employed', gapTitle:'Employment-rate gap',
      hint:age=>'ILO modeled estimate of the share employed in the selected population aged '+age+'.'},
    {slug:'participation', name:'Labor-force participation', title:'Labor-force participation rates', panelId:'participation-rates',
      youthCodes:['SL.TLF.ACTI.1524.ZS','SL.TLF.ACTI.1524.FE.ZS','SL.TLF.ACTI.1524.MA.ZS'],
      codes:['SL.TLF.CACT.ZS','SL.TLF.CACT.FE.ZS','SL.TLF.CACT.MA.ZS'], bundle:'labor-market',
      status:'outside', action:'were in the labor force', gapTitle:'Participation gap',
      hint:age=>'Share of people aged '+age+' who were employed or unemployed.'},
    {slug:'unemployment', name:'Unemployment rate', title:'Unemployment rates', panelId:'unemployment-rates',
      youthCodes:['SL.UEM.1524.ZS','SL.UEM.1524.FE.ZS','SL.UEM.1524.MA.ZS'],
      codes:['SL.UEM.TOTL.ZS','SL.UEM.TOTL.FE.ZS','SL.UEM.TOTL.MA.ZS'], bundle:'labor-market',
      status:'unemployed', action:'were unemployed among labor-force participants', gapTitle:'Unemployment-rate gap',
      hint:age=>'Share of the labor force aged '+age+' who were without work, available for work and seeking employment.'}
  ];
  const allAges = {prefix:'',short:'15+',words:'15 and older',workTopic:'work-status',pair:['VNM','BRA']};
  const youth = {prefix:'youth-',short:'15–24',words:'15–24',workTopic:'youth-work-status',pair:['ZAF','VNM']};
  const rateTopics = {};
  for (const age of [allAges,youth]) {
    for (const family of rateFamilies) {
      const unemployment = family.slug === 'unemployment';
      const codes = age === youth ? family.youthCodes : family.codes;
      for (const [i,group] of rateGroups.entries()) {
        const unit = '% of ' + (unemployment ? group.force : group.population) + (unemployment && age === allAges ? '' : ' ages '+age.short);
        rateTopics[age.prefix+family.slug+'-'+group.key] = {
          rateGroup:group, family, age, name:family.name+' · '+group.name+', age '+age.short, pair:age.pair, kind:'share',
          code:codes[i], sourceBundle:age === youth ? 'youth-labor' : family.bundle, unit, mapUnit:unit, changeUnit:'percentage points',
          hint:family.hint(age.words),
          definition:unemployment ? 'The labor force includes employed and unemployed people aged '+age.words+' in this group.'
            : 'The denominator includes everyone aged '+age.words+' in this group, including people outside the labor force.',
          cuts:unemployment ? [3,6,10,15] : [40,50,60,70],
          labels:unemployment ? ['Under 3%','3–<6%','6–<10%','10–<15%','15% or more'] : ['Under 40%','40–<50%','50–<60%','60–<70%','70% or more']
        };
      }
    }
  }
  const collections = window.LaborTradeCollections;
  const resourceMenu = collections.menuCollections || collections.resourceCollections;
  const topics = {
    ...collections.topics(rateGroups),
    rail: {
      name: 'Rail freight activity', pair: ['USA', 'CAN'], kind: 'volume',
      unit: 'million tonne-kilometres', mapUnit: 'million tonne-km', changeUnit: 'million tonne-km',
      hint: 'Rail freight carried by reporting economies, measured in million tonne-kilometres.',
      definition: 'One tonne-kilometre is one metric tonne of goods moved one kilometre. This national rail activity measure incorporates distance. The U.S. freight-flow collection gives shipment weights by origin and destination.',
      cuts: [1000, 10000, 100000, 1000000], labels: ['Under 1,000','1,000–<10,000','10,000–<100,000','100,000–<1m','1m or more'],
      source: 'The World Bank publishes the rail series in World Development Indicators using data from the International Union of Railways and OECD. Coverage varies by economy and year.',
      publisher: 'World Bank rail freight indicator', url: 'https://data.worldbank.org/indicator/IS.RRS.GOOD.MT.K6'
    },
    housing: {
      name: 'Housing-cost overburden', pair: ['DEU', 'FRA'], kind: 'share',
      unit: '% of people in market-rent households', mapUnit: '%', changeUnit: 'percentage points',
      hint: 'Percentage of people renting at market prices who live in households with housing costs above 40% of disposable household income.',
      definition: 'Eurostat’s measure counts people living in market-rent households in participating European countries. Housing costs and household disposable income are both net of housing allowances. The ACS county measure uses renter-occupied units, gross rent and different income thresholds.',
      cuts: [10,20,30,40], labels: ['Under 10%','10–<20%','20–<30%','30–<40%','40% or more'],
      source: 'Eurostat publishes housing-cost overburden by tenure in EU-SILC. The explorer retains the market-price tenant population, annual percentages and publisher flags. Changes spanning a flagged break are left unavailable.',
      publisher: 'Eurostat housing costs by tenure', url: 'https://ec.europa.eu/eurostat/databrowser/view/ilc_lvho07c/default/table?lang=en'
    },
    gdp: {
      name: 'Real GDP per person (PPP)', pair: ['VNM', 'BRA'], kind: 'money',
      unit: 'constant 2021 international dollars per person', mapUnit: 'international $ per person', changeUnit: 'international $ per person',
      hint: 'Economic output per person, adjusted for inflation and differences in purchasing power across economies.',
      definition: 'GDP measures production across an economy. Dividing by population gives average output per person. Household income and its distribution are separate measures.',
      cuts: [5000,15000,30000,60000], labels: ['Under 5,000','5,000–<15,000','15,000–<30,000','30,000–<60,000','60,000 or more'],
      code: 'NY.GDP.PCAP.PP.KD'
    },
    trade: {
      collection:collections.trade, measure:collections.trade.measures[0],
      name: 'Trade in goods and services (% of GDP)', shortName: 'Trade (% of GDP)', pair: ['VNM', 'BRA'], kind: 'share',
      unit: '% of GDP', mapUnit: '% of GDP', changeUnit: 'percentage points',
      hint: 'Annual exports plus imports of goods and services as a percentage of GDP.',
      definition: 'Trade can exceed 100% of GDP. Exports and imports count the gross value crossing borders, while GDP counts the value added within the economy. A change in the ratio can reflect changes in trade, GDP or both.',
      cuts: [40,80,120,200], labels: ['Under 40%','40–<80%','80–<120%','120–<200%','200% or more'],
      code: 'NE.TRD.GNFS.ZS'
    },
    ...employmentTopics,
    ...outputTopics,
    ...productivityTopics,
    ...rateTopics,
    'work-status':{name:'Work status per 100 people',workStatus:true,age:allAges,pair:allAges.pair,kind:'share',changeUnit:'percentage points',
      definition:'All three outcomes use the selected population aged 15 and older as their denominator. Outside the labor force means neither employed nor unemployed.'},
    'youth-work-status':{name:'Work status per 100 young people (15–24)',workStatus:true,age:youth,pair:youth.pair,kind:'share',changeUnit:'percentage points',
      definition:'All three outcomes use the selected population aged 15–24. Young people outside the labor force can include students. These labor measures do not indicate school enrollment.'},
    'power-industry':{name:'Electricity demand and industrial output',defaultStart:2015,defaultEnd:2024,derived:true,pair:['BRA','IND']},
    'industry-electricity-output':{name:'Industrial electricity use and output',defaultStart:2015,defaultEnd:2023,derived:true,pair:['BRA','IND']},
    'manufacturing-per-person':{name:'Manufacturing in Africa and around the world',defaultStart:2015,defaultEnd:2024,derived:true,pair:['MAR','ZAF']},
    'industrial-value-added':{
      name:'Real industrial value added',pair:['BRA','IND'],kind:'money',unit:'constant 2015 US$',mapUnit:'constant 2015 US$',changeUnit:'constant 2015 US$',
      hint:'Industry including construction, measured in constant 2015 US dollars.',
      definition:'Real value added measures production less intermediate inputs in mining, manufacturing, utilities and construction.',
      cuts:[1e9,1e10,1e11,1e12],labels:['Under $1 billion','$1–<10 billion','$10–<100 billion','$100 billion–<$1 trillion','$1 trillion or more'],
      code:'NV.IND.TOTL.KD',sourceBundle:'industrial-accounts'
    },
    'productivity-change':{name:'What contributed to productivity change?',shortName:'Productivity change',pair:['VNM','BRA'],derived:true},
    manufacturing: {
      name: 'Manufacturing value added (% of GDP)', shortName: 'Manufacturing (% of GDP)', pair: ['IND', 'BGD'], kind: 'share',
      unit: '% of GDP', mapUnit: '% of GDP', changeUnit: 'percentage points',
      hint: 'Manufacturing’s contribution to domestic production as a percentage of GDP.',
      definition: 'Value added is manufacturing output less the cost of intermediate goods and services used in production. Its share can fall even as manufacturing output grows if the rest of the economy grows faster.',
      cuts: [5,10,20,30], labels: ['Under 5%','5–<10%','10–<20%','20–<30%','30% or more'],
      code: 'NV.IND.MANF.ZS'
    }
  };
  const topicOptions = Object.entries(topics).filter(([key,info])=>!info.collection || key==='trade')
    .map(([key,info])=>[key,info.shortName || info.name]);
  topicOptions.push(...[collections.jobs,collections.neet,...collections.directionalCollections,...resourceMenu].map(c=>[c.entry,c.menuTitle || c.title]));
  const narrowScreen = window.matchMedia('(max-width: 620px)');
  const countryPens = [{color:'#196e72', dash:''}, {color:'#9c582e', dash:'6,2'}];
  function linesFor(country){return new Map(country.rows.map(row=>[row[0],row]));}
  function historyChart(title, series, years, unit, {floor = 0, ceiling, compact = false, percentTicks = ceiling === 100, description, emptyMessage}) {
    const box = panel(title, 'hr-history');
    const legend = element('div', 'rf-history-legend');
    for (const item of series) {
      const tag = element('span', 'rf-series-label');
      const swatch = d3.create('svg').attr('width', 26).attr('height', 10).attr('aria-hidden','true');
      swatch.append('line').attr('x2',26).attr('y1',5).attr('y2',5)
        .attr('stroke',item.color).attr('stroke-width',3).attr('stroke-dasharray',item.dash || null);
      tag.append(swatch.node(), document.createTextNode(item.name));
      legend.append(tag);
    }
    box.append(legend, note(unit));
    const chart=element('figure','rf-plot');
    const w = narrowScreen.matches ? 395 : compact ? 490 : 790;
    const h = 225, left = narrowScreen.matches ? 44 : 65, right = 24, top = 15, baseLine = h - 30;
    const svg=d3.create('svg').attr('viewBox',[0,0,w,h]).attr('role','img').attr('aria-label',description);
    const all = series.map(item => years.map(year => item.values.get(year) || [year,null,'']));
    const high=d3.max(all.flat(),r=>r[1]);
    if(!finite(high)){box.append(note(emptyMessage));return box;}
    const low=Math.min(0,floor,d3.min(all.flat(),r=>r[1]));
    const upper=ceiling ?? Math.max(0,high);
    const y=d3.scaleLinear().domain([low,upper>low ? upper : low+1]).nice().range([baseLine,top]);
    const x=d3.scaleLinear([years[0]-.15,years.at(-1)+.15],[left,w-right]);
    const short=new Intl.NumberFormat('en-US',{notation:'compact',maximumSignificantDigits:2});
    for(const tick of y.ticks(4)){
      svg.append('line').attr('x1',left).attr('x2',w-right).attr('y1',y(tick)).attr('y2',y(tick)).attr('stroke','#d4ded3');
      svg.append('text').attr('x',left-7).attr('y',y(tick)+4).attr('text-anchor','end').text(short.format(tick) + (percentTicks ? '%' : ''));
    }
    const step=Math.max(1,Math.ceil(years.length/(narrowScreen.matches ? 4 : 6)));
    for(const yr of years.filter((v,i)=>i===0||i===years.length-1||(i%step===0&&years.length-1-i>1))){
      svg.append('text').attr('x',x(yr)).attr('y',h-5).attr('text-anchor','middle').text(yr);
    }
    all.forEach((rows,i)=>{
      let prev;
      for(const row of rows){
        if(finite(row[1])){
          if(prev&&finite(prev[1])&&!String(row[2]||'').includes('b'))svg.append('line').attr('x1',x(prev[0])).attr('y1',y(prev[1])).attr('x2',x(row[0])).attr('y2',y(row[1])).attr('stroke',series[i].color).attr('stroke-dasharray',series[i].dash || null).attr('stroke-width',2.5);
          svg.append('circle').attr('cx',x(row[0])).attr('cy',y(row[1])).attr('r',3).attr('fill',series[i].color).append('title').text(series[i].name+' · '+row[0]+' · '+fmt(row[1],3)+' '+(series[i].unit || unit));
        }
        prev=row;
      }
    });chart.append(svg.node());box.append(chart);return box;
  }
  function sectorHistory(datasets, country, years, workerView) {
    const productivity = Boolean(workerView);
    const indexed = workerView?.trend === 'index';
    const first = years[0], last = years.at(-1);
    const series = sectors.map((sector, index) => {
      const match = datasets[index].countries.find(item => item.iso3 === country.iso3);
      return {...sector, values:match ? linesFor(match) : new Map()};
    });
    const title = (productivity ? 'Output per worker by sector in ' : 'Employment by sector in ') + country.name;
    const levelUnit = productivity ? workerUnit : '% of total employment';
    const chartUnit = indexed ? 'Index · ' + first + ' = 100' : levelUnit;
    const chartSeries = indexed ? series.map(item => {
      const baseline = item.values.get(first)?.[1];
      const values = new Map();
      if (finite(baseline) && baseline > 0) {
        for (const y of years) {
          const row = item.values.get(y);
          if (finite(row?.[1])) values.set(y, [y, 100 * row[1] / baseline, row[2]]);
        }
      }
      return {...item, values};
    }) : series;
    const box = historyChart(title, chartSeries, years, chartUnit + ' · ' + first + '–' + last, {
      ceiling:productivity ? undefined : 100,
      description:title + ', ' + first + '–' + last + ', ' + chartUnit + '. Annual source values are in the table below.',
      emptyMessage:indexed ? 'No sector has a positive published starting value for this index.' : 'No sector estimate is available for this economy in the selected years.'
    });
    box.classList.add('rf-sector-history');
    box.id = productivity ? 'productivity-sectors' : 'employment-sectors';
    if (productivity) {
      const control = controls();
      control.classList.add('rf-trend-control');
      selectControl(control, 'Chart units', 'worker-trend', [['level','2015 US$ per worker'],['index','Index · ' + first + ' = 100']], workerView.trend, workerView.selectTrend);
      box.querySelector('h2').after(control);
    }
    const comparison = element('div', 'hr-table-scroll');
    const table = element('table');
    if (productivity) {
      table.createCaption().textContent = 'Sector values in constant 2015 US$ per worker';
      comparison.tabIndex = 0;
      comparison.setAttribute('role','region');
      comparison.setAttribute('aria-label','Sector values and change over the selected period');
    }
    const header = table.createTHead().insertRow();
    const singleYear = first === last;
    const labels = ['Sector', String(first)];
    if (!singleYear) labels.push(String(last), productivity ? 'Change' : 'Change (percentage points)');
    const formatValue = productivity ? n => finite(n) ? d3.format('$,.2f')(n) : 'Unavailable' : pct;
    for (const label of labels) {
      const th = element('th','',label);
      th.scope = 'col';
      header.append(th);
    }
    const body = table.createTBody();
    for (const item of series) {
      const row = body.insertRow();
      const name = element('th','',item.name);
      name.scope = 'row';
      row.append(name);
      const startValue = item.values.get(first)?.[1], endValue = item.values.get(last)?.[1];
      row.insertCell().textContent = formatValue(startValue);
      if (!singleYear) {
        row.insertCell().textContent = formatValue(endValue);
        const valid = finite(startValue) && finite(endValue);
        const delta = valid ? endValue - startValue : null;
        const changeCell = row.insertCell();
        if (!valid) changeCell.textContent = 'Unavailable';
        else if (productivity) {
          const growth = startValue > 0 ? d3.format('+.1f')(100 * delta / startValue) + '%' : 'Growth unavailable';
          changeCell.append(element('strong','rf-growth',growth), element('span','rf-dollar-change',d3.format('+$,.2f')(delta)));
        } else changeCell.textContent = d3.format('+.1f')(delta);
      }
    }
    table.setAttribute('aria-label', title + ', selected endpoints');
    comparison.append(table);
    const details = element('details');
    details.append(element('summary','', productivity ? 'Annual dollar values and CSV download' : 'Annual values and CSV download'),
      records(productivity ? 'Annual output per worker by sector' : 'Annual employment by sector',
        ['Country or economy','ISO3','Year', ...sectors.map(s => s.name + ' (' + levelUnit + ')')],
        years.map(y => [country.name, country.iso3, y, ...series.map(s => s.values.get(y)?.[1])]),
        box.id + '-' + country.iso3 + '-' + first + '-' + last + '.csv'));
    box.append(comparison, details, note(productivity
      ? 'Each sector has its own workforce denominator. Dollar values use constant 2015 prices. In the index, 125 means output per worker was 25% higher than in the selected start year. A sector needs a positive starting value to appear in the index. Gaps mark unavailable estimates.'
      : 'The ILO estimates the share of employed people in each sector. A change in share describes the mix of jobs across the economy. The figures combine reported and modeled data. Missing years appear as gaps, and the published shares can sum to slightly above or below 100%.'));
    return box;
  }
  function employmentAndOutput(sector, country, years, employment, output, selections) {
    const first = years[0], last = years.at(-1);
    const series = [
      {name:'Employment share', unit:'% of total employment', dataset:employment, color:'#39724b', dash:''},
      {name:'Value added', unit:'% of GDP', dataset:output, color:'#296b96', dash:'7,3'}
    ].map(item => {
      const economy = item.dataset.countries.find(c => c.iso3 === country.iso3);
      return {...item, values:economy ? linesFor(economy) : new Map()};
    });
    const title = sector.name + ' jobs and output in ' + country.name;
    const box = historyChart(title, series, years, 'Share of total employment and share of GDP · ' + first + '–' + last, {
      ceiling:100, description:title + '. Each line uses its own denominator. Annual values are in the table below.',
      emptyMessage:'Neither source has an estimate for this economy in the selected years.'
    });
    box.id = 'jobs-and-output';
    box.classList.add('rf-sector-history');
    const rows = years.map(year => [country.name,country.iso3,year, ...series.map(item => item.values.get(year)?.[1])]);
    const paired = rows.filter(row => finite(row[3]) && finite(row[4])).length;
    box.append(metrics([
      [last + ' employment share', pct(rows.at(-1)[3])],
      [last + ' share of GDP', pct(rows.at(-1)[4])],
      ['Years with both estimates', paired + ' of ' + years.length]
    ]));
    const details = element('details');
    details.append(element('summary','','Annual jobs and output values and CSV'),
      records('Annual employment share and value added', ['Country or economy','ISO3','Year','Employment (% of total employment)','Value added (% of GDP)'],
        rows, sector.outputTopic + '-and-jobs-' + country.iso3 + '-' + first + '-' + last + '.csv'));
    box.append(details, note('The ILO estimates how many employed people work in this sector as a share of all employed people. National accounts measure its contribution to GDP. Changes in prices as well as quantities can affect the output share. Each line stops where its source has a missing year.'));
    const links = element('div','hr-downloads');
    const onOutput = selections.topic === sector.outputTopic;
    const altTopic = onOutput ? sector.topic : sector.outputTopic;
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({...selections, topic:altTopic})) url.searchParams.set(key,value);
    url.hash = '';
    const mapLink = element('a', '', 'Map ' + sector.name.toLowerCase() + (onOutput ? ' employment' : ' value added'));
    mapLink.href = url.href;
    const workerLink = element('a', '', 'Compare output per worker');
    url.searchParams.set('topic',sector.workerTopic);
    workerLink.href = url.href;
    links.append(mapLink, workerLink);
    for (const [label,code] of [['Employment source',sector.code],['Value added source',sector.outputCode]]) {
      const link = element('a', '', label);
      link.href = 'https://data.worldbank.org/indicator/' + code;
      links.append(link);
    }
    box.append(links);
    return box;
  }
  function employmentRates(datasets, country, years, family, age) {
    const series = rateGroups.map((group,i) => {
      const c = datasets[i].countries.find(row => row.iso3 === country.iso3);
      return {...group, values:c ? linesFor(c) : new Map()};
    });
    const title = family.title + (age === youth ? ' at ages 15–24' : '') + ' in ' + country.name;
    const laborForce = family.slug === 'unemployment';
    const box = historyChart(title, series, years, '% of each '+(laborForce ? 'labor force' : 'population')+' aged '+age.words, {
      ceiling:100, description:title + ' for women, men and the total population. Annual rates appear below.',
      emptyMessage:'No rate is available for this economy in this period.'
    });
    box.id = family.panelId;
    box.classList.add('rf-sector-history');
    const rows = years.map(year => {
      const [total,women,men] = series.map(s => s.values.get(year)?.[1]);
      const gap = finite(women) && finite(men) ? rounded(men - women) : null;
      return [country.name,country.iso3,year,total,women,men,gap];
    });
    const gapText = n => finite(n) ? d3.format('+.2f')(n) + ' points' : 'Unavailable';
    const first = rows[0], last = rows.at(-1);
    const gapMetrics = [[first[2] + ' gap',gapText(first[6])]];
    if (first !== last) {
      gapMetrics.push([last[2] + ' gap',gapText(last[6])],
        ['Change in gap',gapText(finite(first[6]) && finite(last[6]) ? last[6]-first[6] : null)]);
    }
    box.append(element('h3','',family.gapTitle+' · men minus women'), metrics(gapMetrics),
      note('A positive gap means a higher share of men '+family.action+'. Each rate uses the '+(laborForce ? 'labor force' : 'population')+' aged '+age.words+' in its own group. The total is the ILO’s published estimate.'));
    const details = element('details');
    details.append(element('summary','','Annual rates, gap and CSV download'),
      records('Annual '+family.title.toLowerCase(), ['Country or economy','Code','Year',...rateGroups.map(g=>g.name+' (% of '+(laborForce ? g.force+(age === youth ? ' 15–24' : '') : g.population+' '+age.short)+')'),'Men minus women (percentage points)'],
        rows,age.prefix+family.panelId+'-'+country.iso3+'-'+first[2]+'-'+last[2]+'.csv'));
    box.append(details);
    return box;
  }

  function workStatusPanel(pair, years, group, age) {
    const outcomes = window.WorkStatus.outcomes;
    const histories = pair.map(linesFor);
    const series = outcomes.map(outcome => ({
      ...outcome, values:new Map(years.map(year => [year,[year,histories[0].get(year)[3][outcome.key]]]))
    }));
    const groupLabel = group.key === 'total' ? 'people' : group.key;
    const unit = 'Per 100 ' + groupLabel + ' aged ' + age.words;
    const box = historyChart((age === youth ? 'Youth work status over time in ' : 'Work status over time in ') + pair[0].name, series, years, unit, {
      ceiling:100, description:'Employed, unemployed and outside the labor force over the selected years.',
      emptyMessage:'No work-status estimate is available for these years.'
    });
    box.id='work-status-history';
    box.classList.add('rf-sector-history');
    const end = years.at(-1);
    box.append(element('h3','','How the two economies compare in ' + end));
    for (const [i,country] of pair.entries()) {
      const data = histories[i].get(end)[3];
      const item = element('div','rf-status-snapshot');
      item.append(element('strong','',country.name));
      if (outcomes.every(o => finite(data[o.key]))) {
        const bar = element('div','rf-status-bar');
        bar.setAttribute('aria-hidden','true');
        for (const outcome of outcomes) {
          const part = element('span');
          part.style.width = data[outcome.key] + '%';
          part.style.backgroundColor = outcome.color;
          bar.append(part);
        }
        item.append(bar);
      }
      const labels = element('div','rf-status-values');
      for (const outcome of outcomes) {
        labels.append(element('span','',outcome.name+' · '+fmt(data[outcome.key],2)));
      }
      item.append(labels);
      if (age === youth) {
        const unemployment = finite(data.unemploymentRate) ? fmt(data.unemploymentRate,2)+'%' : 'Unavailable';
        item.append(note('Labor-force participants per 100 · '+fmt(data.participation,2)+' | Unemployment rate among participants · '+unemployment));
      }
      box.append(item);
    }
    const rows = years.flatMap(year => pair.map((country,i) => {
      const values = histories[i].get(year)[3];
      return [country.name,country.iso3,year,group.key,values.participation,values.unemploymentRate,values.publishedEmployment,
        ...outcomes.map(o => finite(values[o.key]) ? Number(values[o.key].toFixed(9)) : null)];
    }));
    const details = element('details');
    details.append(element('summary','','Annual work status and source rates for both economies'),
      records('Annual work status and source rates', ['Country or economy','Code','Year','Group','Participation (% of group population '+age.short+')',
        'Unemployment (% of group labor force'+(age === youth ? ' 15–24' : '')+')','Published employment (% of group population '+age.short+')','Employed per 100 (derived)',
        'Unemployed per 100 (derived)','Outside the labor force per 100 (derived)'],
        rows,age.workTopic+'-'+group.key+'-'+pair.map(c=>c.iso3).join('-')+'-'+years[0]+'-'+end+'.csv'));
    box.append(details,note('Participation gives the number in the labor force per 100. Multiplying it by the unemployment rate divided by 100 gives the number unemployed. The rest of the labor force is employed. The table also gives the separately published employment rate.'));
    return box;
  }

  function ageComparisonPanel(pair, allSeries, years, label, group, usesLaborForce, filename) {
    const [focus] = pair;
    const allCountries = new Map(allSeries.countries.map(c=>[c.iso3,linesFor(c)]));
    const denominator = usesLaborForce ? 'labor force' : 'population';
    const points = n => finite(n) ? d3.format('+.2f')(n)+' points' : 'Unavailable';
    const unit = '% of the '+denominator+' in each age group · '+group.name;
    const title = label+' by age in '+focus.name;
    const series = [
      {name:'Ages 15–24',values:linesFor(focus),...countryPens[0]},
      {name:'All ages 15+',values:allCountries.get(focus.iso3)||new Map(),...countryPens[1]}
    ];
    const box = historyChart(title,series,years,unit,{
      percentTicks:true,description:title+'. The two lines show the youth estimate and the estimate for everyone aged 15 and older.',
      emptyMessage:'No estimate is available for this population and period.'
    });
    box.id='youth-age-comparison';
    box.classList.add('rf-sector-history');
    box.append(note('The 15+ group includes people aged 15–24. The difference shows how far the youth estimate sits above or below the overall estimate for the same population group.'));
    const first=years[0],last=years.at(-1);
    const rows=[];
    const gaps=[];
    for (const country of pair) {
      const youthRows=linesFor(country), overall=allCountries.get(country.iso3);
      let lastGap=null;
      for (const year of years) {
        const young=youthRows.get(year)?.[1], all=overall?.get(year)?.[1];
        lastGap=finite(young)&&finite(all) ? Number((young-all).toFixed(9)) : null;
        rows.push([country.name,country.iso3,year,group.key,label,denominator,young,all,lastGap]);
      }
      gaps.push([country.name,points(lastGap)]);
    }
    box.append(element('h3','','Ages 15–24 minus ages 15+ in '+last),metrics(gaps));
    const details=element('details');
    details.append(element('summary','','Annual age comparisons for both economies'),
      records('Age comparison by economy and year',['Country or economy','ISO3','Year','Population group','Measure','Denominator',
        'Ages 15–24 (%)','All ages 15+ (%)','Ages 15–24 minus ages 15+ (percentage points)'],rows,
        filename+'-age-comparison-'+pair.map(c=>c.iso3).join('-')+'-'+first+'-'+last+'.csv'));
    box.append(details);
    return box;
  }

  function productivityChangeView({form, geo, countries, pair, years, params, update, historyByCode}) {
    const start = years[0], end = years.at(-1);
    const components = {total:'Total change',within:'Change within sectors',mix:'Change in the employment mix'};
    const selected = choose(params,'component',Object.keys(components),'total');
    const results = new Map();
    let extent = 0, complete = 0;
    for (const [code,history] of historyByCode) {
      const result = window.SectorProductivityChange.compare(history.get(start),history.get(end));
      results.set(code,result);
      if (!result) continue;
      complete++;
      extent = Math.max(extent,Math.abs(result.total),Math.abs(result.within),Math.abs(result.mix));
    }
    const sourceCode = code => code === 'KOS' ? 'XKX' : code;
    const map = mapPanel({
      title:components[selected] + ' · ' + start + '–' + end,
      hint:'Change in employment-weighted three-sector value added per worker. Select an economy to see its contributions.',
      geometry:geo,year:end,cameraKey:'country-trends',pairGDP:false,ceiling:extent,floor:-extent,
      unit:workerUnit,cuts:[-5000,-1000,1000,5000],
      labels:['Below −$5,000','−$5,000 to <−$1,000','−$1,000 to <$1,000','$1,000 to <$5,000','$5,000 or more'],
      palette:['#963e2d','#cf8066','#f0e9ce','#7ab5af','#226e71'],
      selected:pair[0].iso3 === 'XKX' ? 'KOS' : pair[0].iso3,
      lookup:id => {const code=sourceCode(id);return {id:countries.has(code) ? code : null,value:results.get(code)?.[selected]};},
      onPick:a => update({a,b:a === pair[1].iso3 ? pair[0].iso3 : pair[1].iso3}),
      scaleNote:'Signed change from ' + start + ' to ' + end + '. All three measures use the same height scale for this period.'
    });
    const controlsBox = controls();
    controlsBox.classList.add('rf-trend-control');
    selectControl(controlsBox,'Map measure','change-component',Object.entries(components),selected,component=>update({component}));
    map.querySelector('.hr-note').after(controlsBox);
    map.append(note(start === end ? 'Select two different years to compare change.' :
      complete + ' of ' + countries.size + ' economies have all six inputs at both endpoints. Gray marks an unavailable comparison.'));
    const unavailableCodes = ['a','b'].map(key => params.get(key)).filter(code => code && !countries.has(code));
    if (unavailableCodes.length) map.append(note('No input series for ' + unavailableCodes.join(' or ') + '. Showing ' + pair.map(c => c.name).join(' and ') + '.'));
    if (['start','end'].some((key,i) => params.has(key) && Number(params.get(key)) !== [start,end][i])) {
      map.append(note('The available comparison uses ' + start + '–' + end + '.'));
    }
    const summary = panel('What changed from ' + start + ' to ' + end + '?');
    summary.id = 'productivity-change';
    const dollars = n => finite(n) ? d3.format('+$,.2f')(n) : 'Unavailable';
    for (const c of pair) {
      const result = results.get(c.iso3);
      summary.append(element('h3','',c.name));
      if (result) summary.append(metrics(Object.entries(components).map(([key,name]) => [name,dollars(result[key])])));
      else if (start === end) summary.append(note('Select two different years.'));
      else {
        const absent = [start,end].filter(y => !finite(historyByCode.get(c.iso3).get(y)?.[7]));
        summary.append(note('Missing sector inputs in ' + absent.join(' and ') + '.'));
      }
    }
    summary.append(note('The within-sector term captures changes in each sector’s output per worker. The employment-mix term captures changes in the share of workers in each sector. They add to the change in the three-sector average.'));
    const sectorRows = pair.flatMap(c => sectors.map((s,i) => {
      const part = results.get(c.iso3)?.sectors[i];
      return [c.name,c.iso3,start,end,s.name,rounded(part?.within),rounded(part?.mix),rounded(part?.total),workerUnit];
    }));
    const bySector = records('Contributions by sector · constant 2015 US$ per worker',
      ['Economy','Code','Start year','End year','Sector','Within sector','Employment mix','Combined','Unit'],sectorRows,
      'sector-contributions-'+pair[0].iso3+'-'+pair[1].iso3+'-'+start+'-'+end+'.csv');
    const aggregateSeries = pair.map((c,i) => {
      const values = new Map(years.map(y => [y,[y,historyByCode.get(c.iso3).get(y)?.[7]]]));
      return {name:c.name,values,...countryPens[i]};
    });
    const history = historyChart('Three-sector output per worker · ' + start + '–' + end,aggregateSeries,years,workerUnit,{
      description:'Employment-weighted output per worker for the two selected economies.',
      emptyMessage:'Neither economy has all six inputs in the selected years.'
    });
    const all = records('All economies · selected period',
      ['Economy','Code','Start year','End year','Start average','End average','Within sectors','Employment mix','Total change','Unit'],
      [...countries.values()].map(c => {
        const result=results.get(c.iso3), h=historyByCode.get(c.iso3);
        return [c.name,c.iso3,start,end,rounded(h.get(start)?.[7]),rounded(h.get(end)?.[7]),rounded(result?.within),rounded(result?.mix),rounded(result?.total),workerUnit];
      }), 'three-sector-change-'+start+'-'+end+'.csv');
    const downloads = element('details','rf-change-downloads');
    downloads.append(element('summary','','All economies and CSV download'),all);
    const sources = sourcePanel('The library calculates a three-sector average using the World Bank’s constant 2015 US$ figures and the ILO’s employment shares. For each year we divide each share by the sum of the three published shares. The midpoint calculation weights productivity changes by average employment shares and share changes by average productivity. It describes differences between two annual snapshots. Individual worker movements would require longitudinal data.',[
      ['Inputs, weights and annual averages (compressed CSV)',economyBase+'three-sector-inputs.csv.gz',true],
      ['Calculation, sources and coverage',economyBase+'three-sector-methods.json'],
      ['World Bank midpoint method · appendix, equation A.2','https://documents1.worldbank.org/curated/en/763601467997615813/pdf/97885-WP-P144914-Box393171B-PUBLIC-Understanding-LA-Carib-Income-Gap-FINAL.pdf']
    ]);
    return [form,grid(map,summary),history,bySector,downloads,sources];
  }

  function manufacturingRegion(params) {
    return choose(params,'factoryRegion',['africa','world'],['composition','industry-jobs'].includes(params.get('factoryLens'))?'world':'africa');
  }

  async function world(params) {
    const topic = choose(params, 'topic', Object.keys(topics), 'rail');
    const groupKey = choose(params,'group',rateGroups.map(g=>g.key),'total');
    const group = rateGroups.find(g=>g.key===groupKey);
    const outcomes = window.WorkStatus.outcomes;
    const status = choose(params,'status',outcomes.map(o=>o.key),'employed');
    const {name:label,cuts} = outcomes.find(o=>o.key===status);
    const age = topics[topic].age || allAges;
    const unit = '% of '+group.population+' ages '+age.short;
    const factoryView=topic==='manufacturing-per-person';
    const industryJobs=factoryView && params.get('factoryLens')==='industry-jobs';
    const compositionView=factoryView && (params.get('factoryLens')==='composition' || industryJobs);
    const region=manufacturingRegion(params);
    const info = industryJobs ? {...topics[topic],defaultStart:2019,defaultEnd:2022,pair:['KEN',region==='world'?'VNM':'MAR']} : compositionView ? {...topics[topic],defaultStart:2010,defaultEnd:2022,pair:['KEN',region==='world'?'VNM':'MAR']} : topics[topic].workStatus ? {...topics[topic],name:label+' · '+group.name+', age '+age.short,unit,mapUnit:unit,cuts,
      labels:['Under '+cuts[0],...cuts.slice(1).map((edge,i)=>cuts[i]+'–<'+edge),cuts.at(-1)+' or more'],
      hint:'Out of 100 '+(groupKey==='total' ? 'people' : groupKey)+' aged '+age.words+', how many are '+label.toLowerCase()+'?'} : topics[topic];
    const sector = info.sector || info.outputSector;
    const counterpart = sector && (info.sector ? sector.outputTopic : sector.topic);
    const sectorTopics = info.workerSector ? sectors.map(s => s.workerTopic) : info.sector ? sectors.map(s => s.topic) : null;
    const countrySeries = Boolean(info.code || info.derived || info.workStatus);
    const industrialUse = topic==='industry-electricity-output';
    const jobsView=factoryView && params.get('factoryLens')==='jobs';
    const powerIndustry = topic==='power-industry' || industrialUse;
    const sourceFile = industryJobs ? 'industry-employment' : compositionView ? 'manufacturing-composition' : topic==='productivity-change' ? 'three-sector-inputs' : topic;
    const loadRate = slug => json(economyBase+slug+'.json');
    const statusInputs = prefix => Promise.all(['participation','unemployment','employment-rate'].map(slug=>loadRate(prefix+slug+'-'+groupKey)));
    const [payload, geo, sectorData, companion, rateData, ageBaseline, collectionData, employment] = await Promise.all([
      info.workStatus ? statusInputs(age.prefix) : json(countrySeries ? economyBase + sourceFile + '.json' : base + 'world.json'),
      json('/workbench/data/map-geometry/world.json'),
      sectorTopics ? Promise.all(sectorTopics.map(slug => json(economyBase + slug + '.json'))) : null,
      counterpart ? json(economyBase + counterpart + '.json').catch(() => null) : null,
      info.rateGroup ? Promise.all(rateGroups.map(g=>loadRate(age.prefix+info.family.slug+'-'+g.key))) : null,
      age === youth ? (info.workStatus ? statusInputs('') : loadRate(info.family.slug+'-'+info.rateGroup.key)).catch(()=>null) : null,
      info.collection ? collections.load(info,rateGroups,loadRate).catch(()=>null) : null,
      jobsView ? loadRate('manufacturing-employment') : null
    ]);
    const resource=collections.resourceCollections.includes(info.collection);
    let series = info.workStatus ? window.WorkStatus.countrySeries(payload,status) : countrySeries ? payload : payload[topic];
    const scopedCountries=factoryView && region==='africa'?series.countries.filter(c=>c.africa):series.countries;
    const countries = new Map(scopedCountries.map(c => [c.iso3, c]));
    if (jobsView) {
      for (const c of employment.countries) {
        if ((region==='world' || c.africa) && !countries.has(c.iso3)) countries.set(c.iso3,{iso3:c.iso3,name:c.name,rows:[]});
      }
    }
    if ((info.collection===collections.neet || info.collection?.directions || resource) && collectionData) {
      // Keep selections when one source has observations outside the other source's coverage.
      const datasets=[...collectionData.values()];
      for (const dataset of datasets) {
        for (const c of dataset.countries) if (!countries.has(c.iso3)) countries.set(c.iso3,{iso3:c.iso3,name:c.name,rows:[]});
      }
      series={...series,first:Math.min(...datasets.map(d=>d.first)),last:Math.max(...datasets.map(d=>d.last))};
    }
    if (info.workerSector) {
      for (const dataset of sectorData) {
        for (const c of dataset.countries) {
          if (!countries.has(c.iso3)) countries.set(c.iso3,{iso3:c.iso3, name:c.name, rows:[]});
        }
      }
    }
    const codes = [...countries.keys()];
    const firstCountry = choose(params, 'a', codes, factoryView && params.get('b')===info.pair[0]?info.pair[1]:info.pair[0]);
    const peers = codes.filter(c => c !== firstCountry);
    const otherCountry = choose(params, 'b', peers, peers.includes(info.pair[1]) ? info.pair[1] : factoryView && peers.includes(info.pair[0]) ? info.pair[0] : peers[0]);
    const pair = [countries.get(firstCountry), countries.get(otherCountry)];
    const allYears = d3.range(series.first, series.last + 1);
    const requestedEnd = Number(params.get('end'));
    const defaultEnd = info.defaultEnd ?? (info.kind==='index' || resource ? payload.last : series.last);
    const endFallback = countrySeries && requestedEnd > 0 ? Math.min(series.last, Math.max(series.first, requestedEnd)) : defaultEnd;
    const end = Number(choose(params, 'end', allYears.map(String), String(Math.trunc(endFallback))));
    const startYears = allYears.filter(y => y < end || y === series.first || ((powerIndustry || factoryView) && y===end));
    const requestedStart = Number(params.get('start'));
    const defaultStart = end===info.defaultEnd ? info.defaultStart : end-10;
    const startFallback = countrySeries && requestedStart > 0 ? Math.min(startYears.at(-1), Math.max(series.first, requestedStart)) : Math.max(series.first, defaultStart);
    const start = Number(choose(params, 'start', startYears.map(String), String(Math.trunc(startFallback))));
    const years = d3.range(start, end + 1);
    const selections = {view:'world', topic, a:firstCountry, b:otherCountry, start, end};
    const update = extra => change({...selections, ...extra});
    const form = controls();
    form.classList.add('country-controls');
    const choices = Array.from(countries.values(), c => [c.iso3, c.name]).sort((u, v) => u[1].localeCompare(v[1]));
    selectControl(form, 'Economic indicator', 'world-topic', topicOptions, info.collection?.menuEntry || info.collection?.entry || topic, next => {
      if (next==='manufacturing-per-person') change({view:'world',topic:next,a:null,b:null,start:null,end:null,factoryRegion:null,factoryMeasure:null,factoryLens:null,jobsMeasure:null,subsector:null,mixMeasure:null,industryMetric:null});
      else if (topics[next].workStatus && info.rateGroup) update({topic:next,group:info.rateGroup.key,status:info.family.status});
      else if (countrySeries && (topics[next].code || topics[next].derived || topics[next].workStatus)) update({topic:next});
      else change({view:'world', topic:next, a:null, b:null, start:null, end:null});
    });
    if(factoryView) selectControl(form,'Geographic coverage','factory-region',[['africa','Africa'],['world','Worldwide']],region,factoryRegion=>update({factoryRegion}));
    if(factoryView) selectControl(form,'Compare','factory-lens',[['resident','Output and population'],['jobs','Output and employment'],['composition','Manufacturing by industry'],['industry-jobs','Industry jobs and output']],industryJobs?'industry-jobs':compositionView?'composition':jobsView?'jobs':'resident',factoryLens=>{
      const next={factoryLens,factoryRegion:region};
      if(compositionView && ['composition','industry-jobs'].includes(factoryLens)) next.subsector=id('mix-sector').value;
      update(next);
    });
    selectControl(form, 'First country or economy', 'world-first', choices, firstCountry, a => update({a, b:a === otherCountry ? firstCountry : otherCountry}));
    selectControl(form, 'Comparison country or economy', 'world-second', choices.filter(([k]) => k !== firstCountry), otherCountry, b => update({b}));
    selectControl(form, 'Start year', 'world-start', startYears.map(y => [y,y]), start, start => update({start}));
    selectControl(form, info.derived ? 'End year' : 'End year and map year', 'world-end', allYears.map(y => [y,y]), end, newEnd => update({end:newEnd, start:Math.max(series.first, Math.min(start, Number(newEnd) - (powerIndustry || factoryView ? 0 : 1)))}));

    if (info.collection) collections.controls(form,info,rateGroups,update);
    if (info.workStatus || info.rateGroup) {
      selectControl(form,'Age group','labor-age',[[allAges.short,'All ages 15+'],[youth.short,'Ages 15–24']],age.short,next=>{
        const nextAge = next===youth.short ? youth : allAges;
        update({topic:info.workStatus ? nextAge.workTopic : nextAge.prefix+info.family.slug+'-'+info.rateGroup.key});
      });
    }
    if (info.workStatus) {
      selectControl(form,'Population aged '+age.short,'status-group',rateGroups.map(g=>[g.key,g.name]),groupKey,group=>update({group}));
      selectControl(form,'Work status on map','status-measure',outcomes.map(o=>[o.key,o.name]),status,status=>update({status}));
    }
    const byCountry = new Map(Array.from(countries.values(), c => [c.iso3, linesFor(c)]));
    if (industryJobs) return window.IndustryEmployment.render({form,geo,region,countries,pair,years,params,update,byCountry,data:payload,historyChart});
    if (compositionView) return window.ManufacturingComposition.render({form,geo,region,africanAreaCodes:payload.africanAreaCodes,countries,pair,years,params,update,byCountry,historyChart});
    if (jobsView) return window.ManufacturingEmployment.render({form,geo,region,africanAreaCodes:payload.africanAreaCodes,countries,pair,years,params,update,byCountry,employment,historyChart});
    if (factoryView) return window.ManufacturingPerPerson.render({form,geo,region,africanAreaCodes:payload.africanAreaCodes,countries,pair,years,params,update,byCountry,historyChart});
    if (powerIndustry) return window.PowerIndustry.render({industrialUse,form,geo,countries,pair,years,params,update,historyByCode:byCountry,historyChart});
    if (info.derived) return productivityChangeView({form,geo,countries,pair,years,params,update,historyByCode:byCountry});
    const geoValue = k => byCountry.get(k)?.get(end)?.[1];
    const sourceCode = mapCode => countrySeries && mapCode === 'KOS' ? 'XKX' : mapCode;
    const maxAcrossHistory = data => d3.max(data.countries,c => d3.max(c.rows,r => r[1]));
    const directional=Boolean(info.collection?.directions);
    const electricity=info.collection?.bundle==='electricity';
    const netImports=topic==='electricity-net-imports';
    const coverage = series.countries.filter(c => finite(geoValue(c.iso3))).length;
    const floor=directional || netImports ? Math.min(0,d3.min(payload.countries,c=>d3.min(c.rows,r=>r[1]))) : undefined;
    const ceiling = directional || resource ? Math.max(100,maxAcrossHistory(payload)) : info.collection===collections.trade && collectionData ? d3.max([...collectionData.values()],maxAcrossHistory)
      : info.workerSector ? d3.max(sectorData, maxAcrossHistory)
      : topic === 'housing' || sector || info.rateGroup || info.workStatus || (info.collection && info.collection!==collections.trade) ? 100 : maxAcrossHistory(series);
    const map = mapPanel({
      title: info.name + ' · ' + end, hint: (electricity ? coverage+' of '+countries.size+' economies have a published value for '+end+'.' : info.hint) + ' Select a country to change the first history.',
      geometry: geo, year:end, cameraKey:'country-trends', pairGDP:topic!=='gdp'&&!sector&&!info.workerSector&&!info.rateGroup&&!info.workStatus&&(!info.collection||info.collection===collections.trade),
      ceiling,floor,polygonHeightCap:info.kind==='index' ? 300 : info.measure?.heightCap,
      selected: countrySeries && firstCountry === 'XKX' ? 'KOS' : firstCountry,
      lookup: key => {
        const code = sourceCode(key);
        const value=geoValue(code);
        return {id:countries.has(code) ? code : null, value, display:collections.smallResidual(info.measure,value)};
      },
      cuts: info.cuts, labels: info.labels, palette: netImports ? powerTrade : topic === 'housing' ? brown : blue, unit: info.mapUnit,
      onPick: a => update({a, b:a === otherCountry ? firstCountry : otherCountry})
    });
    if (sectorData) {
      const jump = element('a', '', 'Compare all three sectors in ' + pair[0].name);
      jump.href = info.workerSector ? '#productivity-sectors' : '#employment-sectors';
      map.querySelector('.hr-note').append(' ', jump);
    }
    if (sector) {
      const jump = element('a', '', 'Compare jobs and output in ' + pair[0].name);
      jump.href = '#jobs-and-output';
      map.querySelector('.hr-note').append(' ', jump);
    }
    if (info.rateGroup) {
      const jump = element('a','','Compare women, men and the total in ' + pair[0].name);
      jump.href = '#'+info.family.panelId;
      const workLink = element('a','','Compare work status per 100');
      const url = new URL(location.href);
      for (const [key,value] of Object.entries({...selections,topic:age.workTopic,group:info.rateGroup.key,status:info.family.status})) url.searchParams.set(key,value);
      url.hash='';
      workLink.href=url.href;
      map.querySelector('.hr-note').append(' ',jump,' · ',workLink);
    }
    if (info.workStatus) {
      const jump = element('a','','Compare all three work statuses');
      jump.href = '#work-status-history';
      map.querySelector('.hr-note').append(' ',jump);
    }
    if (info.workerSector) {
      const url = new URL(location.href);
      for (const [key,value] of Object.entries({...selections,topic:'productivity-change'})) url.searchParams.set(key,value);
      url.hash = '';
      const link = element('a','','Explore what contributed to the change');
      link.href = url.href;
      map.querySelector('.hr-note').append(' ',link);
    }
    if (info.collection && collectionData) {
      const jump=element('a','','Compare '+(info.collection===collections.neet ? 'both sources' : info.collection.title.toLowerCase()));
      jump.href='#'+info.collection.id+'-comparison';
      map.querySelector('.hr-note').append(' ',jump);
    }
    if (age===youth || info.sector || info.collection===collections.neet || info.collection===collections.jobs) {
      const url=new URL(location.href);
      let target,groupParam,label;
      if (age===youth) {
        target='youth-neet-modeled-'+(info.rateGroup?.key || groupKey); label='Explore youth education, employment and training';
      } else if (info.collection===collections.neet) {
        target='youth-work-status';groupParam=info.scopeGroup.key;label='Explore youth work status';
      } else if (info.collection===collections.jobs) {
        target='employment';label='Compare employment by sector';
      } else {
        target=collections.jobs.entry;label='Compare employment arrangements';
      }
      for (const [key,value] of Object.entries({...selections,topic:target})) url.searchParams.set(key,value);
      if(groupParam) url.searchParams.set('group',groupParam);
      url.hash='';
      const link=element('a','',label);link.href=url.href;
      map.querySelector('.hr-note').append(' · ',link);
    }
    if (info.collection===collections.trade || info.collection?.directions) {
      const direction=info.collection?.directions ? info.scopeGroup.key : topic==='trade-imports' ? 'imports' : 'exports';
      const related=[
        [collections.trade,'trade-'+direction,'Trade as a share of GDP'],
        [collections.merchandise,'merchandise-food-'+direction,'Merchandise trade by product'],
        [collections.commercial,'commercial-travel-'+direction,'Commercial services trade by activity'],
        [collections.partnerRegions,'partner-east-asia-'+direction,'Trade by partner region'],
        [collections.partnerGroups,'partner-group-high-income-'+direction,'Trade by partner group'],
        [collections.tradeIndices,'trade-index-volume-'+direction,'Trade volume, unit value and value']
      ];
      for (const [collection,other,label] of related) {
        if (collection===info.collection) continue;
        const url=new URL(location.href);
        for (const [key,value] of Object.entries({...selections,topic:other})) url.searchParams.set(key,value);
        url.hash='';
        const link=element('a','',label);link.href=url.href;
        map.querySelector('.hr-note').append(' · ',link);
      }
    }
    if (resource || info.collection===collections.partnerRegions || info.collection===collections.merchandise) {
      const related=resource ? resourceMenu.filter(c=>c.entry!==(info.collection.menuEntry || info.collection.entry)
        && (!electricity || c.bundle==='electricity' || c===collections.freshwater)) : [collections.rents];
      const targets=related.map(c=>[c.entry,c.menuTitle || c.title]);
      if (electricity) targets.push(['industry-electricity-output','Explore industrial electricity use and output'],['power-industry','Compare electricity demand and industrial output'],['industry-per-worker','Industrial output per worker']);
      else if (info.collection===collections.freshwater) targets.push(['agriculture-per-worker','Agricultural output per worker']);
      else if (resource) targets.push([info.collection===collections.land ? 'merchandise-food-exports' : 'partner-east-asia-exports',
        info.collection===collections.land ? 'Food exports' : 'Trade by partner region']);
      for (const [target,label] of targets) {
        const url=new URL(location.href);
        for (const [key,value] of Object.entries({...selections,topic:target})) url.searchParams.set(key,value);
        url.hash='';
        const link=element('a','',label);link.href=url.href;map.querySelector('.hr-note').append(' · ',link);
      }
    }
    if (['industrial-value-added','industry-output','industry-per-worker'].includes(topic)) {
      for (const [target,label] of [['power-industry','Compare electricity demand and industrial output'],['industry-electricity-output','Explore industrial electricity use and output']]) {
        const url=new URL(location.href);
        for (const [key,value] of Object.entries({...selections,topic:target})) url.searchParams.set(key,value);
        const link=element('a','',label);
        url.hash='';link.href=url.href;map.querySelector('.hr-note').append(' · ',link);
      }
    }
    if (topic==='manufacturing') {
      const destination=new URL(location.href);
      destination.searchParams.set('topic','manufacturing-per-person');
      destination.searchParams.set('factoryRegion','world');
      for (const [key,value] of Object.entries({a:firstCountry,b:otherCountry,start,end})) destination.searchParams.set(key,value);
      const link=element('a','','Compare total and per-resident manufacturing value added');
      link.href=destination.href;map.querySelector('.hr-note').append(' · ',link);
    }
    if (electricity) map.append(note('This series spans '+payload.first+'–'+payload.last+'. Economies without a map outline can be selected by name.'));
    else if (resource) map.append(note(coverage+' of '+countries.size+' economies in this comparison have a published value in '+end+'. This measure spans '+payload.first+'–'+payload.last+'. Gray marks a missing value.'));
    else if (directional) map.append(note(coverage+' of '+countries.size+' economies in the comparison have a published value in '+end+'.'));
    else if (info.collection===collections.neet) map.append(note(coverage+' of '+countries.size+' economies in the comparison have a value from '+info.measure.name+' in '+end+'. This source spans '+payload.first+'–'+payload.last+'. Gray marks a missing value.'));
    else map.append(note(coverage + ' of ' + countries.size + ' reporting countries or economies have an estimate in ' + end + '. The selectors include small economies with no outline on this map.'));

    if (info.measure?.heightCap) map.append(note('3D heights use the same scale across years and reach full height at '+info.measure.heightCap.toLocaleString('en-US')+' '+info.unit+'. Labels and downloads retain values above that level.'));
    if (info.kind==='index') map.append(note('Available source years for '+info.measure.name.toLowerCase()+': '+payload.first+'–'+payload.last+'. In 3D, polygon height increases to 300 index points, then stays at full height. Labels, charts and downloads show the published level. Gray marks a missing value.'));
    else if (directional) map.append(note('Gray marks an unavailable value. Polygon heights use a common scale for this indicator across all years.'));
    if (info.workerSector) map.append(note('All three productivity maps use the same dollar bands and 3D height scale across years. Gray marks an unavailable value.'));
    if (netImports) map.append(note('Net exporters have negative values and net importers have positive values. The height scale is fixed across years.'));
    if (countrySeries) {
      const absent = ['a', 'b'].map(key => params.get(key)).filter(code => code && !countries.has(code));
      if (absent.length) map.append(note('This indicator has no series for ' + absent.join(' or ') + '. The comparison shown uses ' + pair.map(c => c.name).join(' and ') + '.'));
      if ((requestedEnd > 0 && requestedEnd !== end) || (requestedStart > 0 && requestedStart !== start)) {
        map.append(note('The available comparison for the selected period runs from ' + start + ' to ' + end + '.'));
      }
    }

    const share = info.kind === 'share';
    const money = info.kind === 'money';
    const estimate = n => finite(n) ? (money ? '$' : '') + (collections.smallResidual(info.measure,n) ?? fmt(n, electricity ? 3 : share ? 1 : money ? 2 : 3)) + (share ? '%' : '') : 'Unavailable';
    const signed = (n, places) => (n > 0 ? '+' : '') + fmt(n, places);
    const changeRows = [];
    const side = panel('Change from ' + start + ' to ' + end);
    if (money) side.append(note('All amounts are in ' + info.unit + '.'));
    if (info.kind==='level') side.append(note('Values are in ' + info.unit + '.'));
    for (const country of pair) {
      const values = byCountry.get(country.iso3);
      const initial = values.get(start)?.[1], final = values.get(end)?.[1];
      const breaks = years.filter(y => y > start && String(values.get(y)?.[2] || '').includes('b'));
      const comparable = start < end && finite(initial) && finite(final) && breaks.length === 0;
      const delta = comparable ? final - initial : null;
      const rate = comparable && initial !== 0 && !netImports ? 100 * delta / initial : null;
      let changeText = start === end ? 'Single year' : 'Endpoint unavailable';
      if (breaks.length) changeText = 'Break in ' + breaks.join(', ');
      if (comparable) changeText = signed(delta, electricity ? 3 : share ? 1 : 2) + ' ' + info.changeUnit;
      const entries = [[String(start), estimate(initial)], [String(end), estimate(final)], ['Change', changeText]];
      if (money || info.kind==='index' || (info.kind==='level' && !netImports)) entries.push(['Relative change', finite(rate) ? signed(rate, 1) + '%' : 'Unavailable']);
      if (countrySeries) entries.push(['Years with data', years.filter(y => finite(values.get(y)?.[1])).length + ' of ' + years.length]);
      side.append(element('h3', '', country.name), metrics(entries));
      if (info.code && !info.sector && !info.rateGroup && (!info.collection || info.collection===collections.trade) && share && years.some(y => values.get(y)?.[1] === 0)) {
        side.append(note('The publisher reports zero for one or more selected years. Check the national accounts before interpreting those zeros as an absence of activity.'));
      }
      if (directional && share && years.some(y=>{
        const value=values.get(y)?.[1];
        return finite(value) && (value<0 || value>100);
      })) side.append(note(info.measure.code==='RS' ? 'Some published residuals are slightly below zero because the assigned amounts differ from the reported total at very small decimal places.' : 'The publisher reports a share outside 0–100% for this economy in the selected period. The chart and downloads retain the reported value.'));
      const row = [country.name, country.iso3, start, end, initial, final, rounded(delta)];
      if (!share && !netImports) row.push(rounded(rate));
      row.push(breaks.join(', '));
      changeRows.push(row);
    }
    side.append(note(info.definition));
    const histories = historyChart('Country histories · ' + start + '–' + end,
      pair.map((c,i) => ({name:c.name, values:byCountry.get(c.iso3), ...countryPens[i]})), years, info.unit, {
        description:info.name + ' in ' + pair.map(c => c.name).join(' and ') + '. Exact estimates and flags appear below.',
        emptyMessage:'Neither selected country has a published estimate in this period.'
      });
    histories.append(note('The lines stop at missing years and at publisher-flagged breaks. Both countries use the same scale.'));
    const provenance = info.sourceBundle ? info.sourceBundle + '-provenance.json' : 'provenance.json';
    const archive = info.sourceBundle ? info.sourceBundle + '-sources.zip' : 'wdi-source-files.zip';
    const downloadTopic = info.workStatus ? [topic,groupKey,status].join('-') : topic;
    const table = records('Selected annual estimates', ['Country or economy','ISO3','Year','Indicator','Unit','Estimate','Source status'],
      years.flatMap(y => pair.map(c => {
        const row = byCountry.get(c.iso3).get(y);
        return [c.name, c.iso3, y, info.name, info.unit, row?.[1], statusLabel(row?.[2], series.flags)];
      })), downloadTopic + '-' + firstCountry + '-' + otherCountry + '-' + start + '-' + end + '.csv');
    const changes = records('Endpoint comparison', ['Country or economy','ISO3','Start year','End year','Start estimate','End estimate','Change (' + info.changeUnit + ')', ...(!share && !netImports ? ['Relative change (%)'] : []), 'Break years'],
      changeRows, downloadTopic + '-changes-' + start + '-' + end + '.csv');
    const sources = info.workStatus ? sourcePanel('Library calculation from ILO modeled estimates in the World Bank’s World Development Indicators. Availability varies by year. All three outcomes are estimates per 100 people in the selected group aged '+age.words+'. Source rates and calculation details accompany the download.', [
      ['All work-status estimates (compressed CSV)',economyBase+age.workTopic+'.csv.gz',true],['Definitions, calculations and coverage',economyBase+age.workTopic+'-methods.json'],
      ...(age === youth ? [['Original youth labor files (ZIP)',economyBase+'youth-labor-sources.zip',true]] :
        [['Original participation and unemployment files (ZIP)',economyBase+'labor-market-sources.zip',true],['Original employment-rate files (ZIP)',economyBase+'employment-rates-sources.zip',true]]),
      ...rateFamilies.map(f=>[f.name+' · '+group.name,'https://data.worldbank.org/indicator/'+rateTopics[age.prefix+f.slug+'-'+groupKey].code])
    ]) : info.code ? sourcePanel(
      info.collection ? info.collection.source :
      info.rateGroup ? 'The International Labour Organization publishes modeled estimates through World Development Indicators. Survey and modeled estimates are combined. The release provides no country-year imputation flag. '+info.definition :
      info.workerSector ? 'World Development Indicators publishes sector value added per worker using World Bank national accounts and ILO employment estimates. Each annual figure divides the sector’s value added at constant 2015 prices by its employed people. Hours worked, wages and purchasing power differences require separate measures.' :
      info.outputSector ? 'World Bank, World Development Indicators, national accounts. Sector value added can sum to a different total from GDP, which includes taxes less subsidies on products. WDI also documents valuation differences across economies, including the use of value added at factor cost in some agriculture shares. Published percentages, missing years and zeros are retained.' :
      info.sector ? 'The International Labour Organization publishes these modeled estimates through World Development Indicators. The release does not flag which country-years are imputed. The ILO cautions against ranking economies using imputed estimates.' :
      'World Bank, World Development Indicators. Observations are annual, with availability varying by economy. Regional and income-group totals are excluded. The downloadable series retains published numerical precision and missing observations.', [
        ['All economies and years (compressed CSV)', economyBase + topic + '.csv.gz', true],
        ['Source, definitions and coverage', economyBase + provenance],
        [topic==='industrial-value-added' ? 'Original World Bank industry files (ZIP)' : info.collection?.bundle==='electricity' ? 'Original Ember global CSV and methodology (ZIP)' : info.collection && info.sourceBundle ? 'Original indicator files for this collection (ZIP)' : age === youth ? 'Original youth labor files (ZIP)' : info.sourceBundle==='labor-market' ? 'Original participation and unemployment files (ZIP)' : info.sector ? 'Original employment indicator files (ZIP)' : 'Original World Bank files for all three series (ZIP)', economyBase + archive, true],
        ...(info.measure?.snapshot ? [['Explore the 2022 atlas snapshot','/#explore?series=water::'+info.measure.snapshot+'&place='+firstCountry]] : []),
        ...(info.measure?.relatedSeries ? [[info.measure.relatedLabel,'/#explore?'+new URLSearchParams({series:info.measure.relatedSeries,place:firstCountry})]] : []),
        ...(info.collection?.sourceUrl ? [['Ember yearly electricity data',info.collection.sourceUrl],
          ['Ember electricity methodology (PDF)','https://files.ember-energy.org/public-downloads/ember_electricity_data_methodology.pdf']] :
          [['World Bank indicator ' + info.code, 'https://data.worldbank.org/indicator/' + info.code]]),
        ['Creative Commons Attribution 4.0', 'https://creativecommons.org/licenses/by/4.0/']
      ]) : sourcePanel(info.source, [
        ['Download both international series (CSV)',base+'world.csv',true], ['Source coverage and definitions',base+'world-provenance.json'],
        ['Original international source files (ZIP)',base+'world-sources.zip',true], [info.publisher,info.url]
      ]);
    const panels = [form, grid(map, side)];
    if (info.collection) {
      if (collectionData) panels.push(collections.comparison(info,collectionData,pair,years,rateGroups,historyChart));
      else {
        const unavailable=panel(info.collection.title);
        unavailable.append(note('The companion series could not be loaded.'),button('Retry comparison',render));
        panels.push(unavailable);
      }
    }
    if (info.workStatus) {
      const composition = workStatusPanel(pair,years,group,age);
      const links = element('div','hr-downloads');
      for (const family of rateFamilies) {
        const link = element('a','','Map '+family.name.toLowerCase());
        const url = new URL(location.href);
        for (const [key,value] of Object.entries({...selections,topic:age.prefix+family.slug+'-'+groupKey})) url.searchParams.set(key,value);
        url.searchParams.delete('status');
        url.searchParams.delete('group');
        url.hash='';
        link.href=url.href;
        links.append(link);
      }
      composition.append(links);
      panels.push(composition);
    }
    if (rateData) panels.push(employmentRates(rateData,pair[0],years,info.family,age));
    if (age === youth) {
      if (ageBaseline) {
        const overall = info.workStatus ? window.WorkStatus.countrySeries(ageBaseline,status) : ageBaseline;
        const comparison = ageComparisonPanel(pair,overall,years,info.workStatus ? label : info.family.name,
          info.rateGroup || group,info.family?.slug==='unemployment',downloadTopic);
        const downloads = element('div','hr-downloads');
        const baselineSlug = info.workStatus ? allAges.workTopic : info.family.slug+'-'+info.rateGroup.key;
        const baselineLink = element('a','','Download the ages 15+ comparison data (CSV)');
        baselineLink.href=economyBase+baselineSlug+'.csv.gz';
        baselineLink.download='';
        downloads.append(baselineLink);
        comparison.append(downloads);
        panels.push(comparison);
        const jump = element('a','','Compare ages 15–24 with all ages 15+');
        jump.href='#youth-age-comparison';
        map.querySelector('.hr-note').append(' · ',jump);
      } else {
        const unavailable=panel('Age comparison');
        unavailable.append(note('The ages 15+ comparison could not be loaded.'),button('Retry comparison',render));
        panels.push(unavailable);
      }
    }
    if (sectorData) {
      const workerView = info.workerSector ? {
        trend:choose(params,'trend',['level','index'],'level'), selectTrend:trend => update({trend})
      } : null;
      panels.push(sectorHistory(sectorData, pair[0], years, workerView));
    }
    if (sector && companion) {
      const employment = info.sector ? series : companion;
      const output = info.sector ? companion : series;
      panels.push(employmentAndOutput(sector, pair[0], years, employment, output, selections));
    } else if (sector) {
      const missing = panel('Jobs and output');
      missing.id = 'jobs-and-output';
      missing.append(note('The companion series could not be loaded.'), button('Retry comparison', render));
      panels.push(missing);
    }
    return [...panels, histories, table, changes, sources];
  }
  function statusLabel(raw,flags){
    if(!raw)return '';
    return String(raw).split('').filter(k=>k.trim()).map(k=>flags?.[k]||k).join(', ');
  }
  const titles={rent:'County rent burden',freight:'Domestic freight flows',world:'Country trends'};
  const introductions={
    rent:'Compare the share of household income spent on gross rent across U.S. counties and Puerto Rico municipios in the 2020–2024 American Community Survey.',
    freight:'Explore estimated 2022 freight moving between U.S. states and Washington, D.C. Choose a commodity, direction and mode to compare weight and value.',
    world:'Compare jobs, labor-force participation, unemployment, productivity, trade, housing costs and freight across countries. Choose two economies and a period to see their annual estimates and the change between endpoints.'
  };
  async function render(){
    const version=++epoch,params=new URLSearchParams(location.search),view=choose(params,'view',Object.keys(titles),'rent');
    const root=id('content'),status=id('status'),focus=document.activeElement?.id;
    document.title=titles[view]+' · Public Evidence Library';id('heading').textContent=titles[view];id('intro').textContent=introductions[view];
    if(view==='world' && params.get('topic')==='manufacturing-per-person'){
      const worldwide=manufacturingRegion(params)==='world';
      id('heading').textContent=worldwide?'Manufacturing around the world':'Manufacturing in Africa';
      id('intro').textContent='Compare the value created by manufacturing in each economy and per resident over time. All dollar amounts use constant 2015 prices.';
      if(params.get('factoryLens')==='jobs'){
        id('heading').textContent='Manufacturing output and employment '+(worldwide?'worldwide':'in Africa');
        id('intro').textContent='Compare changes in real manufacturing value added with the number of people employed in manufacturing. Choose two economies and a period to follow their paths.';
      }
      if(params.get('factoryLens')==='composition'){
        id('heading').textContent='What do economies manufacture?';
        id('intro').textContent='Explore how five industries contribute to manufacturing value added '+(worldwide?'around the world':'in Africa')+'. Compare two economies or map how an industry’s share changed over time.';
      }
      if(params.get('factoryLens')==='industry-jobs'){
        id('heading').textContent='Where did manufacturing jobs and output shift?';
        id('intro').textContent='Compare each industry’s share of manufacturing employment and value added '+(worldwide?'worldwide':'in Africa')+'. Follow two economies over time or select an industry on the map.';
      }
      document.title=id('heading').textContent+' · Public Evidence Library';
    }
    for(const key of Object.keys(titles)){const tab=id('tab-'+key);if(key===view)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
    root.setAttribute('aria-busy','true');status.hidden=false;status.textContent='Opening the collection…';
    try{
      const nodes=await ({rent,freight,world}[view])(params);
      if(version!==epoch)return;
      root.replaceChildren(...nodes);status.hidden=true;
      if(focus)id(focus)?.focus({preventScroll:true});
    }catch(error){
      if(version!==epoch)return;
      root.replaceChildren();status.replaceChildren(document.createTextNode('The collection could not open. '),button('Try again',render));console.error(error);
    }finally{if(version===epoch)root.removeAttribute('aria-busy');}
  }
  narrowScreen.addEventListener('change', () => {
    if (id('world-topic')) render();
  });
  window.addEventListener('popstate',render);render();
})();
