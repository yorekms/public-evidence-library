(() => {
  'use strict';
  const {element,note,panel,metrics,records,selectControl,sourcePanel,mapPanel}=window.PublicEvidenceComponents;
  const finite=Number.isFinite;
  const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  const count=n=>finite(n)?number.format(n):'Unavailable';
  const signed=n=>finite(n)?(n>0?'+':'')+number.format(n)+'%':'Unavailable';
  const growth=(a,b)=>finite(a) && a>0 && finite(b)?100*(b/a-1):null;
  const labels=['Output and employment rose','Output rose, employment fell','Output fell, employment rose','Output and employment fell','At least one was unchanged'];
  const directionColors=['#28776c','#d3923b','#6977a5','#9e4e45','#a6a99f'];
  const positiveColors=['#dcece7','#b1d6c9','#7bb9a8','#428e7e','#195d55'];
  const changeColors=['#97472d','#d89b7e','#eae7d5','#87b8ad','#276d67'];
  const changeCuts=[-25,0,Number.MIN_VALUE,25];
  const changeLabels=['Below −25%','−25% to below 0','Zero','Above 0 to below 25%','25% or more'];
  const measures={
    together:{option:'Output and employment together',title:'Manufacturing output and employment change',period:true,unit:'% employment change',cap:100,cuts:[],labels,palette:directionColors},
    people:{option:'People employed',title:'People employed in manufacturing',unit:'people',cap:5e6,cuts:[100000,500000,1e6,3e6],labels:['Under 100,000','100,000–<500,000','500,000–<1 million','1–<3 million','3 million or more'],palette:positiveColors},
    share:{option:'Share of employment',title:'Manufacturing share of total employment',unit:'% of employment',cap:25,cuts:[5,10,15,20],labels:['Below 5%','5–<10%','10–<15%','15–<20%','20% or more'],palette:positiveColors},
    jobsChange:{option:'Employment change',title:'Change in manufacturing employment',unit:'%',period:true,cap:100,cuts:changeCuts,labels:changeLabels,palette:changeColors},
    outputChange:{option:'Output change',title:'Change in real manufacturing value added',unit:'%',period:true,cap:100,cuts:changeCuts,labels:changeLabels,palette:changeColors}
  };
  function direction(output,jobs){
    if(!finite(output)||!finite(jobs))return null;
    if(output===0||jobs===0)return 4;
    if(output>0)return jobs>0?0:1;
    return jobs>0?2:3;
  }
  function table(id,title,headers,rows,filename){
    const wrap=element('details','rf-change-downloads');wrap.id=id;
    wrap.append(element('summary','',title),records(title,headers,rows,filename,v=>finite(v) && Math.abs(v)<1e-3 && v!==0?v.toPrecision(3):finite(v)?number.format(v):v??'Unavailable'));
    return wrap;
  }
  function render({form,geo,region,africanAreaCodes,countries,pair,years,params,update,byCountry,employment,historyChart}){
    const start=years[0],end=years.at(-1),area=region==='world'?'Worldwide':'Africa';
    const requested=params.get('jobsMeasure');
    const key=Object.hasOwn(measures,requested)?requested:'together',measure=measures[key];
    const jobs=new Map(employment.countries.map(c=>[c.iso3,new Map(c.rows.map(r=>[r[0],r]))]));
    const entries=new Map(),groups=labels.map(()=>[]),endpoints=[];
    for(const c of countries.values()){
      const history=byCountry.get(c.iso3),labour=jobs.get(c.iso3),a=history.get(start),b=history.get(end),x=labour?.get(start),y=labour?.get(end);
      const outputChange=start<end?growth(a?.[1],b?.[1]):null,jobsChange=start<end?growth(x?.[1],y?.[1]):null;
      const group=direction(outputChange,jobsChange);
      if(group!==null)groups[group].push(c);
      entries.set(c.iso3,{outputChange,jobsChange,group,people:y?.[1],share:y?.[3],together:group===null?null:jobsChange});
      endpoints.push([c.name,c.iso3,String(start),String(end),a?.[1],b?.[1],x?.[1],y?.[1],x?.[3],y?.[3],outputChange,jobsChange,labels[group],x?.[4],y?.[4]]);
    }
    selectControl(form,'Map measure','jobs-measure',Object.entries(measures).map(([k,m])=>[k,m.option]),key,jobsMeasure=>update({jobsMeasure}));
    const geometry=region==='world'?geo:window.ManufacturingPerPerson.regionGeometry(geo,africanAreaCodes);
    const scopeCode=id=>id==='KOS'?'XKX':id;
    const source=id=>entries.get(scopeCode(id));
    const available=[...entries.values()].filter(r=>finite(r[key])).length;
    const mapped=geometry.features.filter(f=>finite(source(f.id)?.[key])).length;
    const cap=key==='people' && region==='world'?25e6:measure.cap;
    const labelPeriod=measure.period?start+'–'+end:String(end);
    const coverage=area+' · '+available+' economies have data for this measure, including '+mapped+' with a map outline.';
    const map=mapPanel({
      title:measure.title+' · '+labelPeriod,hint:coverage+(key==='together'?' Color shows which way output and employment moved. Height shows the percentage change in people employed.':''),
      unit:measure.unit,geometry,year:end,period:labelPeriod,cameraKey:'manufacturing-'+region,pairGDP:false,
      selected:pair[0].iso3==='XKX'?'KOS':pair[0].iso3,
      cuts:measure.cuts,labels:measure.labels,palette:measure.palette,
      floor:measure.period?-cap:0,ceiling:Math.max(cap,...Array.from(entries.values(),r=>Math.abs(r[key]??0))),polygonHeightCap:cap,polygonHeightFloor:measure.period?-cap:0,
      scaleNote:'Full height at '+(measure.period?'±':'')+number.format(cap)+' '+measure.unit+'. Gray means unavailable.',
      lookup:id=>{
        const r=source(id),value=r?.[key];
        let display='Unavailable';
        if(finite(value)){
          if(key==='together')display='Output '+signed(r.outputChange)+' · Employment '+signed(r.jobsChange);
          else if(key==='people')display=count(value)+' people';
          else if(key==='share')display=number.format(value)+'% of total employment';
          else display=signed(value);
        }
        return {id:r?scopeCode(id):null,value,display,color:key==='together' && finite(value)?directionColors[r.group]:undefined};
      },
      onPick:a=>update({a,b:a===pair[1].iso3?pair[0].iso3:pair[1].iso3})
    });
    const summary=panel('Manufacturing in '+pair.map(c=>c.name).join(' and '));
    for(const c of pair){
      const r=entries.get(c.iso3),out=byCountry.get(c.iso3).get(end)?.[1];
      summary.append(element('h3','',c.name),metrics([
        ['Real value added in '+end,finite(out)?'$'+number.format(out/1e9)+' billion':'Unavailable'],
        ['People employed in '+end,count(r.people)],
        ['Share of all employment in '+end,finite(r.share)?number.format(r.share)+'%':'Unavailable'],
        ['Output change, '+start+'–'+end,signed(r.outputChange)],['Employment change, '+start+'–'+end,signed(r.jobsChange)]
      ]));
    }
    summary.append(note('Output is manufacturing value added in constant 2015 US dollars. Employment is the ILO’s modelled estimate of people working in manufacturing.'));
    const top=element('div','hr-grid');top.append(map,summary);
    const plots=element('div','rf-power-charts'),charts=[],annual=[];
    let ceiling=100;
    for(const c of pair){
      const history=byCountry.get(c.iso3),labour=jobs.get(c.iso3),outputStart=history.get(start)?.[1],jobStart=labour?.get(start)?.[1];
      const outputLine={name:'Manufacturing output',color:'#196e72',values:new Map()};
      const jobsLine={name:'People employed',color:'#9c582e',dash:'7,3',values:new Map()};
      for(const year of years){
        const o=history.get(year),j=labour?.get(year);
        const comparable=outputStart>0 && jobStart>0 && finite(o?.[1]) && finite(j?.[1]);
        const oi=comparable?100*o[1]/outputStart:null,ji=comparable?100*j[1]/jobStart:null;
        if(comparable)ceiling=Math.max(ceiling,oi,ji);
        outputLine.values.set(year,[year,oi,o?.[4]]);jobsLine.values.set(year,[year,ji,j?.[4]]);
        annual.push([c.name,c.iso3,String(year),o?.[1],j?.[1],j?.[2],j?.[3],oi,ji,o?.[4],j?.[4],j?.[5]]);
      }
      charts.push({c,lines:[outputLine,jobsLine]});
    }
    for(const {c,lines} of charts){
      plots.append(historyChart(c.name+' · output and employment',lines,years,'Index · '+start+' = 100',{compact:true,ceiling,percentTicks:false,description:'Manufacturing output and employment in '+c.name+' indexed to '+start,emptyMessage:'Both starting values and at least one matched observation are needed. Available source levels are in the annual table.'}));
    }
    const comparison=panel('Where did manufacturing employment grow with output?');comparison.id='factory-jobs-directions';
    const eligible=groups.reduce((n,g)=>n+g.length,0);
    if(eligible){
      comparison.append(note(area+' · '+eligible+' economies have manufacturing output and employment at both endpoints for '+start+'–'+end+'. Select a group to explore its economies.'));
      for(const [idx,list] of groups.entries()){
        if(!list.length)continue;
        const d=element('details','rf-change-downloads');d.dataset.group=String(idx);
        const links=element('div','hr-downloads');
        for(const c of list.sort((a,b)=>a.name.localeCompare(b.name))){
          const u=new URL(location.href);
          for(const [k,v] of Object.entries({factoryLens:'jobs',factoryRegion:region,start,end,a:c.iso3,b:c.iso3===pair[1].iso3?pair[0].iso3:pair[1].iso3}))u.searchParams.set(k,v);
          const link=element('a','',c.name);link.href=u.href;links.append(link);
        }
        d.append(element('summary','',labels[idx]+' · '+list.length),links);comparison.append(d);
      }
    }else comparison.append(note(start===end?'Choose different start and end years to compare growth.':'No economies have comparable observations at both selected endpoints.'));
    const suffix='-'+start+'-'+end+'.csv',base='/data/economy/manufacturing-employment';
    const links=[['All annual employment and output data (compressed CSV)',base+'.csv.gz',true],['Methods, coverage and source flags',base+'-methods.json'],['Archived ILO source data (ZIP)',base+'-sources.zip',true],
      ['ILO modelled estimates','https://ilostat.ilo.org/databases/iloest/'],['World Bank manufacturing value added','https://data.worldbank.org/indicator/NV.IND.MANF.KD'],['Archived output and population sources (ZIP)','/data/economy/manufacturing-per-person-sources.zip',true]];
    const sources=sourcePanel('Counts cover people employed in manufacturing (ISIC Rev. 4, section C), all sexes. Employment comes from the ILO’s November 2025 modelled estimates. The employment series spans 1991–2025. The ILO prepared the 2025 estimates before the year ended. The flag A means adjusted. The employment share divides that count by all employed people in the same ILO series. The charts use matching economy and year labels and positive starting values. They describe how output and employment changed together.',links);
    return [form,top,plots,comparison,
      table('factory-jobs-annual','Annual output and employment for the selected economies',['Economy','Code','Year','Manufacturing value added (constant 2015 US$)','Manufacturing employed persons','Total employed persons','Manufacturing share of employment (%)','Output index','Employment index','Output source flag','Manufacturing employment status','Total employment status'],annual,'manufacturing-employment-'+pair.map(c=>c.iso3).join('-')+suffix),
      table('factory-jobs-endpoints',area+' output and employment comparisons',['Economy','Code','Start year','End year','Start manufacturing value added (constant 2015 US$)','End manufacturing value added (constant 2015 US$)','Start manufacturing employed persons','End manufacturing employed persons','Start share of employment (%)','End share of employment (%)','Output change (%)','Employment change (%)','Direction','Start manufacturing employment status','End manufacturing employment status'],endpoints,'manufacturing-employment-'+region+suffix),sources];
  }
  window.ManufacturingEmployment={render};
})();
