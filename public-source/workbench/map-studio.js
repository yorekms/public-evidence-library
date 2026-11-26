/* Source-year playback and explicit local media exports. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const fmt=v=>finite(v)?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(v)):'Not reported';
const cleanURL=v=>{try{const u=new URL(v,location.href);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const fileURL=v=>{const u=new URL(v,location.href);if(u.origin!==location.origin||!u.pathname.startsWith('/exports/'))throw Error('Unexpected export file location.');return u.href;};
function mount({request,onYearChange,notify}){
 let renderer=null,scene=null,metadata=null,pendingKey='',revision=0,timer=null,year=null,focusId='VA',job=null,pollTimer=null;
 let preferred=null,availableFormats=['gif'],camera={elevation:58,azimuth:-90,height_scale:1,zoom:1};
 const busy=()=>job&&['queued','running'].includes(job.status);
 const status=text=>{$('map3d-status').textContent=text;};
 function pause(){if(timer)clearInterval(timer);timer=null;$('map3d-play').textContent='Play years';$('map3d-play').setAttribute('aria-pressed','false');}
 function clearScene(){scene=null;year=null;pause();$('map3d-host').hidden=true;$('map3d-host').removeAttribute('aria-busy');document.querySelector('.studio-legend').hidden=true;$('map3d-source-link').hidden=true;$('map3d-year').textContent='—';$('map3d-place-name').textContent='No map available';$('map3d-place-value').textContent='—';for(const id of ['map3d-place-unit','map3d-place-period','map3d-place-interval','map3d-place-change','map3d-frame-note','map3d-definition','map3d-geography-note','map3d-range-note','map3d-renderer-note'])$(id).textContent='';updateButtons();}
 function frame(){return scene?.frames.find(f=>f.year===year);}
 function updateDetail(){
  const f=frame(),row=f?.values?.[focusId],feature=scene?.features.find(p=>p.id===focusId);
  $('map3d-place-name').textContent=feature?.name||focusId||'Choose a place';
  $('map3d-place-value').textContent=row?.eligible!==false&&finite(row?.value)?fmt(row.value):'Not reported';
  $('map3d-place-unit').textContent=metadata?.unit||'';
  $('map3d-place-period').textContent=String(row?.period||year||'')+(row?.status?' · '+row.status:'');
  $('map3d-place-interval').textContent=finite(row?.low)&&finite(row?.high)?(metadata?.interval_type||'Published source interval')+': '+fmt(row.low)+'–'+fmt(row.high):'';
  const records=scene?.frames||[],history=records.map(f=>({year:f.year,row:f.values?.[focusId]}));
  const observed=history.filter(p=>p.row?.eligible!==false&&finite(p.row?.value));
  const first=observed[0],last=observed.at(-1);
  $('map3d-place-change').textContent=first&&last&&first.year!==last.year?'Observed change, '+first.year+'–'+last.year+': '+fmt(Number(last.row.value)-Number(first.row.value))+' '+(metadata?.unit||'')+'. This is a descriptive change, not a policy effect.':'Select a multi-year source to inspect a change through time.';
 }
 function paint(){
  if(!scene||!renderer)return;
  renderer.render({scene,year,...camera,focusId});
  const f=frame();$('map3d-year').textContent=String(year);
  $('map3d-year-slider').value=String(scene.years.indexOf(year));
  $('map3d-year-slider').setAttribute('aria-valuetext','Source year '+year);
  $('map3d-year-select').value=String(year);
  $('map3d-frame-note').textContent=f?.available===false?'No source observations for this calendar year. Nothing is filled from neighboring years.':String(f?.numeric_count??Object.values(f?.values||{}).filter(r=>r.eligible!==false&&finite(r.value)).length)+' eligible source observations · '+String(f?.missing_count??0)+' missing/ineligible native places';
  updateDetail();onYearChange?.(year);
 }
 function setYear(value){if(!scene||!scene.years.includes(Number(value)))return;year=Number(value);paint();}
 function updateButtons(){
  const single=!scene||scene.years.length<2;
  $('map3d-year-select').disabled=!scene;$('map3d-year-slider').disabled=single;for(const id of ['map3d-start','map3d-end','map3d-place'])$(id).disabled=!scene;
  $('map3d-play').disabled=single;$('map3d-previous').disabled=single;$('map3d-next').disabled=single;
  $('map3d-export-animation').disabled=single||!!busy();$('map3d-cancel-export').hidden=!busy();
  $('map3d-export-still').disabled=!scene||!!busy();
 }
 function legend(){
  const scale=scene.scale,domain=scale.color_domain,colors=scale.color_range,lo=domain[0],hi=domain.at(-1);
  $('map3d-scale-ramp').style.background='linear-gradient(to right, '+colors.map((c,i)=>c+' '+(100*(domain[i]-lo)/(hi-lo))+'%').join(', ')+')';
  $('map3d-scale-min').textContent=fmt(lo);$('map3d-scale-max').textContent=fmt(hi);
  $('map3d-scale-unit').textContent=metadata.unit;
  $('map3d-scale-note').textContent='Height starts at zero. Height and color scales stay fixed for '+scene.years[0]+'–'+scene.years.at(-1)+'. Gray means missing or ineligible, never zero.';
 }
 function fillControls(){
  const years=scene.years;
  $('map3d-year-slider').min='0';$('map3d-year-slider').max=String(years.length-1);$('map3d-year-slider').disabled=years.length<2;
  $('map3d-year-select').replaceChildren(...years.map(v=>new Option(String(v),String(v))));
  const all=metadata.years.map(Number).sort((a,b)=>a-b);
  $('map3d-start').replaceChildren(...all.map(v=>new Option(String(v),String(v))));
  $('map3d-end').replaceChildren(...all.map(v=>new Option(String(v),String(v))));
  $('map3d-start').value=String(years[0]);$('map3d-end').value=String(years.at(-1));
  $('map3d-place').replaceChildren(...scene.features.map(f=>new Option(f.name,f.id)));
  if(!scene.features.some(f=>f.id===focusId))focusId=scene.features.some(f=>f.id==='USA')?'USA':scene.features[0]?.id||null;
  if(focusId)$('map3d-place').value=focusId;
  $('map3d-range-note').textContent=years.length===1?'One source year. You can export a still; an animation needs more than one year.':years.length+' calendar frames · observed years shown as steps · no interpolation';
  $('map3d-source-label').textContent=metadata.label;
  const source=$('map3d-source-link'),url=cleanURL(metadata.source_url);
  source.hidden=!url;if(url){source.href=url;source.textContent='Original source';}
  $('map3d-definition').textContent=metadata.definition||'Review the source definitions before interpreting a geographic pattern.';
  $('map3d-geography-note').textContent=(scene.provenance?.projection||'Native source geography. Display geometry does not reallocate observations.')+' Region height is data, not terrain; geographic area and extrusion volume are not additional measures.';
  legend();updateButtons();
 }
 async function show(value,force=false){
  const ticket=++revision;
  metadata=value;$('map3d-source-label').textContent=value.label;
  if(!window.PublicDataMapScene){clearScene();status('The local 3D renderer could not be loaded. Other views and the source table remain available.');return;}
  if(!renderer)renderer=window.PublicDataMapScene.mount($('map3d-host'),{
   onCameraChange:next=>{camera={...camera,...next};syncCameraControls();},
   onSelectPlace:id=>{focusId=id;$('map3d-place').value=id;updateDetail();}
  });
  const years=(value.years||[]).map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
  if(!years.length){clearScene();status('This source has no explicit annual year. A pooled period is not converted into annual frames.');return;}
  const range=preferred?.series_id===value.id?preferred:null;
  const start=range?.start_year??Math.max(years[0],years.at(-1)-79),end=range?.end_year??years.at(-1),key=[value.id,start,end].join('|');
  if(!force&&scene?.scene_id&&pendingKey===key){paint();return;}
  clearScene();pendingKey=key;status('Preparing native boundaries and a fixed scale for the selected years…');
  $('map3d-host').setAttribute('aria-busy','true');$('map3d-host').hidden=true;
  try{
   const next=await request('/api/map-scene',{series_id:value.id,start_year:Number(start),end_year:Number(end)});
   if(ticket!==revision)return;
   scene=next;$('map3d-host').hidden=false;document.querySelector('.studio-legend').hidden=false;
   if(range?.camera){camera={...camera,...range.camera};syncCameraControls();}
   if(range?.focus_id)focusId=range.focus_id;
   year=scene.years.includes(Number(range?.year))?Number(range.year):scene.years[0];
   fillControls();paint();
   const info=renderer.getRendererInfo?.();
   $('map3d-renderer-note').textContent=info?.message||'Drag to orbit · scroll to zoom · use the camera controls for a precise view.';
   status('Ready. '+scene.years.length+' source-year frame'+(scene.years.length===1?'':'s')+'; scales are fixed across this range.');
  }catch(error){if(ticket!==revision)return;clearScene();status(error.message);notify?.(error.message,true);}
  finally{if(ticket===revision)$('map3d-host').removeAttribute('aria-busy');}
 }
 function syncCameraControls(){
  for(const [id,key]of [['map3d-elevation','elevation'],['map3d-azimuth','azimuth'],['map3d-height','height_scale']])if(finite(camera[key]))$(id).value=String(camera[key]);
  $('map3d-elevation-value').textContent=Math.round(camera.elevation)+'°';
  $('map3d-azimuth-value').textContent=Math.round(camera.azimuth)+'°';
  $('map3d-height-value').textContent=fmt(camera.height_scale)+'×';
 }
 function settings(){return {...camera,focus_id:focusId,fps:Number($('map3d-fps').value)};}
 function exportLinks(result,title,format){
  const host=$('map3d-export-result');host.replaceChildren();
  const strong=document.createElement('strong');strong.textContent='Last completed export: '+title;host.append(strong);
  const paragraph=document.createElement('p');paragraph.textContent='Save the media and its separate source/settings record together. Exported views use the same source geometry, scale and camera parameters; framing, lighting and text layout differ from the interactive viewer.';host.append(paragraph);
  for(const [label,url]of [[format.toUpperCase()+' file',result.url],['Source and settings · JSON',result.provenance_url]]){
   if(!url)continue;const a=document.createElement('a');a.href=fileURL(url);a.download='';a.textContent=label;
   if(url===result.provenance_url)a.addEventListener('click',async event=>{event.preventDefault();try{const data=await request(fileURL(url)),blob=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=blob;link.download=url.split('/').at(-1);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(blob),1000);}catch(error){notify?.(error.message,true);}});
   host.append(a);
  }
  if(format==='mp4'){const video=document.createElement('video');video.controls=true;video.preload='metadata';video.src=fileURL(result.url);video.setAttribute('aria-label','Exported source-year map animation');host.append(video);}
  host.hidden=false;
 }
 async function still(){
  if(!scene)return;pause();$('map3d-export-still').disabled=true;status('Rendering the selected source year locally…');
  const format=$('map3d-still-format').value,title=$('map3d-export-title').value.trim()||metadata.label;
  try{if(window.PublicWorkbenchAPI){await window.PublicWorkbenchAPI.exportMapStill({canvas:renderer.canvas,scene,year,format,title,settings:settings()});$('map3d-export-result').textContent='PNG canvas and separate source/settings JSON downloaded. Browser canvas pixels do not include the surrounding HTML labels; the JSON records the source, year, scale and camera.';$('map3d-export-result').hidden=false;status('Browser PNG canvas and source/settings record downloaded.');return;}const result=await request('/api/export-map3d',{scene_id:scene.scene_id,year,format,title,settings:settings()});exportLinks(result,title+' · '+year,format);status('Still figure exported. Its source/settings record is available beside it.');}
  catch(error){status(error.message);notify?.(error.message,true);}finally{updateButtons();}
 }
 async function poll(){
  if(!job)return;
  try{
   const next=await request('/api/export-jobs/'+encodeURIComponent(job.job_id));job={...job,...next};
   const p=job.progress||{},done=p.completed_frames||0,total=p.total_frames||1;
   $('map3d-export-progress').max=total;$('map3d-export-progress').value=done;
   $('map3d-export-status').textContent=job.status==='running'?'Rendering '+job.series_label+': '+done+' / '+total+' frames · '+(p.stage||'drawing'):job.status;
   updateButtons();
   if(job.status==='succeeded'){exportLinks(job.result,job.series_label+' · '+job.range,job.format);$('map3d-export-status').textContent='Animation ready. Source scales and camera stayed fixed across the source-year frames.';}
   else if(job.status==='failed'||job.status==='cancelled')$('map3d-export-status').textContent=job.error||'Animation cancelled.';
   else pollTimer=setTimeout(poll,700);
  }catch(error){$('map3d-export-status').textContent=error.message;pollTimer=setTimeout(poll,2000);}
 }
 async function animate(){
  if(!scene||scene.years.length<2||busy())return;pause();
  const format=$('map3d-animation-format').value,title=$('map3d-export-title').value.trim()||metadata.label;
  try{
   const started=await request('/api/export-animation',{scene_id:scene.scene_id,format,title,settings:settings()});
   job={...started,range:scene.years[0]+'–'+scene.years.at(-1)};$('map3d-export-progress').hidden=false;updateButtons();poll();
  }catch(error){$('map3d-export-status').textContent=error.message;notify?.(error.message,true);}
 }
 $('map3d-play').addEventListener('click',()=>{
  if(timer){pause();return;}if(!scene||scene.years.length<2)return;
  if(year===scene.years.at(-1))setYear(scene.years[0]);
  $('map3d-play').textContent='Pause';$('map3d-play').setAttribute('aria-pressed','true');
  timer=setInterval(()=>{const i=scene.years.indexOf(year);if(i>=scene.years.length-1){pause();return;}setYear(scene.years[i+1]);},1000/Number($('map3d-fps').value));
 });
 $('map3d-year-slider').addEventListener('input',event=>{pause();setYear(scene?.years[Number(event.target.value)]);});
 $('map3d-year-select').addEventListener('change',event=>{pause();setYear(Number(event.target.value));});
 for(const [id,step]of [['map3d-previous',-1],['map3d-next',1]])$(id).addEventListener('click',()=>{pause();if(scene)setYear(scene.years[Math.max(0,Math.min(scene.years.length-1,scene.years.indexOf(year)+step))]);});
 for(const id of ['map3d-start','map3d-end'])$(id).addEventListener('change',()=>{
  if(!metadata)return;pause();let start=Number($('map3d-start').value),end=Number($('map3d-end').value);
  if(start>end){if(id==='map3d-start')end=start;else start=end;}
  preferred={series_id:metadata.id,start_year:start,end_year:end,year,focus_id:focusId,camera};show(metadata,true);
 });
 $('map3d-place').addEventListener('change',event=>{focusId=event.target.value;paint();});
 for(const [id,key]of [['map3d-elevation','elevation'],['map3d-azimuth','azimuth'],['map3d-height','height_scale']])$(id).addEventListener('input',event=>{camera[key]=Number(event.target.value);syncCameraControls();paint();});
 $('map3d-reset-camera').addEventListener('click',()=>{camera={elevation:58,azimuth:-90,height_scale:1,zoom:1};syncCameraControls();paint();});
 $('map3d-fps').addEventListener('change',pause);
 $('map3d-export-still').addEventListener('click',still);$('map3d-export-animation').addEventListener('click',animate);
 $('map3d-cancel-export').addEventListener('click',async()=>{if(!busy())return;try{await request('/api/export-jobs/'+job.job_id+'/cancel',{});$('map3d-export-status').textContent='Cancellation requested; finishing the current frame safely…';}catch(error){notify?.(error.message,true);}});
 syncCameraControls();
 return{
  show,pause,getYear:()=>year,
  prepareSource:value=>{if(metadata?.id!==value.id){revision++;pendingKey='';metadata=value;clearScene();$('map3d-source-label').textContent=value.label;status('Loading the selected source observations…');}},
  sourceError:message=>{revision++;pendingKey='';clearScene();status(message);},
  getState:()=>({series_id:metadata?.id,start_year:scene?.years[0],end_year:scene?.years.at(-1),year,focus_id:focusId,camera:{...camera},fps:Number($('map3d-fps').value),title:$('map3d-export-title').value,animation_format:$('map3d-animation-format').value,still_format:$('map3d-still-format').value}),
  restore:value=>{pause();preferred=value&&typeof value==='object'&&!Array.isArray(value)?{...value}:null;
   if(preferred){const c=preferred.camera||{},bounded=(key,lo,hi,fallback)=>typeof c[key]==='number'&&Number.isFinite(c[key])&&c[key]>=lo&&c[key]<=hi?c[key]:fallback;preferred.camera={elevation:bounded('elevation',15,80,58),azimuth:bounded('azimuth',-36000,36000,-90),height_scale:bounded('height_scale',.2,2,1),zoom:bounded('zoom',.5,3,1)};
    $('map3d-export-title').value=typeof preferred.title==='string'?preferred.title.slice(0,180):'';
    for(const [id,key]of [['map3d-fps','fps'],['map3d-animation-format','animation_format'],['map3d-still-format','still_format']])if([...$(id).options].some(o=>!o.disabled&&o.value===String(preferred[key])))$(id).value=String(preferred[key]);}
   clearScene();pendingKey='';revision++;},
  invalidate:()=>{pendingKey='';revision++;clearScene();},
  configure:value=>{if(window.PublicWorkbenchAPI){availableFormats=[];$('map3d-format-note').textContent='PNG captures the displayed browser canvas. SVG/PDF 3D figures and GIF/MP4 animations require the original local Python workbench. Timeline playback remains available here.';return;}availableFormats=value||['gif'];for(const option of $('map3d-animation-format').options)option.disabled=!availableFormats.includes(option.value);if(!availableFormats.includes($('map3d-animation-format').value))$('map3d-animation-format').value='gif';$('map3d-format-note').textContent=availableFormats.includes('mp4')?'GIF and MP4 render locally. No network service is used.':'GIF renders locally. MP4 is available when FFmpeg is installed on this computer.';}
 };
}
window.PublicDataMapStudio=Object.freeze({mount});
})();
