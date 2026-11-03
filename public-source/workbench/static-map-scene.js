/* Original workbench scene schema over retained public source rows and projected native boundaries. */
(function(global){
'use strict';
const SCHEMA='workbench.map-scene/v1',MAX_FRAMES=80,SUPPORTED=new Set(['world','us_states','virginia','us_counties']);
const clone=value=>JSON.parse(JSON.stringify(value));
function number(value,label){if(typeof value!=='number'||!Number.isFinite(value))throw Error(label+' must be a finite number.');return value;}
function annual(value,label){if(!Number.isInteger(value)||value<1800||value>2200)throw Error(label+' must be an integer annual year from 1800 through 2200.');return value;}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
async function sha256(value){let crypto=global.crypto;if(!crypto?.subtle&&typeof require==='function')crypto=require('node:crypto').webcrypto;if(!crypto?.subtle)throw Error('This browser needs HTTPS to fingerprint public source selections.');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
async function build({series,dataset,records,geometry,payload={}}){
 if(!series||!Array.isArray(records)||!dataset)throw Error('Choose a loaded public source series.');
 if(payload.series_id!==undefined&&payload.series_id!==series.id)throw Error('The requested series does not match the retained source.');
 const scope=series.scope;if(!SUPPORTED.has(scope)||geometry?.scope!==scope)throw Error('This source has no supported native 3D polygon map. Use the flat map or source table for this geography.');
 const features=geometry.features;if(!Array.isArray(features)||!features.length||features.length>10000||new Set(features.map(f=>String(f.id))).size!==features.length)throw Error('The native projected boundary pack is invalid.');
 const sourceYears=[...new Set(records.filter(r=>r.year!==null&&r.year!==undefined).map(r=>annual(r.year,'Source year')))].sort((a,b)=>a-b);
 if(!sourceYears.length)throw Error('This source uses pooled or unspecified periods. It has no annual map frames; inspect its original source table instead.');
 const start=annual(payload.start_year??sourceYears[0],'First year'),end=annual(payload.end_year??sourceYears.at(-1),'Last year');
 if(start>end||start<sourceYears[0]||end>sourceYears.at(-1))throw Error('Choose an ordered year range within the loaded source years.');
 if(end-start+1>MAX_FRAMES)throw Error('Choose at most '+MAX_FRAMES+' calendar-year frames per scene.');
 const nativeIds=new Set(features.map(f=>String(f.id))),byYear=new Map(),keys=new Set(),publicRows=[];
 for(const row of records){
  const year=row.year;if(year===null||year===undefined||year<start||year>end)continue;
  const id=String(row.geo_id),key=JSON.stringify([id,year]);if(keys.has(key))throw Error('Duplicate native place/year observations cannot be averaged into a 3D scene.');keys.add(key);
  if(row.scope!==scope||row.unit!==series.unit)throw Error('A source row has incompatible native geography or units.');
  if(row.value!==null&&row.value!==undefined)number(row.value,'Source value');
  const eligible=row.eligible===undefined?true:row.eligible;if(typeof eligible!=='boolean')throw Error('Source eligibility must be true or false.');
  publicRows.push(Object.fromEntries(Object.entries(row).filter(([key])=>!['analysis','question','rationale','learningSession'].includes(key))));
  if(!byYear.has(year))byYear.set(year,new Map());
  byYear.get(year).set(id,{value:row.value??null,eligible,status:String(row.status??'published source observation'),period:String(row.period??year),low:row.low??null,high:row.high??null});
 }
 const values=[];for(const frame of byYear.values())for(const[id,row]of frame)if(nativeIds.has(id)&&row.eligible&&row.value!==null)values.push(row.value);
 if(!values.length)throw Error('This year range has no eligible numeric observations matching native boundaries.');
 let dataMin=Infinity,dataMax=-Infinity;for(const value of values){dataMin=Math.min(dataMin,value);dataMax=Math.max(dataMax,value);}const maxAbs=Math.max(Math.abs(dataMin),Math.abs(dataMax));
 let reference=series.display_reference??null;if(reference===null&&series.id==='bea::SARPP-1')reference=100;if(reference===null&&dataMin<0)reference=0;
 let low,high,colors,domain;if(reference!==null){number(reference,'Color reference');let distance=0;for(const value of values)distance=Math.max(distance,Math.abs(value-reference));distance=distance||1;low=reference-distance;high=reference+distance;colors=['#a86a47','#f5f3e8','#176957'];domain=[low,reference,high];}else{low=Math.min(0,dataMin);high=Math.max(0,dataMax);if(low===high)high=low+1;colors=['#e3eee7','#176957'];domain=[low,high];}
 const years=Array.from({length:end-start+1},(_,i)=>start+i),frames=years.map(year=>{const source=byYear.get(year)||new Map(),values=Object.fromEntries(features.map(f=>[f.id,source.get(String(f.id))||{value:null,eligible:false,status:'No source observation for this calendar year',period:String(year),low:null,high:null}]));let count=0;for(const row of Object.values(values))if(row.eligible&&row.value!==null)count++;return{year,values,available:byYear.has(year),numeric_count:count,missing_count:features.length-count};});
 const recordHash=await sha256(canonical(publicRows)),scene={schema:SCHEMA,scene_id:'public-'+recordHash.slice(0,24)+'-'+start+'-'+end,series:clone(series),dataset:clone(dataset),scope,years,available_years:[...byYear.keys()].sort((a,b)=>a-b),features,bounds:geometry.bounds,frames,
  scale:{min:low,max:high,max_abs:maxAbs,reference,height_max:13,data_min:dataMin,data_max:dataMax,color_domain:domain,color_range:colors,locked_years:[start,end]},
  provenance:{source_records:clone(publicRows),selected_record_sha256:recordHash,selected_record_hash_encoding:'Sorted-key ECMAScript JSON, UTF-8. Semantic browser selection fingerprint; differs from Python JSON serialization and source-file bytes.',dataset_sha256:dataset.sha256??null,geometry_sha256:geometry.provenance?.geometry_sha256??null,projection:geometry.provenance?.projection,display_clips:geometry.provenance?.display_clips||[],interpretation:'Height represents the source value, not terrain or volume. No spatial aggregation, interpolation, imputation or causal inference. Camera and source color/height domains are fixed across the selected calendar-year range.',uncertainty:'Published source intervals remain in the record and table; they are not extruded as height uncertainty.',missing_years:years.filter(y=>!byYear.has(y)),table_only_records:publicRows.filter(r=>!nativeIds.has(String(r.geo_id))).length,browser_scene_adapter:'public-workbench-scene/v1',projected_geometry_note:geometry.provenance?.projected_geometry_note}};
 return scene;
}
const api={build,canonical,sha256};if(typeof module!=='undefined'&&module.exports)module.exports=api;global.PublicWorkbenchScene=api;
})(typeof window==='undefined'?globalThis:window);
