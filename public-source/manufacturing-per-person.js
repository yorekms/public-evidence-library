(() => {
  'use strict';
  const {element,note,panel,metrics,records,selectControl,sourcePanel,mapPanel}=window.PublicEvidenceComponents;
  const finite=Number.isFinite;
  const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  const moneyBillion='billion constant 2015 US$';
  const moneyPerson='constant 2015 US$ per resident';
  const signed=value=>finite(value)?(value>0?'+':'')+number.format(value)+'%':'Unavailable';
  const amount=(value,unit)=>finite(value)?'$'+number.format(value)+(unit===moneyBillion?' billion':' per resident'):'Unavailable';
  const growth=(first,last)=>finite(first) && first>0 && finite(last)?100*(last/first-1):null;
  const seriesColors=['#196e72','#9c582e'];
  const moneyPalette=['#dcece7','#b1d6c9','#7bb9a8','#428e7e','#195d55'];
  const changePalette=['#97472d','#d89b7e','#eae7d5','#87b8ad','#276d67'];
  const measures={
    resident:{option:'Per resident',label:'Manufacturing value added per resident',column:3,unit:moneyPerson,cap:5000,cuts:[100,300,750,1500],labels:['Under $100','$100–<300','$300–<750','$750–<1,500','$1,500 or more']},
    total:{option:'Total value added',label:'Total manufacturing value added',column:1,unit:moneyBillion,cap:100,cuts:[1,5,20,50],labels:['Under $1B','$1–<5B','$5–<20B','$20–<50B','$50B or more']},
    residentChange:{option:'Per-resident change',label:'Change in manufacturing value added per resident',column:3,change:true},
    totalChange:{option:'Total change',label:'Change in total manufacturing value added',column:1,change:true}
  };

  function regionGeometry(world, codes) {
    const features=world.features.filter(f=>codes.includes(f.id));
    const points=features.flatMap(f=>f.polygons.flat(2));
    const bounds=[[d3.min(points,p=>p[0]),d3.min(points,p=>p[1])],[d3.max(points,p=>p[0]),d3.max(points,p=>p[1])]];
    return {...world,features,bounds};
  }

  function render({form,geo,region,africanAreaCodes,countries,pair,years,params,update,byCountry,historyChart}) {
    const start=years[0],end=years.at(-1),area=region==='world'?'Worldwide':'Africa';
    const selected=Object.hasOwn(measures,params.get('factoryMeasure'))?params.get('factoryMeasure'):'resident';
    const measure=measures[selected],unit=measure.change?'%':measure.unit,cap=selected==='resident' && region==='africa'?1500:(measure.cap??100);
    const geometry=region==='world'?geo:regionGeometry(geo,africanAreaCodes);
    const rows=[],byCode=new Map();
    let bothUp=0,opposite=0,bothDown=0,eligible=0,available=0;
    for(const c of countries.values()){
      const history=byCountry.get(c.iso3),first=history.get(start),last=history.get(end);
      const totalChange=end>start?growth(first?.[1],last?.[1]):null;
      const residentChange=end>start?growth(first?.[3],last?.[3]):null;
      const value=measure.change?(measure.column===1?totalChange:residentChange):last?.[measure.column];
      const mapValue=selected==='total' && finite(value)?value/1e9:value;
      if(finite(mapValue))available++;
      if(finite(totalChange) && finite(residentChange)){
        eligible++;
        if(totalChange>0 && residentChange>0)bothUp++;
        if(totalChange<0 && residentChange<0)bothDown++;
        if(totalChange>0 && residentChange<0)opposite++;
      }
      byCode.set(c.iso3,{mapValue,totalChange,residentChange});
      rows.push([c.name,c.iso3,start,end,first?.[1],last?.[1],first?.[2],last?.[2],first?.[3],last?.[3],totalChange,residentChange]);
    }
    selectControl(form,'Map measure','factory-measure',Object.entries(measures).map(([k,m])=>[k,m.option]),selected,factoryMeasure=>update({factoryMeasure}));
    const period=measure.change?start+'–'+end:end;
    const mapped=geometry.features.filter(f=>finite(byCode.get(f.id==='KOS'?'XKX':f.id)?.mapValue)).length;
    const map=mapPanel({
      title:measure.label+' · '+period,hint:area+' · '+available+' of '+countries.size+' economies have data, including '+mapped+' with a map outline. Dollar values use 2015 prices.',
      unit,geometry,year:end,period:String(period),cameraKey:'manufacturing-'+region,pairGDP:false,
      selected:pair[0].iso3==='XKX'?'KOS':pair[0].iso3,
      lookup:id=>{
        const code=id==='KOS'?'XKX':id,record=byCode.get(code);
        return {id:record?code:null,value:record?.mapValue,display:measure.change?signed(record?.mapValue):amount(record?.mapValue,unit)};
      },
      onPick:a=>update({a,b:a===pair[1].iso3?pair[0].iso3:pair[1].iso3}),
      floor:measure.change?-cap:0,ceiling:Math.max(cap,...Array.from(byCode.values(),r=>Math.abs(r.mapValue??0))),
      polygonHeightCap:cap,polygonHeightFloor:measure.change?-cap:0,
      palette:measure.change?changePalette:moneyPalette,
      cuts:measure.cuts??[-25,0,Number.MIN_VALUE,25],labels:measure.labels??['Below −25%','−25% to below 0','Zero','Above 0 to below 25%','25% or more'],
      scaleNote:'Heights are capped at '+(measure.change?'±':'')+number.format(cap)+' '+unit+'. Labels show the underlying values. Gray means unavailable.'
    });
    const summary=panel('Manufacturing in '+pair[0].name+' and '+pair[1].name);
    for (const c of pair){
      const last=byCountry.get(c.iso3).get(end),r=byCode.get(c.iso3);
      summary.append(element('h3','',c.name),metrics([
        ['Total value added in '+end,amount(finite(last?.[1])?last[1]/1e9:null,moneyBillion)],
        ['Per resident in '+end,finite(last?.[3])?'$'+number.format(last[3]):'Unavailable'],
        ['Total change, '+start+'–'+end,signed(r.totalChange)],
        ['Per-resident change, '+start+'–'+end,signed(r.residentChange)]
      ]));
    }
    const top=element('div','hr-grid');top.append(map,summary);
    const histories=element('div','rf-power-charts');
    for (const key of ['total','resident']){
      const m=measures[key],lines=pair.map((c,i)=>{
        const values=new Map(years.map(year=>{
          const row=byCountry.get(c.iso3).get(year),value=row?.[m.column];
          return [year,[year,key==='total' && finite(value)?value/1e9:value,row?.[4]||'']];
        }));
        return {name:c.name,values,color:seriesColors[i],dash:i?'7,3':''};
      });
      histories.append(historyChart(m.label,lines,years,m.unit,{compact:true,percentTicks:false,description:m.label+' in '+pair.map(c=>c.name).join(' and '),emptyMessage:'No observations for the selected economies in these years.'}));
    }
    const comparison=panel('How did manufacturing change across '+(region==='world'?'the world':'Africa')+'?');
    if(eligible){
      comparison.append(note('From '+start+' to '+end+', '+eligible+' economies had both measures at both endpoints. Each reporting economy counts once.'),metrics([
        ['Total and per-resident value added both rose',bothUp],
        ['Total rose while value added per resident fell',opposite],
        ['Total and per-resident value added both fell',bothDown],
        ...(eligible>bothUp+opposite+bothDown?[['Other directions or no change',eligible-bothUp-opposite-bothDown]]:[])
      ]));
    } else comparison.append(note(start===end?'Choose different start and end years to compare changes.':'No economies have both measures and positive baselines in this period.'));
    if(opposite){
      const details=element('details','rf-change-downloads');
      details.append(element('summary','','Explore the '+opposite+(opposite===1?' economy':' economies')+' where total rose and per-resident value fell'));
      const links=element('div','hr-downloads');
      for(const c of [...countries.values()].sort((a,b)=>a.name.localeCompare(b.name))){
        const r=byCode.get(c.iso3);
        if(!(r.totalChange>0 && r.residentChange<0))continue;
        const url=new URL(location.href);
        for (const [key,value] of Object.entries({a:c.iso3,b:c.iso3===pair[1].iso3?pair[0].iso3:pair[1].iso3,start,end,factoryRegion:region})) url.searchParams.set(key,value);
        const link=element('a','',c.name);link.href=url.href;links.append(link);
      }
      details.append(links);comparison.append(details);
    }
    const annual=pair.flatMap(c=>years.map(year=>{
      const r=byCountry.get(c.iso3).get(year);
      return [c.name,c.iso3,year,r?.[1],r?.[2],r?.[3],r?.[4],r?.[5]];
    }));
    const detail=(id,title,headers,values,filename)=>{
      const d=element('details','rf-change-downloads');d.id=id;
      d.append(element('summary','',title),records(title,headers,values,filename,v=>finite(v)?number.format(v):v??'Unavailable'));return d;
    };
    const data='/data/economy/manufacturing-per-person';
    const links=[['All annual values (compressed CSV)',data+'.csv.gz',true],['Definitions, coverage and calculation',data+'-methods.json'],['Original World Bank data and UN geographic classification (ZIP)',data+'-sources.zip',true],
      ['World Bank manufacturing value added','https://data.worldbank.org/indicator/NV.IND.MANF.KD'],['World Bank total population','https://data.worldbank.org/indicator/SP.POP.TOTL'],['UN geographic regions','https://unstats.un.org/unsd/methodology/m49/']];
    const share=new URL(location.href);share.searchParams.set('topic','manufacturing');share.searchParams.delete('factoryMeasure');share.searchParams.delete('factoryRegion');
    for (const [key,value] of Object.entries({a:pair[0].iso3,b:pair[1].iso3,start,end})) share.searchParams.set(key,value);
    links.push(['Explore manufacturing as a share of GDP',share.href]);
    const sources=sourcePanel('Manufacturing value added measures the value created after intermediate inputs, in constant 2015 US dollars. The per-resident measure divides that value by the same economy’s midyear population, including residents of all ages. Africa follows the UN M49 classification. Missing source values remain blank in the downloads.',links);
    return [form,top,histories,comparison,
      detail('factory-annual','Annual values for the selected economies',['Economy','Code','Year','Manufacturing value added (constant 2015 US$)','Population','Manufacturing value added per resident (constant 2015 US$)','Manufacturing source flag','Population source flag'],annual,'manufacturing-'+pair.map(c=>c.iso3).join('-')+'-'+start+'-'+end+'.csv'),
      detail('factory-endpoints',area+' comparisons and CSV download',['Economy','Code','Start year','End year','Start manufacturing value added (constant 2015 US$)','End manufacturing value added (constant 2015 US$)','Start population','End population','Start per resident (constant 2015 US$)','End per resident (constant 2015 US$)','Total change (%)','Per-resident change (%)'],rows,'manufacturing-'+region+'-'+start+'-'+end+'.csv'),
      sources];
  }
  window.ManufacturingPerPerson={render,regionGeometry};
})();
