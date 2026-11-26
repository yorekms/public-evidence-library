(() => {
  'use strict';
  const {element,note,panel,metrics,selectControl,sourcePanel,mapPanel}=window.PublicEvidenceComponents;
  const {sectors,amount,dataTable,difference}=window.ManufacturingComposition;
  const finite=Number.isFinite;
  const groups=['Both shares rose','Value-added share rose, employment share fell','Value-added share fell, employment share rose','Both shares fell','At least one share was unchanged'];
  const groupColors=['#28776c','#d3923b','#6977a5','#9e4e45','#a6a99f'];
  const options={
    together:'Direction of both shares',workers:'Reported employment',workersChange:'Change in reported employment',
    jobs:'Employment share',jobsChange:'Change in employment share',output:'Value-added share',outputChange:'Change in value-added share'
  };
  const formats={
    workers:{suffix:'',unit:'employment in source units',cuts:[10000,50000,250000,1e6],labels:['Under 10,000','10,000–<50,000','50,000–<250,000','250,000–<1 million','1 million or more']},
    workersChange:{suffix:'',unit:'employment in source units',cuts:[-10000,0,Number.MIN_VALUE,10000],labels:['Below −10,000','−10,000 to below zero','Zero','Above zero to below 10,000','10,000 or more']},
    share:{suffix:'%',unit:'%',cuts:[0,10,25,50,100],labels:['Below 0%','0–<10%','10–<25%','25–<50%','50–<100%','100% or more']},
    change:{suffix:' pp',unit:'percentage points',cuts:[-5,0,Number.MIN_VALUE,5],labels:['Below −5 pp','−5 to below 0 pp','Zero','Above 0 to below 5 pp','5 pp or more']}
  };
  function direction(output,jobs){
    if(!finite(output)||!finite(jobs))return null;
    if(!output || !jobs)return 4;
    return (output<0?2:0)+(jobs<0?1:0);
  }
  function observation(row,index,data){
    const total=row?.[1],workers=row?.[index+2],output=row?.[index+12];
    const jobs=finite(workers) && total>0 && workers<=total?100*workers/total:null;
    const profile=data.profiles[row?.[11]];
    const flag=[];
    if(row?.[9] & (1<<(index+1)))flag.push('Industry employment estimated');
    if(row?.[9] & 1)flag.push('Total employment estimated');
    if(row?.[10])flag.push('Employment provisional');
    if(row?.[21])flag.push('Value added provisional');
    if(row?.[18] & (1<<(index+1)))flag.push('Value-added share uses an estimate');
    return {total,workers,jobs,output,aligned:!!row?.[20],outputRegime:row?.[17],outputProfile:data.profiles[row?.[19]],regime:row?.[8],basis:data.concepts[row?.[7]],status:flag.join(', '),profile};
  }
  function periodValues(a,b,start,end){
    const comparable=a.regime!=null && a.regime===b.regime;
    const workersChange=comparable?difference(a.workers,b.workers,start,end):null;
    const jobsChange=comparable?difference(a.jobs,b.jobs,start,end):null;
    const outputComparable=a.outputRegime!=null && a.outputRegime===b.outputRegime;
    const outputChange=outputComparable?difference(a.output,b.output,start,end):null;
    const group=a.aligned && b.aligned?direction(outputChange,jobsChange):null;
    return {...b,workersChange,jobsChange,outputChange,group,together:group===null?null:jobsChange,
      breakInSeries:a.regime!=null && b.regime!=null && !comparable,
      outputBreak:a.outputRegime!=null && b.outputRegime!=null && !outputComparable};
  }
  function render({form,geo,region,countries,pair,years,params,update,byCountry,data,historyChart}){
    const sector=sectors.find(s=>s.key===params.get('subsector')) || sectors[0],index=sectors.indexOf(sector);
    const requested=params.get('industryMetric'),key=Object.hasOwn(options,requested)?requested:'together';
    const start=years[0],end=years.at(-1),area=region==='world'?'Worldwide':'Africa';
    const change=key.endsWith('Change') || key==='together',joint=key==='together';
    const format=formats[key] || (change?formats.change:formats.share);
    selectControl(form,'Manufacturing industry','mix-sector',sectors.map(s=>[s.key,s.name]),sector.key,subsector=>update({subsector}));
    selectControl(form,'Map measure','industry-metric',Object.entries(options),key,industryMetric=>update({industryMetric}));
    const at=(code,y)=>observation(byCountry.get(code)?.get(y),index,data);
    const items=new Map(),endpoints=[],members=groups.map(()=>[]);
    for(const c of countries.values()){
      const a=at(c.iso3,start),b=at(c.iso3,end),r=periodValues(a,b,start,end);
      items.set(c.iso3,r);
      if(r.group!==null)members[r.group].push(c);
      endpoints.push([c.name,c.iso3,sector.name,String(start),String(end),a.workers,b.workers,r.workersChange,a.jobs,b.jobs,r.jobsChange,a.output,b.output,r.outputChange,groups[r.group],a.basis,b.basis,a.status,b.status,[r.breakInSeries?'Employment series break':'',r.outputBreak?'Value-added series break':'',
        (!a.aligned || !b.aligned) && finite(r.jobsChange) && finite(r.outputChange)?'Different survey coverage':''].filter(Boolean).join(', ')]);
    }
    const geometry=region==='world'?geo:window.ManufacturingPerPerson.regionGeometry(geo,data.africanAreaCodes);
    const code=id=>id==='KOS'?'XKX':id;
    const values=[...items.values()].map(r=>r[key]).filter(finite),mapped=geometry.features.filter(f=>finite(items.get(code(f.id))?.[key])).length;
    const scale=Math.max(key==='workers'||key==='workersChange'?1:change?5:100,...values.map(Math.abs));
    const period=change?start+'–'+end:String(end);
    const map=mapPanel({
      title:sector.name+' · '+options[key]+' · '+period,
      hint:area+' · '+values.length+' economies with '+(joint?'comparable changes in both shares':change?'comparable endpoint values':'a value in '+end)+', including '+mapped+' with a map outline.'+
        (joint?' Color shows the direction of each share. Height shows the change in employment share.':'')+(change && start===end?' Choose different years to see changes.':''),
      geometry,year:end,period,cameraKey:'manufacturing-'+region,pairGDP:false,
      unit:joint?'pp employment share':format.unit,selected:pair[0].iso3==='XKX'?'KOS':pair[0].iso3,
      cuts:joint?[]:format.cuts,labels:joint?groups:format.labels,
      palette:joint?groupColors:change?['#97472d','#d89b7e','#eae7d5','#87b8ad','#276d67']:key==='workers'?['#dcece7','#b1d6c9','#7bb9a8','#428e7e','#195d55']:['#a5543c','#e0eee8','#accec2','#78af9d','#418773','#195d55'],
      floor:change||key==='output'?-scale:0,ceiling:scale,polygonHeightCap:scale,polygonHeightFloor:change||key==='output'?-scale:0,
      lookup:id=>{
        const source=code(id),r=items.get(source),v=r?.[key];
        const display=joint && finite(v)?'Employment '+amount(v,' pp',true)+' · Value added '+amount(r.outputChange,' pp',true):amount(v,format.suffix,change);
        return {id:r?source:null,value:v,display,color:joint && finite(v)?groupColors[r.group]:undefined};
      },onPick:a=>update({a,b:a===pair[1].iso3?pair[0].iso3:pair[1].iso3}),
      scaleNote:'Gray marks unavailable comparisons. Negative values extend below the baseline.'
    });
    const summary=panel(sector.name+' · '+end);
    for(const c of pair){
      const r=items.get(c.iso3);
      summary.append(element('h3','',c.name),metrics([
        ['Reported employment',amount(r.workers,'')],['Employment share',amount(r.jobs,'%')],['Value-added share',amount(r.output,'%')],
        ...(end>start?[['Employment share change',amount(r.jobsChange,' pp',true)],['Value-added share change',amount(r.outputChange,' pp',true)]]:[])
      ]));
      if(r.basis || r.status)summary.append(note([r.basis,r.status].filter(Boolean).join(' · ')+'.'));
      for(const text of new Set([r.profile?.qualification,r.outputProfile?.qualification].filter(Boolean)))summary.append(note(text));
      if(r.outputBreak)summary.append(note('Value-added coverage or definition changes during this interval. Its change is unavailable.'));
      if(!r.aligned && finite(r.jobs) && finite(r.output))summary.append(note('Employment and value added have different survey coverage in '+end+'. The joint comparison is unavailable.'));
      if(r.breakInSeries)summary.append(note('The employment series changes basis or coverage during this interval. Employment changes are unavailable.'));
    }
    if(index===4)summary.append(note('Other manufacturing is the remainder after the four named industries. Each remainder needs the manufacturing total and all four industry values.'));
    const top=element('div','hr-grid');top.append(map,summary);
    const charts=[],plots=element('div','rf-power-charts'),annual=[];
    let floor=0,ceiling=100;
    for(const c of pair){
      const jobs={name:'Employment share',color:'#9c582e',dash:'7,3',values:new Map()},out={name:'Value-added share',color:'#196e72',values:new Map()};
      let previous,previousOutput;
      for(const y of years){
        const r=at(c.iso3,y),breakFlag=previous!=null && previous!==r.regime?'b':'';
        jobs.values.set(y,[y,r.jobs,breakFlag]);previous=r.regime;
        // Plot source-only levels, but avoid overlaying two values with incompatible coverage.
        const plottedOutput=!r.aligned && finite(r.jobs)?null:r.output;
        out.values.set(y,[y,plottedOutput,previousOutput!=null && previousOutput!==r.outputRegime?'b':'']);
        previousOutput=r.outputRegime;
        for(const v of [r.jobs,plottedOutput])if(finite(v)){floor=Math.min(floor,v);ceiling=Math.max(ceiling,v);}
        annual.push([c.name,c.iso3,sector.name,String(y),r.workers,r.total,r.jobs,r.output,r.basis,r.status,r.profile?.definition,r.profile?.scope,r.profile?.reference,r.profile?.sourceNote,r.outputProfile?.scope,r.outputProfile?.reference,r.outputProfile?.definition,r.outputProfile?.sourceNote,r.profile?.qualification,r.outputProfile?.qualification,finite(r.jobs) && finite(r.output)?(r.aligned?'Matched':'Different survey coverage'):'']);
      }
      charts.push({c,lines:[out,jobs]});
    }
    for(const {c,lines} of charts){
      plots.append(historyChart(c.name+' · '+sector.name,lines,years,'Share of manufacturing total (%)',{floor,ceiling,percentTicks:true,compact:true,
        description:'Employment and value-added shares in '+c.name,emptyMessage:'No annual shares available for these years.'}));
    }
    const shifts=panel('Where did the two shares move together?');shifts.id='industry-directions';
    shifts.append(note(start===end?'Choose two different years to compare shifts in the two shares.':area+' · '+members.reduce((n,g)=>n+g.length,0)+' economies have comparable employment and value-added shares in '+start+' and '+end+'.'));
    for(const [i,list] of members.entries()){
      if(!list.length)continue;
      const details=element('details','rf-change-downloads'),links=element('div','hr-downloads');details.dataset.group=i;
      for(const c of list.sort((a,b)=>a.name.localeCompare(b.name))){
        const url=new URL(location.href);
        for(const [k,v] of Object.entries({view:'world',topic:'manufacturing-per-person',factoryLens:'industry-jobs',factoryRegion:region,subsector:sector.key,start,end,a:c.iso3,b:c.iso3===pair[1].iso3?pair[0].iso3:pair[1].iso3}))url.searchParams.set(k,v);
        const link=element('a','',c.name);link.href=url.href;links.append(link);
      }
      details.append(element('summary','',groups[i]+' · '+list.length),links);shifts.append(details);
    }
    const base='/data/economy/industry-employment',suffix=sector.key+'-'+start+'-'+end+'.csv';
    const sources=sourcePanel('Employment and value added come from the United Nations Industrial Development Organization, INDSTAT 2026, ISIC Revision 3. The counts cover the establishments or enterprises in each source. Some series report persons engaged or full-time equivalents. Employment shares divide each industry count by its reported manufacturing total. Value-added shares use the same industry divisions and each economy’s reported manufacturing value added, at current prices. Both shares are calculated directly from INDSTAT. The earlier manufacturing-by-industry view contains the separately published World Bank shares. Changes here are measured in percentage points.',[
      ['Full employment and value-added data (compressed CSV)',base+'.csv.gz',true],['Methods, coverage and industry definitions',base+'-methods.json'],['Original UNIDO records and survey notes (ZIP)',base+'-sources.zip',true],
      ['UNIDO Industrial Statistics Database','https://stat.unido.org/data/table?dataset=indstat&revision=3'],['UNIDO source terms','https://stat.unido.org/terms-and-conditions']
    ]);
    return [form,top,plots,shifts,
      dataTable('industry-annual','Annual employment and value-added records',['Economy','Code','Industry','Year','Industry employment (source units)','Manufacturing employment (source units)','Employment share (%)','Value-added share (%)','Employment basis','Source status','Source definition','Employment survey scope','Employment reference period','Employment survey source','Value-added survey scope','Value-added reference period','Value-added definition','Value-added survey source','Employment source note','Value-added source note','Annual comparison'],annual,'industry-employment-'+pair.map(c=>c.iso3).join('-')+'-'+suffix),
      dataTable('industry-endpoints',area+' · industry comparisons',['Economy','Code','Industry','Start year','End year','Start employment (source units)','End employment (source units)','Change in employment (source units)','Start employment share (%)','End employment share (%)','Employment share change (pp)','Start value-added share (%)','End value-added share (%)','Value-added share change (pp)','Joint direction','Start basis','End basis','Start status','End status','Comparability'],endpoints,'industry-employment-'+region+'-'+suffix),sources];
  }
  window.IndustryEmployment={render};
})();
