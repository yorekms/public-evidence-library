(() => {
  'use strict';
  const {element,note,panel,metrics,records,selectControl,sourcePanel,mapPanel}=window.PublicEvidenceComponents;
  const finite=Number.isFinite;
  const format=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  const levelFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:9});
  const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumSignificantDigits:4});
  const signed=(n,unit)=>finite(n) ? (n>0?'+':'')+format.format(n)+unit : 'Unavailable';
  const pens=[{color:'#196e72',dash:''},{color:'#9c582e',dash:'7,3'}];
  const demandMeasures={gap:['Demand growth minus output growth','percentage points'],demand:['Electricity demand growth','%'],industry:['Real industrial value-added growth','%']};
  const useMeasures={
    level:['Industrial electricity use','TWh'],
    gap:['Electricity use growth minus output growth','percentage points'],
    demand:['Industrial electricity use growth','%'],
    industry:demandMeasures.industry
  };
  const unsdUrl='https://data.un.org/legacy/Data.aspx?d=EDATA&f=cmID%3AEL%3BtrID%3A121';
  const useScope='The UN records final electricity consumption in manufacturing, construction and non-fuel mining. The World Bank’s industrial value added includes fuel extraction and utilities as well. The two series cover overlapping groups of activities.';
  const useStatus=row=>!finite(row?.[1]) ? 'Unavailable' : row[3]==='1' ? 'Estimate' : 'No estimate flag';
  const useValue=row=>finite(row?.[1]) ? (row[1]>0 && row[1]<0.01?levelFormat:format).format(row[1])+' TWh'+(row[3]==='1'?' (estimate)':'') : 'Unavailable';
  const complete=row=>Boolean(row && finite(row[1]) && finite(row[2]));
  const baseline=row=>complete(row) && row[1]>0 && row[2]>0;

  function growth(first,last) {
    if (!baseline(first) || !complete(last) || last[0]<=first[0]) return null;
    const demand=100*(last[1]/first[1]-1);
    const industry=100*(last[2]/first[2]-1);
    return {demand,industry,gap:demand-industry};
  }
  function indices(first,row) {
    if (!baseline(first) || !complete(row)) return [null,null];
    return [100*row[1]/first[1],100*row[2]/first[2]];
  }
  function drawScatter(points,pair,onPick,start,end,measureName,sectorUse) {
    const box=panel(sectorUse?'How industrial electricity use and output changed across economies':'How demand and output changed across economies','hr-history');
    box.id='power-industry-scatter';
    if (!points.length) {
      box.append(note('Choose two different years with paired observations to see the cross-country comparison.'));
      return box;
    }
    box.append(note('Each point is one economy. Above the diagonal, '+measureName.toLowerCase()+' grew faster than industrial value added. Below it, industrial value added grew faster. Select a point to explore its history.'));
    const sameUp=points.filter(p=>p.demand>0 && p.industry>0).length;
    const sameDown=points.filter(p=>p.demand<0 && p.industry<0).length;
    const opposite=points.filter(p=>p.demand*p.industry<0).length;
    const unchanged=points.length-sameUp-sameDown-opposite;
    box.append(note('Of '+points.length+' economies with comparable endpoints, both measures rose in '+sameUp+', both fell in '+sameDown+', and they moved in opposite directions in '+opposite+'.'+(unchanged?' At least one was unchanged in '+unchanged+'.':'')));
    if (sectorUse) {
      const estimated=points.filter(p=>p.estimated).length;
      box.append(note(estimated+' of these '+points.length+' comparisons include a UN electricity estimate in the start or end year.'));
    }
    const low=Math.min(-1,...points.map(p=>Math.min(p.demand,p.industry)))*1.12;
    const high=Math.max(1,...points.map(p=>Math.max(p.demand,p.industry)))*1.12;
    const side=320,left=60,top=18;
    const x=d3.scaleSymlog().constant(25).domain([low,high]).range([left,left+side]);
    const y=x.copy().range([top+side,top]);
    const svg=d3.create('svg').attr('role','img').attr('aria-label','Changes from '+start+' to '+end+'. Horizontal axis: industrial value added. Vertical axis: '+measureName.toLowerCase()+'. Both axes show percentage change.').attr('viewBox','0 0 412 398');
    const ticks=[0];
    for (let size=1;size<10*Math.max(high,-low);size*=10) {
      for (const multiple of [1,2.5,5]) {
        const v=size*multiple;
        if (v>=10 || Math.max(high,-low)<10) ticks.push(-v,v);
      }
    }
    const visible=[];
    for (const tick of ticks) {
      if (tick<low || tick>high || visible.some(v=>Math.abs(x(v)-x(tick))<30)) continue;
      visible.push(tick);
      const stroke=tick===0?'#82958b':'#dce4db';
      svg.append('line').attr('x1',x(tick)).attr('x2',x(tick)).attr('y1',top).attr('y2',top+side).attr('stroke',stroke);
      svg.append('line').attr('x1',left).attr('x2',left+side).attr('y1',y(tick)).attr('y2',y(tick)).attr('stroke',stroke);
      svg.append('text').attr('x',x(tick)).attr('y',top+side+17).attr('text-anchor','middle').text(format.format(tick));
      svg.append('text').attr('x',left-6).attr('y',y(tick)+4).attr('text-anchor','end').text(format.format(tick));
    }
    svg.append('line').attr('x1',x(low)).attr('y1',y(low)).attr('x2',x(high)).attr('y2',y(high)).attr('stroke','#53695e').attr('stroke-dasharray','4,4');
    svg.append('text').attr('text-anchor','middle').attr('x',left+side/2).attr('y',top+side+44).text('Industrial value-added change (%)');
    svg.append('text').attr('text-anchor','middle').attr('transform','translate(13,'+(top+side/2)+') rotate(-90)').text(measureName+' change (%)');
    const picks=pair.map(c=>c.iso3);
    const ordered=[...points].sort((a,b)=>Number(picks.includes(a.code))-Number(picks.includes(b.code)));
    for (const point of ordered) {
      const i=picks.indexOf(point.code);
      svg.append('circle').attr('cx',x(point.industry)).attr('cy',y(point.demand)).attr('r',i<0?3.3:5.4)
        .attr('data-economy',point.code).attr('fill',i<0?'#718a80':pens[i].color)
        .attr('fill-opacity',i < 0 ? 0.7 : 1).attr('stroke',i<0?'#fff':'#243d35').attr('stroke-width',i < 0 ? 0.5 : 1.4)
        .on('click',()=>onPick(point.code)).append('title').text(point.name+' · electricity '+signed(point.demand,'%')+' · industry '+signed(point.industry,'%'));
    }
    const fig=element('figure','rf-power-scatter');
    fig.append(svg.node());box.append(fig);
    const legend=element('div','rf-history-legend');
    for (const [i,c] of pair.entries()) {
      const label=element('span','rf-series-label');const swatch=element('i','hr-key');swatch.style.backgroundColor=pens[i].color;
      label.append(swatch,document.createTextNode(c.name+(points.some(p=>p.code===c.iso3)?'':' · endpoints unavailable')));legend.append(label);
    }
    box.append(legend,note('Both axes use the same scale. Tick spacing compresses large percentage changes so the full range stays visible. The table lists every economy, including those without a plotted point.'));
    return box;
  }
  function render({industrialUse=false,form,geo,countries,pair,years,params,update,historyByCode,historyChart}) {
    const start=years[0],end=years.at(-1);
    const measures=industrialUse?useMeasures:demandMeasures;
    const measureName=industrialUse?'Industrial electricity use':'Electricity demand';
    const shortName=industrialUse?'Electricity use':'Demand';
    const dataset=industrialUse?'industry-electricity-output':'power-industry';
    const requested=params.get('powerMetric');
    const selected=Object.hasOwn(measures,requested)?requested:(industrialUse?'level':'gap');
    const level=selected==='level';
    const [label,unit]=measures[selected];
    const results=new Map(), points=[], allRows=[];
    for (const c of countries.values()) {
      const series=historyByCode.get(c.iso3),first=series.get(start),last=series.get(end);
      const g=growth(first,last);results.set(c.iso3,g);
      if (g) points.push({code:c.iso3,name:c.name,...g,estimated:industrialUse && (first[3]==='1' || last[3]==='1')});
      allRows.push([c.name,c.iso3,start,end,first?.[1],last?.[1],first?.[2],last?.[2],g?.demand,g?.industry,g?.gap]);
      if (industrialUse) allRows.at(-1).push(useStatus(first),useStatus(last));
    }
    selectControl(form,'Map measure','power-metric',Object.entries(measures).map(([key,entry])=>[key,entry[0]]),selected,powerMetric=>update({powerMetric}));
    const onPick=a=>update({a,b:a===pair[1].iso3?pair[0].iso3:pair[1].iso3});
    const useAtEnd=code=>historyByCode.get(code)?.get(end);
    const reporting=level?Array.from(countries.keys()).filter(code=>finite(useAtEnd(code)?.[1])).length:0;
    const extent=level?1000:Math.max(1,...points.map(p=>Math.abs(p[selected])));
    const changeHint=(start===end?'Choose two different years to map change. ':points.length+' economies have both measures at both endpoints. ')+(selected==='gap'?'Positive values mean '+measureName.toLowerCase()+' grew faster. Negative values mean industrial output grew faster.':'The map uses the same matched economies as the growth-gap comparison.');
    const map=mapPanel({
      title:label+' · '+(level?end:start+'–'+end),
      hint:level?reporting+' reporting areas have an electricity-use value in '+end+'. Select an economy to compare its consumption and industrial output.':changeHint,
      geometry:geo,year:end,cameraKey:'country-trends',pairGDP:false,ceiling:extent,floor:level?0:-extent,polygonHeightCap:level?1000:100,polygonHeightFloor:level?0:-100,unit,
      selected:pair[0].iso3==='XKX'?'KOS':pair[0].iso3,
      lookup:id=>{
        const code=id==='KOS'?'XKX':id;
        const row=useAtEnd(code);
        return {id:countries.has(code)?code:null,value:level?row?.[1]:results.get(code)?.[selected],display:level?useValue(row):undefined};
      },
      onPick,cuts:level?[1,10,100,500]:[-25,0,Number.MIN_VALUE,25],
      labels:level?['Under 1','1 to below 10','10 to below 100','100 to below 500','500 or more']:['Below −25','−25 to below 0','Zero','Above 0 to below 25','25 or more'],
      palette:level?['#dbece7','#a9d2c8','#70b3a6','#378a7d','#175c55']:['#97472d','#d89b7e','#eae7d5','#87b8ad','#276d67'],
      scaleNote:level?'Height reaches its limit at 1,000 TWh. Labels and tables show the full amount. Gray marks missing consumption data.':'Height reaches its limit at ±100 '+unit+'. Labels and tables show the full change. Gray marks unavailable endpoints.'
    });
    const summary=panel('Changes in the selected economies');
    for (const c of pair) {
      const g=results.get(c.iso3),series=historyByCode.get(c.iso3);
      summary.append(element('h3','',c.name),metrics([
        ...(industrialUse?[[measureName+' in '+end,useValue(series.get(end))],['Industrial value added in '+end,finite(series.get(end)?.[2])?dollars.format(series.get(end)[2])+' (2015 US$)':'Unavailable']]:[]),
        [industrialUse?'Electricity use change':measureName,signed(g?.demand,'%')],[industrialUse?'Industrial output change':'Industrial value added',signed(g?.industry,'%')],
        [shortName+' minus output',signed(g?.gap,' pp')],['Years with both values',years.filter(y=>complete(series.get(y))).length+' of '+years.length]
      ]));
      if (industrialUse) {
        const estimatedYears=[...new Set([start,end])].filter(year=>series.get(year)?.[3]==='1');
        if (estimatedYears.length) summary.append(note('The UN flags electricity use in '+estimatedYears.join(' and ')+' as estimated.'));
      }
      if (!g) summary.append(note(start===end?'A change needs two different years.':'Both source values are required in the exact start and end years, with positive starting values.'));
    }
    summary.append(note(industrialUse?useScope:'Electricity demand covers homes, businesses, industry and system losses. Industrial output here is value added by mining, manufacturing, utilities and construction, at constant 2015 prices.'));
    const charts=element('div','rf-power-charts');
    const annual=[];
    const chartCeiling=Math.max(100,...pair.flatMap(c=>{
      const history=historyByCode.get(c.iso3);
      return years.flatMap(y=>indices(history.get(start),history.get(y))).filter(finite);
    }));
    for (const c of pair) {
      const series=historyByCode.get(c.iso3),first=series.get(start);
      const lines=[measureName,'Industrial value added'].map((name,i)=>({name,values:new Map(),...pens[i]}));
      for (const year of years) {
        const row=series.get(year),idx=indices(first,row);
        lines.forEach((line,i)=>line.values.set(year,[year,idx[i]]));
        annual.push([c.name,c.iso3,year,row?.[1],row?.[2],...idx]);
        if (industrialUse) annual.at(-1).push(useStatus(row));
      }
      charts.append(historyChart(c.name+(industrialUse?' · industrial electricity use and output':' · demand and industrial output'),lines,years,'Index · '+start+' = 100',{
        ceiling:chartCeiling,compact:true,percentTicks:false,description:measureName+' and industrial value added in '+c.name+', indexed to '+start+'.',
        emptyMessage:'A paired start-year observation is required to index these series. Available source levels appear in the annual table.'
      }));
    }
    const scatter=drawScatter(points,pair,onPick,start,end,measureName,industrialUse);
    const suffix='-'+start+'-'+end+'.csv';
    function detail(title,content) {
      const d=element('details','rf-change-downloads');d.append(element('summary','',title),content);return d;
    }
    const pretty=v=>finite(v)?(industrialUse && Math.abs(v)<1?levelFormat:format).format(v):v??'Unavailable';
    const rawTable=records('Annual source levels and indices',['Economy','Code','Year',measureName+' (TWh)','Industrial value added (constant 2015 US$)',shortName+' index','Industrial output index',...(industrialUse?['UN electricity-use status']:[])],
      annual,dataset+'-'+pair.map(c=>c.iso3).join('-')+suffix,pretty);
    const worldTable=records('All economies for the selected period',['Economy','Code','Start year','End year','Start '+shortName.toLowerCase()+' (TWh)','End '+shortName.toLowerCase()+' (TWh)','Start industrial value added (constant 2015 US$)','End industrial value added (constant 2015 US$)',shortName+' growth (%)','Industrial output growth (%)',shortName+' minus output (percentage points)',...(industrialUse?['Start UN electricity-use status','End UN electricity-use status']:[])],allRows,dataset+'-world'+suffix,pretty);
    rawTable.id='power-industry-annual';
    worldTable.id='power-industry-endpoints';
    const data='/data/economy/';
    const links=[['All annual country values (compressed CSV)',data+dataset+'.csv.gz',true],['Pairing, coverage and calculations',data+dataset+'-methods.json'],
      industrialUse?['Original UN electricity data and documentation (ZIP)',data+'industrial-electricity-sources.zip',true]:['Original Ember data and methodology (ZIP)',data+'electricity-sources.zip',true],['Original World Bank files (ZIP)',data+'industrial-accounts-sources.zip',true],
      industrialUse?['UN industrial electricity consumption',unsdUrl]:['Ember yearly electricity data','https://ember-energy.org/data/yearly-electricity-data/'],['World Bank industrial value added','https://data.worldbank.org/indicator/NV.IND.TOTL.KD']];
    if (industrialUse) links.push(['Industrial electricity observations and UN flags (compressed CSV)',data+'industrial-electricity-use.csv.gz',true],['UN source notes and coverage',data+'industrial-electricity-provenance.json']);
    links.push(['Explore manufacturing in Africa','/rent-freight.html?view=world&topic=manufacturing-per-person&mode=raised3d']);
    const counterpart=industrialUse?['power-industry','Compare economy-wide electricity demand and output']:['industry-electricity-output','Explore industrial electricity use and output'];
    for (const [topic,text] of [counterpart,['electricity-demand','Explore electricity demand in TWh'],['industrial-value-added','Explore real industrial value added']]) {
      const url=new URL(location.href);url.searchParams.set('topic',topic);url.searchParams.delete('powerMetric');links.push([text,url.href]);
    }
    const sources=sourcePanel(industrialUse?'The UN reports electricity in millions of kilowatt-hours. Dividing by 1,000 gives terawatt-hours (TWh). The annual table identifies UN estimates. Reporting years follow each publisher and may be fiscal years. UN areas that combine several economies keep their electricity levels and appear separately in the selector. Changes use the exact selected years and require a positive starting value for each series. The indexed charts set both series to 100 in the start year.': 'Ember estimates annual economy-wide demand from domestic generation and net imports. Some recent estimates use economic assumptions. The World Bank reports industry value added in constant 2015 US dollars. The comparison matches economy codes and calendar years. A shared trend describes how the measures moved together and cannot establish a cause.',links);
    const top=element('div','hr-grid');top.append(map,summary);
    return [form,top,charts,scatter,detail('Annual levels and indices for the two economies',rawTable),detail('Worldwide endpoint table and CSV download',worldTable),sources];
  }
  window.PowerIndustry={render,growth,indices};
})();
