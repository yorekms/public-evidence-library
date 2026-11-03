/* Public country maps. Source rows and time semantics are retained; no observations are imputed. */
(() => {
'use strict';
const finite=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
const numeric=r=>finite(r?.value)&&r.eligible!==false;
const nativeYears=rows=>[...new Set(rows.map(r=>r.year).filter(finite).map(Number))].sort((a,b)=>a-b);
const rowsForYear=(rows,year)=>year===null?rows.filter(r=>!finite(r.year)):rows.filter(r=>finite(r.year)&&Number(r.year)===Number(year));
function frameRows(rows){const groups=new Map();for(const r of rows){const id=String(r.geo_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}const values=new Map(),ambiguous=[];for(const[id,items]of groups){if(items.length!==1){ambiguous.push(id);continue;}if(numeric(items[0]))values.set(id,Number(items[0].value));}return{values,groups,ambiguous};}
function valueDomain(rows){const v=rows.filter(numeric).map(r=>Number(r.value));if(!v.length)return null;let lo=0,hi=0;for(const n of v){lo=Math.min(lo,n);hi=Math.max(hi,n);}if(lo<0){const max=Math.max(Math.abs(lo),Math.abs(hi));return[-max,0,max];}return[0,hi];}
function orient(geo,d3){const reverse=coordinates=>{if(d3.geoArea({type:'Polygon',coordinates})>2*Math.PI)return coordinates.map(ring=>ring.slice().reverse());return coordinates;};return{...geo,features:geo.features.map(f=>({...f,geometry:f.geometry.type==='Polygon'?{...f.geometry,coordinates:reverse(f.geometry.coordinates)}:f.geometry.type==='MultiPolygon'?{...f.geometry,coordinates:f.geometry.coordinates.map(reverse)}:f.geometry}))};}
function timelineEligibility(series,rows){
 const years=nativeYears(rows),description=[series.reporting_period,series.reference_period,series.time_semantics,series.label].filter(Boolean).join(' ');
 if(!years.length)return{eligible:false,years,reason:'No annual source years are retained; this is a source-defined or pooled period.'};
 if(years.length===1)return{eligible:false,years,reason:'One source year is retained; a historical playback sequence is unavailable.'};
 if(/latest[ -]available|year[s]? varies|pooled|snapshot/i.test(description))return{eligible:false,years,reason:'These source years belong to a latest-available snapshot or pooled source, not a historical time sequence.'};
 if(!years.every(Number.isInteger))return{eligible:false,years,reason:'Native source periods are not an annual calendar-year sequence.'};
 const byPlace=new Map();for(const r of rows){if(!finite(r.year))continue;const id=String(r.geo_id);if(!byPlace.has(id))byPlace.set(id,new Set());byPlace.get(id).add(Number(r.year));}
 if(![...byPlace.values()].some(values=>values.size>1))return{eligible:false,years,reason:'Countries have separate source years, without a retained within-country history.'};
 return{eligible:true,years,reason:'Only actual retained reporting-year frames are offered; missing country values stay unavailable.'};
}
function yearAtIndex(years,index){if(!years.length||!finite(index))return null;return years[Math.max(0,Math.min(years.length-1,Math.round(Number(index))))];}
function uniqueHistoryRows(rows){
 const groups=new Map();for(const r of rows){const key=JSON.stringify([String(r.geo_id),finite(r.year)?Number(r.year):null]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 return [...groups.values()].filter(group=>group.length===1&&numeric(group[0])).map(group=>group[0]);
}
function historySegments(rows){
 const valid=uniqueHistoryRows(rows).filter(r=>finite(r.year)).sort((a,b)=>Number(a.year)-Number(b.year));
 const segments=[];let current=[];for(const row of valid){if(current.length&&Number(row.year)!==Number(current.at(-1).year)+1){segments.push(current);current=[];}current.push(row);}if(current.length)segments.push(current);return segments;
}
function createDisplayScale(rows){
 const sorted=uniqueHistoryRows(rows).map(r=>Number(r.value)).sort((a,b)=>a-b);
 const max=sorted.reduce((m,v)=>Math.max(m,Math.abs(v)),0)||1,negative=sorted.some(v=>v<0);
 const minPos=sorted.find(v=>v>0)||1,lo=Math.log10(Math.max(1e-6,minPos*0.5)),hi=Math.log10(Math.max(minPos*2,max));
 const c=max>100?10:1,lMax=Math.log1p(max/c)||1;
 const rank=v=>{if(!sorted.length)return 0;let a=0,b=sorted.length-1;while(a<b){const m=(a+b)>>1;if(sorted[m]<v)a=m+1;else b=m;}return sorted.length>1?a/(sorted.length-1):0.5;};
 function position(v,mode){
  if(!Number.isFinite(v))return null;
  if(mode==='quantile')return rank(v);
  if(negative){if(mode==='sqrt')return 0.5+0.5*Math.sign(v)*Math.sqrt(Math.min(1,Math.abs(v)/max));if(mode==='log')return 0.5+0.5*Math.sign(v)*Math.log1p(Math.abs(v)/c)/lMax;return Math.max(0,Math.min(1,(v+max)/(2*max)));}
  if(mode==='sqrt')return Math.sqrt(Math.max(0,Math.min(1,v/max)));
  if(mode==='log')return v<=0?0:Math.max(0,Math.min(1,(Math.log10(Math.max(1e-6,v))-lo)/(hi-lo)));
  return Math.max(0,Math.min(1,v/max));
 }
 function invert(t,mode){
  if(mode==='quantile')return sorted.length?sorted[Math.min(sorted.length-1,Math.max(0,Math.round(t*(sorted.length-1))))]:0;
  if(negative){const u=t*2-1;if(mode==='sqrt')return Math.sign(u)*u*u*max;if(mode==='log')return Math.sign(u)*c*Math.expm1(Math.abs(u)*lMax);return u*max;}
  if(mode==='sqrt')return t*t*max;if(mode==='log')return t<=0?0:Math.pow(10,lo+t*(hi-lo));return t*max;
 }
 return{position,invert,sorted,max,negative};
}
function exactPPPPairs(records,pppRecords,year,geoIds){
 if(!finite(year))return[];
 const x=frameRows(rowsForYear(records,Number(year))).values;
 const y=frameRows(rowsForYear(pppRecords.filter(r=>r.series_id==='wdi::NY.GDP.PCAP.PP.KD'),Number(year))).values;
 const ids=geoIds?new Set(geoIds):new Set(x.keys()),pairs=[];
 for(const id of ids)if(x.has(String(id))&&y.has(String(id)))pairs.push({id:String(id),w:x.get(String(id)),p:y.get(String(id))});
 return pairs;
}
const helpers={finite,numeric,nativeYears,rowsForYear,frameRows,valueDomain,orient,timelineEligibility,yearAtIndex,uniqueHistoryRows,historySegments,createDisplayScale,exactPPPPairs};
if(typeof module!=='undefined'&&module.exports)module.exports=helpers;
if(typeof document==='undefined')return;

const DEG=Math.PI/180,SQRT3_2=Math.sqrt(3)/2;
const EE_A1=1.340264,EE_A2=-0.081106,EE_A3=0.000893,EE_A4=0.003796;
const EE_MAX_X=2.72,EE_MAX_Y=1.34;
function projectEE(lon,lat){
 const lam=lon*DEG,phi=Math.max(-89.9,Math.min(89.9,lat))*DEG;
 const theta=Math.asin(Math.max(-1,Math.min(1,SQRT3_2*Math.sin(phi))));
 const t2=theta*theta,t6=t2*t2*t2,t8=t6*t2;
 const denom=3*(9*EE_A4*t8+7*EE_A3*t6+3*EE_A2*t2+EE_A1);
 const x=(2*Math.sqrt(3)*lam*Math.cos(theta))/denom;
 const y=-(EE_A4*t8*theta+EE_A3*t6*theta+EE_A2*t2*theta+EE_A1*theta);
 return[x,y];
}

const PALETTES={
 emerald_gold:['#fef9e7','#bfe3b4','#41ab8d','#166963','#0a363d'],
 ylgnbu:['#ffffd9','#c7e9b4','#41b6c4','#225ea8','#081d58'],
 viridis:['#440154','#3b528b','#21918c','#5ec962','#fde725'],
 site_mint:['#e0edd5','#155b42'],
 diverging:['#a85e36','#e8c59e','#f4f0df','#8ec4ab','#166963']
};
const BIV_COLORS=[
 ['#e8e8e8','#b5c0da','#6c83b5'],
 ['#b8d6be','#90b2b3','#567994'],
 ['#73ae80','#5a9178','#2a5a5b']
];
function hexToRgb(hex){const n=parseInt(hex.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
function sampleRamp(stops,t){
 const u=Math.max(0,Math.min(1,t));
 if(stops.length===1)return stops[0];
 const scaled=u*(stops.length-1),i=Math.min(stops.length-2,Math.floor(scaled)),f=scaled-i;
 const a=hexToRgb(stops[i]),b=hexToRgb(stops[i+1]);
 return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;
}

function globeProject3D(lonDeg,latDeg,lon0Deg,lat0Deg){
 const dLam=(lonDeg-lon0Deg)*DEG,phi=latDeg*DEG,phi0=lat0Deg*DEG;
 const cosPhi=Math.cos(phi),sinPhi=Math.sin(phi),cosPhi0=Math.cos(phi0),sinPhi0=Math.sin(phi0);
 const cosDLam=Math.cos(dLam),sinDLam=Math.sin(dLam);
 return[cosPhi*sinDLam,cosPhi0*sinPhi-sinPhi0*cosPhi*cosDLam,sinPhi0*sinPhi+cosPhi0*cosPhi*cosDLam];
}
function clipRingFrontHemisphere(pts3D){
 const out=[],n=pts3D.length;if(n<3)return out;
 for(let i=0;i<n;i++){
  const A=pts3D[i],B=pts3D[(i+1)%n],aIn=A[2]>=0,bIn=B[2]>=0;
  if(aIn&&bIn){out.push(B);}
  else if(aIn&&!bIn){
   const t=A[2]/(A[2]-B[2]||1e-9);
   let ix=A[0]+(B[0]-A[0])*t,iy=A[1]+(B[1]-A[1])*t;const len=Math.hypot(ix,iy)||1;
   out.push([ix/len,iy/len,0]);
  }else if(!aIn&&bIn){
   const t=A[2]/(A[2]-B[2]||1e-9);
   let ix=A[0]+(B[0]-A[0])*t,iy=A[1]+(B[1]-A[1])*t;const len=Math.hypot(ix,iy)||1;
   out.push([ix/len,iy/len,0]);out.push(B);
  }
 }
 return out;
}
function lonLatToVec3(lonDeg,latDeg){const lam=lonDeg*DEG,phi=latDeg*DEG,cp=Math.cos(phi);return[cp*Math.sin(lam),Math.sin(phi),cp*Math.cos(lam)];}
function rotateVec3ToView(v,lon0Deg,lat0Deg){
 const lam0=lon0Deg*DEG,phi0=lat0Deg*DEG,cosL=Math.cos(lam0),sinL=Math.sin(lam0),cosP=Math.cos(phi0),sinP=Math.sin(phi0);
 const x1=v[0]*cosL-v[2]*sinL,y1=v[1],z1=v[0]*sinL+v[2]*cosL;
 return[x1,cosP*y1-sinP*z1,sinP*y1+cosP*z1];
}
function pointInRings(x,y,rings){
 let inside=false;
 for(const ring of rings){
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
   if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi||1e-12)+xi))inside=!inside;
  }
 }
 return inside;
}

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const fmt=n=>finite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(Number(n)):'Unavailable';
const fmtInt=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const compact=n=>finite(n)?new Intl.NumberFormat('en-US',{notation:'compact',maximumSignificantDigits:3}).format(Number(n)):'—';
const safeSource=url=>{try{const u=new URL(url);return['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)?u.href:null;}catch{return null;}};
function control(parent,label,id,items,current){const wrap=el('label','',label),select=el('select');select.id=id;for(const[value,text]of items)select.append(new Option(text,String(value)));select.value=String(current);wrap.append(select);parent.append(wrap);return select;}
function csv(rows,name){const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))],cell=v=>'"'+String(v&&typeof v==='object'?JSON.stringify(v):v??'').replaceAll('"','""')+'"';const blob=new Blob([[cols.map(cell).join(','),...rows.map(r=>cols.map(k=>cell(r[k])).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

let activeController=null;
function stop(){const controller=activeController;activeController=null;controller?.stop();}

async function render({root,catalogue,index,loadEvidence,loadJSON,explainMeasure,historyHrefFor,params,navigate,isCurrent=()=>true,enableTimeline=false,enable3D=false,onFrameChange}){
 stop();let disposed=false,playing=false,timer=null,rafId=null,observer=null,headerObserver=null,resizeObserver=null,visibilityHandler=null,controller=null,threeD=null;
 const live=()=>!disposed&&root.isConnected&&isCurrent();
 const stopPlayback=()=>{playing=false;if(timer!==null){clearTimeout(timer);timer=null;}syncPlayback();};
 function dispose(){
  if(disposed)return;stopPlayback();if(rafId!==null){cancelAnimationFrame(rafId);rafId=null;}
  threeD?.destroy();threeD=null;disposed=true;
  if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);
  observer?.disconnect();headerObserver?.disconnect();resizeObserver?.disconnect();
  if(activeController===controller)activeController=null;
 }
 function route(next){dispose();navigate(next);}
 let syncPlayback=()=>{};
 root.replaceChildren();const status=el('p','world-status','Opening the public country map…');status.setAttribute('role','status');root.append(status);
 try{
  if(!window.d3)throw new Error('The bundled map drawing library could not be loaded.');const d3=window.d3;
  const requested=params.get('series');
  const requestedSeries=requested?catalogue.series.find(s=>s.id===requested):null;
  const activeScope=params.get('scope')||requestedSeries?.scope||'world';
  const all=catalogue.series.filter(s=>s.scope===activeScope&&(index[s.id]||index[s.id]===undefined));
  if(!all.length){const fallback=catalogue.series.filter(s=>s.scope===activeScope);if(fallback.length)all.push(...fallback);}
  if(!all.length){status.textContent='No measures available for '+activeScope+' in this public evidence edition.';return;}
  const meta=all.find(s=>s.id===requested)||(activeScope==='world'?all.find(s=>s.id==='food-history-qcl::15-5510-t'):null)||all[0];
  const geoUrl=activeScope==='world'?'/data/world-geometry.json':'/workbench/data/geography/'+activeScope+'.json';
  const currentGeometryPromise=loadJSON(geoUrl).then(g=>orient(g,d3));
  const[data,geometry]=await Promise.all([loadEvidence(meta.id),currentGeometryPromise]);if(!isCurrent())return;
  if(!data||!Array.isArray(data.records))throw new Error('This country measure has no published source observations.');
  const series={...meta,...data.series},records=data.records,years=nativeYears(records);
  let year=null;if(years.length)year=years.includes(Number(params.get('year')))?Number(params.get('year')):years.at(-1);
  let frame=rowsForYear(records,year),framed=frameRows(frame);
  const domain=valueDomain(records);
  const places=[...new Map(records.map(r=>[String(r.geo_id),{id:String(r.geo_id),name:r.geo_name||String(r.geo_id)}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  let place=params.get('place')||'';if(!places.some(p=>p.id===place))place='';
  const temporal=timelineEligibility(series,records),enhanced=Boolean(enableTimeline&&temporal.eligible);
  const selectParams=extra=>({scope:activeScope,series:meta.id,...(year===null?{}:{year}),...(place?{place}:{}),...extra});
  status.textContent=`${all.length.toLocaleString()} published measures (${activeScope}) · ${series.unit||'native source unit'} · ${year===null?'source-defined period':year}`;

  // Precompute projected geometry for 60fps Canvas & hit testing across all scopes
  let d3Proj=null;
  if(activeScope!=='world'){
   try{
    if(activeScope==='us_states'||activeScope==='us_counties')d3Proj=d3.geoAlbersUsa().fitExtent([[-2.55,-1.22],[2.55,1.22]],geometry);
    else if(activeScope==='virginia')d3Proj=d3.geoConicConformal().parallels([36+46/60,37+58/60]).rotate([79+30/60,0]).fitExtent([[-2.55,-1.22],[2.55,1.22]],geometry);
    else d3Proj=d3.geoMercator().fitExtent([[-2.55,-1.22],[2.55,1.22]],geometry);
   }catch{d3Proj=d3.geoMercator().fitExtent([[-2.55,-1.22],[2.55,1.22]],geometry);}
  }
  const projectPt=(lon,lat)=>{
   if(activeScope==='world')return projectEE(lon,lat);
   const p=d3Proj?d3Proj([lon,lat]):null;
   return p&&Number.isFinite(p[0])&&Number.isFinite(p[1])?p:[0,0];
  };

  const geoFeatures=[];
  const countryById=new Map();
  const featureIds=new Set();
  for(const f of geometry.features){
   const id=String(f.id??f.properties?.id??'');
   if(!id)continue;
   featureIds.add(id);
   const name=f.properties?.name||places.find(p=>p.id===id)?.name||id;
   const rawPolys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
   const eePolys=[];
   let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
   let bestRingArea=-1,bestCentroid=[0,0],bestLonLat=[0,0];
   for(const poly of rawPolys){
    const eeRings=[];
    for(const ring of poly){
     let sx=0,sy=0,slon=0,slat=0,cnt=0;
     const pts=[];
     for(const pt of ring){
      const p=projectPt(pt[0],pt[1]);
      if(p[0]<minX)minX=p[0];if(p[0]>maxX)maxX=p[0];
      if(p[1]<minY)minY=p[1];if(p[1]>maxY)maxY=p[1];
      pts.push(p);
      sx+=p[0];sy+=p[1];slon+=pt[0];slat+=pt[1];cnt++;
     }
     eeRings.push(pts);
     if(cnt>0){
      const bw=(maxX-minX)*(maxY-minY)+cnt*0.001;
      if(bw>bestRingArea){bestRingArea=bw;bestCentroid=[sx/cnt,sy/cnt];bestLonLat=[slon/cnt,slat/cnt];}
     }
    }
    eePolys.push(eeRings);
   }
   try{
    const cLonLat=d3.geoCentroid(f);
    if(cLonLat&&Number.isFinite(cLonLat[0])&&Number.isFinite(cLonLat[1])){
     bestLonLat=cLonLat;
     const cp=projectPt(cLonLat[0],cLonLat[1]);
     if(cp[0]!==0||cp[1]!==0)bestCentroid=cp;
    }
   }catch{}
   const item={id,n:name,c:bestLonLat,p:rawPolys,eePolys,eeBBox:[minX,minY,maxX,maxY],eeCenter:bestCentroid,rawFeature:f};
   geoFeatures.push(item);
   countryById.set(id,item);
  }

  // Index records by place and year
  const recordsByPlace=new Map();
  let globalMaxAbs=0,globalMinVal=0;
  for(const r of records){
   const id=String(r.geo_id);
   if(!recordsByPlace.has(id))recordsByPlace.set(id,[]);
   recordsByPlace.get(id).push(r);
   if(numeric(r)){
    const v=Number(r.value);
    if(Math.abs(v)>globalMaxAbs)globalMaxAbs=Math.abs(v);
    if(v<globalMinVal)globalMinVal=v;
   }
  }
  const hasNegative=uniqueHistoryRows(records).some(r=>Number(r.value)<0);

  // Build Workspace & Top Data Selector Dock
  const workspace=el('section','world-map-workspace');workspace.setAttribute('aria-label','Choose data and explore the map');root.append(workspace);
  const dock=el('div','world-selector-dock');dock.setAttribute('role','group');dock.setAttribute('aria-label','Map data selection');workspace.append(dock);
  const siteHeader=document.querySelector('.site-header');
  const fitDock=()=>{if(siteHeader)dock.style.setProperty('--world-header-offset',Math.ceil(siteHeader.getBoundingClientRect().height)+'px');};
  fitDock();if(siteHeader&&typeof ResizeObserver==='function'){headerObserver=new ResizeObserver(fitDock);headerObserver.observe(siteHeader);}
  const controls=el('div','world-controls');dock.append(controls);
  const scopeOptions=[['world','World economies'],['us_states','U.S. states'],['virginia','Virginia localities'],['us_counties','U.S. counties']];
  const scopeSelect=control(controls,'Geography scope','world-scope',scopeOptions,activeScope);
  scopeSelect.addEventListener('change',()=>{const nextScope=scopeSelect.value;const nextFirst=catalogue.series.find(s=>s.scope===nextScope);route({scope:nextScope,series:nextFirst?.id||''});});
  const datasets=[...new Set(all.map(s=>s.dataset_id))].map(id=>({id,title:catalogue.datasets.find(d=>d.id===id)?.title||id}));
  const collection=control(controls,'Source collection','world-collection',datasets.map(d=>[d.id,d.title]),meta.dataset_id);
  collection.addEventListener('change',()=>{const next=all.find(s=>s.dataset_id===collection.value);route(selectParams({series:next.id}));});
  const measure=control(controls,'Commodity / measure','world-series',all.filter(s=>s.dataset_id===meta.dataset_id).map(s=>[s.id,s.label]),meta.id);
  measure.addEventListener('change',()=>route(selectParams({series:measure.value})));

  const periods=el('div','world-period-controls');dock.append(periods);
  const readingDetails=el('details','world-reading-details');readingDetails.append(el('summary','','Measure definition, reporting periods and reading guide'));
  let previous=null,next=null,yearSelect=null,slider=null,yearLabel=null,play=null;
  if(years.length){
   previous=el('button','','←');next=el('button','','→');
   yearSelect=control(periods,'Source year','world-year',years.map(y=>[y,y]),year);
   previous.type=next.type='button';previous.id='world-previous';next.id='world-next';
   previous.setAttribute('aria-label','Previous source year');previous.title='Previous source year';
   next.setAttribute('aria-label','Next source year');next.title='Next source year';
   previous.addEventListener('click',()=>changeYear(years[years.indexOf(year)-1]));
   next.addEventListener('click',()=>changeYear(years[years.indexOf(year)+1]));
   yearSelect.addEventListener('change',()=>changeYear(Number(yearSelect.value)));
   const steps=el('div','world-year-steps');steps.append(previous,next);periods.append(steps);
  }else{
   periods.append(el('p','world-period-note','Source-defined period'));
   readingDetails.append(el('p','world-period-note','This source has a snapshot or pooled period. No annual timeline is constructed.'));
  }
  if(enableTimeline&&!enhanced&&years.length)readingDetails.append(el('p','world-timeline-note',temporal.reason));
  const country=control(periods,'Country / economy','world-place',[['','World overview'],...places.map(p=>[p.id,p.name])],place);
  country.addEventListener('change',()=>route(selectParams({place:country.value})));

  const periodsText=[...new Set(frame.map(r=>r.period).filter(Boolean))];
  const periodNote=el('p','world-period-note');periodNote.id='world-period-note';
  periodNote.textContent=periodsText.length===1?'Native reporting period: '+periodsText[0]:periodsText.length?'Native reporting periods vary across this frame; inspect the country summary and source table.':'No additional native period label is supplied. Inspect the source definitions before comparison.';
  readingDetails.append(periodNote);
  if(typeof explainMeasure==='function'){const explanation=explainMeasure(series);if(explanation)readingDetails.append(explanation);}

  const flowEntry=window.PublicCommodityFlowLinks?.entry?.(series,el);
  if(flowEntry)workspace.append(flowEntry);

  // =========================================================================
  // ZERO-COST HIGH-DENSITY CARTOGRAPHY STUDIO (Matches zero_cost_map_lab.html)
  // =========================================================================
  const labContainer=el('div','map-lab-studio');
  workspace.append(labContainer);

  // 1. Studio Header + Mode Tabs
  const labHeader=el('header','map-lab-header');
  const labHeaderLeft=el('div','map-lab-header-left');
  const badgeRow=el('div','map-lab-badge-row');
  badgeRow.append(
   el('span','map-lab-pill-badge','Map Studio · Retained Library Data'),
   el('span','map-lab-meta-note','Native source values · Missing ≠ 0 · Reporting gaps retained')
  );
  const selectedTitle=el('h2','world-measure-title map-lab-title',series.label);
  const modeSubtitle=el('p','map-lab-subtitle','Explore the selected measure with color maps, signed spikes, a rotating globe, exact-year PPP comparisons, and the original raised map.');
  labHeaderLeft.append(badgeRow,selectedTitle,modeSubtitle);

  const modeNav=el('nav','map-lab-tabs');
  modeNav.setAttribute('role','tablist');modeNav.setAttribute('aria-label','Visualization modes');
  const btnChoropleth=el('button','map-lab-mode-btn','1. Perceptual Choropleth');
  btnChoropleth.id='world-view-flat';btnChoropleth.type='button';btnChoropleth.dataset.mode='choropleth';btnChoropleth.setAttribute('role','tab');btnChoropleth.setAttribute('aria-selected','true');btnChoropleth.setAttribute('aria-pressed','true');
  const btnSpikes=el('button','map-lab-mode-btn','2. Equal-Area + 3D Spikes');
  btnSpikes.type='button';btnSpikes.dataset.mode='spikes';btnSpikes.setAttribute('role','tab');btnSpikes.setAttribute('aria-selected','false');
  const btnGlobe=el('button','map-lab-mode-btn','3. 3D Globe');
  btnGlobe.type='button';btnGlobe.dataset.mode='globe';btnGlobe.setAttribute('role','tab');btnGlobe.setAttribute('aria-selected','false');
  const btnBivariate=el('button','map-lab-mode-btn','4. Bivariate 3×3');
  btnBivariate.type='button';btnBivariate.dataset.mode='bivariate';btnBivariate.setAttribute('role','tab');btnBivariate.setAttribute('aria-selected','false');
  modeNav.append(btnChoropleth,btnSpikes,btnGlobe,btnBivariate);

  let btnRaised3D=null;
  if(enable3D){
   btnRaised3D=el('button','map-lab-mode-btn','5. 3D Extruded Polygons');
   btnRaised3D.id='world-view-3d';btnRaised3D.type='button';btnRaised3D.dataset.mode='raised3d';btnRaised3D.setAttribute('role','tab');btnRaised3D.setAttribute('aria-selected','false');btnRaised3D.setAttribute('aria-pressed','false');
   modeNav.append(btnRaised3D);
  }
  labHeader.append(labHeaderLeft,modeNav);
  labContainer.append(labHeader);

  // 2. Controls Toolbar (Scale, Palette, Flow Controls, Bivariate Controls, Timeline Scrubber)
  const controlsBar=el('section','map-lab-controls-bar');
  const scaleControls=el('div','map-lab-scale-group');
  const scaleBtnWrap=el('div','map-lab-pill-group');
  scaleBtnWrap.setAttribute('role','group');scaleBtnWrap.setAttribute('aria-label','Color and height scale');
  scaleBtnWrap.append(el('span','map-lab-control-label','Scale:'));

  const defaultScale=hasNegative?'sqrt':'log';
  const state={
   mode:'choropleth',
   scale:defaultScale,
   palette:hasNegative?'diverging':'emerald_gold',
   darkStage:true,
   selectedIso:place||(activeScope==='world'?'CHN':''),
   hoveredIso:null,
   hoveredFlowIdx:-1,
   bivFilter:null,
   zoom2d:1,
   panX:0,
   panY:0,
   globeLon:135,
   globeLat:22,
   globeZoom:1.05,
   autoSpin:false,
   flowMetric:'none',
   animTime:0
  };
  try{
   const urlMode=new URLSearchParams(window.location.hash.split('?')[1]||'').get('mode');
   if(['choropleth','spikes','globe','bivariate'].includes(urlMode))state.mode=urlMode;
   else if(new URLSearchParams(window.location.hash.split('?')[1]||'').get('spikes')==='1')state.mode='spikes';
  }catch{}

  const scaleDefs=[
   ['site_linear','Current Site (Linear)'],
   ['sqrt','√x Sqrt'],
   ['log',hasNegative?'Signed log':'Log₁₀'],
   ['quantile','Quantile Rank']
  ];
  const scaleButtons={};
  for(const[sKey,sText]of scaleDefs){
   const b=el('button','map-lab-pill-btn',sText);
   b.type='button';b.dataset.scale=sKey;b.setAttribute('aria-pressed',String(state.scale===sKey));
   scaleBtnWrap.append(b);
   scaleButtons[sKey]=b;
  }
  scaleControls.append(scaleBtnWrap);

  const paletteLabel=el('label','map-lab-inline-label','Palette:');
  const paletteSelect=el('select','map-lab-select');
  for(const[pVal,pText]of[
   ['emerald_gold','Spruce–Teal–Amber (High Contrast)'],
   ['ylgnbu','YlGnBu (Multi-Hue Cartographic)'],
   ['viridis','Viridis (Perceptual Uniform)'],
   ['site_mint','Current Site Pale Mint (#e0edd5 → #155b42)'],
   ['diverging','Diverging Warm–Cool']
  ]){paletteSelect.append(new Option(pText,pVal));}
  paletteSelect.value=state.palette;
  paletteLabel.append(paletteSelect);
  scaleControls.append(paletteLabel);

  const stageThemeBtn=el('button','map-lab-pill-btn','Dark Stage');
  stageThemeBtn.type='button';stageThemeBtn.setAttribute('aria-pressed','true');
  stageThemeBtn.title='Toggle between High-Contrast Dark Cartographic Stage and Light Editorial Stage';
  scaleControls.append(stageThemeBtn);
  controlsBar.append(scaleControls);

  // Globe controls use the selected measure; actual trade is a separate source view.
  const flowControls=el('div','map-lab-scale-group');flowControls.hidden=true;
  const spinBtn=el('button','map-lab-pill-btn','Auto-Orbit');spinBtn.type='button';spinBtn.setAttribute('aria-pressed','false');
  const tradeLink=el('a','map-lab-inline-label','Open source-attached commodity flows →');tradeLink.href='/workbench/pipelines.html?collection=trade_coal';
  flowControls.append(spinBtn,tradeLink);controlsBar.append(flowControls);

  let bivYear=year,pppPacket=null,pppError='',pppLoad=null;
  const bivControls=el('div','map-lab-scale-group');bivControls.hidden=true;
  const bivDesc=el('span','map-lab-biv-desc');
  const bivSource=el('a','map-lab-inline-label','World Bank PPP definition ↗');bivSource.href='https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.KD';bivSource.target='_blank';bivSource.rel='noopener noreferrer';
  const clearBivBtn=el('button','map-lab-pill-btn','Show All 9 Cells');clearBivBtn.type='button';clearBivBtn.hidden=true;
  bivControls.append(bivDesc,bivSource,clearBivBtn);controlsBar.append(bivControls);
  function ensurePPP(){
   if(pppLoad||pppPacket||pppError||activeScope!=='world')return;
   pppLoad=loadJSON('/data/economic-valuation.json').then(packet=>{
    if(packet?.schema!=='economic-valuation.price-data/v1'||Number(packet.base_year)!==2021||!Array.isArray(packet.macro_context?.records)||!Array.isArray(packet.macro_context?.series))throw Error('Unsupported retained PPP source packet.');
    pppPacket=packet;
   }).catch(error=>{pppError=error.message;}).finally(()=>{pppLoad=null;if(live())refreshStudio();});
  }

  // Timeline Scrubber on Right of Controls Bar
  if(enhanced){
   const tlWrap=el('div','map-lab-timeline-inline');
   play=el('button','map-lab-play-btn','▶ Play');
   play.id='world-play';play.type='button';play.setAttribute('aria-pressed','false');
   const yrLbl=el('label','map-lab-control-label','Year');yrLbl.htmlFor='world-year-slider';
   slider=el('input','map-lab-slider');slider.id='world-year-slider';slider.type='range';
   slider.min='0';slider.max=String(years.length-1);slider.step='1';slider.value=String(Math.max(0,years.indexOf(year)));
   slider.setAttribute('aria-label','Map source year');
   yearLabel=el('output','map-lab-year-output',String(year));yearLabel.id='world-year-label';yearLabel.htmlFor='world-year-slider';
   tlWrap.append(play,yrLbl,slider,yearLabel);
   controlsBar.append(tlWrap);

   slider.addEventListener('input',()=>changeYear(yearAtIndex(years,slider.value)));
   syncPlayback=()=>{
    if(!play)return;
    play.textContent=playing?'⏸ Pause':years.indexOf(year)===years.length-1?'▶ Replay':'▶ Play';
    play.setAttribute('aria-pressed',String(playing));
   };
   play.addEventListener('click',()=>{
    if(!live())return;
    if(playing){stopPlayback();return;}
    if(years.indexOf(year)===years.length-1)updateFrame(years[0]);
    playing=true;syncPlayback();timer=setTimeout(tickPlayback,380);
   });
   readingDetails.append(el('p','world-timeline-note',years.length+' retained source years. Drag the year slider or use its arrow keys. Playback advances one source frame at a time; missing values are never filled.'));
  }
  labContainer.append(controlsBar);

  // 3. Main 12-Column Grid: Map Stage (8 cols) + Live Side Inspector (4 cols)
  const mainGrid=el('div','map-lab-grid');
  labContainer.append(mainGrid);

  // Left 8 Cols: Map Stage Card
  const mapPanel=el('section','world-map-panel map-lab-stage-card');
  mapPanel.setAttribute('aria-label','Interactive country map');
  const stageTop=el('div','map-lab-stage-top');
  const stageTitles=el('div','map-lab-stage-titles');
  const stageTitle=el('h3','map-lab-stage-title',series.label);
  const stageStats=el('p','map-lab-stage-stats','Loading observations…');
  stageTitles.append(stageTitle,stageStats);

  const stageTools=el('div','map-lab-stage-tools');
  const navHint=el('span','map-lab-nav-hint','Scroll to zoom · Drag to pan');
  const zoomIn=el('button','map-lab-icon-btn','+');zoomIn.id='world-zoom-in';zoomIn.type='button';zoomIn.title='Zoom in';zoomIn.setAttribute('aria-label','Zoom in on the world map');
  const zoomOut=el('button','map-lab-icon-btn','−');zoomOut.id='world-zoom-out';zoomOut.type='button';zoomOut.title='Zoom out';zoomOut.setAttribute('aria-label','Zoom out on the world map');
  const overview=el('button','map-lab-tool-btn','Reset');overview.id='world-reset';overview.type='button';
  const expSvgBtn=el('button','map-lab-tool-btn','Export SVG');expSvgBtn.type='button';expSvgBtn.title='Download SVG containing a raster map image and vector legend; original raised maps use their own export control';
  const expPngBtn=el('button','map-lab-tool-btn','Export PNG');expPngBtn.type='button';expPngBtn.title='Download the displayed map image at 2400×1600; original raised maps use their own export control';
  stageTools.append(navHint,zoomIn,zoomOut,overview,expSvgBtn,expPngBtn);
  stageTop.append(stageTitles,stageTools);
  mapPanel.append(stageTop);

  // Canvas Container + Floating Hover Card + Bivariate 3x3 Overlay + 3D Host
  const canvasWrap=el('div','map-lab-canvas-wrap');
  const canvas=el('canvas','map-lab-canvas');
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label',`${series.label}; ${year===null?'native source period':year}; ${series.unit}. Diagonal hatching indicates no eligible mapped value.`);
  const ctx=canvas.getContext('2d');
  canvasWrap.append(canvas);

  // Hidden SVG for legacy selector compatibility
  const compatSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  compatSvg.setAttribute('id','world-map-svg');
  compatSvg.setAttribute('data-view-hidden','true');
  compatSvg.style.display='none';
  canvasWrap.append(compatSvg);

  // Original 3D Host (Mode 5)
  const host3D=el('div','world-3d-host');
  host3D.id='world-3d-host';host3D.hidden=true;
  host3D.setAttribute('aria-label','Original interactive 3D country map');
  canvasWrap.append(host3D);

  // Floating Instant Hover Tooltip
  const hoverCard=el('div','map-lab-hover-card');hoverCard.hidden=true;
  const hcHead=el('div','map-lab-hc-head');
  const hcName=el('strong','map-lab-hc-name','Country');
  const hcIso=el('span','map-lab-hc-iso','ISO');
  hcHead.append(hcName,hcIso);
  const hcVal=el('div','map-lab-hc-val','—');
  const hcSub=el('div','map-lab-hc-sub','—');
  const hcSparkWrap=el('div','map-lab-hc-spark-wrap');
  const hcSparkHead=el('div','map-lab-hc-spark-head');
  const hcSparkTitle=el('span','',years.length>1?`${years[0]}–${years.at(-1)} native history`:'Source status');
  const hcStatus=el('span','map-lab-hc-status','Official');
  hcSparkHead.append(hcSparkTitle,hcStatus);
  const hcSpark=document.createElementNS('http://www.w3.org/2000/svg','svg');
  hcSpark.setAttribute('viewBox','0 0 220 44');
  hcSpark.setAttribute('class','map-lab-hc-spark');
  hcSparkWrap.append(hcSparkHead,hcSpark);
  hoverCard.append(hcHead,hcVal,hcSub,hcSparkWrap);
  canvasWrap.append(hoverCard);

  // Mode 4 Bivariate 3x3 Legend Overlay
  const bivOverlay=el('div','map-lab-biv-overlay');bivOverlay.hidden=true;
  bivOverlay.append(el('div','map-lab-biv-title','Click cell to spotlight economies'));
  const bivBody=el('div','map-lab-biv-body');
  bivBody.append(el('div','map-lab-biv-ylabel','PPP GDP / person →'));
  const bivRight=el('div','');
  const bivGrid=el('div','map-lab-biv-grid');
  const bivXLabel=el('div','map-lab-biv-xlabel',(series.unit||'Measure')+' →');
  bivRight.append(bivGrid,bivXLabel);
  bivBody.append(bivRight);
  bivOverlay.append(bivBody);
  canvasWrap.append(bivOverlay);

  mapPanel.append(canvasWrap);

  // Bottom Legend + Live 32-Bin Distribution Histogram + Hover Needle
  const legendBar=el('div','map-lab-legend-bar');
  const legendTop=el('div','map-lab-legend-top');
  const legendLabel=el('span','map-lab-legend-title',`Distribution of Observed Places Along Scale (${series.unit||'native unit'}, fixed ${years.length>1?years[0]+'–'+years.at(-1):'source'} domain)`);
  const hatchNote=el('span','map-lab-hatch-note');
  const hatchSwatch=el('span','map-lab-hatch-swatch');
  hatchNote.append(hatchSwatch,document.createTextNode('Diagonal hatch = Missing / Ineligible (never 0)'));
  legendTop.append(legendLabel,hatchNote);
  const legendSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  legendSvg.setAttribute('viewBox','0 0 760 58');
  legendSvg.setAttribute('class','map-lab-legend-svg');
  legendBar.append(legendTop,legendSvg);
  mapPanel.append(legendBar);

  // Right 4 Cols: Live Side Inspector
  const sidebar=el('aside','map-lab-sidebar');

  // Card 1: Selected Jurisdiction Card (#world-selection)
  const summary=el('section','world-selection map-lab-card');
  summary.id='world-selection';summary.setAttribute('aria-live','polite');
  const selTop=el('div','map-lab-card-top');
  selTop.append(el('span','map-lab-eyebrow','Selected Jurisdiction'));
  const selBadge=el('span','map-lab-iso-badge','—');
  selTop.append(selBadge);
  const selName=el('h3','map-lab-sel-name','—');
  const selPrimary=el('p','world-selected-value map-lab-sel-val','—');
  const selRank=el('p','small map-lab-sel-rank','—');
  const selSparkBox=el('div','map-lab-sel-spark-box');
  const selSparkHead=el('div','map-lab-sel-spark-head');
  selSparkHead.append(el('span','',years.length>1?`Retained Source History (${years[0]}–${years.at(-1)})`:'Single-Period Observation'));
  const selGaps=el('span','map-lab-sel-gaps','No interpolation');
  selSparkHead.append(selGaps);
  const selSpark=document.createElementNS('http://www.w3.org/2000/svg','svg');
  selSpark.setAttribute('viewBox','0 0 340 88');
  selSpark.setAttribute('class','map-lab-sel-spark');
  selSparkBox.append(selSparkHead,selSpark);
  const selHistoryLink=el('a','button small map-lab-history-btn','Open this country’s source history →');
  summary.append(selTop,selName,selPrimary,selRank,selSparkBox,selHistoryLink);
  sidebar.append(summary);

  // Card 2: Dynamic Mode Insight & Ranked Top 12 List OR Geodesic Trade Flows
  const secondaryCard=el('section','map-lab-card map-lab-secondary-card');
  const insightPanel=el('div','map-lab-insight-panel');
  insightPanel.append(el('span','map-lab-eyebrow','Reading this view'));
  const insightTitle=el('h4','map-lab-insight-title','Perceptual Scale + Live Histogram Legend');
  const insightBody=el('p','map-lab-insight-body','');
  const topWrap=el('div','map-lab-top-wrap');
  topWrap.append(el('div','map-lab-top-heading','Top Observed Places in Frame (Click to Focus)'));
  const topList=el('div','map-lab-top-list');
  topWrap.append(topList);
  insightPanel.append(insightTitle,insightBody,topWrap);

  const flowsPanel=el('div','map-lab-flows-panel');flowsPanel.hidden=true;
  const flowsTop=el('div','map-lab-card-top');
  flowsTop.append(el('span','map-lab-eyebrow','Selected measure on the globe'));
  const flowsSub=el('p','map-lab-insight-body','Globe colors show the selected measure and source year. Actual reported trade pathways, their quantities, and source records are available in Commodity flows.');
  const flowList=el('a','map-lab-flow-list','Open Commodity flows →');flowList.href='/workbench/pipelines.html?collection=trade_coal';
  flowsPanel.append(flowsTop,flowsSub,flowList);
  secondaryCard.append(insightPanel,flowsPanel);
  sidebar.append(secondaryCard);

  mainGrid.append(mapPanel,sidebar);

  // Hatch Pattern Generator
  let cachedHatch=null,lastLight=null;
  function makeHatchPattern(isLight){
   const pCan=document.createElement('canvas');pCan.width=8;pCan.height=8;
   const pCtx=pCan.getContext('2d');
   pCtx.fillStyle=isLight?'#dfe3dc':'#262b28';
   pCtx.fillRect(0,0,8,8);
   pCtx.strokeStyle=isLight?'#adb5ab':'#434c47';
   pCtx.lineWidth=1.1;
   pCtx.beginPath();
   pCtx.moveTo(-2,2);pCtx.lineTo(2,-2);
   pCtx.moveTo(0,8);pCtx.lineTo(8,0);
   pCtx.moveTo(6,10);pCtx.lineTo(10,6);
   pCtx.stroke();
   hatchSwatch.style.backgroundImage=`url(${pCan.toDataURL()})`;
   return ctx.createPattern(pCan,'repeat');
  }

  // Frame Statistics & Scale Math
  let cachedFrameYear=undefined,cachedFrameObj=null;
  function getFrameStats(targetYear){
   if(cachedFrameYear===targetYear&&cachedFrameObj)return cachedFrameObj;
   const fRows=rowsForYear(records,targetYear),fFramed=frameRows(fRows);
   const values=fFramed.values;
   const statuses=new Map();
   const periodsMap=new Map();
   for(const[id,grp]of fFramed.groups){
    if(grp[0]?.status)statuses.set(id,grp[0].status);
    if(grp[0]?.period)periodsMap.set(id,grp[0].period);
   }
   const numericList=[];
   let worldSum=0;
   for(const[id,v]of values){
    if(Number.isFinite(v)){
     numericList.push({id,v});

    }
   }
   numericList.sort((a,b)=>b.v-a.v);
   const ranks=new Map();
   let rank=0,previousValue;numericList.forEach((d,idx)=>{if(idx===0||d.v!==previousValue)rank=idx+1;ranks.set(d.id,rank);previousValue=d.v;});
   const sortedAsc=numericList.map(d=>d.v).slice().sort((a,b)=>a-b);
   cachedFrameYear=targetYear;
   cachedFrameObj={values,statuses,periodsMap,numericList,sortedAsc,ranks,worldSum,groups:fFramed.groups,ambiguous:fFramed.ambiguous};
   return cachedFrameObj;
  }

  const displayScale=createDisplayScale(records);
  const normalizedScaleValue=(v,mode)=>displayScale.position(v,mode);
  const invertScaleTick=(t,mode)=>displayScale.invert(t,mode);

  // Bivariate 3x3 computation
  function computeBivariate(targetYear){
   const paired=activeScope==='world'&&pppPacket?exactPPPPairs(records,pppPacket.macro_context.records,targetYear,geoFeatures.map(f=>f.id)):[];
   const ws=paired.map(d=>d.w).sort((a,b)=>a-b);
   const ps=paired.map(d=>d.p).sort((a,b)=>a-b);
   const q=(arr,t)=>arr[Math.min(arr.length-1,Math.floor(t*arr.length))]||0;
   const wCuts=[q(ws,1/3),q(ws,2/3)];
   const pCuts=[q(ps,1/3),q(ps,2/3)];
   const bins=new Map();
   for(const d of paired){
    const xb=d.w<=wCuts[0]?0:d.w<=wCuts[1]?1:2;
    const yb=d.p<=pCuts[0]?0:d.p<=pCuts[1]?1:2;
    bins.set(d.id,{xb,yb,w:d.w,p:d.p});
   }
   return{bins,wCuts,pCuts,count:paired.length};
  }
  let bivData=computeBivariate(bivYear);

  // Build 3x3 Bivariate Interactive Grid
  for(let yb=2;yb>=0;yb--){
   for(let xb=0;xb<3;xb++){
    const cell=el('button','map-lab-biv-cell');
    cell.type='button';
    cell.style.backgroundColor=BIV_COLORS[yb][xb];
    cell.title=`${series.label} tier ${xb+1}/3 × PPP GDP tier ${yb+1}/3`;
    cell.addEventListener('click',()=>{
     if(state.bivFilter&&state.bivFilter[0]===xb&&state.bivFilter[1]===yb){
      state.bivFilter=null;clearBivBtn.hidden=true;
     }else{
      state.bivFilter=[xb,yb];clearBivBtn.hidden=false;
     }
     drawCanvas();
    });
    bivGrid.append(cell);
   }
  }

  // 2D Viewport Transform
  function get2DTransform(W,H){
   const pad=22;
   const baseScale=Math.min((W-pad*2)/(EE_MAX_X*2),(H-pad*2)/(EE_MAX_Y*2));
   const s=baseScale*state.zoom2d;
   const cx=W/2+state.panX;
   const cy=H/2+state.panY+(state.mode==='spikes'?24:0);
   const ySquash=state.mode==='spikes'?0.76:1.0;
   return{
    s,cx,cy,ySquash,
    toScreen:(ex,ey)=>[cx+ex*s,cy+ey*s*ySquash],
    toEE:(sx,sy)=>[(sx-cx)/s,(sy-cy)/(s*ySquash)]
   };
  }

  // Sparkline Renderer (Respects Gaps — Never Interpolates)
  function renderSparkline(svgEl,iso,activeYr,heightPx){
   svgEl.replaceChildren();
   const placeRows=uniqueHistoryRows(recordsByPlace.get(iso)||[]).filter(r=>finite(r.year)).sort((a,b)=>Number(a.year)-Number(b.year));
   const W=svgEl.viewBox.baseVal.width||240;
   const H=svgEl.viewBox.baseVal.height||heightPx;
   const padL=6,padR=6,padT=7,padB=15;
   const ns='http://www.w3.org/2000/svg';
   const valid=placeRows.filter(numeric);
   if(!valid.length||years.length<=1||!temporal.eligible){
    const txt=document.createElementNS(ns,'text');
    txt.setAttribute('x',String(W/2));txt.setAttribute('y',String(H/2));
    txt.setAttribute('text-anchor','middle');txt.setAttribute('fill','currentColor');
    txt.setAttribute('opacity','0.55');txt.setAttribute('font-size','11');
    txt.textContent=!temporal.eligible?'Source periods do not form an annual history':valid.length===1?`Single source year (${valid[0].year}): ${compact(valid[0].value)}`:'No retained multi-year history';
    svgEl.appendChild(txt);
    return{gaps:0};
   }
   let minV=Math.min(0,...valid.map(r=>Number(r.value)));
   let maxV=Math.max(...valid.map(r=>Number(r.value)),1e-6);
   if(maxV<=minV)maxV=minV+1;
   const yFirst=years[0],yLast=years.at(-1),ySpan=Math.max(1,yLast-yFirst);
   const xOf=yr=>padL+((Number(yr)-yFirst)/ySpan)*(W-padL-padR);
   const yOf=v=>(H-padB)-((Number(v)-minV)/(maxV-minV))*(H-padT-padB);

   const base=document.createElementNS(ns,'line');
   base.setAttribute('x1',String(padL));base.setAttribute('x2',String(W-padR));
   base.setAttribute('y1',String(H-padB));base.setAttribute('y2',String(H-padB));
   base.setAttribute('stroke','currentColor');base.setAttribute('stroke-opacity','0.2');
   svgEl.appendChild(base);

   const midYr=Math.round((yFirst+yLast)/2);
   for(const[yr,anchor]of[[yFirst,'start'],[midYr,'middle'],[yLast,'end']]){
    const lbl=document.createElementNS(ns,'text');
    lbl.setAttribute('x',String(xOf(yr)));lbl.setAttribute('y',String(H-2));
    lbl.setAttribute('text-anchor',anchor);lbl.setAttribute('font-size','10.5');
    lbl.setAttribute('fill','currentColor');lbl.setAttribute('opacity','0.65');
    lbl.textContent=String(yr);
    svgEl.appendChild(lbl);
   }

   const segments=[];let cur=[];
   for(const r of valid){
    if(cur.length&&Number(r.year)!==Number(cur[cur.length-1].year)+1){segments.push(cur);cur=[];}
    cur.push(r);
   }
   if(cur.length)segments.push(cur);

   for(const seg of segments){
    if(seg.length>1){
     const p=document.createElementNS(ns,'path');
     p.setAttribute('d',seg.map((r,i)=>`${i?'L':'M'}${xOf(r.year).toFixed(1)},${yOf(r.value).toFixed(1)}`).join(' '));
     p.setAttribute('fill','none');p.setAttribute('stroke','#1f9d82');p.setAttribute('stroke-width','2');
     svgEl.appendChild(p);
    }else{
     const c=document.createElementNS(ns,'circle');
     c.setAttribute('cx',String(xOf(seg[0].year)));c.setAttribute('cy',String(yOf(seg[0].value)));
     c.setAttribute('r','2.5');c.setAttribute('fill','#1f9d82');
     svgEl.appendChild(c);
    }
   }

   if(finite(activeYr)){
    const gx=xOf(activeYr);
    const vLine=document.createElementNS(ns,'line');
    vLine.setAttribute('x1',String(gx));vLine.setAttribute('x2',String(gx));
    vLine.setAttribute('y1',String(padT));vLine.setAttribute('y2',String(H-padB));
    vLine.setAttribute('stroke','#d97706');vLine.setAttribute('stroke-dasharray','2 2');
    svgEl.appendChild(vLine);
    const curRow=valid.find(r=>Number(r.year)===Number(activeYr));
    if(curRow){
     const dot=document.createElementNS(ns,'circle');
     dot.setAttribute('cx',String(gx));dot.setAttribute('cy',String(yOf(curRow.value)));
     dot.setAttribute('r','4');dot.setAttribute('fill','#d97706');
     dot.setAttribute('stroke','#ffffff');dot.setAttribute('stroke-width','1.2');
     svgEl.appendChild(dot);
    }
   }
   return{gaps:Math.max(0,segments.length-1)};
  }

  // Live 32-Bin Distribution Histogram + Color Ramp + Hover Needle
  function renderLegendHistogram(fStats){
   legendSvg.replaceChildren();
   if(state.mode==='bivariate'||state.mode==='raised3d'){
    legendBar.hidden=true;return;
   }
   legendBar.hidden=false;
   const W=760,padL=24,padR=24,barW=W-padL-padR;
   const stops=state.scale==='site_linear'?PALETTES.site_mint:(PALETTES[state.palette]||PALETTES.emerald_gold);
   const ns='http://www.w3.org/2000/svg';
   const defs=document.createElementNS(ns,'defs');
   const grad=document.createElementNS(ns,'linearGradient');
   grad.setAttribute('id','map-lab-ramp-grad');
   for(let i=0;i<=16;i++){
    const t=i/16,st=document.createElementNS(ns,'stop');
    st.setAttribute('offset',`${(t*100).toFixed(1)}%`);
    st.setAttribute('stop-color',sampleRamp(stops,t));
    grad.appendChild(st);
   }
   defs.appendChild(grad);legendSvg.appendChild(defs);

   const BINS=32,counts=new Array(BINS).fill(0);
   for(const d of fStats.numericList){
    const t=normalizedScaleValue(d.v,state.scale,fStats.sortedAsc);
    if(t!==null){
     const b=Math.min(BINS-1,Math.max(0,Math.floor(t*BINS)));
     counts[b]++;
    }
   }
   const maxBin=Math.max(1,...counts),binW=barW/BINS;
   for(let i=0;i<BINS;i++){
    if(!counts[i])continue;
    const bh=Math.max(2,(counts[i]/maxBin)*24);
    const r=document.createElementNS(ns,'rect');
    r.setAttribute('x',(padL+i*binW+0.8).toFixed(1));
    r.setAttribute('y',(27-bh).toFixed(1));
    r.setAttribute('width',Math.max(1,binW-1.6).toFixed(1));
    r.setAttribute('height',bh.toFixed(1));
    r.setAttribute('rx','1');
    r.setAttribute('fill',sampleRamp(stops,(i+0.5)/BINS));
    r.setAttribute('stroke','currentColor');r.setAttribute('stroke-opacity','0.25');r.setAttribute('stroke-width','0.6');
    legendSvg.appendChild(r);
   }

   const bar=document.createElementNS(ns,'rect');
   bar.setAttribute('x',String(padL));bar.setAttribute('y','29');
   bar.setAttribute('width',String(barW));bar.setAttribute('height','10');
   bar.setAttribute('rx','3');bar.setAttribute('fill','url(#map-lab-ramp-grad)');
   bar.setAttribute('stroke','currentColor');bar.setAttribute('stroke-opacity','0.25');
   legendSvg.appendChild(bar);

   const shortUnit=series.unit&&series.unit.length<=12?' '+series.unit:'';
   for(const t of[0,0.25,0.5,0.75,1]){
    const val=invertScaleTick(t,state.scale,fStats.sortedAsc);
    const tx=padL+t*barW;
    const txt=document.createElementNS(ns,'text');
    txt.setAttribute('x',String(tx));txt.setAttribute('y','54');
    txt.setAttribute('text-anchor',t===0?'start':t===1?'end':'middle');
    txt.setAttribute('font-size','11.5');txt.setAttribute('fill','currentColor');txt.setAttribute('opacity','0.8');
    txt.textContent=compact(val)+(t===1?shortUnit:'');
    legendSvg.appendChild(txt);
   }

   const focusIso=state.hoveredIso||state.selectedIso;
   if(focusIso&&fStats.values.has(focusIso)){
    const t=normalizedScaleValue(fStats.values.get(focusIso),state.scale,fStats.sortedAsc);
    if(t!==null){
     const nx=padL+t*barW;
     const marker=document.createElementNS(ns,'path');
     marker.setAttribute('d',`M${nx},28 L${nx-5},20 L${nx+5},20 Z`);
     marker.setAttribute('fill','#d97706');
     legendSvg.appendChild(marker);
     const line=document.createElementNS(ns,'line');
     line.setAttribute('x1',String(nx));line.setAttribute('x2',String(nx));
     line.setAttribute('y1','28');line.setAttribute('y2','41');
     line.setAttribute('stroke','#d97706');line.setAttribute('stroke-width','2.5');
     legendSvg.appendChild(line);
    }
   }
  }

  // Side Inspector Updates
  const MODE_INSIGHTS={
   choropleth:{title:'Color scale and frame distribution',body:'Colors transform the selected native values for display. The numerical domain stays fixed across the complete retained history; the histogram shows this frame. Quantile colors use ranks across the complete retained history.'},
   spikes:{title:'Signed spikes at map centroids',body:'Equal-width spikes show transformed magnitude without multiplying it by land area. Negative values extend below the map surface. Colors retain sign; zero remains a measured zero. Height is a display transform, not physical volume.'},
   globe:{title:'Selected measure on a rotating globe',body:'The globe uses the selected source measure and year. Open Commodity flows for separately sourced directional trade pathways.'},
   bivariate:{title:'Exact-year national PPP comparison',body:'Classifies the selected measure against World Bank GDP per person in constant 2021 international dollars for the same country and reporting year. This describes national output per person, not household income or a causal relationship. Missing, ineligible and duplicate country-year cells stay unpaired.'},
   raised3d:{title:'Original raised polygons',body:'Height and color show retained source values. Use the original map controls for rotation and its own export control. Polygon volume also depends on land area.'}
  };

  function updateSidePanels(fStats){
   const defaultIso=state.selectedIso&& (fStats.values.has(state.selectedIso)||countryById.has(state.selectedIso))
    ?state.selectedIso
    :(fStats.numericList[0]?.id||geoFeatures[0]?.id||'CHN');
   state.selectedIso=defaultIso;
   const c=countryById.get(defaultIso);
   const name=c?.n||places.find(p=>p.id===defaultIso)?.name||defaultIso;
   selBadge.textContent=defaultIso;
   selName.textContent=name;

   const activeYr=state.mode==='bivariate'?bivYear:year;
   if(state.mode==='bivariate'){
    const b=bivData.bins.get(defaultIso);
    selPrimary.textContent=b?`${fmt(b.w)} ${series.unit||''} · ${fmt(b.p)} international $ / person`:'Incomplete paired record';
    selRank.textContent=b?`Measure tertile ${b.xb+1}/3 · PPP GDP/person tertile ${b.yb+1}/3`:'Missing observations stay unmerged (diagonal hatch)';
   }else{
    const v=fStats.values.get(defaultIso);
    const st=fStats.statuses.get(defaultIso)||'No observation in this frame';
    if(v!==undefined){
     const rk=fStats.ranks.get(defaultIso);
     selPrimary.textContent=`${fmt(v)} ${series.unit||''}`;
     selRank.textContent=`Rank #${rk} of ${fStats.numericList.length} observed · ${st}`;
    }else{
     selPrimary.textContent='Unavailable in '+(activeYr??'period');
     selRank.textContent=st+' · Never filled as zero';
    }
   }

   const sp=renderSparkline(selSpark,defaultIso,activeYr,88);
   selGaps.textContent=sp.gaps>0?`${sp.gaps} reporting gap(s) kept unjoined`:'Contiguous series';
   selHistoryLink.href=typeof historyHrefFor==='function'?historyHrefFor({series:meta.id,place:defaultIso,year:activeYr}):'#explore?'+new URLSearchParams({series:meta.id,place:defaultIso});

   if(state.mode==='globe'){
    insightPanel.hidden=true;flowsPanel.hidden=false;
   }else{
    insightPanel.hidden=false;flowsPanel.hidden=true;
    const info=MODE_INSIGHTS[state.mode]||MODE_INSIGHTS.choropleth;
    insightTitle.textContent=info.title;
    insightBody.textContent=info.body;

    topList.replaceChildren();
    const topSlice=fStats.numericList.slice(0,12);
    const maxTop=Math.max(1e-6,Math.abs(topSlice[0]?.v||1));
    for(const item of topSlice){
     const row=el('button','map-lab-top-item');row.type='button';
     const cname=countryById.get(item.id)?.n||places.find(p=>p.id===item.id)?.name||item.id;
     const pct=Math.max(4,Math.round((Math.abs(item.v)/maxTop)*100));
     const leftSpan=el('span','map-lab-top-name',`${fStats.ranks.get(item.id)}. ${cname}`);
     const rightSpan=el('span','map-lab-top-val',`${compact(item.v)} ${series.unit&&series.unit.length<=8?series.unit:''}`);
     row.append(leftSpan,rightSpan);
     row.style.backgroundImage=`linear-gradient(to right, rgba(31,157,130,0.20) ${pct}%, transparent ${pct}%)`;
     if(item.id===state.selectedIso)row.classList.add('is-selected');
     row.addEventListener('click',()=>{
      state.selectedIso=item.id;
      place=item.id;
      if(country)country.value=places.some(p=>p.id===item.id)?item.id:'';
      const target=countryById.get(item.id);
      if(target){
       state.zoom2d=Math.max(2.2,state.zoom2d);
       const rect=canvasWrap.getBoundingClientRect();
       const baseS=Math.min((rect.width-44)/(EE_MAX_X*2),(rect.height-44)/(EE_MAX_Y*2))*state.zoom2d;
       const ySq=state.mode==='spikes'?0.76:1;
       state.panX=-target.eeCenter[0]*baseS;
       state.panY=-target.eeCenter[1]*baseS*ySq;
      }
      refreshStudio();
     });
     topList.append(row);
    }
   }
  }

  // Canvas Drawing Engine (Modes 1, 2, 3, 4)
  let drawnSpikes=[];
  function colorOfCountry(id,fStats,stops){
   if(state.mode==='bivariate'){
    const b=bivData.bins.get(id);
    if(!b)return null;
    if(state.bivFilter&&(b.xb!==state.bivFilter[0]||b.yb!==state.bivFilter[1])){
     return !state.darkStage?'rgba(200,206,202,0.35)':'rgba(60,68,65,0.35)';
    }
    return BIV_COLORS[b.yb][b.xb];
   }
   if(!fStats.values.has(id))return null;
   const t=normalizedScaleValue(fStats.values.get(id),state.scale,fStats.sortedAsc);
   return sampleRamp(stops,t??0);
  }

  function drawCanvas(){
   if(state.mode==='raised3d')return;
   const rect=canvasWrap.getBoundingClientRect();
   const W=Math.max(300,rect.width||900);
   const H=Math.max(300,rect.height||490);
   const dpr=Math.min(2,window.devicePixelRatio||1);
   if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){
    canvas.width=Math.round(W*dpr);
    canvas.height=Math.round(H*dpr);
   }
   ctx.setTransform(dpr,0,0,dpr,0,0);

   const light=!state.darkStage;
   if(light!==lastLight||!cachedHatch){
    cachedHatch=makeHatchPattern(light);
    lastLight=light;
   }

   const activeYr=state.mode==='bivariate'?bivYear:year;
   const fStats=getFrameStats(activeYr);
   const stops=state.scale==='site_linear'?PALETTES.site_mint:(PALETTES[state.palette]||PALETTES.emerald_gold);

   ctx.fillStyle=light?'#eef4f5':'#0f171e';
   ctx.fillRect(0,0,W,H);

   if(state.mode==='globe'){
    drawGlobeScene(W,H,light,fStats,stops);
   }else{
    draw2DScene(W,H,light,fStats,stops);
   }
  }

  function draw2DScene(W,H,light,fStats,stops){
   const T=get2DTransform(W,H);
   drawnSpikes=[];

   if(activeScope==='world'){
    ctx.beginPath();
    for(let lat=-90;lat<=90;lat+=5){
     const[ex,ey]=projectEE(-180,lat),[sx,sy]=T.toScreen(ex,ey);
     if(lat===-90)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
    }
    for(let lat=90;lat>=-90;lat-=5){
     const[ex,ey]=projectEE(180,lat),[sx,sy]=T.toScreen(ex,ey);
     ctx.lineTo(sx,sy);
    }
    ctx.closePath();
    ctx.fillStyle=light?'#f8fbfb':'#142029';
    ctx.fill();
    ctx.strokeStyle=light?'#cbd8dc':'#263845';
    ctx.lineWidth=1;
    ctx.stroke();

    ctx.strokeStyle=light?'rgba(130,155,160,0.18)':'rgba(140,175,190,0.10)';
    ctx.lineWidth=0.7;
    for(const lat of[-60,-30,0,30,60]){
     const[x0,y0]=T.toScreen(...projectEE(-180,lat));
     const[x1,y1]=T.toScreen(...projectEE(180,lat));
     ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
    }
   }

   for(const f of geoFeatures){
    const fill=colorOfCountry(f.id,fStats,stops);
    const isSel=f.id===state.selectedIso;
    const isHov=f.id===state.hoveredIso;

    ctx.beginPath();
    for(const poly of f.eePolys){
     for(const ring of poly){
      ring.forEach((pt,idx)=>{
       const[sx,sy]=T.toScreen(pt[0],pt[1]);
       if(idx===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
      });
      ctx.closePath();
     }
    }
    ctx.fillStyle=fill!==null?fill:cachedHatch;
    ctx.fill('evenodd');
    ctx.strokeStyle=isHov?'#f59e0b':isSel?'#d97706':(light?'#ffffff':'#1d2b36');
    ctx.lineWidth=isHov||isSel?2.0:(activeScope==='us_counties'?0.35:0.65);
    ctx.stroke();
   }

   if(state.mode==='spikes'){
    const spikeItems=geoFeatures
     .filter(f=>fStats.values.has(f.id)&&Math.abs(fStats.values.get(f.id))>0)
     .map(f=>{
      const v=fStats.values.get(f.id);
      const colorT=normalizedScaleValue(v,state.scale,fStats.sortedAsc)||0;
      const t=hasNegative?(state.scale==='quantile'?Math.sign(v)*Math.abs(v)/(displayScale.max||1):2*colorT-1):colorT;
      const[sx,sy]=T.toScreen(f.eeCenter[0],f.eeCenter[1]);
      return{f,v,t,sx,sy};
     })
     .sort((a,b)=>a.sy-b.sy);

    const maxH=Math.min(115,H*0.25);
    const baseW=activeScope==='us_counties'?2.0:3.6;
    for(const item of spikeItems){
     const h=Math.sign(item.v)*Math.max(2,Math.abs(item.t)*maxH);
     const w=Math.max(2.0,Math.min(6.8,baseW*Math.sqrt(state.zoom2d)));
     const x=item.sx,y=item.sy;
     const highlight=item.f.id===state.hoveredIso||item.f.id===state.selectedIso;
     drawnSpikes.push({id:item.f.id,x,y,w,h});

     ctx.beginPath();
     ctx.ellipse(x,y,w*1.15,w*0.45,0,0,Math.PI*2);
     ctx.fillStyle='rgba(0,0,0,0.24)';
     ctx.fill();

     ctx.beginPath();
     ctx.moveTo(x-w,y);ctx.lineTo(x,y-h);ctx.lineTo(x,y+w*0.35);
     ctx.closePath();
     ctx.fillStyle=highlight?'#f59e0b':item.v<0?'#c98150':'#1f9d82';
     ctx.fill();

     ctx.beginPath();
     ctx.moveTo(x+w,y);ctx.lineTo(x,y-h);ctx.lineTo(x,y+w*0.35);
     ctx.closePath();
     ctx.fillStyle=highlight?'#b45309':item.v<0?'#875237':'#0f5249';
     ctx.fill();

     ctx.beginPath();
     ctx.moveTo(x,y-h);ctx.lineTo(x,y+w*0.35);
     ctx.strokeStyle='rgba(255,255,255,0.58)';
     ctx.lineWidth=0.8;
     ctx.stroke();
    }
   }
  }

  function drawGlobeScene(W,H,light,fStats,stops){
   const cx=W/2,cy=H/2;
   const R=Math.min(W,H)*0.42*state.globeZoom;
   const lon0=state.globeLon,lat0=state.globeLat;

   const glow=ctx.createRadialGradient(cx,cy,R*0.88,cx,cy,R*1.09);
   glow.addColorStop(0,light?'rgba(56,189,248,0.12)':'rgba(45,212,191,0.18)');
   glow.addColorStop(1,'rgba(0,0,0,0)');
   ctx.fillStyle=glow;
   ctx.beginPath();ctx.arc(cx,cy,R*1.09,0,Math.PI*2);ctx.fill();

   const ocean=ctx.createRadialGradient(cx-R*0.28,cy-R*0.28,R*0.1,cx,cy,R);
   ocean.addColorStop(0,light?'#ffffff':'#1b2e3c');
   ocean.addColorStop(1,light?'#dbeafe':'#0b1620');
   ctx.fillStyle=ocean;
   ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();

   ctx.strokeStyle=light?'rgba(100,130,155,0.20)':'rgba(148,185,210,0.12)';
   ctx.lineWidth=0.7;
   for(let lat=-60;lat<=60;lat+=30){
    ctx.beginPath();let pen=false;
    for(let lon=-180;lon<=180;lon+=6){
     const[x,y,z]=globeProject3D(lon,lat,lon0,lat0);
     if(z>=0){if(!pen){ctx.moveTo(cx+x*R,cy-y*R);pen=true;}else ctx.lineTo(cx+x*R,cy-y*R);}
     else pen=false;
    }
    ctx.stroke();
   }
   for(let lon=-180;lon<180;lon+=30){
    ctx.beginPath();let pen=false;
    for(let lat=-85;lat<=85;lat+=5){
     const[x,y,z]=globeProject3D(lon,lat,lon0,lat0);
     if(z>=0){if(!pen){ctx.moveTo(cx+x*R,cy-y*R);pen=true;}else ctx.lineTo(cx+x*R,cy-y*R);}
     else pen=false;
    }
    ctx.stroke();
   }

   for(const f of geoFeatures){
    const fill=colorOfCountry(f.id,fStats,stops);
    const isSel=f.id===state.selectedIso;
    const isHov=f.id===state.hoveredIso;

    ctx.beginPath();let anyVisible=false;
    for(const poly of f.p){
     for(const ring of poly){
      const pts3D=ring.map(pt=>globeProject3D(pt[0],pt[1],lon0,lat0));
      if(pts3D.every(p=>p[2]<0))continue;
      const clipped=pts3D.every(p=>p[2]>=0)?pts3D:clipRingFrontHemisphere(pts3D);
      if(clipped.length<3)continue;
      anyVisible=true;
      clipped.forEach((p,i)=>{
       const sx=cx+p[0]*R,sy=cy-p[1]*R;
       if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
      });
      ctx.closePath();
     }
    }
    if(!anyVisible)continue;
    ctx.fillStyle=fill!==null?fill:cachedHatch;
    ctx.fill('evenodd');
    ctx.strokeStyle=isHov?'#f59e0b':isSel?'#d97706':(light?'#ffffff':'#1e303e');
    ctx.lineWidth=isHov||isSel?1.9:0.6;
    ctx.stroke();
   }

   ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);
   ctx.strokeStyle=light?'#94a3b8':'#334e62';
   ctx.lineWidth=1.3;ctx.stroke();

  }

  // Hit Testing (Polygons + 3D Spikes + 3D Globe)
  function hitTestCountry(clientX,clientY){
   const rect=canvas.getBoundingClientRect();
   const x=clientX-rect.left,y=clientY-rect.top;
   const W=rect.width,H=rect.height;

   if(state.mode==='globe'){
    const cx=W/2,cy=H/2,R=Math.min(W,H)*0.42*state.globeZoom;
    const dx=(x-cx)/R,dy=(cy-y)/R,r2=dx*dx+dy*dy;
    if(r2>1)return null;
    const dz=Math.sqrt(1-r2),phi0=state.globeLat*DEG;
    const sinPhi=Math.cos(phi0)*dy+Math.sin(phi0)*dz;
    const lat=Math.asin(Math.max(-1,Math.min(1,sinPhi)))/DEG;
    const lon=state.globeLon+Math.atan2(dx,-Math.sin(phi0)*dy+Math.cos(phi0)*dz)/DEG;
    const normLon=((lon+540)%360)-180;
    for(const f of geoFeatures){
     for(const poly of f.p){
      if(pointInRings(normLon,lat,poly))return f.id;
     }
    }
    return null;
   }

   if(state.mode==='spikes'&&drawnSpikes.length){
    for(let i=drawnSpikes.length-1;i>=0;i--){
     const sp=drawnSpikes[i];
     if(Math.abs(x-sp.x)<=sp.w+3&&y>=Math.min(sp.y,sp.y-sp.h)-3&&y<=Math.max(sp.y,sp.y-sp.h)+3)return sp.id;
    }
   }

   const T=get2DTransform(W,H);
   const[ex,ey]=T.toEE(x,y);
   for(const f of geoFeatures){
    const[minX,minY,maxX,maxY]=f.eeBBox;
    if(ex<minX||ex>maxX||ey<minY||ey>maxY)continue;
    for(const poly of f.eePolys){
     if(pointInRings(ex,ey,poly))return f.id;
    }
   }
   return null;
  }

  function updateHoverCard(clientX,clientY,iso){
   if(!iso){hoverCard.hidden=true;return;}
   const activeYr=state.mode==='bivariate'?bivYear:year;
   const fStats=getFrameStats(activeYr);
   const c=countryById.get(iso);
   hcName.textContent=c?.n||iso;
   hcIso.textContent=iso;

   if(state.mode==='bivariate'){
    const b=bivData.bins.get(iso);
    hcVal.textContent=b?`${fmt(b.w)} ${series.unit||''} · ${fmt(b.p)} international $ / person`:'Unpaired in '+bivYear;
    hcSub.textContent=b?`Measure tier ${b.xb+1}/3 · PPP GDP tier ${b.yb+1}/3`:'Missing source cell preserved';
    hcStatus.textContent=b?bivYear+' exact-year pair':'No exact-year pair';
   }else{
    const v=fStats.values.get(iso);
    const st=fStats.statuses.get(iso)||'Unavailable';
    hcVal.textContent=v!==undefined?`${fmt(v)} ${series.unit||''}`:'No eligible value';
    if(v!==undefined){
     const rk=fStats.ranks.get(iso);
     hcSub.textContent=`${activeYr??'Period'} · Rank #${rk}/${fStats.numericList.length}`;
    }else{
     hcSub.textContent=`${activeYr??'Period'} · Diagonal hatch ≠ 0`;
    }
    hcStatus.textContent=st.length>18?st.slice(0,17)+'…':st;
   }

   renderSparkline(hcSpark,iso,activeYr,44);
   hoverCard.hidden=false;

   const rect=canvasWrap.getBoundingClientRect();
   const lx=Math.min(rect.width-272,Math.max(8,clientX-rect.left+14));
   const ly=Math.min(rect.height-170,Math.max(8,clientY-rect.top+14));
   hoverCard.style.left=`${lx}px`;
   hoverCard.style.top=`${ly}px`;
  }

  // Pointer & Wheel Interactions on Canvas
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;
   drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};
   canvas.setPointerCapture?.(e.pointerId);
   hoverCard.hidden=true;
  });
  canvas.addEventListener('pointermove',e=>{
   if(drag){
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    drag.x=e.clientX;drag.y=e.clientY;
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;
    if(state.mode==='globe'){
     state.globeLon=((state.globeLon-dx*0.35+540)%360)-180;
     state.globeLat=Math.max(-75,Math.min(75,state.globeLat+dy*0.32));
    }else{
     state.panX+=dx;state.panY+=dy;
    }
    drawCanvas();
    return;
   }
   const iso=hitTestCountry(e.clientX,e.clientY);
   if(iso!==state.hoveredIso){
    state.hoveredIso=iso;
    drawCanvas();
    renderLegendHistogram(getFrameStats(state.mode==='bivariate'?bivYear:year));
   }
   updateHoverCard(e.clientX,e.clientY,iso);
  });
  canvas.addEventListener('pointerup',e=>{
   const wasDrag=drag;drag=null;
   canvas.releasePointerCapture?.(e.pointerId);
   if(wasDrag&&!wasDrag.moved){
    const iso=hitTestCountry(e.clientX,e.clientY);
    if(iso){
     state.selectedIso=iso;place=iso;
     if(country&&places.some(p=>p.id===iso))country.value=iso;
     refreshStudio();
    }
   }
  });
  canvas.addEventListener('pointerleave',()=>{
   if(!drag){
    state.hoveredIso=null;hoverCard.hidden=true;
    drawCanvas();
    renderLegendHistogram(getFrameStats(state.mode==='bivariate'?bivYear:year));
   }
  });
  canvas.addEventListener('wheel',e=>{
   e.preventDefault();
   const factor=Math.exp(-e.deltaY*0.0014);
   if(state.mode==='globe')state.globeZoom=Math.max(0.65,Math.min(3.5,state.globeZoom*factor));
   else state.zoom2d=Math.max(0.85,Math.min(14,state.zoom2d*factor));
   drawCanvas();
  },{passive:false});

  // Zoom / Reset / Export Buttons
  zoomIn.addEventListener('click',()=>{
   if(state.mode==='raised3d'&&threeD){threeD.zoomBy(1.7);return;}
   if(state.mode==='globe')state.globeZoom=Math.min(3.5,state.globeZoom*1.35);
   else state.zoom2d=Math.min(14,state.zoom2d*1.45);
   drawCanvas();
  });
  zoomOut.addEventListener('click',()=>{
   if(state.mode==='raised3d'&&threeD){threeD.zoomBy(1/1.7);return;}
   if(state.mode==='globe')state.globeZoom=Math.max(0.65,state.globeZoom/1.35);
   else state.zoom2d=Math.max(0.85,state.zoom2d/1.45);
   drawCanvas();
  });
  overview.addEventListener('click',()=>{
   if(state.mode==='raised3d'&&threeD){threeD.resetCamera();return;}
   state.zoom2d=1;state.panX=0;state.panY=0;
   state.globeLon=135;state.globeLat=22;state.globeZoom=1.05;
   drawCanvas();
  });

  // Initial Zoom if place param was passed
  if(place&&countryById.has(place)){
   const target=countryById.get(place);
   state.zoom2d=2.2;
   const W=900,H=490;
   const baseS=Math.min((W-44)/(EE_MAX_X*2),(H-44)/(EE_MAX_Y*2))*state.zoom2d;
   state.panX=-target.eeCenter[0]*baseS;
   state.panY=-target.eeCenter[1]*baseS;
  }

  // Export High-Res PNG & Publication SVG
  function exportFigure(format){
   drawCanvas();
   const activeYr=state.mode==='bivariate'?bivYear:(year||'period');
   const baseFilename=`publication-${meta.id.replace(/[^a-zA-Z0-9_-]/g,'_')}-${activeYr}-${state.mode}`;
   const sha=data.dataset?.sha256?` · Dataset SHA-256: ${data.dataset.sha256}`:'';
   const fStats=getFrameStats(state.mode==='bivariate'?bivYear:year);
   const pppCitation=state.mode==='bivariate'?' · PPP: World Bank NY.GDP.PCAP.PP.KD; same reporting year; constant 2021 international $':'';
   const mapDataUrl=canvas.toDataURL('image/png');

   if(format==='png'){
    const outCan=document.createElement('canvas');outCan.width=2400;outCan.height=1600;
    const oCtx=outCan.getContext('2d');
    oCtx.fillStyle=state.darkStage?'#0b1117':'#fbfcf8';
    oCtx.fillRect(0,0,2400,1600);
    oCtx.fillStyle=state.darkStage?'#f8fafc':'#153f31';
    oCtx.font='bold 38px system-ui, sans-serif';
    oCtx.fillText(`${series.label} (${activeYr})`,60,72);
    oCtx.fillStyle=state.darkStage?'#94a3b8':'#4f6959';
    oCtx.font='24px system-ui, sans-serif';
    oCtx.fillText(`Mode: ${state.mode.toUpperCase()} · Scale: ${state.scale.toUpperCase()} · Unit: ${series.unit||'native'} · ${fStats.numericList.length} observed places${pppCitation}`,60,114);
    const img=new Image();
    img.onload=()=>{
     const fit=Math.min(2280/img.width,1260/img.height),iw=img.width*fit,ih=img.height*fit;oCtx.drawImage(img,60+(2280-iw)/2,145+(1260-ih)/2,iw,ih);
     oCtx.fillStyle=state.darkStage?'#64748b':'#718779';
     oCtx.font='21px system-ui, sans-serif';
     oCtx.fillText(`Public Evidence Library · Source: ${series.source_url||'Official open source'}${sha} · Missing cells hatched, never imputed as zero.`,60,1545);
     outCan.toBlob(blob=>{
      const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=baseFilename+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
     },'image/png');
    };
    img.src=mapDataUrl;
    return;
   }

   const ns='http://www.w3.org/2000/svg';
   const outSvg=document.createElementNS(ns,'svg');
   outSvg.setAttribute('xmlns',ns);outSvg.setAttribute('viewBox','0 0 1200 800');
   outSvg.setAttribute('width','1200');outSvg.setAttribute('height','800');
   const bg=document.createElementNS(ns,'rect');
   bg.setAttribute('width','1200');bg.setAttribute('height','800');
   bg.setAttribute('fill',state.darkStage?'#0b1117':'#fbfcf8');
   outSvg.appendChild(bg);
   const t1=document.createElementNS(ns,'text');
   t1.setAttribute('x','40');t1.setAttribute('y','44');t1.setAttribute('font-family','system-ui,sans-serif');t1.setAttribute('font-size','20');t1.setAttribute('font-weight','700');
   t1.setAttribute('fill',state.darkStage?'#f8fafc':'#153f31');
   t1.textContent=`${series.label} (${activeYr})`;
   const t2=document.createElementNS(ns,'text');
   t2.setAttribute('x','40');t2.setAttribute('y','68');t2.setAttribute('font-family','system-ui,sans-serif');t2.setAttribute('font-size','13');
   t2.setAttribute('fill',state.darkStage?'#94a3b8':'#4f6959');
   t2.textContent=`Mode: ${state.mode} · Scale: ${state.scale} · Unit: ${series.unit||'native'} · ${fStats.numericList.length} observed places${pppCitation}`;
   const imgEl=document.createElementNS(ns,'image');
   imgEl.setAttribute('x','40');imgEl.setAttribute('y','85');imgEl.setAttribute('width','1120');imgEl.setAttribute('height','590');
   imgEl.setAttribute('preserveAspectRatio','xMidYMid meet');imgEl.setAttribute('href',mapDataUrl);
   const legClone=legendSvg.cloneNode(true);
   legClone.setAttribute('x','40');legClone.setAttribute('y','685');legClone.setAttribute('width','760');legClone.setAttribute('height','58');
   const foot=document.createElementNS(ns,'text');
   foot.setAttribute('x','40');foot.setAttribute('y','774');foot.setAttribute('font-family','system-ui,sans-serif');foot.setAttribute('font-size','11');
   foot.setAttribute('fill',state.darkStage?'#64748b':'#718779');
   foot.textContent=`Public Evidence Library · Publisher: ${series.source_url||'Official open source'}${sha} · Native reporting units preserved.`;
   outSvg.append(t1,t2,imgEl,legClone,foot);
   const metadata=document.createElementNS(ns,'metadata');metadata.textContent=JSON.stringify({series:meta.id,year:activeYr,unit:series.unit,source_url:series.source_url,dataset:data.dataset||null,display:{mode:state.mode,scale:state.scale,fixed_domain:displayScale.sorted.length?[displayScale.sorted[0],displayScale.sorted.at(-1)]:[],quantiles:'complete retained unambiguous history'},...(state.mode==='bivariate'?{ppp:{series:pppPacket.macro_context.series.find(s=>s.id==='wdi::NY.GDP.PCAP.PP.KD'),source_vintage:pppPacket.source_vintage,sources:pppPacket.sources,pairs:exactPPPPairs(records,pppPacket.macro_context.records,bivYear,geoFeatures.map(f=>f.id))}}:{})});outSvg.append(metadata);
   const svgString=new XMLSerializer().serializeToString(outSvg);
   const blob=new Blob([svgString],{type:'image/svg+xml;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=baseFilename+'.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  expSvgBtn.addEventListener('click',()=>exportFigure('svg'));
  expPngBtn.addEventListener('click',()=>exportFigure('png'));

  // Mode Switching & Control Wiring
  async function mountOriginal3DIfNeeded(){
   if(threeD||!enable3D)return;
   host3D.replaceChildren(el('p','world-3d-note','Opening the original interactive 3D regions…'));
   try{
    if(year===null)throw Error('This source uses a pooled or source-defined period, so an annual raised map is unavailable.');
    if(!window.PublicWorldMap3D?.mount)throw Error('The original 3D map component could not load.');
    threeD=await window.PublicWorldMap3D.mount({
     host:host3D,
     data:{series,records,dataset:data.dataset||catalogue.datasets.find(d=>d.id===meta.dataset_id)},
     loadJSON,isCurrent:live,year,place:state.selectedIso,
     onSelectPlace:id=>{if(places.some(p=>p.id===id))route(selectParams({place:id}));}
    });
    if(!live()){threeD?.destroy();return;}
    threeD?.setFrame(year,state.selectedIso);
   }catch(error){
    if(!live())return;
    threeD?.destroy();threeD=null;
    host3D.replaceChildren(el('p','world-3d-note','Original 3D unavailable for this source: '+error.message));
   }
  }

  function refreshStudio(){
   bivYear=year;
   if(state.mode==='bivariate')ensurePPP();
   bivData=computeBivariate(bivYear);
   bivDesc.textContent=`X = ${series.label} × Y = World Bank GDP/person (constant 2021 international $) · Same source year: ${bivYear??'unavailable'}`;
   expSvgBtn.disabled=expPngBtn.disabled=state.mode==='raised3d'||state.mode==='bivariate';
   if(state.mode==='raised3d')expSvgBtn.title=expPngBtn.title='Use the original raised map’s own PNG export control.';
   else if(state.mode==='bivariate')expSvgBtn.title=expPngBtn.title='Bivariate figure export is unavailable; inspect the exact-year paired values and native source downloads.';
   else{expSvgBtn.title='Download SVG containing a raster map image and vector legend.';expPngBtn.title='Download the current map image at 2400×1600 pixels.';}
   const activeYr=state.mode==='bivariate'?bivYear:year;
   const fStats=getFrameStats(activeYr);
   canvas.setAttribute('aria-label',`${series.label}; ${activeYr??'native source period'}; ${series.unit||'native source unit'}; ${state.mode}. Diagonal hatching indicates no eligible mapped value.`);

   for(const btn of modeNav.querySelectorAll('.map-lab-mode-btn')){
    const isAct=btn.dataset.mode===state.mode;
    btn.setAttribute('aria-selected',String(isAct));
    if(btn.id==='world-view-flat'||btn.id==='world-view-3d')btn.setAttribute('aria-pressed',String(isAct));
   }

   scaleControls.hidden=state.mode==='bivariate'||state.mode==='raised3d';
   flowControls.hidden=state.mode!=='globe';
   bivControls.hidden=state.mode!=='bivariate';
   bivOverlay.hidden=state.mode!=='bivariate';
   canvas.hidden=state.mode==='raised3d';
   host3D.hidden=state.mode!=='raised3d';

   const projName=activeScope==='world'?'Equal-Earth Projection':activeScope==='virginia'?'Virginia Lambert Conformal':'Albers Equal-Area Projection';
   if(state.mode==='choropleth'){
    stageTitle.textContent=`${series.label} · ${activeYr??'Source period'} · ${projName}`;
    stageStats.textContent=`${fStats.numericList.length} observed places · ${Math.max(0,geoFeatures.length-fStats.numericList.length)} missing/ineligible (hatched) · Scale: ${state.scale}`;
    navHint.textContent='Scroll to zoom · Drag to pan';
   }else if(state.mode==='spikes'){
    stageTitle.textContent=`Equal-Footprint 3D Centroid Spikes · ${series.label} · ${activeYr??'Source period'}`;
    stageStats.textContent=`Signed height = ${hasNegative&&state.scale==='quantile'?'linear magnitude; color = history quantile':state.scale+' transform'} · Equal-width spikes · ${fStats.numericList.length} observed places`;
    navHint.textContent='Scroll to zoom · Drag to pan';
   }else if(state.mode==='globe'){
    stageTitle.textContent=`3D Orthographic Globe · ${series.label} · ${activeYr??'source period'}`;
    stageStats.textContent='Native selected measure and source year · Drag globe to orbit';
    navHint.textContent='Drag to rotate 3D globe · Scroll to zoom';
   }else if(state.mode==='bivariate'){
    stageTitle.textContent=`Bivariate 3×3 Matrix · ${series.label} × National PPP GDP/Person (${bivYear})`;
    stageStats.textContent=activeScope!=='world'?'National PPP is available only for world economies; no subnational GDP is inferred.':pppError?'Retained PPP source unavailable: '+pppError:!pppPacket?'Opening the retained national PPP source…':`${bivData.count} economies with both exact ${bivYear??'source-year'} observations · Unmatched cells stay hatched`;
    navHint.textContent='Click 3×3 legend cells to filter';
   }else if(state.mode==='raised3d'){
    stageTitle.textContent=`3D Extruded Polygons · ${series.label} · ${activeYr??'Source period'}`;
    stageStats.textContent='Drag to rotate · Right-drag to pan · Scroll to zoom';
    navHint.textContent='Drag to rotate · Scroll to zoom';
    mountOriginal3DIfNeeded();
   }

   drawCanvas();
   renderLegendHistogram(fStats);
   updateSidePanels(fStats);
   if(state.mode==='globe'&&rafId===null)rafId=requestAnimationFrame(animLoop);
  }

  for(const btn of modeNav.querySelectorAll('.map-lab-mode-btn')){
   btn.addEventListener('click',()=>{
    state.mode=btn.dataset.mode;
    hoverCard.hidden=true;
    refreshStudio();
   });
  }

  for(const[sKey,b]of Object.entries(scaleButtons)){
   b.addEventListener('click',()=>{
    state.scale=sKey;
    for(const[k,btn]of Object.entries(scaleButtons))btn.setAttribute('aria-pressed',String(k===sKey));
    refreshStudio();
   });
  }

  paletteSelect.addEventListener('change',e=>{
   state.palette=e.target.value;
   if(state.scale==='site_linear'&&state.palette!=='site_mint'){
    state.scale=defaultScale;
    for(const[k,btn]of Object.entries(scaleButtons))btn.setAttribute('aria-pressed',String(k===state.scale));
   }
   refreshStudio();
  });

  stageThemeBtn.addEventListener('click',()=>{
   state.darkStage=!state.darkStage;
   stageThemeBtn.textContent=state.darkStage?'Dark Stage':'Light Stage';
   stageThemeBtn.setAttribute('aria-pressed',String(state.darkStage));
   refreshStudio();
  });

  spinBtn.addEventListener('click',()=>{
   state.autoSpin=!state.autoSpin;
   spinBtn.setAttribute('aria-pressed',String(state.autoSpin));
   if(state.autoSpin&&rafId===null)rafId=requestAnimationFrame(animLoop);
  });

  clearBivBtn.addEventListener('click',()=>{
   state.bivFilter=null;clearBivBtn.hidden=true;
   drawCanvas();
  });

  // Coverage, Source Links, Source Table & CSV Downloads below the Studio
  const coverage=el('p','world-coverage');coverage.id='world-coverage';
  root.append(readingDetails,coverage);
  if(data.hosted_scope_note)root.append(el('p','limitation',data.hosted_scope_note));
  if(series.definition||series.description)root.append(el('p','source-definition',series.definition||series.description));
  const sources=el('div','source-links');
  for(const[url,label]of[[series.source_url,'Original publisher ↗'],['/data/WORLD_MAP_SOURCES.md','Map geometry and drawing-library sources']]){
   const valid=url?.startsWith('/')?url:safeSource(url);
   if(valid){const a=el('a','',label);a.href=valid;if(!url.startsWith('/')){a.target='_blank';a.rel='noopener noreferrer';}sources.append(a);}
  }
  if(typeof series.source_archive==='string'&&/^\/data\/(?:historical-sources|early-energy-sources)\/[A-Za-z0-9_.-]+\.zip$/.test(series.source_archive)){
   const archive=el('a','','Download original source archive · ZIP');archive.href=series.source_archive;archive.download='';sources.append(archive);
  }
  root.append(sources);
  for(const limit of(Array.isArray(series.limitations)?series.limitations:[]).slice(0,4))root.append(el('p','small muted',limit));

  const details=el('details','source-table world-source-table'),tableSummary=el('summary','');details.append(tableSummary);
  const scroll=el('div','table-scroll'),table=el('table'),head=el('thead'),header=el('tr');
  for(const text of['Country / economy','Native year and period','Value / native unit','Status / original text'])header.append(el('th','',text));
  head.append(header);table.append(head);const body=el('tbody');table.append(body);scroll.append(table);details.append(scroll);
  const more=el('button','','Show more source rows');more.type='button';let limit=100;
  const drawRows=()=>{
   body.replaceChildren();
   for(const r of frame.slice(0,limit)){
    const tr=el('tr'),countryCell=el('td','',r.geo_name||r.geo_id),periodCell=el('td','',finite(r.year)?r.year:'Source-defined period'),valueCell=el('td','',numeric(r)?fmt(r.value):'Unavailable / ineligible'),statusCell=el('td','',r.status||'Not supplied');
    countryCell.append(el('small','',String(r.geo_id)+(featureIds.has(String(r.geo_id))?'':' · no retained polygon')));
    periodCell.append(el('small','',r.period||''));
    valueCell.append(el('small','',r.unit||series.unit));
    statusCell.append(el('small','',r.raw_value??''));
    tr.append(countryCell,periodCell,valueCell,statusCell);body.append(tr);
   }
   more.hidden=limit>=frame.length;
  };
  more.addEventListener('click',()=>{limit+=200;drawRows();});details.append(more);drawRows();root.append(details);

  const downloads=el('div','download-row'),download=el('button','','Download all source rows in this frame · CSV');
  download.type='button';download.addEventListener('click',()=>csv(frame,'world-map-'+(year??'source-period')+'.csv'));downloads.append(download);
  if(years.length>1){
   const fullHistory=el('button','','Download this measure’s complete history · CSV');
   fullHistory.type='button';fullHistory.addEventListener('click',()=>csv(records,'historical-measure-'+meta.id.replace(/[^A-Za-z0-9_-]/g,'-')+'.csv'));
   downloads.append(fullHistory);
  }
  root.append(downloads);

  function updateFrame(nextYear,notify=true){
   if(disposed||!isCurrent()||!years.includes(Number(nextYear)))return;
   year=Number(nextYear);frame=rowsForYear(records,year);framed=frameRows(frame);
   status.textContent=`${all.length.toLocaleString()} published measures (${activeScope}) · ${series.unit||'native source unit'} · ${year}`;
   if(yearSelect)yearSelect.value=String(year);
   if(previous)previous.disabled=years.indexOf(year)===0;
   if(next)next.disabled=years.indexOf(year)===years.length-1;
   if(slider){slider.value=String(years.indexOf(year));slider.setAttribute('aria-valuetext',String(year));}
   if(yearLabel){yearLabel.value=String(year);yearLabel.textContent=String(year);}
   syncPlayback();
   const reporting=[...new Set(frame.map(r=>r.period).filter(Boolean))];
   periodNote.textContent=reporting.length===1?'Native reporting period: '+reporting[0]:reporting.length?'Native reporting periods vary across this frame; inspect the country summary and source table.':'No additional native period label is supplied. Inspect the source definitions before comparison.';
   if(enableTimeline)selectedTitle.textContent=series.label+' · '+year;
   threeD?.setFrame(year,state.selectedIso);
   refreshStudio();
   const eligibleCount=frame.filter(numeric).length,unmapped=[...framed.groups.keys()].filter(id=>!featureIds.has(id));
   coverage.textContent=`${frame.length.toLocaleString()} retained source rows in this frame; ${eligibleCount.toLocaleString()} eligible numeric rows. ${unmapped.length.toLocaleString()} reporting economies have no matching map polygon. ${framed.ambiguous.length?framed.ambiguous.length+' economies have multiple native rows and are not combined. ':''}All retained rows remain in the table and download.`;
   tableSummary.textContent=`Inspect all source observations in this frame · ${frame.length.toLocaleString()} rows`;
   limit=100;drawRows();
   if(notify&&typeof onFrameChange==='function')onFrameChange({series:meta.id,year:String(year),place:state.selectedIso});
  }

  function changeYear(nextYear){
   if(!live()||!years.includes(Number(nextYear)))return;
   stopPlayback();
   if(years.length>1)updateFrame(Number(nextYear));
   else route(selectParams({year:Number(nextYear)}));
  }

  function tickPlayback(){
   timer=null;if(!live()){dispose();return;}
   if(document.hidden){stopPlayback();return;}
   const position=years.indexOf(year);
   if(position>=years.length-1){stopPlayback();return;}
   updateFrame(years[position+1]);
   if(!live()){dispose();return;}
   if(years.indexOf(year)===years.length-1){stopPlayback();return;}
   timer=setTimeout(tickPlayback,380);
  }

  function animLoop(now){
   if(disposed||!live()||state.mode!=='globe'||!state.autoSpin){rafId=null;return;}
   state.animTime=now;
   if(!drag)state.globeLon=((state.globeLon+0.22+540)%360)-180;
   drawCanvas();
   rafId=requestAnimationFrame(animLoop);
  }

  state.animTime=1800;
  if(years.length)updateFrame(year,false);
  else{
   refreshStudio();
   const eligibleCount=frame.filter(numeric).length,unmapped=[...framed.groups.keys()].filter(id=>!featureIds.has(id));
   coverage.textContent=`${frame.length.toLocaleString()} retained source rows in this frame; ${eligibleCount.toLocaleString()} eligible numeric rows. ${unmapped.length.toLocaleString()} reporting economies have no matching map polygon. ${framed.ambiguous.length?framed.ambiguous.length+' economies have multiple native rows and are not combined. ':''}All retained rows remain in the table and download.`;
   tableSummary.textContent=`Inspect all source observations in this frame · ${frame.length.toLocaleString()} rows`;
   drawRows();
  }

  try{
   const hParam=new URLSearchParams(window.location.hash.split('?')[1]||'').get('hover');
   if(hParam&&countryById.has(hParam)){
    state.hoveredIso=hParam;
    drawCanvas();
    renderLegendHistogram(getFrameStats(state.mode==='bivariate'?bivYear:year));
    const rect=canvasWrap.getBoundingClientRect();
    const T=get2DTransform(rect.width||820,rect.height||490);
    const target=countryById.get(hParam);
    const[sx,sy]=T.toScreen(target.eeCenter[0],target.eeCenter[1]);
    updateHoverCard(rect.left+sx,rect.top+sy,hParam);
   }
   if(new URLSearchParams(window.location.hash.split('?')[1]||'').get('scroll')==='studio'){
    setTimeout(()=>labContainer.scrollIntoView({block:'start'}),50);
   }
  }catch{}

  if(typeof ResizeObserver==='function'){
   resizeObserver=new ResizeObserver(()=>{if(live())drawCanvas();});
   resizeObserver.observe(canvasWrap);
  }

  controller={stop:dispose};activeController=controller;
  visibilityHandler=()=>{if(document.hidden)stopPlayback();};
  document.addEventListener('visibilitychange',visibilityHandler);
  if(typeof MutationObserver==='function'){
   observer=new MutationObserver(()=>{if(!live())dispose();});
   observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  return{series:meta.id,year:year===null?'':String(year),place};
 }catch(error){
  dispose();
  if(isCurrent()){
   root.replaceChildren();
   const message=el('p','error-message','The country map could not open: '+error.message);
   message.setAttribute('role','alert');
   root.append(message,el('p','','The complete catalogue, original source links and local research workbench remain available.'));
  }
 }
}
window.PublicWorldMaps={render,stop};
})();
