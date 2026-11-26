(() => {
  'use strict';
  const {element,note,panel,metrics,records,selectControl,sourcePanel,mapPanel}=window.PublicEvidenceComponents;
  const sectors=[
    {key:'food',name:'Food, beverages and tobacco',code:'FBTO',color:'#79511d'},
    {key:'textiles',name:'Textiles and clothing',code:'TXTL',color:'#95526f',dash:'6,2'},
    {key:'machinery',name:'Machinery and transport equipment',code:'MTRN',color:'#196e72'},
    {key:'chemicals',name:'Chemicals',code:'CHEM',color:'#545d96',dash:'3,2'},
    {key:'other',name:'Other manufacturing',code:'OTHR',color:'#58634a',dash:'8,3'}
  ];
  const finite=Number.isFinite;
  const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  const amount=(n,unit,sign=false)=>finite(n)?(sign && n>0?'+':'')+number.format(n)+unit:'Unavailable';
  const difference=(a,b,start,end)=>end>start && finite(a) && finite(b)?b-a:null;
  const sourcePath='/data/economy/manufacturing-composition';
  function dataTable(id,title,headers,rows,filename){
    const detail=element('details','rf-change-downloads');detail.id=id;
    detail.append(element('summary','',title),records(title,headers,rows,filename,v=>finite(v)?number.format(v):v??'Unavailable'));
    return detail;
  }

  function render({form,geo,region,africanAreaCodes,countries,pair,years,params,update,byCountry,historyChart}){
    const sector=sectors.find(s=>s.key===params.get('subsector')) || sectors[2];
    const column=sectors.indexOf(sector)+1;
    const start=years[0],end=years.at(-1);
    const change=params.get('mixMeasure')==='change',area=region==='world'?'Worldwide':'Africa';
    selectControl(form,'Manufacturing industry','mix-sector',sectors.map(s=>[s.key,s.name]),sector.key,subsector=>update({subsector}));
    selectControl(form,'Map measure','mix-measure',[['share','Share in end year'],['change','Change in share']],change?'change':'share',mixMeasure=>update({mixMeasure}));
    const geometry=region==='world'?geo:window.ManufacturingPerPerson.regionGeometry(geo,africanAreaCodes);
    const endpoints=[],mapValues=new Map();
    for(const c of countries.values()){
      const history=byCountry.get(c.iso3),a=history.get(start)?.[column],b=history.get(end)?.[column];
      const delta=difference(a,b,start,end);
      endpoints.push([c.name,c.iso3,sector.name,String(start),String(end),a,b,delta]);
      mapValues.set(c.iso3,change?delta:b);
    }
    const sourceCode=id=>id==='KOS'?'XKX':id;
    const values=Array.from(mapValues.values()).filter(finite);
    const mapped=geometry.features.filter(f=>finite(mapValues.get(sourceCode(f.id)))).length;
    const scale=change?Math.max(25,...values.map(Math.abs)):150;
    const period=change?start+'–'+end:String(end);
    const map=mapPanel({
      title:sector.name+' · '+(change?'change in share':'share of manufacturing')+' · '+period,
      hint:area+' · '+values.length+' economies with '+(change?'both endpoint values':'a reported share')+', including '+mapped+' with a map outline.'+(change && start===end?' Choose two different years to measure change.':''),
      unit:change?'percentage points':'% of manufacturing value added',geometry,year:end,period,cameraKey:'manufacturing-'+region,pairGDP:false,
      selected:pair[0].iso3==='XKX'?'KOS':pair[0].iso3,
      lookup:id=>{
        const code=sourceCode(id),value=mapValues.get(code);
        return {id:mapValues.has(code)?code:null,value,display:amount(value,change?' pp':'%',change)};
      },
      onPick:a=>update({a,b:a===pair[1].iso3?pair[0].iso3:pair[1].iso3}),
      floor:-scale,ceiling:scale,polygonHeightFloor:-scale,polygonHeightCap:scale,
      palette:change?['#97472d','#d89b7e','#eae7d5','#87b8ad','#276d67']:['#a5543c','#e0eee8','#accec2','#78af9d','#418773','#195d55'],
      cuts:change?[-10,0,Number.MIN_VALUE,10]:[0,10,25,50,100],
      labels:change?['Below −10 pp','−10 to below 0 pp','Zero','Above 0 to below 10 pp','10 pp or more']:['Below 0%','0–<10%','10–<25%','25–<50%','50–<100%','100% or more'],
      scaleNote:'Gray marks missing data. Negative values extend below the baseline.'
    });
    const summary=panel(sector.name);
    for(const c of pair){
      const h=byCountry.get(c.iso3),a=h.get(start)?.[column],b=h.get(end)?.[column];
      const lines=[['Share in '+start,amount(a,'%')]];
      if(start!==end)lines.push(['Share in '+end,amount(b,'%')],['Change in share',amount(difference(a,b,start,end),' pp',true)]);
      summary.append(element('h3','',c.name),metrics(lines));
    }
    summary.append(note('Each share uses the economy’s manufacturing value added as its denominator. A rising share means the industry accounted for more of that total.'));
    const top=element('div','hr-grid');top.append(map,summary);
    const plots=element('div','rf-power-charts'),charts=[],annual=[];
    let floor=0,ceiling=100;
    for(const c of pair){
      const h=byCountry.get(c.iso3);
      const lines=sectors.map(s=>({...s,values:new Map()}));
      for(const y of years){
        const row=h.get(y);
        annual.push([c.name,c.iso3,String(y),...sectors.map((s,i)=>row?.[i+1])]);
        lines.forEach((line,i)=>{
          const value=row?.[i+1];
          line.values.set(y,[y,value]);
          if(finite(value)){floor=Math.min(floor,value);ceiling=Math.max(ceiling,value);}
        });
      }
      charts.push({c,lines});
    }
    for(const {c,lines} of charts){
      plots.append(historyChart(c.name+' · manufacturing by industry',lines,years,'% of manufacturing value added',{compact:true,percentTicks:true,floor,ceiling,description:'Annual shares of manufacturing value added in '+c.name,emptyMessage:'No industry shares were published for this economy in the selected years.'}));
    }
    const sources=sourcePanel('The UN Industrial Development Organization’s International Yearbook of Industrial Statistics supplies these annual series through the World Bank. Other manufacturing includes unallocated activity and can include industries without a separate estimate. The charts retain published values below 0% or above 100% and show gaps where values are missing.',[
      ['All industry shares and source flags (compressed CSV)',sourcePath+'.csv.gz',true],['Methods, definitions and coverage',sourcePath+'-methods.json'],['Original source files (ZIP)',sourcePath+'-sources.zip',true],
      ...sectors.map(s=>[s.name+' · World Bank','https://data.worldbank.org/indicator/NV.MNF.'+s.code+'.ZS.UN'])
    ]);
    const suffix=start+'-'+end+'.csv';
    return [form,top,plots,
      dataTable('mix-annual','Annual shares for the selected economies',['Economy','Code','Year',...sectors.map(s=>s.name+' (%)')],annual,'manufacturing-industries-'+pair.map(c=>c.iso3).join('-')+'-'+suffix),
      dataTable('mix-endpoints',area+' · '+sector.name+' comparisons',['Economy','Code','Industry','Start year','End year','Start share (%)','End share (%)','Change (percentage points)'],endpoints,'manufacturing-'+sector.key+'-'+region+'-'+suffix),sources];
  }
  window.ManufacturingComposition={render,sectors,amount,dataTable,difference};
})();
