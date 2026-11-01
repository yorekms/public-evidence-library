/* Public static adapter for the original workbench UI. No Python/cloud state. */
(() => {
'use strict';
const root=typeof window==='object'?window:globalThis;
const cache=new Map(),pending=new Map(),metadataCache=new Map(),geometryCache=new Map();
let cataloguePromise=null,indexPromise=null,supplementPromise=null,catalogue=null,seriesLookup=null;
const scopeNote='All retained normalized source observations are hosted here. No selected-country or selected-year subset is substituted.';
const encodingNote='Browser JSON/CSV exports re-encode normalized source values. Their bytes differ from original publisher/source bundles; retained source SHA-256 values identify those original bundles, not this browser encoding.';
const localNote='This action requires the original local Python workbench at http://127.0.0.1:8772/ (on your computer, when running). The public browser edition does not run Python models, import datasets, or render PDF/MP4/GIF files.';
const clone=value=>JSON.parse(JSON.stringify(value));
function lru(map,key,value,max){map.delete(key);map.set(key,value);while(map.size>max)map.delete(map.keys().next().value);return value;}
async function sha256(bytes){if(!root.crypto?.subtle)return null;const digest=await root.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function readJSON(path,integrity){
 const u=new URL(path,root.location?.href||'https://public-workbench.invalid/');
 if(root.location&&u.origin!==root.location.origin)throw Error('Public data must load from this site.');
 const response=await fetch(u.pathname+u.search,{headers:{Accept:'application/json, application/gzip'}});
 if(!response.ok)throw Error('Public source file could not be loaded ('+response.status+'): '+u.pathname);
 let bytes=new Uint8Array(await response.arrayBuffer());
 const gz=bytes[0]===31&&bytes[1]===139;
 const expected=gz?integrity?.sha256:integrity?.json_sha256;
 if(expected){const actual=await sha256(bytes);if(actual&&actual!==expected)throw Error('Public source integrity check failed for '+u.pathname);}
 if(gz){if(typeof DecompressionStream!=='function')throw Error('This browser needs gzip DecompressionStream support to open the complete retained collection. Use a current browser.');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('Public source file is not readable JSON: '+u.pathname);}
}
async function loadIndex(){if(!indexPromise)indexPromise=readJSON('/full-data/index.json').catch(error=>{indexPromise=null;throw error;});return indexPromise;}
async function loadSupplement(){
 if(!supplementPromise)supplementPromise=Promise.all([readJSON('/data/catalogue.json'),readJSON('/data/evidence-index.json')]).then(([metadata,index])=>({metadata,files:index.files||index.series||index})).catch(error=>{supplementPromise=null;throw error;});
 return supplementPromise;
}
async function loadCatalogue(){
 if(!cataloguePromise)cataloguePromise=Promise.all([readJSON('/full-data/catalogue.json.gz'),loadSupplement()]).then(([value,supplement])=>{
  const existingSeries=new Set(value.series.map(s=>s.id)),existingDatasets=new Set(value.datasets.map(d=>d.id));
  const additions=supplement.metadata.series.filter(s=>!existingSeries.has(s.id)&&supplement.files[s.id]);
  const addedDatasets=new Set(additions.map(s=>s.dataset_id));
  const datasets=[...value.datasets,...supplement.metadata.datasets.filter(d=>!existingDatasets.has(d.id)&&addedDatasets.has(d.id))];
  const series=[...value.series,...additions];
  catalogue={...value,datasets,series,counts:{...value.counts,datasets:datasets.length,series:series.length,records:value.counts.records+additions.reduce((sum,s)=>sum+(Number(s.rows)||0),0)}};
  seriesLookup=new Map(series.map(s=>[s.id,s]));return catalogue;
 }).catch(error=>{cataloguePromise=null;throw error;});
 return cataloguePromise;
}
async function metadataFor(id,entry){
 if(catalogue){const series=seriesLookup.get(id);if(!series)throw Error('This series is absent from the retained catalogue.');return{series,dataset:catalogue.datasets.find(d=>d.id===series.dataset_id)};}
 if(!entry.metadata_path){await loadCatalogue();return metadataFor(id,entry);}
 let packet=metadataCache.get(entry.metadata_path);
 if(!packet){packet=await readJSON(entry.metadata_path);lru(metadataCache,entry.metadata_path,packet,2);}
 else lru(metadataCache,entry.metadata_path,packet,2);
 const series=packet.series[id];if(!series)throw Error('Retained series metadata does not contain '+id);
 return{series,dataset:packet.dataset};
}
async function loadSeries(id){
 id=String(id||'');if(!id)throw Error('Choose a retained measure series.');
 if(cache.has(id))return lru(cache,id,cache.get(id),3);
 if(pending.has(id))return pending.get(id);
 const task=(async()=>{
  const index=await loadIndex(),entry=index.series[id];
  if(!entry){
   const supplement=await loadSupplement();let file=supplement.files[id];if(file&&typeof file==='object')file=file.file||file.path;
   if(typeof file!=='string'||!/^evidence\/[A-Za-z0-9_.-]+\.json$/.test(file)||!supplement.metadata.series.some(s=>s.id===id))throw Error('This series is absent from the complete public source index: '+id);
   const data=await readJSON('/data/'+file);
   if(data.series?.id!==id||!Array.isArray(data.records))throw Error('Supplementary historical source identity/count mismatch: '+id);
   if(Number.isInteger(data.series.rows)&&data.series.rows!==data.records.length)throw Error('Supplementary historical source row count mismatch: '+id);
   return lru(cache,id,data,3);
  }
  const metadata=await metadataFor(id,entry),records=[];
  // One part at a time bounds transient decompression memory for county panels.
  for(const part of entry.parts){const data=await readJSON(part.path,part);if(data.series_id!==id||!Array.isArray(data.records)||data.records.length!==part.records)throw Error('Retained source part identity/count mismatch: '+part.path);for(const row of data.records)records.push(row);}
  if(records.length!==entry.records)throw Error('Retained series count mismatch for '+id);
  return lru(cache,id,{...metadata,records,hosted_scope_note:scopeNote,source_bundle_sha256:entry.source_bundle_sha256||metadata.dataset?.sha256||null},3);
 })().finally(()=>pending.delete(id));pending.set(id,task);return task;
}
async function geography(scope,projected=false){const key=(projected?'map-geometry/':'geography/')+scope;if(!['world','us_states','us_counties','virginia'].includes(scope))throw Error('This source has no native display geometry. Use its source table or history.');if(!geometryCache.has(key))geometryCache.set(key,readJSON('/workbench/data/'+key+'.json').catch(error=>{geometryCache.delete(key);throw error;}));return geometryCache.get(key);}
function sourceRef(series,dataset){return{series_id:series.id,dataset_id:series.dataset_id,sha256:dataset?.normalized_bundle_sha256||dataset?.sha256||null};}
async function projectExport(body){
 const cat=await loadCatalogue(),ui_state=clone(body?.ui_state||{}),refs={};
 for(const [key,name]of[['x_series','x'],['y_series','y']]){const series=seriesLookup.get(ui_state[key]);if(series)refs[name]=sourceRef(series,cat.datasets.find(d=>d.id===series.dataset_id));}
 ui_state.source_refs=refs;
 return{project:{schema:'public-data-workbench/public-view-v1',created_by:'Original Public Data Workbench · public browser edition',created_at:new Date().toISOString(),ui_state,source_refs:refs,analysis:body?.analysis||null,source_collection:'/full-data/index.json',encoding_note:encodingNote}};
}
async function projectImport(body){
 const project=body?.project;if(!project||typeof project!=='object'||Array.isArray(project)||!project.ui_state)throw Error('Choose a saved workbench project with view settings.');
 if(!['public-data-workbench/public-view-v1','public-data-workbench/project-v2'].includes(project.schema))throw Error('This public edition can reopen public view files or source-reference project-v2 files. Full/imported datasets require the original local workbench.');
 if((project.datasets||[]).length||(project.series||[]).length||Object.keys(project.records||{}).length)throw Error('This file includes imported or embedded datasets. '+localNote);
 const cat=await loadCatalogue(),refs=project.source_refs||project.ui_state.source_refs||{};
 for(const ref of Object.values(refs)){const series=seriesLookup.get(ref.series_id),dataset=cat.datasets.find(d=>d.id===series?.dataset_id);if(!series||series.dataset_id!==ref.dataset_id||(ref.sha256&&ref.sha256!==(dataset?.normalized_bundle_sha256||dataset?.sha256)))throw Error('Saved source reference is unavailable or its fingerprint differs from this public edition.');}
 for(const ref of project.builtin_references||[]){const d=cat.datasets.find(d=>d.id===ref.id);if(!d||ref.source_sha256!==d.sha256)throw Error('The saved built-in source fingerprint differs from this public collection: '+ref.id);}
 return{ui_state:clone(project.ui_state),analysis:project.analysis||null};
}
async function request(path,body){
 const u=new URL(path,root.location?.href||'https://public-workbench.invalid/');
 if(u.pathname==='/api/config')return{version:'public retained collection · original 3D renderer',token:'',animation_formats:[],public_static:true};
 if(u.pathname==='/api/catalog')return loadCatalogue();
 if(u.pathname==='/api/data')return loadSeries(u.searchParams.get('series'));
 if(u.pathname==='/api/geography')return geography(u.searchParams.get('scope'));
 if(u.pathname==='/api/map-scene'){
  if(!root.PublicWorkbenchScene?.build)throw Error('The public source-scene adapter could not be loaded.');
  const data=await loadSeries(body?.series_id),geometry=await geography(data.series.scope,true);
  return root.PublicWorkbenchScene.build({...data,geometry,payload:body||{}});
 }
 if(u.pathname==='/api/project/export')return projectExport(body);
 if(u.pathname==='/api/project/import')return projectImport(body);
 throw Error(localNote);
}
function download(value,name,type='application/json'){
 const blob=value instanceof Blob?value:new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'],{type});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function provenance({series,dataset,rows,settings,title}){return{schema:'public-data-workbench/browser-figure-provenance-v1',title,created_at:new Date().toISOString(),series,dataset,settings,records:rows,encoding_note:encodingNote,hosted_scope_note:scopeNote};}
async function exportMapStill({canvas,scene,year,format,title,settings}){
 if(format!=='png')throw Error('The public 3D view exports its displayed canvas as PNG. '+localNote);
 if(!canvas)throw Error('No rendered browser canvas is available.');
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('The browser could not encode the displayed canvas.');
 download(blob,'public-workbench-map-'+year+'.png');
 const source=await loadSeries(scene.series.id);
 download({...provenance({series:source.series,dataset:source.dataset,rows:source.records.filter(row=>Number(row.year)===Number(year)),settings:{year,...settings},title}),scene_id:scene.scene_id,scale:scene.scale,frame:scene.frames.find(f=>f.year===year),projection:scene.provenance?.projection,export_note:'PNG captures the original browser renderer canvas only. Surrounding HTML labels are not rasterized; source period, units, scales and camera are recorded here.'},'public-workbench-map-'+year+'-sources.json');
}
async function exportFigure({host,body,series,dataset,rows}){
 if(body.format==='pdf')throw Error('PDF figure rendering requires the original local Python workbench.');
 if(body.chart==='map3d')throw Error('Use Export this year in the 3D map studio to save its PNG canvas.');
 const svg=host.querySelector('svg');if(!svg)throw Error('Choose a flat map, bar chart or time series before exporting this figure.');
 const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
 // Make browser-exported vectors readable outside the page stylesheet.
 const originals=svg.querySelectorAll('*');copy.querySelectorAll('*').forEach((node,index)=>{const original=originals[index];if(!original)return;const style=getComputedStyle(original);for(const key of['fill','stroke','stroke-width','font-family','font-size','font-weight','opacity','text-anchor'])node.style.setProperty(key,style.getPropertyValue(key));});
 const text=new XMLSerializer().serializeToString(copy);
 if(body.format==='svg')download(text,'public-workbench-figure.svg','image/svg+xml');
 else if(body.format==='png'){
  const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas'),box=svg.viewBox.baseVal;canvas.width=box.width||900;canvas.height=box.height||440;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('The browser could not encode this figure.');download(blob,'public-workbench-figure.png');}finally{URL.revokeObjectURL(url);}
 }else throw Error('Choose SVG or PNG for a browser figure export.');
 download(provenance({series,dataset,rows,settings:body.settings,title:body.title}),'public-workbench-figure-sources.json');
}
root.PublicWorkbenchAPI=Object.freeze({request,loadCatalogue,loadIndex,loadSeries,exportMapStill,exportFigure,encodingNote,scopeNote});

// Source-free view snapshots keep controls through browser Back/Forward and return visits.
if(typeof document==='object'&&root.location?.pathname.startsWith('/workbench/')){
 const key='public-workbench.view.v1';let adapter=null,timer=null,restoring=false,last='';
 const encode=value=>'v1_'+btoa(unescape(encodeURIComponent(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const decode=value=>{try{if(!value?.startsWith('v1_')||value.length>96000)return null;return JSON.parse(decodeURIComponent(escape(atob(value.slice(3).replaceAll('-','+').replaceAll('_','/')))));}catch{return null;}};
 function snapshot(push=false){if(!adapter||restoring)return;const value=adapter.capture(),encoded=encode(value);if(encoded===last)return;const u=new URL(adapter.toURL(value),location.href);if(u.origin!==location.origin||!u.pathname.startsWith('/workbench/'))return;u.searchParams.set('view',encoded);history[push&&last?'pushState':'replaceState']({...history.state,publicWorkbenchView:value},'',u.pathname+u.search);last=encoded;const back=document.getElementById('public-return-maps');if(back){const query=new URLSearchParams();if(value.x_series)query.set('series',value.x_series);const studio=value.chart_type==='map3d'?value.studio:null,year=studio?.year??value.view_year??value.year,place=studio?.focus_id||value.view_place||value.geo_id;if(Number.isInteger(year))query.set('year',String(year));if(place)query.set('place',place);back.href='/#maps'+(query.size?'?'+query:'');}try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}}
 async function restore(value){if(!value||!adapter)return;restoring=true;try{await adapter.restore(value);}finally{restoring=false;last='';snapshot();}}
 // Studio paint/source callbacks must publish before returning. A reload can begin
 // before a debounce timer fires, and its destination URL is then already fixed.
 root.WorkbenchNavigation=Object.freeze({register:async(_id,implementation)=>{adapter=implementation;const params=new URLSearchParams(location.search);let value=decode(params.get('view'));if(!params.size){try{value=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}}await restore(value);snapshot();return true;},changed:({push=false}={})=>{clearTimeout(timer);snapshot(push);}});
 root.addEventListener('popstate',event=>restore(event.state?.publicWorkbenchView||decode(new URLSearchParams(location.search).get('view'))));
 root.addEventListener('pagehide',()=>{clearTimeout(timer);snapshot();});
 for(const type of['input','change','pointerup'])document.addEventListener(type,()=>{clearTimeout(timer);if(type==='input')timer=setTimeout(()=>snapshot(),180);else snapshot(type==='change');});
}
})();
