/* Original raised-region renderer embedded in the existing public map panels. */
(() => {
'use strict';
const global=typeof window==='undefined'?globalThis:window;
const finite=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
const DEFAULT_CAMERA=Object.freeze({elevation:58,azimuth:-90,height_scale:1,zoom:1});
function sceneInput(data){
 const series=data.series,groups=new Map();
 for(const original of data.records){if(!finite(original.year)||!Number.isInteger(Number(original.year)))continue;const key=JSON.stringify([String(original.geo_id),Number(original.year)]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(original);}
 const records=[],ambiguous=[];
 for(const[key,rows]of groups){if(rows.length!==1){ambiguous.push(JSON.parse(key));continue;}const row=rows[0];records.push({...row,scope:row.scope??series.scope,unit:row.unit??series.unit,year:Number(row.year),value:finite(row.value)?Number(row.value):null,eligible:row.eligible!==false&&finite(row.value)});}
 const years=[...new Set(records.map(row=>row.year))].sort((a,b)=>a-b);
 if(!years.length)throw Error('This source has no unambiguous annual observations for a raised map. Its original records remain available in the color map and table.');
 return{series,records,dataset:data.dataset||{id:series.dataset_id||series.id,title:series.label},years,ambiguous};
}
function windowForYears(years,year){
 const first=years[0],last=years.at(-1),selected=finite(year)?Math.max(first,Math.min(last,Number(year))):last;
 const start=first+Math.floor((selected-first)/80)*80;
 return{start,end:Math.min(last,start+79)};
}
function fullHistoryScale(input,geometry){
 const ids=new Set(geometry.features.map(f=>String(f.id))),values=input.records.filter(r=>ids.has(String(r.geo_id))&&r.eligible&&finite(r.value)).map(r=>Number(r.value));
 if(!values.length)throw Error('This history has no eligible numeric observations matching the retained boundaries.');
 let dataMin=Infinity,dataMax=-Infinity;for(const value of values){dataMin=Math.min(dataMin,value);dataMax=Math.max(dataMax,value);}
 const maxAbs=Math.max(Math.abs(dataMin),Math.abs(dataMax));
 let reference=input.series.display_reference??null;if(reference===null&&input.series.id==='bea::SARPP-1')reference=100;if(reference===null&&dataMin<0)reference=0;
 let low,high,colors,domain;
 if(reference!==null){if(!finite(reference))throw Error('The source color reference must be numeric.');reference=Number(reference);let distance=0;for(const value of values)distance=Math.max(distance,Math.abs(value-reference));distance=distance||1;low=reference-distance;high=reference+distance;colors=['#a86a47','#f5f3e8','#176957'];domain=[low,reference,high];}
 else{low=Math.min(0,dataMin);high=Math.max(0,dataMax);if(low===high)high=low+1;colors=['#e3eee7','#176957'];domain=[low,high];}
 return{min:low,max:high,max_abs:maxAbs,reference,height_max:13,data_min:dataMin,data_max:dataMax,color_domain:domain,color_range:colors,locked_years:[input.years[0],input.years.at(-1)]};
}
async function mount({host,data,loadJSON,isCurrent=()=>true,onSelectPlace,year,place}){
 if(!global.PublicDataMapScene||!global.PublicWorkbenchScene)throw Error('The original 3D drawing libraries could not load.');
 const input=sceneInput(data),geometry=await loadJSON('/workbench/data/map-geometry/'+input.series.scope+'.json');
 const extended=input.years.at(-1)-input.years[0]>79,lockedScale=extended?fullHistoryScale(input,geometry):null,scenes=new Map(),pending=new Map();let templatePromise=null;
 const openingCamera={...DEFAULT_CAMERA};
 let renderer=null,closed=false,currentYear=year,currentPlace=place,camera={...openingCamera},generation=0,windowStatus=null;
 async function missingWindow(range){
  const ids=new Set(geometry.features.map(f=>String(f.id)));
  if(!templatePromise){const anchor=input.records.find(r=>ids.has(String(r.geo_id))&&r.eligible&&finite(r.value));templatePromise=global.PublicWorkbenchScene.build({...input,geometry,payload:{series_id:input.series.id,start_year:anchor.year,end_year:anchor.year}});}
  const template=await templatePromise,rows=input.records.filter(r=>r.year>=range.start&&r.year<=range.end).map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['analysis','question','rationale','learningSession'].includes(key))));
  const byYear=new Map();for(const row of rows){if(!byYear.has(row.year))byYear.set(row.year,new Map());byYear.get(row.year).set(String(row.geo_id),row);}
  const years=Array.from({length:range.end-range.start+1},(_,i)=>range.start+i),recordHash=await global.PublicWorkbenchScene.sha256(global.PublicWorkbenchScene.canonical(rows));
  const frames=years.map(year=>({year,available:byYear.has(year),numeric_count:0,missing_count:geometry.features.length,values:Object.fromEntries(geometry.features.map(f=>{const r=byYear.get(year)?.get(String(f.id));return[f.id,r?{value:r.value??null,eligible:r.eligible,status:r.status,period:r.period??String(year),low:r.low??null,high:r.high??null}:{value:null,eligible:false,status:'No source observation for this calendar year',period:String(year),low:null,high:null}];}))}));
  return{...template,scene_id:'public-missing-'+recordHash.slice(0,24)+'-'+range.start+'-'+range.end,years,available_years:[...byYear.keys()].sort((a,b)=>a-b),frames,scale:{...lockedScale},provenance:{...template.provenance,source_records:JSON.parse(JSON.stringify(rows)),selected_record_sha256:recordHash,missing_years:years.filter(y=>!byYear.has(y)),table_only_records:rows.filter(r=>!ids.has(String(r.geo_id))).length,all_missing_window:true}};
 }
 async function sceneFor(selectedYear){
  const range=windowForYears(input.years,selectedYear),key=range.start+':'+range.end;
  if(scenes.has(key)){const cached=scenes.get(key);scenes.delete(key);scenes.set(key,cached);return cached;}
  if(!pending.has(key)){
   const request=global.PublicWorkbenchScene.build({...input,geometry,payload:{series_id:input.series.id,start_year:range.start,end_year:range.end}}).catch(error=>{if(extended&&/no eligible numeric observations matching native boundaries/.test(error.message))return missingWindow(range);throw error;}).then(scene=>{
    if(lockedScale)scene.scale={...lockedScale};
    scene.provenance.ambiguous_country_years=input.ambiguous;
    scene.provenance.display_note='Missing scope/unit fields inherit the selected measure definition for drawing only. Multiple source rows for one country/year are unavailable in the raised view; no aggregation is inferred. Original rows remain unchanged in the source table and downloads.';
    if(extended){scene.provenance.full_history_years=[input.years[0],input.years.at(-1)];scene.provenance.scene_window=[range.start,range.end];scene.provenance.scale_note='Color, height and camera-fit domains are fixed across the complete retained history. At most 80 calendar-year drawing frames are loaded at a time; source observations are not trimmed.';}
    scenes.set(key,scene);while(scenes.size>2)scenes.delete(scenes.keys().next().value);return scene;
   }).finally(()=>pending.delete(key));pending.set(key,request);
  }
  return pending.get(key);
 }
 const scene=await sceneFor(currentYear);
 if(!isCurrent()||!host.isConnected)return null;
 host.replaceChildren();const sceneHost=document.createElement('div');sceneHost.className='world-3d-scene';host.append(sceneHost);
 const controls=document.createElement('div');controls.className='world-3d-camera';const outputs=[];
 function syncCamera(){for(const item of outputs){item.input.value=String(camera[item.key]);item.output.textContent=item.key==='height_scale'?Number(camera[item.key]).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'×':Math.round(camera[item.key])+'°';}}
 let activeScene=scene;
 function draw(){if(!closed&&isCurrent())renderer.render({scene:activeScene,year:currentYear,focusId:currentPlace||null,...camera});}
 function paint(){
  if(closed||!isCurrent())return Promise.resolve();
  const ticket=++generation,range=windowForYears(input.years,currentYear),key=range.start+':'+range.end;
  if(scenes.has(key)){activeScene=scenes.get(key);scenes.delete(key);scenes.set(key,activeScene);if(windowStatus)windowStatus.textContent='';draw();return Promise.resolve();}
  if(windowStatus)windowStatus.textContent='Loading the retained 3D source-year view for '+currentYear+'…';
  return sceneFor(currentYear).then(next=>{if(closed||!isCurrent()||ticket!==generation)return;activeScene=next;if(windowStatus)windowStatus.textContent='';draw();}).catch(error=>{if(!closed&&isCurrent()&&ticket===generation&&windowStatus)windowStatus.textContent='The 3D source-year view could not load: '+error.message+' The color map and complete source rows remain available.';});
 }
 try{
  renderer=global.PublicDataMapScene.mount(sceneHost,{homeCamera:openingCamera,onSelectPlace:id=>{if(!closed&&isCurrent())onSelectPlace?.(id);},onCameraChange:next=>{camera={...camera,...next};syncCamera();}});
  for(const[label,key,min,max,step]of[['Tilt','elevation',15,80,1],['Rotate','azimuth',-180,180,1],['Height emphasis','height_scale',.2,2,.05]]){
   const wrap=document.createElement('label');wrap.append(document.createTextNode(label+' '));const output=document.createElement('output'),input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.setAttribute('aria-label',label+' of 3D map');wrap.append(output,input);outputs.push({key,input,output});input.addEventListener('input',()=>{camera[key]=Number(input.value);syncCamera();paint();});controls.append(wrap);
  }
  host.append(controls);const note=document.createElement('p');note.className='world-3d-note';note.textContent='Original 3D regions · drag to rotate, scroll to zoom. Height represents the source value, not terrain. Color and height scales stay fixed across the retained source years. '+(input.ambiguous.length?input.ambiguous.length+' country/year groups have multiple native rows and are shown unavailable; inspect their original table rows. ':'')+(extended?'The complete '+input.years[0]+'–'+input.years.at(-1)+' history is available; drawing frames load in bounded windows with one fixed scale. ':'')+(renderer.getRendererInfo?.().mode==='canvas'?'Software 3D rendering uses the same source values and camera.':'');host.append(note);windowStatus=document.createElement('p');windowStatus.className='world-3d-note';windowStatus.setAttribute('role','status');host.append(windowStatus);syncCamera();paint();
 }catch(error){renderer?.destroy();host.replaceChildren();throw error;}
 return{setFrame(nextYear,nextPlace){currentYear=nextYear;currentPlace=nextPlace;return paint();},zoomBy(factor){camera.zoom=Math.min(3,Math.max(.5,camera.zoom*factor));paint();},resetCamera(){camera={...openingCamera};syncCamera();paint();},getCamera(){return{...camera};},destroy(){if(closed)return;closed=true;generation++;renderer?.destroy();scenes.clear();host.replaceChildren();}};
}
const api={mount,sceneInput,windowForYears,fullHistoryScale,DEFAULT_CAMERA};if(typeof module!=='undefined'&&module.exports)module.exports=api;global.PublicWorldMap3D=api;
})();
