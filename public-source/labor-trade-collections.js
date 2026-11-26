(() => {
  'use strict';
  const {element,selectControl,note,records} = window.PublicEvidenceComponents;
  const jobs = {
    title:'Employment arrangements', id:'employment-arrangements', entry:'wage-workers-total', bundle:'job-types', pair:['VNM','BRA'],
    control:'Employment arrangement', unit:'share of employment',
    source:'ILO modeled estimates from World Development Indicators. Each share uses employment in the selected population group. The ILO combines reported and modeled observations.',
    interpretation:'Wage and salaried work and self-employment are the two broad categories. Employers and contributing family workers are included within self-employment. Vulnerable employment combines own-account and contributing family workers. These categories overlap.',
    measures:[
      {slug:'wage-workers',name:'Wage and salaried workers',code:'SL.EMP.WORK',hint:'Employees who receive pay from an employer.'},
      {slug:'self-employed',name:'Self-employed workers',code:'SL.EMP.SELF',hint:'Workers whose earnings depend directly on the profits of their work or business, including contributing family workers.'},
      {slug:'employers',name:'Employers',code:'SL.EMP.MPYR',hint:'Self-employed workers who engage at least one employee on a continuous basis.'},
      {slug:'family-workers',name:'Contributing family workers',code:'SL.FAM.WORK',hint:'People who work in a market-oriented enterprise operated by a relative in the same household.'},
      {slug:'vulnerable-employment',name:'Vulnerable employment',code:'SL.EMP.VULN',hint:'The ILO uses own-account and contributing family work as a proxy for vulnerable employment.'}
    ]
  };
  const neet = {
    title:'Youth outside employment, education or training', id:'youth-neet',entry:'youth-neet-modeled-total',bundle:'youth-neet',pair:['IND','VNM'],
    control:'Estimate source', unit:'share of youth population',
    source:'World Development Indicators publishes the ILO Modelled Estimates and ILO Labour Force Statistics series separately. The age range is 15–24. Survey coverage and methods vary by economy and year.',
    interpretation:'Each series counts young people who are neither employed nor in education or training. The modeled series combines reported data with model estimates. The Labour Force Statistics series has gaps where WDI publishes no value. Both use the full youth population of the selected group.',
    measures:[
      {slug:'youth-neet-modeled',name:'ILO modeled estimates',code:'SL.UEM.NEET',suffix:'.ME.ZS'},
      {slug:'youth-neet-reported',name:'ILO Labour Force Statistics',code:'SL.UEM.NEET',suffix:'.ZS'}
    ]
  };
  const trade = {
    title:'Trade in goods and services', id:'trade-components',entry:'trade',bundle:'trade-components',pair:['VNM','BRA'],
    control:'Trade measure', unit:'share of GDP',
    source:'World Bank national accounts and OECD National Accounts data files, published in World Development Indicators. Each series measures the value of goods and services as a share of GDP.',
    interpretation:'Total trade includes exports and imports. The three lines retain the published series independently, including their coverage and precision. Exports and imports can each exceed GDP.',
    measures:[
      {slug:'trade',name:'Total trade',code:'NE.TRD.GNFS.ZS'},
      {slug:'trade-exports',name:'Exports',code:'NE.EXP.GNFS.ZS',hint:'Goods and services supplied by residents to the rest of the world, as a share of GDP.'},
      {slug:'trade-imports',name:'Imports',code:'NE.IMP.GNFS.ZS',hint:'Goods and services supplied by the rest of the world to residents, as a share of GDP.'}
    ]
  };
  const directions=[{key:'exports',name:'Exports',prefix:'TX'},{key:'imports',name:'Imports',prefix:'TM'}];
  const merchandise={
    title:'Merchandise trade by product',id:'merchandise-mix',entry:'merchandise-food-exports',bundle:'merchandise-mix',pair:['BRA','CHN'],
    directions,control:'Product category',denominator:'merchandise',classification:'UN',
    source:'UN Comtrade via the World Integrated Trade Solution and World Bank staff estimates, published in World Development Indicators. Products follow the Standard International Trade Classification, Revision 3.',
    interpretation:'Each product’s value is a percentage of all merchandise exports or all merchandise imports for the same economy and year. Unclassified goods can leave shares short of 100%. Some published shares or sums exceed 100%. The figures retain the reported values. Changes can reflect prices as well as quantities.',
    measures:[
      {slug:'merchandise-food',name:'Food',code:'FOOD',hint:'Includes live animals, beverages, tobacco, oils, fats and oilseeds.'},
      {slug:'merchandise-fuel',name:'Fuels',code:'FUEL',hint:'Includes mineral fuels, lubricants and related materials.'},
      {slug:'merchandise-ores',name:'Ores and metals',code:'MMTL',hint:'Includes ores, metal scrap, nonferrous metals and selected crude minerals.'},
      {slug:'merchandise-manufactures',name:'Manufactures',code:'MANF',hint:'Includes chemicals, machinery, transport equipment and other manufactures. Nonferrous metals appear under ores and metals.'},
      {slug:'merchandise-agricultural-raw',name:'Agricultural raw materials',code:'AGRI',hint:'Includes agricultural raw materials such as timber and textile fibers. Oilseeds are counted under food.'}
    ]
  };
  const commercial={
    title:'Commercial services trade by activity',id:'commercial-mix',entry:'commercial-travel-exports',bundle:'commercial-mix',pair:['ESP','IND'],
    directions,control:'Service category',denominator:'commercial service',classification:'WT',
    source:'International Monetary Fund balance of payments statistics, published in World Development Indicators. Commercial services exclude government goods and services recorded in the separate government category.',
    interpretation:'Each activity is a percentage of all commercial service exports or all commercial service imports for the same economy and year. Reporting detail varies. Some flows, including insurance, can be recorded after offsetting payments. Published values and reporting gaps appear as supplied.',
    measures:[
      {slug:'commercial-travel',name:'Travel',code:'TRVL',hint:'Goods and services that visitors buy in the economy they visit, including business and personal travel.'},
      {slug:'commercial-transport',name:'Transport',code:'TRAN',hint:'International carriage of passengers and freight, and related transport services.'},
      {slug:'commercial-finance',name:'Insurance and financial services',code:'INSF',hint:'Includes insurance, financial intermediation and related services.'},
      {slug:'commercial-other',name:'Computer, communications and other services',code:'OTHR',hint:'Also covers construction, intellectual property charges, and business, professional, cultural and recreational services.'}
    ]
  };
  const partnerSource='IMF Direction of Trade Statistics and World Bank staff estimates, published in World Development Indicators. Each share uses the reporting economy’s total merchandise exports or imports.';
  const partnerRegions={
    title:'Merchandise trade by partner region',id:'partner-regions',entry:'partner-east-asia-exports',bundle:'partner-regions',pair:['BRA','IND'],
    directions,control:'Low- and middle-income partners in',denominator:'merchandise',source:partnerSource,
    interpretation:'The map shows each reporting economy. For exports the selected region is the destination, and for imports it is the origin. These six groups cover low- and middle-income partners. High-income and unallocated trade are outside these groups. Region names follow the published series.',
    measures:[
      {slug:'partner-east-asia',name:'East Asia & Pacific',code:'R1'},
      {slug:'partner-europe',name:'Europe & Central Asia',code:'R2'},
      {slug:'partner-latin-america',name:'Latin America & the Caribbean',code:'R3'},
      {slug:'partner-middle-east',name:'Middle East & North Africa',code:'R4'},
      {slug:'partner-south-asia',name:'South Asia',code:'R5'},
      {slug:'partner-sub-saharan-africa',name:'Sub-Saharan Africa',code:'R6'}
    ]
  };
  const partnerGroups={
    title:'Merchandise trade by partner group',id:'partner-groups',entry:'partner-group-high-income-exports',bundle:'partner-groups',pair:['ZAF','BRA'],
    directions,control:'Partner group',denominator:'merchandise',source:partnerSource,
    interpretation:'The regional comparison uses the reporting economy’s own World Bank region. The publisher requires data from at least half of a partner group for classified shares. The residual includes unassigned trade and can contain tiny negative values.',
    measures:[
      {slug:'partner-group-high-income',name:'High-income partners',code:'HI',hint:'Trade with high-income economies worldwide.'},
      {slug:'partner-group-within-region',name:'Low- and middle-income partners in the same region',code:'WR',hint:'WDI describes an exclusion for high-income reporters. The files include figures for some, including Japan, and leave others blank.'},
      {slug:'partner-group-outside-region',name:'Low- and middle-income partners outside the region',code:'OR',hint:'Trade with low- and middle-income economies outside the reporting economy’s own region.'},
      {slug:'partner-group-residual',name:'Unallocated trade (residual)',code:'RS',hint:'World merchandise trade less the amounts assigned to income groups. Published zeros and tiny negative values are retained.'}
    ]
  };
  const tradeIndices={
    title:'Merchandise trade volume, unit value and value',id:'trade-indices',entry:'trade-index-volume-exports',bundle:'trade-indices',pair:['VNM','GBR'],
    directions,control:'Trade index',kind:'index',unit:'index (2015 = 100)',
    source:'UN Trade and Development (UNCTAD) indices published in World Development Indicators. Each economy has its own 2015 reference level.',
    interpretation:'An index of 150 represents 50% more than the reference level of 100. Volume measures trade adjusted for unit-value changes. Unit value can change with prices or the mix of goods, and trade value is measured in current US dollars. Each line uses its own published series and years.',
    measures:[
      {slug:'trade-index-volume',name:'Volume',code:'QTY',hint:'The volume of merchandise trade relative to its 2015 reference.'},
      {slug:'trade-index-unit-value',name:'Unit value',code:'UVI',hint:'Unit values reflect prices and the mix of traded goods. Tuvalu’s published unit-value indices differ from 100 in 2015.'},
      {slug:'trade-index-value',name:'Current-dollar value',code:'VAL',hint:'The value of merchandise trade in current US dollars relative to its 2015 reference.'}
    ]
  };
  const wealthSource='World Bank estimates from The Changing Wealth of Nations, distributed through World Development Indicators.';
  const rents={
    id:'resource-rents',bundle:'resource-rents',entry:'resource-rent-total',title:'Natural resource rents',control:'Resource rent',unit:'% of GDP',pair:['BRA','CHL'],cuts:[1,5,10,20],source:wealthSource,
    interpretation:'Economic rent estimates the value of production after costs. The total covers oil, natural gas, coal, minerals and forests. It is published separately and can have a value when a component is missing. Each figure uses the reporting economy’s GDP.',
    measures:[
      {slug:'resource-rent-total',name:'Total natural resource rents',code:'NY.GDP.TOTL.RT.ZS',hint:'Estimated rents from the five resource types as a share of GDP.'},
      {slug:'resource-rent-oil',name:'Oil rents',code:'NY.GDP.PETR.RT.ZS',hint:'Crude oil production valued at world prices, less estimated production costs.'},
      {slug:'resource-rent-gas',name:'Natural gas rents',code:'NY.GDP.NGAS.RT.ZS',hint:'Natural gas production valued at regional prices, less estimated production costs.'},
      {slug:'resource-rent-coal',name:'Coal rents',code:'NY.GDP.COAL.RT.ZS',hint:'Estimated economic rents from hard and soft coal production.'},
      {slug:'resource-rent-mineral',name:'Mineral rents',code:'NY.GDP.MINR.RT.ZS',hint:'Estimated rents from the ten minerals covered by the World Bank series.'},
      {slug:'resource-rent-forest',name:'Forest rents',code:'NY.GDP.FRST.RT.ZS',hint:'The World Bank applies regional prices and rental rates to roundwood harvest.'}
    ]
  };
  const depletion={
    id:'resource-depletion',bundle:'resource-depletion',entry:'resource-depletion-total',title:'Natural resource depletion',control:'Depletion measure',unit:'% of GNI',pair:['BRA','CHL'],cuts:[1,5,10,20],source:wealthSource,
    interpretation:'Depletion values the use of energy, mineral and timber resources as a share of gross national income (GNI). The total comes from its published series. A zero for net forest depletion means the measure records no harvest in excess of growth. Forest area can still decline.',
    measures:[
      {slug:'resource-depletion-total',name:'Total natural resource depletion',code:'NY.ADJ.DRES.GN.ZS',hint:'Energy, mineral and net forest depletion relative to gross national income.'},
      {slug:'resource-depletion-energy',name:'Energy depletion',code:'NY.ADJ.DNGY.GN.ZS',hint:'Stock value of coal, crude oil and natural gas divided by estimated remaining reserve life, capped at 25 years.'},
      {slug:'resource-depletion-mineral',name:'Mineral depletion',code:'NY.ADJ.DMIN.GN.ZS',hint:'Stock value of ten mineral resources divided by estimated remaining reserve life, capped at 25 years.'},
      {slug:'resource-depletion-forest',name:'Net forest depletion',code:'NY.ADJ.DFOR.GN.ZS',hint:'The timber rent on roundwood harvest in excess of natural forest growth.'}
    ]
  };
  const land={
    id:'land-shares',bundle:'land-shares',entry:'land-share-forest',title:'Agricultural land and forest area',control:'Land use',unit:'% of land area',pair:['BRA','CRI'],cuts:[5,20,40,60],
    source:'Food and Agriculture Organization of the United Nations (FAO), distributed through World Development Indicators. Land area excludes inland water bodies. Forest figures draw on periodic assessments.',
    interpretation:'Agricultural land includes arable land, permanent cropland, and permanent meadows and pastures. The categories overlap. Each line retains the published estimate. Forest area includes natural and planted forest and excludes tree crops grown mainly for agriculture.',
    measures:[
      {slug:'land-share-forest',name:'Forest area',code:'AG.LND.FRST.ZS',hint:'The share of land covered by forests under the FAO definition.'},
      {slug:'land-share-agricultural',name:'Agricultural land',code:'AG.LND.AGRI.ZS',hint:'Land in temporary or permanent crops and permanent meadows and pastures.'},
      {slug:'land-share-arable',name:'Arable land',code:'AG.LND.ARBL.ZS',hint:'Includes temporary crops, temporary meadows, market gardens and temporary fallow.'},
      {slug:'land-share-permanent-crops',name:'Permanent cropland',code:'AG.LND.CROP.ZS',hint:'Land in crops that last for several years, including coffee, cocoa and fruit trees.'}
    ]
  };
  const withdrawalUnit='% of freshwater withdrawals';
  const freshwater={
    id:'freshwater',bundle:'freshwater',entry:'water-productivity',title:'Freshwater use and economic output',control:'Freshwater indicator',pair:['BRA','IND'],
    source:'FAO AQUASTAT water estimates, distributed through World Development Indicators. The productivity series also uses World Bank and OECD GDP estimates.',
    interpretation:'Sector shares come from intermittent reporting and estimation. Some published shares exceed 100% or add up to a different total. Gaps mark years without a published estimate.',
    measures:[
      {slug:'water-productivity',name:'GDP per cubic meter withdrawn',code:'ER.GDP.FWTL.M3.KD',unit:'constant 2015 US$ GDP per m³ withdrawn',cuts:[5,20,50,100],heightCap:200,
        hint:'Economy-wide GDP at constant 2015 prices divided by total withdrawals. Industry mix, water availability and withdrawal practices can all affect this ratio.'},
      {slug:'water-withdrawal-agriculture',name:'Agricultural share of withdrawals',code:'ER.H2O.FWAG.ZS',sector:true,unit:withdrawalUnit,cuts:[20,40,60,80],heightCap:100,snapshot:'agriculture_withdrawal_share',
        hint:'Share of all withdrawals used for agriculture, including irrigation and livestock.'},
      {slug:'water-withdrawal-industry',name:'Industrial share of withdrawals',code:'ER.H2O.FWIN.ZS',sector:true,unit:withdrawalUnit,cuts:[10,25,50,75],heightCap:100,snapshot:'industry_withdrawal_share',
        hint:'Direct industrial withdrawals include cooling water for thermoelectric plants.'},
      {slug:'water-withdrawal-domestic',name:'Domestic share of withdrawals',code:'ER.H2O.FWDM.ZS',sector:true,unit:withdrawalUnit,cuts:[10,25,50,75],heightCap:100,snapshot:'domestic_withdrawal_share',
        hint:'Domestic withdrawals include water supplied to homes, businesses and public services.'},
      {slug:'water-pressure-stress',name:'Water stress (SDG 6.4.2)',code:'ER.H2O.FWST.ZS',unit:'% of available freshwater resources',cuts:[25,50,75,100],heightCap:200,snapshot:'water_stress',
        hint:'Freshwater withdrawals divided by renewable resources including external inflows, after setting aside environmental flow requirements. Values can exceed 100%.'},
      {slug:'water-pressure-internal',name:'Withdrawals relative to internal resources',code:'ER.H2O.FWTL.ZS',unit:'% of internal freshwater resources',cuts:[25,50,100,200],heightCap:500,
        hint:'Withdrawals relative to renewable flows generated within the economy. The denominator excludes incoming water from other countries. The withdrawal series can include significant desalinated supplies.'},
      {slug:'water-volume-withdrawals',name:'Annual water withdrawals',code:'ER.H2O.FWTL.K3',unit:'billion m³',cuts:[1,10,50,100],heightCap:500,snapshot:'total_withdrawals',
        hint:'The annual volume taken from water sources. Some withdrawn water returns to the environment after use.'},
      {slug:'water-volume-renewable',name:'Renewable internal freshwater',code:'ER.H2O.INTR.K3',unit:'billion m³',cuts:[10,50,200,500],heightCap:1000,
        hint:'Long-term average annual river flows and groundwater recharge generated by domestic precipitation. The same baseline can appear in successive years.'},
      {slug:'water-per-person-renewable',name:'Renewable internal freshwater per person',code:'ER.H2O.INTR.PC',unit:'m³ per person',cuts:[500,2000,5000,10000],heightCap:20000,
        hint:'Long-term average annual internal freshwater flows divided by the population in each year. Population growth can reduce the per-person figure even when the estimated flow stays constant.'}
    ]
  };
  const electricity=window.ElectricityCollections || [];
  const resourceCollections=[rents,depletion,land,freshwater,...electricity];
  const menuCollections=resourceCollections.filter(c=>!c.menuEntry || c.menuEntry===c.entry);
  const directionalCollections=[merchandise,commercial,partnerRegions,partnerGroups,tradeIndices];
  const linePens=[
    {color:'#196e72',dash:''},{color:'#9c582e',dash:'7,3'},{color:'#464f85',dash:'3,2'},
    {color:'#86547c',dash:'8,2,2,2'},{color:'#4b6844',dash:'2,3'},{color:'#806124',dash:'10,3,2,3'}
  ];
  const slugFor=(measure,group)=>group ? measure.slug+'-'+group.key : measure.slug;
  const getUnit=(collection,group)=>resourceCollections.includes(collection) || collection.kind==='index' ? collection.unit : collection.directions ? '% of '+collection.denominator+' '+group.key : collection===trade ? '% of GDP' : collection===neet ?
    '% of '+group.population+' ages 15–24' : '% of '+({total:'total',men:'male',women:'female'}[group.key])+' employment';
  function topics(groups) {
    const result={};
    for (const collection of [jobs,neet,trade]) {
      for (const measure of collection.measures) {
        for (const group of collection===trade ? [null] : groups) {
          if (measure.slug==='trade') continue;
          const unit=getUnit(collection,group);
          const suffix=group ? {women:'.FE',men:'.MA',total:''}[group.key] : '';
          const code=group ? measure.code+suffix+(measure.suffix||'.ZS') : measure.code;
          const name=collection===neet ? 'Youth outside employment, education or training · '+measure.name+' · '+group.name :
            collection===jobs ? measure.name+' · '+group.name : measure.name+' of goods and services (% of GDP)';
          const cuts=collection===trade ? [20,40,70,100] : collection===neet ? [10,20,30,40] :
            ['employers','family-workers'].includes(measure.slug) ? [2,5,10,20] : [20,40,60,80];
          const labels=['Under '+cuts[0]+'%',...cuts.slice(1).map((edge,i)=>cuts[i]+'–<'+edge+'%'),cuts.at(-1)+'% or more'];
          result[slugFor(measure,group)]={collection,measure,scopeGroup:group,code,name,kind:'share',unit,mapUnit:unit,
            changeUnit:'percentage points',pair:collection.pair,sourceBundle:collection.bundle,cuts,labels,
            hint:measure.hint||'Share of young people aged 15–24 who are neither employed nor in education or training.',
            definition:collection.interpretation};
        }
      }
    }
    for (const collection of directionalCollections) {
      const indexed=collection.kind==='index';
      for (const measure of collection.measures) {
        for (const group of directions) {
          const unit=getUnit(collection,group);
          let code=group.prefix+'.VAL.MRCH.'+measure.code+'.ZS';
          if (collection.classification) code=[group.prefix,'VAL',measure.code,'ZS',collection.classification].join('.');
          if (indexed) code=[group.prefix,measure.code,'MRCH.XD.WD'].join('.');
          const title=collection===partnerRegions ? 'Low- and middle-income partners in '+measure.name : measure.name;
          const name=indexed ? group.name+' · '+title+' (2015 = 100)' : title+' ('+unit+')';
          let cuts=[5,15,35,60];
          if (collection===commercial) cuts=[0,10,35,60];
          if (collection===partnerRegions) cuts=[1,5,15,35];
          if (measure.code==='RS') cuts=[0,0.01,1,5];
          if (indexed) cuts=[75,100,125,200];
          const suffix=indexed ? '' : '%';
          const labels=['Under '+cuts[0]+suffix,...cuts.slice(1).map((edge,i)=>cuts[i]+'–<'+edge+suffix),cuts.at(-1)+suffix+' or more'];
          const hint=measure.hint || (group.key==='exports' ? 'Share of merchandise exports destined for ' : 'Share of merchandise imports originating in ')+'low- and middle-income partners in '+measure.name+'.';
          result[slugFor(measure,group)]={collection,measure,scopeGroup:group,code,name,kind:indexed ? 'index' : 'share',
            unit,mapUnit:unit,changeUnit:indexed ? 'index points' : 'percentage points',pair:collection.pair,
            sourceBundle:collection.bundle,cuts,labels,hint,definition:collection.interpretation};
        }
      }
    }
    for (const collection of resourceCollections) {
      for (const measure of collection.measures) {
        const unit=measure.unit || collection.unit;
        const cuts=measure.cuts || collection.cuts;
        const share=unit.startsWith('%');
        const mark=share ? '%' : '';
        const labels=['Under '+cuts[0]+mark,...cuts.slice(1).map((edge,i)=>cuts[i]+'–<'+edge+mark),cuts.at(-1)+mark+' or more'];
        result[measure.slug]={collection,measure,code:measure.code,name:measure.name+' ('+unit+')',
          kind:share ? 'share' : 'level',unit,mapUnit:unit,changeUnit:share ? 'percentage points' : unit,pair:collection.pair,
          sourceBundle:collection.bundle,cuts,labels,hint:measure.hint,definition:collection===freshwater || collection.bundle==='electricity' ? measure.hint : collection.interpretation};
      }
    }
    return result;
  }
  async function load(info,groups,loadRate) {
    const {collection,measure,scopeGroup}=info;
    const ids=new Set(collection.measures.map(m=>slugFor(m,scopeGroup)));
    if (scopeGroup) {
      for (const g of collection.directions || groups) {
        ids.add(slugFor(measure,g));
        if (collection===neet || collection.directions) for (const m of collection.measures) ids.add(slugFor(m,g));
      }
    }
    if (collection===rents) ids.add(depletion.entry);
    if (collection===depletion) ids.add(rents.entry);
    return new Map(await Promise.all(Array.from(ids,async slug=>[slug,await loadRate(slug)])));
  }
  function controls(form,info,groups,update) {
    const {collection,measure,scopeGroup}=info;
    selectControl(form,collection.control,'series-measure',collection.measures.map(m=>[m.slug,m.name]),measure.slug,
      next=>update({topic:scopeGroup ? next+'-'+scopeGroup.key : next}));
    if (collection.metric) {
      const formats=electricity.filter(c=>c.metric);
      selectControl(form,'Measurement','electricity-metric',formats.map(c=>[c.metric,c.metricLabel]),collection.metric,
        next=>update({topic:formats.find(c=>c.metric===next).measures.find(m=>m.fuel===measure.fuel).slug}));
    }
    if (collection.directions) selectControl(form,'Trade direction','trade-direction',directions.map(g=>[g.key,g.name]),scopeGroup.key,
      next=>update({topic:measure.slug+'-'+next}));
    else if (scopeGroup) selectControl(form,collection===neet ? 'Youth population aged 15–24' : 'Employed population','series-group',
      groups.map(g=>[g.key,g.name]),scopeGroup.key,next=>update({topic:measure.slug+'-'+next}));
  }
  function smallResidual(measure,value) {
    if (measure?.code==='RS' && Number.isFinite(value) && value!==0 && Math.abs(value)<0.005) return value.toExponential(2);
  }
  function comparison(info,data,pair,years,groups,historyChart) {
    const {collection,measure,scopeGroup}=info;
    const water=collection===freshwater;
    const power=collection.bundle==='electricity';
    const mixedUnits=water || Boolean(collection.chartUnit);
    const unit=collection.chartUnit || (water ? withdrawalUnit : getUnit(collection,scopeGroup));
    const start=years[0], end=years.at(-1);
    const suffix='-'+pair.map(c=>c.iso3).join('-')+'-'+start+'-'+end+'.csv';
    const groupName=scopeGroup?.name || 'Total';
    const sourceById=new Map(Array.from(data,([slug,dataset])=>[slug,new Map(dataset.countries
      .filter(c=>pair.some(p=>p.iso3===c.iso3)).map(c=>[c.iso3,new Map(c.rows.map(r=>[r[0],r]))]))]));
    const getRows=(m,g,code)=>sourceById.get(slugFor(m,g))?.get(code);
    const value=(m,g,code,year)=>getRows(m,g,code)?.get(year)?.[1];
    const chartMeasures=power ? collection.measures.filter(m=>m.chart) :
      water ? collection.measures.filter(m=>m.sector) : collection.measures;
    const series=chartMeasures.map((m,i)=>({name:m.name,values:getRows(m,scopeGroup,pair[0].iso3)||new Map(),...linePens[i]}));
    const title=(water ? 'Agricultural, industrial and domestic withdrawals' : collection.chartTitle || collection.title)+(collection.directions ? ' · '+scopeGroup.name : '')+' in '+pair[0].name;
    const box=historyChart(title,series,years,unit+(scopeGroup && !collection.directions ? ' · '+groupName : ''),{
      percentTicks:power ? unit.startsWith('%') : info.kind!=='index',description:title+'. Annual estimates for the selected period.',emptyMessage:'No estimates are available for this economy in the selected years.'
    });
    box.id=collection.id+'-comparison';
    box.classList.add('rf-sector-history');
    box.append(note(collection.interpretation));
    const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:power ? 3 : 2});
    const snapshot=records('Comparing the two economies in '+end,
      [collection.control,...pair.map(c=>mixedUnits ? c.name : c.name+' ('+unit+')')],
      collection.measures.map(m=>[mixedUnits ? m.name+' ('+m.unit+')' : m.name,...pair.map(c=>value(m,scopeGroup,c.iso3,end))]),collection.id+'-snapshot-'+groupName+suffix,
      v=>Number.isFinite(v) ? ((collection===partnerGroups || water) && v!==0 && Math.abs(v)<0.005 ? v.toExponential(2) : number.format(v)) : (v ?? 'Unavailable'));
    box.append(snapshot);
    const details=element('details');
    const headers=resourceCollections.includes(collection) ? [] : [collection.directions ? 'Trade direction' : 'Population group'];
    const groupCells=headers.length ? [groupName] : [];
    const header=['Country or economy','ISO3','Year',...headers];
    const rows=years.flatMap(y=>pair.map(c=>[c.name,c.iso3,y,...groupCells,...collection.measures.map(m=>value(m,scopeGroup,c.iso3,y))]));
    details.append(element('summary','','Annual comparison and CSV download'),records(collection.title+' by year',
      [...header,...collection.measures.map(m=>m.name+' ('+(m.unit || unit)+')')],rows,collection.id+'-'+groupName+suffix));
    box.append(details);
    if (collection.directions) {
      const detail=element('details');
      const both=years.flatMap(y=>pair.map(c=>[c.name,c.iso3,y,...directions.map(g=>value(measure,g,c.iso3,y))]));
      detail.append(element('summary','','Exports and imports for '+measure.name),records(measure.name+' by trade direction',
        ['Country or economy','ISO3','Year',...directions.map(g=>g.name+' ('+getUnit(collection,g)+')')],
        both,measure.slug+'-both-directions'+suffix));
      box.append(detail);
    } else if (scopeGroup) {
      const sex=element('details');
      const byGroup=years.flatMap(y=>pair.map(c=>[c.name,c.iso3,y,measure.name,...groups.map(g=>value(measure,g,c.iso3,y))]));
      sex.append(element('summary','','Women, men and total for '+measure.name),records(measure.name+' by population group',
        ['Country or economy','ISO3','Year',collection.control,...groups.map(g=>g.name+' ('+getUnit(collection,g)+')')],
        byGroup,measure.slug+'-population-groups'+suffix));
      box.append(sex);
    }
    if (collection===rents || collection===depletion) {
      const totals=element('details');
      const inputs=[rents,depletion];
      const pairedRows=years.flatMap(year=>pair.map(c=>[c.name,c.iso3,year,...inputs.map(input=>value({slug:input.entry},null,c.iso3,year))]));
      totals.append(element('summary','','Total rents and depletion side by side'),
        note('Rents use gross domestic product. Depletion uses gross national income, which includes net primary income from abroad. Each column keeps its own unit and reporting gaps.'),
        records('The two published totals',['Country or economy','ISO3','Year','Resource rents (% of GDP)','Resource depletion (% of GNI)'],
          pairedRows,'resource-rents-and-depletion'+suffix));
      for (const input of inputs) {
        const link=element('a','',input.title+' source and coverage');link.href='/data/economy/'+input.bundle+'-provenance.json';
        totals.append(link,document.createTextNode(' '));
      }
      box.append(totals);
    }
    if (collection===trade) {
      const links=element('div','hr-downloads');
      const inputFiles=[['Total trade source','provenance.json'],['Exports and imports sources','trade-components-provenance.json']];
      for (const [name,file] of inputFiles) {
        const link=element('a','',name);
        link.href='/data/economy/'+file;
        links.append(link);
      }
      box.append(links);
    }
    return box;
  }
  window.LaborTradeCollections={jobs,neet,trade,merchandise,commercial,partnerRegions,partnerGroups,tradeIndices,directionalCollections,resourceCollections,menuCollections,rents,depletion,land,freshwater,smallResidual,topics,load,controls,comparison};
})();
