/* Original raised-region renderer embedded in the existing public map panels. */
(() => {
'use strict';
const global=typeof window==='undefined'?globalThis:window;
const finite=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
function sceneInput(data){
 const series=data.series,groups=new Map();
 for(const original of data.records){if(!finite(original.year)||!Number.isInteger(Number(original.year)))continue;const key=JSON.stringify([String(original.geo_id),Number(original.year)]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(original);}
 const records=[],ambiguous=[];
 for(const[key,rows]of groups){if(rows.length!==1){ambiguous.push(JSON.parse(key));continue;}const row=rows[0];records.push({...row,scope:row.scope??series.scope,unit:row.unit??series.unit,year:Number(row.year),value:finite(row.value)?Number(row.value):null,eligible:row.eligible!==false&&finite(row.value)});}
 const years=[...new Set(records.map(row=>row.year))].sort((a,b)=>a-b);
 if(!years.length)throw Error('This source has no unambiguous annual observations for a raised map. Its original records remain available in the color map and table.');
 if(years.at(-1)-years[0]>79)throw Error('This source exceeds the original 80-calendar-year 3D window. Its complete history remains in the color map and original explorer.');
 return{series,records,dataset:data.dataset||{id:series.dataset_id||series.id,title:series.label},years,ambiguous};
}
async function mount({host,data,loadJSON,isCurrent=()=>true,onSelectPlace,year,place}){
 if(!global.PublicDataMapScene||!global.PublicWorkbenchScene)throw Error('The original 3D drawing libraries could not load.');
 const input=sceneInput(data),geometry=await loadJSON('/workbench/data/map-geometry/'+input.series.scope+'.json');
 const scene=await global.PublicWorkbenchScene.build({...input,geometry,payload:{series_id:input.series.id,start_year:input.years[0],end_year:input.years.at(-1)}});
 if(!isCurrent()||!host.isConnected)return null;
 scene.provenance.ambiguous_country_years=input.ambiguous;
 scene.provenance.display_note='Missing scope/unit fields inherit the selected measure definition for drawing only. Multiple source rows for one country/year are unavailable in the raised view; no aggregation is inferred. Original rows remain unchanged in the source table and downloads.';
 let renderer=null,closed=false,currentYear=year,currentPlace=place,camera={elevation:45,azimuth:-60,height_scale:1,zoom:1};
 host.replaceChildren();const sceneHost=document.createElement('div');sceneHost.className='world-3d-scene';host.append(sceneHost);
 const controls=document.createElement('div');controls.className='world-3d-camera';const outputs=[];
 function syncCamera(){for(const item of outputs){item.input.value=String(camera[item.key]);item.output.textContent=item.key==='height_scale'?Number(camera[item.key]).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'×':Math.round(camera[item.key])+'°';}}
 function paint(){if(!closed&&isCurrent())renderer.render({scene,year:currentYear,focusId:currentPlace||null,...camera});}
 try{
  renderer=global.PublicDataMapScene.mount(sceneHost,{onSelectPlace:id=>{if(!closed&&isCurrent())onSelectPlace?.(id);},onCameraChange:next=>{camera={...camera,...next};syncCamera();}});
  for(const[label,key,min,max,step]of[['Tilt','elevation',15,80,1],['Rotate','azimuth',-180,180,1],['Height emphasis','height_scale',.2,2,.05]]){
   const wrap=document.createElement('label');wrap.append(document.createTextNode(label+' '));const output=document.createElement('output'),input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.setAttribute('aria-label',label+' of 3D map');wrap.append(output,input);outputs.push({key,input,output});input.addEventListener('input',()=>{camera[key]=Number(input.value);syncCamera();paint();});controls.append(wrap);
  }
  host.append(controls);const note=document.createElement('p');note.className='world-3d-note';note.textContent='Original 3D regions · drag to rotate, scroll to zoom. Height represents the source value, not terrain. Color and height scales stay fixed across the retained source years. '+(input.ambiguous.length?input.ambiguous.length+' country/year groups have multiple native rows and are shown unavailable; inspect their original table rows. ':'')+(renderer.getRendererInfo?.().mode==='canvas'?'Software 3D rendering uses the same source values and camera.':'');host.append(note);syncCamera();paint();
 }catch(error){renderer?.destroy();host.replaceChildren();throw error;}
 return{setFrame(nextYear,nextPlace){currentYear=nextYear;currentPlace=nextPlace;paint();},zoomBy(factor){camera.zoom=Math.min(3,Math.max(.5,camera.zoom*factor));paint();},resetCamera(){camera={elevation:45,azimuth:-60,height_scale:1,zoom:1};syncCamera();paint();},getCamera(){return{...camera};},destroy(){if(closed)return;closed=true;renderer?.destroy();host.replaceChildren();}};
}
const api={mount,sceneInput};if(typeof module!=='undefined'&&module.exports)module.exports=api;global.PublicWorldMap3D=api;
})();
