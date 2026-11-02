/* Source-preserving browser adapter for the retained PipelineAtlas collections. */
(() => {
'use strict';
const root=typeof window==='object'?window:globalThis;
const REGION_TYPES=new Set(['state','state_region','origin_subregion','customs_area','customs_partner_area','address_country','country','economy','customs_port','port','port_reference','country_sector','economic_country','economic_area']);
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const text=v=>String(v||'').trim();
const own=(o,k,fallback)=>Object.prototype.hasOwnProperty.call(o,k)?o[k]:fallback;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const casefold=v=>String(v).toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ').replace(/[ﬀﬁﬂﬃﬄﬅﬆ]/g,c=>({'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl','ﬅ':'st','ﬆ':'st'}[c]));
const pyJSON=v=>Array.isArray(v)?'['+v.map(pyJSON).join(', ')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+': '+pyJSON(x)).join(', ')+'}':JSON.stringify(v);
function point(n){const x=own(n,'lon',n.longitude),y=own(n,'lat',n.latitude);return numeric(x)&&numeric(y)&&x>=-180&&x<=180&&y>=-90&&y<=90?[x,y]:null;}
function displayNode(node,year){const n={...node};if(n.positions_by_year&&Object.keys(n.positions_by_year).length){const p=n.positions_by_year[String(year)];if(p&&Object.keys(p).length){for(const k of['lat','lon','label','state','source_id'])if(Object.prototype.hasOwnProperty.call(p,k))n[k]=p[k];n.display_location_basis=p.basis??null;}else Object.assign(n,{lat:null,lon:null,map_eligible:false,display_location_basis:'No location for this source period'});}n.region_anchor_allowed=REGION_TYPES.has(n.type)&&['world','us_states'].includes(n.scope)&&Boolean(n.geo_id);return n;}

function prepareBundle(data,cid){
 if(data?.schema!=='ridgeway.pipeline/v1'||data.id!==cid)throw Error('Unsupported pipeline source schema.');
 const nodes=new Map(),years=new Map(),metrics=new Map(),sources=new Map(),search=new Map();
 for(const n of data.nodes||[]){if(nodes.has(n.id))throw Error('Duplicate pipeline node identifiers.');nodes.set(n.id,n);}
 for(const m of data.metrics||[])metrics.set(m.id,m);
 if(!metrics.size)metrics.set('references',{id:'references',label:'Reference connections',unit:'unweighted references',field:null,additive:false});
 for(const s of data.sources||[])sources.set(s.id,s);
 const quantity=[...metrics.values()].find(m=>m.field==='quantity'&&own(m,'additive',true)),edgeIDs=new Set();
 for(const e of data.edges||[]){
  if(edgeIDs.has(e.id))throw Error('Duplicate pipeline source edge.');edgeIDs.add(e.id);
  if(!nodes.has(e.from_id)||!nodes.has(e.to_id))throw Error('Unresolved pipeline endpoint.');
  if(!sources.has(e.source_id))throw Error('Unresolved pipeline source record.');
  if(quantity&&numeric(e.quantity)&&e.unit!==quantity.unit)throw Error('Mixed physical/accounting units in a pipeline collection.');
  for(const m of metrics.values()){const v=e[m.field];if(v!==undefined&&v!==null&&!numeric(v))throw Error('Normalized pipeline measures must be finite numbers or null.');}
  const year=String(own(e,'year',''));if(!years.has(year))years.set(year,[]);years.get(year).push(e);
 }
 for(const [id,n]of nodes)search.set(id,casefold(['id','label','state','country_iso3','stage','type','operations','address','chemical_id','fei_number'].map(k=>text(n[k])).join(' ')+' '+pyJSON(own(n,'search_fields',{}))));
 return{data,nodes,years,metrics,sources,search};
}
function catalog(manifest,fingerprint){return{fingerprint,collections:(manifest.collections||[]).map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>k!=='file'))),boundaries:['Connections retain their source geography and evidence type.','Map arcs are schematic; moving particles illustrate direction, not travel time.','Quantities, monetary accounts, reference associations and modeled allocations remain distinct.'],preserved_library:{url:'/',series:1940,collections:16,rows:341857}};}
function facets(b){
 const commodities=new Map(),places=new Map();
 for(const e of b.data.edges||[])if(e.commodity_id)commodities.set(text(e.commodity_id),text(own(e,'commodity_label',e.commodity_id)));
 for(const n of b.nodes.values()){if(n.state)places.set('state:'+n.state,{id:n.state,label:n.state,kind:'state'});if(n.country_iso3)places.set('country:'+n.country_iso3,{id:n.country_iso3,label:own(n,'country_name',n.country_iso3),kind:'country'});}
 const unique=field=>[...new Set((b.data.edges||[]).filter(e=>e[field]).map(e=>text(e[field])))].sort(compare);
 return{commodities:[...commodities].sort((a,z)=>compare(a[1],z[1])).map(([id,label])=>({id,label})),sectors:unique('sector'),transports:unique('transport'),evidence_types:unique('evidence_type'),places:[...places.values()].sort((a,z)=>compare(a.kind,z.kind)||compare(a.label,z.label))};
}
function validate(b,payload={}){
 const years=(b.data.years||[]).map(String),year=String(own(payload,'year',own(b.data,'default_year',years.at(-1)||'')));
 if(years.length&&!years.includes(year))throw Error('Choose an actual loaded source period.');
 const mid=own(payload,'metric',own(b.data,'default_metric',b.metrics.keys().next().value));if(!b.metrics.has(mid))throw Error('Choose a metric offered by this source.');
 const focus=text(own(payload,'focus','all'))||'all',direction=own(payload,'direction','either');if(!['outbound','inbound','either','all'].includes(direction))throw Error('Choose a valid direction.');
 for(const k of['search','commodity','sector','transport','evidence_type']){const value=own(payload,k,'');if(typeof value!=='string'||value.length>500)throw Error('Invalid pipeline filter.');}
 return{bundle:b,year,metric:b.metrics.get(mid),focus,direction};
}
const matchesPlace=(n,focus)=>focus==='all'||[n.id,n.state,n.country_iso3,n.geo_id].includes(focus);
function select(b,payload={},yearOverride){
 const selected=validate(b,payload),year=yearOverride||selected.year,{metric,focus,direction}=selected,needle=casefold((payload.search||'').trim()),edges=[];
 for(const e of b.years.get(year)||[]){
  if([['commodity','commodity_id'],['sector','sector'],['transport','transport'],['evidence_type','evidence_type']].some(([k,field])=>![undefined,null,'','all',e[field]].includes(payload[k])))continue;
  const a=b.nodes.get(e.from_id),z=b.nodes.get(e.to_id),af=matchesPlace(a,focus),zf=matchesPlace(z,focus);
  if(direction!=='all'&&focus!=='all'&&!(direction==='outbound'?af:direction==='inbound'?zf:af||zf))continue;
  if(direction==='all'&&focus!=='all'&&!(af||zf))continue;
  if(needle&&!(b.search.get(a.id)+' '+b.search.get(z.id)+' '+casefold(text(e.commodity_label))+' '+casefold(text(e.sector))).includes(needle))continue;
  edges.push(e);
 }
 let nodes;
 if((b.data.edges||[]).length){const ids=new Set();for(const e of edges){ids.add(e.from_id);ids.add(e.to_id);}nodes=[...ids].map(id=>b.nodes.get(id));}
 else nodes=[...b.nodes.values()].filter(n=>matchesPlace(n,focus)&&(!needle||b.search.get(n.id).includes(needle))&&(!n.year||String(n.year)===year));
 return{bundle:b,year,metric,edges,nodes:nodes.map(n=>displayNode(n,year))};
}
function amount(edge,metric){const v=metric.field?edge[metric.field]:null;return numeric(v)&&own(edge,'eligible',true)?v:null;}
function query(b,payload={},provenance={}){
 const s=select(b,payload),{year,metric,edges,nodes}=s,values=edges.map(e=>amount(e,metric)).filter(v=>v!==null),additive=Boolean(own(metric,'additive',true)&&metric.field),groups=new Map();
 for(const e of edges){const key=JSON.stringify([e.from_id,e.to_id,own(e,'evidence_type','reported')]);let g=groups.get(key);if(!g){g={id:'pair:'+groups.size,from_id:e.from_id,to_id:e.to_id,evidence_type:own(e,'evidence_type','reported'),value:null,measured_records:0,missing_records:0,source_records:0,source_ids:new Set(),sectors:new Set()};groups.set(key,g);}g.source_records++;g.source_ids.add(e.source_id);if(e.sector)g.sectors.add(e.sector);const v=amount(e,metric);if(v===null)g.missing_records++;else{g.measured_records++;g.value=(g.value||0)+v;}}
 const links=[...groups.values()].map(g=>({...g,source_ids:[...g.source_ids].filter(Boolean).sort(compare),sectors:[...g.sectors].sort(compare)})).sort((a,z)=>Math.abs(z.value||0)-Math.abs(a.value||0));
 const regional={};for(const n of nodes){if(b.data.id==='pharma_registry'&&n.type!=='establishment_registration')continue;if(n.country_iso3)regional[n.country_iso3]=(regional[n.country_iso3]||0)+1;}
 const trend=[];let domain=0;
 for(const t of b.data.years||[]){const es=select(b,{...payload,year:String(t)}).edges,vs=es.map(e=>amount(e,metric)).filter(v=>v!==null);trend.push({year:String(t),value:vs.length&&additive?vs.reduce((a,v)=>a+v,0):null,measured_records:vs.length,source_records:es.length});const pairs=new Map();for(const e of es){const v=amount(e,metric);if(v!==null){const k=JSON.stringify([e.from_id,e.to_id]);pairs.set(k,(pairs.get(k)||0)+v);}}for(const v of pairs.values())domain=Math.max(domain,Math.abs(v));}
 const used=new Set([...edges.map(e=>e.source_id),...nodes.map(n=>n.source_id)]);let sources=(b.data.sources||[]).filter(s=>!used.size||used.has(s.id));if(!sources.length)sources=b.data.sources||[];
 const pointNodes=nodes.filter(n=>point(n)&&own(n,'map_eligible',true)&&own(n,'physical_location',true));
 return{collection:b.data.id,title:b.data.title,description:own(b.data,'description',''),year,metric,fingerprint:provenance.fingerprint??null,bundle_sha256:provenance.bundleSha256??null,query:{...payload},nodes,links,table:edges.slice(0,250),counts:{source_records:edges.length,connections:links.length,nodes:nodes.length,measured:values.length,missing:edges.length-values.length,source_coordinate_nodes:pointNodes.length,other_nodes:nodes.length-pointNodes.length,table_rows:Math.min(250,edges.length)},total:values.length&&additive?values.reduce((a,v)=>a+v,0):null,additive,fixed_width_domain:[0,domain],trend,sources,limitations:b.data.limitations||[],time_semantics:own(b.data,'time_semantics',''),geographic_scope:own(b.data,'geographic_scope',''),regional_reference_counts:regional,records_count:b.recordCount??(b.data.records||[]).length,reference_only:!(b.data.edges||[]).length||!metric.field||!own(metric,'additive',true),map_notice:'Regional endpoints use representative geography anchors. Facility points require source coordinates. Paths are schematic; motion shows direction, not transit time.'};
}
function selectedRecords(b,edges,nodes){const ids=new Set();for(const e of edges)for(const r of e.record_ids||[])ids.add(r);if(!(b.data.edges||[]).length)for(const n of nodes)for(const r of n.record_ids||[])ids.add(r);const nodeIDs=new Set(nodes.filter(n=>!REGION_TYPES.has(n.type)&&!String(n.type||'').includes('categor')&&!String(n.type||'').includes('chemical')).map(n=>n.id));return(b.data.records||[]).filter(r=>ids.has(r.id)||(!ids.size&&nodeIDs.has(r.node_id)));}
function node(b,payload={},provenance={}){const {year,metric}=validate(b,payload),nid=payload.node_id;if(!b.nodes.has(nid))throw Error('Choose a node in this source collection.');const n=displayNode(b.nodes.get(nid),year),history=[];for(const y of b.data.years||[]){const es=select(b,{...payload,year:String(y)}).edges.filter(e=>[e.from_id,e.to_id].includes(nid)),vs=es.map(e=>amount(e,metric)).filter(v=>v!==null);history.push({year:String(y),value:vs.length&&own(metric,'additive',true)?vs.reduce((a,v)=>a+v,0):null,source_records:es.length,measured_records:vs.length});}const selected=select(b,payload).edges.filter(e=>[e.from_id,e.to_id].includes(nid)),records=selectedRecords(b,selected,[n]);return{node:n,year,metric,edges:selected,history,records:records.slice(0,300),record_count:records.length,sources:b.data.sources||[],limitations:b.data.limitations||[],bundle_sha256:provenance.bundleSha256??null,collection:b.data.id};}
function records(b,payload={}){const integer=(value,fallback)=>{value=value===undefined?fallback:value;if(typeof value==='number'&&Number.isFinite(value))return Math.trunc(value);if(typeof value==='string'&&/^\s*[+-]?\d+\s*$/.test(value))return Number(value);throw Error('Choose a valid source-record page.');},offset=integer(payload.offset,0),limit=integer(payload.limit,100);if(offset<0||limit<1||limit>500)throw Error('Choose a valid source-record page.');const needle=casefold(text(payload.search)),rows=needle?(b.data.records||[]).filter(r=>casefold(pyJSON(r)).includes(needle)):b.data.records||[];return{records:rows.slice(offset,offset+limit),total:rows.length,offset,limit};}
function evidence(b,payload={},provenance={}){const {year,metric,edges,nodes}=select(b,payload);return{schema:'ridgeway.pipeline-evidence/v1',query:payload,collection:b.data.id,title:b.data.title,year,metric,bundle_sha256:provenance.bundleSha256??null,manifest_sha256:provenance.fingerprint??null,nodes,edges,records:selectedRecords(b,edges,nodes),sources:b.data.sources||[],limitations:b.data.limitations||[],time_semantics:own(b.data,'time_semantics',''),interpretation:'Reported/source-typed connections. No inferred itinerary, owner-attributed output, cash payment or causal effect.'};}

/* Large source packs exceed a browser's maximum single-string length. Parse
 * top-level arrays incrementally, JSON-validating each complete native item. */
function createPacketJSONParser(options={}){
 let buffer='',pos=0,state='root',key=null,value={},array=null,first=true,done=false;
 const skip=()=>{while(pos<buffer.length&&/\s/.test(buffer[pos]))pos++;};
 function endOf(start,final){const first=buffer[start];if(first==='"'){const re=/["\\]/g;re.lastIndex=start+1;let m;while((m=re.exec(buffer))){if(m[0]==='\\')re.lastIndex=m.index+2;else return m.index+1;}return null;}if(first==='{'||first==='['){let depth=0,inString=false;const re=/["\\{}\[\]]/g;re.lastIndex=start;let m;while((m=re.exec(buffer))){const c=m[0];if(inString){if(c==='\\')re.lastIndex=m.index+2;else if(c==='"')inString=false;}else if(c==='"')inString=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0)return m.index+1;}}return null;}const re=/[,\]}\s]/g;re.lastIndex=start;const m=re.exec(buffer);return m?m.index:final?buffer.length:null;}
 function assign(k,v){Object.defineProperty(value,k,{value:v,writable:true,enumerable:true,configurable:true});}
 function feed(chunk,final=false){if(done&&chunk.trim())throw Error('Unexpected data after pipeline source JSON.');buffer+=chunk;
  while(true){skip();if(pos>=buffer.length)break;const c=buffer[pos];
   if(state==='root'){if(c!=='{')throw Error('Pipeline source must be a JSON object.');pos++;state='key';first=true;}
   else if(state==='key'){if(c==='}'&&first){pos++;done=true;state='done';continue;}if(c!=='"')throw Error('Invalid pipeline source JSON key.');const end=endOf(pos,final);if(end===null)break;key=JSON.parse(buffer.slice(pos,end));pos=end;state='colon';}
   else if(state==='colon'){if(c!==':')throw Error('Invalid pipeline source JSON separator.');pos++;state='value';}
   else if(state==='value'){if(c==='['){array=[];assign(key,array);pos++;state='array';first=true;}else{const end=endOf(pos,final);if(end===null)break;assign(key,JSON.parse(buffer.slice(pos,end)));pos=end;state='propertyEnd';}}
   else if(state==='array'){if(c===']'&&first){pos++;state='propertyEnd';array=null;continue;}const end=endOf(pos,final);if(end===null)break;const literal=buffer.slice(pos,end);if(options.onRawItem?.(key,literal)!==false&&options.wantsItem?.(key)!==false){const parsed=JSON.parse(literal),replacement=options.onItem?.(key,parsed,literal);if(replacement!==false)array.push(replacement===undefined?parsed:replacement);}pos=end;state='itemEnd';}
   else if(state==='itemEnd'){if(c===','){pos++;state='array';first=false;}else if(c===']'){pos++;state='propertyEnd';array=null;}else throw Error('Invalid pipeline source array separator.');}
   else if(state==='propertyEnd'){if(c===','){pos++;state='key';first=false;}else if(c==='}'){pos++;done=true;state='done';}else throw Error('Invalid pipeline source property separator.');}
   else if(state==='done'){if(buffer.slice(pos).trim())throw Error('Unexpected data after pipeline source JSON.');pos=buffer.length;break;}
  }
  if(pos){buffer=buffer.slice(pos);pos=0;}if(buffer.length>32*1024*1024)throw Error('A single pipeline JSON item exceeds the bounded browser parser.');if(final&&(!done||buffer.trim()))throw Error('Incomplete pipeline source JSON.');return done?value:null;
 }
 return{feed};
}

function createAPI(options={}){
 const env=options.root||root,fetcher=options.fetch||env.fetch?.bind(env),crypto=options.crypto||env.crypto,cache=new Map(),pending=new Map();
 const maxCacheBytes=options.maxCacheBytes??96*1024*1024,maxCacheEntries=options.maxCacheEntries??2,maxDecodedBytes=options.maxDecodedBytes??700_000_000;
 let support=null,manifest=null,fingerprint=null,entries=null,cacheBytes=0;
 const abortError=()=>Object.assign(new Error('The source request was cancelled.'),{name:'AbortError'});
 function check(signal){if(signal?.aborted)throw abortError();}
 async function digest(bytes){if(!crypto?.subtle)throw Error('A secure browser connection is required to verify retained pipeline sources.');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
 async function verified(bytes,expected,size,label){if(bytes.byteLength!==size||await digest(bytes)!==expected)throw Error('Pipeline source fingerprint/length check failed: '+label);return bytes;}
 function address(path){const u=new URL(path,env.location?.href||'https://public-workbench.invalid/');if(env.location&&u.origin!==env.location.origin)throw Error('Pipeline sources must load from this site.');return u.pathname+u.search;}
 async function fetchBytes(path,signal){check(signal);if(!fetcher)throw Error('Source downloading is unavailable in this browser.');const response=await fetcher(address(path),{signal,credentials:'omit'});if(!response.ok)throw Error('Pipeline source could not load (HTTP '+response.status+'): '+path);const bytes=new Uint8Array(await response.arrayBuffer());check(signal);return bytes;}
 async function ungzip(bytes,signal){check(signal);const DS=options.DecompressionStream||env.DecompressionStream;if(typeof DS!=='function')throw Error('This browser needs gzip decompression support for the retained pipeline sources.');const response=new Response(new Blob([bytes]).stream().pipeThrough(new DS('gzip'))),result=new Uint8Array(await response.arrayBuffer());check(signal);return result;}
 function shared(key,loader,signal){check(signal);let entry=pending.get(key);if(entry?.controller.signal.aborted){pending.delete(key);entry=null;}if(!entry){const controller=new AbortController();entry={controller,users:0,settled:false};entry.promise=Promise.resolve().then(()=>loader(controller.signal)).finally(()=>{entry.settled=true;if(pending.get(key)===entry)pending.delete(key);});pending.set(key,entry);}entry.users++;
  return new Promise((resolve,reject)=>{let finished=false;const complete=(fn,result)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',onAbort);entry.users--;if(!entry.users&&!entry.settled)entry.controller.abort();fn(result);},onAbort=()=>complete(reject,abortError());signal?.addEventListener('abort',onAbort,{once:true});entry.promise.then(v=>complete(resolve,v),e=>complete(reject,e));if(signal?.aborted)onAbort();});
 }
 async function loadSupport(signal){if(support)return support;return shared('support',async s=>{const bytes=await fetchBytes('/full-data/support/support-index.json',s),value=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(value.files))throw Error('Unsupported supporting-source index.');check(s);support=value;return value;},signal);}
 async function original(path,signal){const index=await loadSupport(signal),file=index.files.find(f=>f.original_path===path);if(!file)throw Error('The retained pipeline source is absent from the published support index: '+path);if(!Array.isArray(file.chunks)||!file.chunks.length||file.chunks.length>64)throw Error('Invalid retained pipeline source parts.');const chunks=[];let total=0;
  for(const part of file.chunks){if(typeof part.url!=='string'||!/^\/full-data\/support\/pipelines\/[A-Za-z0-9_.-]+$/.test(part.url)||!Number.isSafeInteger(part.bytes)||part.bytes<0)throw Error('Invalid retained pipeline source path.');const bytes=await fetchBytes(part.url,signal);await verified(bytes,part.sha256,part.bytes,part.url);chunks.push(bytes);total+=bytes.byteLength;if(total>200_000_000)throw Error('Retained pipeline source exceeds the browser transfer bound.');}
  const combined=new Uint8Array(total);let offset=0;for(const bytes of chunks){combined.set(bytes,offset);offset+=bytes.length;}if(file.stored_bytes!==undefined&&total!==file.stored_bytes)throw Error('Retained source reassembly length differs.');if(file.stored_sha256&&await digest(combined)!==file.stored_sha256)throw Error('Retained source reassembly fingerprint differs.');let bytes=combined;if(file.transfer_encoding==='gzip')bytes=await ungzip(bytes,signal);else if(file.transfer_encoding!=='identity')throw Error('Unsupported pipeline transfer encoding.');await verified(bytes,file.original_sha256,file.original_bytes,path);check(signal);return{bytes,file};
 }
 async function loadManifest(signal){if(manifest)return manifest;return shared('manifest',async s=>{const {bytes}=await original('data/pipelines/manifest.json',s),value=JSON.parse(new TextDecoder().decode(bytes)),list=value.collections;if(!Array.isArray(list))throw Error('Unsupported retained pipeline manifest.');const lookup=new Map();for(const e of list){if(lookup.has(e.id))throw Error('Duplicate pipeline collection.');if(typeof e.file!=='string'||!/^[A-Za-z0-9_-]+\.json(?:\.gz)?$/.test(e.file)||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Invalid pipeline source filename/fingerprint.');lookup.set(e.id,e);}const hash=await digest(bytes);check(s);manifest=value;entries=lookup;fingerprint=hash;return value;},signal);}
 async function parseBundle(bytes,gzip,signal,parserOptions={}){const parser=createPacketJSONParser(parserOptions),decoder=new TextDecoder('utf-8',{fatal:true}),DS=options.DecompressionStream||env.DecompressionStream;let stream=new Blob([bytes]).stream();if(gzip){if(typeof DS!=='function')throw Error('This browser needs gzip decompression support for the retained pipeline sources.');stream=stream.pipeThrough(new DS('gzip'));}const reader=stream.getReader();let decodedBytes=0,sinceYield=0;try{while(true){check(signal);const {done,value}=await reader.read();if(done)break;decodedBytes+=value.byteLength;sinceYield+=value.byteLength;if(decodedBytes>maxDecodedBytes)throw Error('This retained pipeline exceeds the browser decoding bound.');parser.feed(decoder.decode(value,{stream:true}));if(sinceYield>=4*1024*1024){sinceYield=0;await new Promise(resolve=>setTimeout(resolve,0));check(signal);}}const data=parser.feed(decoder.decode(),true);check(signal);return{data,decodedBytes};}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}}
 function compactItem(item){return Object.fromEntries(Object.entries(item).filter(([key,value])=>value===null||typeof value!=='object'||['record_ids','positions_by_year','search_fields','operations'].includes(key)));}
 function evict(){while(cache.size>maxCacheEntries||cacheBytes>maxCacheBytes&&cache.size>1){const key=cache.keys().next().value;cacheBytes-=cache.get(key).retainedBytes;cache.delete(key);}}
 async function loadBundle(cid,signal){await loadManifest(signal);if(!entries.has(cid))throw Error('Choose an installed pipeline collection.');if(cache.has(cid)){const entry=cache.get(cid);cache.delete(cid);cache.set(cid,entry);return entry.bundle;}return shared('bundle:'+cid,async s=>{const entry=entries.get(cid);if(cacheBytes>maxCacheBytes){cache.clear();cacheBytes=0;}const {bytes}=await original('data/pipelines/'+entry.file,s);if(await digest(bytes)!==entry.sha256)throw Error('Pipeline source fingerprint changed: '+entry.file);const compressed=entry.file.endsWith('.gz'),sizeHint=compressed?new DataView(bytes.buffer,bytes.byteOffset+bytes.byteLength-4,4).getUint32(0,true):bytes.byteLength,compact=sizeHint>(options.compactThresholdBytes??32*1024*1024);let recordCount=0,retainedBytes=bytes.byteLength;
  const parserOptions=compact?{onRawItem(key){if(key==='records'){recordCount++;return false;}},onItem(key,item,literal){if(['nodes','edges'].includes(key)){const value=compactItem(item);retainedBytes+=JSON.stringify(value).length;return value;}retainedBytes+=literal.length;}}:{};
  const parsed=await parseBundle(bytes,compressed,s,parserOptions),bundle=prepareBundle(parsed.data,cid);if(compact){bundle.recordCount=recordCount;bundle.originalBytes=bytes;bundle.originalCompressed=compressed;bundle.compact=true;}else retainedBytes=parsed.decodedBytes;check(s);cache.set(cid,{bundle,decodedBytes:parsed.decodedBytes,retainedBytes});cacheBytes+=retainedBytes;evict();return bundle;},signal);}
 function wantedRecords(b,edges,nodes){const ids=new Set();for(const e of edges)for(const id of e.record_ids||[])ids.add(id);if(!(b.data.edges||[]).length)for(const n of nodes)for(const id of n.record_ids||[])ids.add(id);const nodeIDs=new Set(nodes.filter(n=>!REGION_TYPES.has(n.type)&&!String(n.type||'').includes('categor')&&!String(n.type||'').includes('chemical')).map(n=>n.id));return{ids,nodeIDs};}
 async function hydrate(b,payload,kind,signal){
  if(!b.compact)return b;
  const s=select(b,payload);let selectedEdges=s.edges,selectedNodes=s.nodes;
  if(kind==='node'){if(!b.nodes.has(payload.node_id))throw Error('Choose a node in this source collection.');selectedNodes=[displayNode(b.nodes.get(payload.node_id),s.year)];selectedEdges=selectedEdges.filter(e=>[e.from_id,e.to_id].includes(payload.node_id));}
  const nodeIDs=new Set(selectedNodes.map(n=>n.id)),edgeIDs=new Set(selectedEdges.map(e=>e.id)),recordSelection=wantedRecords(b,selectedEdges,selectedNodes),fullNodes=new Map(),fullEdges=new Map(),fullRecords=[];
  const wanted={nodes:nodeIDs,edges:edgeIDs,records:recordSelection.ids};
  await parseBundle(b.originalBytes,b.originalCompressed,signal,{wantsItem:key=>['nodes','edges','records'].includes(key),onRawItem(key,literal){if(!wanted[key])return false;if(key==='records'&&!recordSelection.ids.size)return recordSelection.nodeIDs.size>0;const m=/^\{\s*"id"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(literal);return m?wanted[key].has(JSON.parse(m[1])):undefined;},onItem(key,item){if(key==='nodes'){if(nodeIDs.has(item.id))fullNodes.set(item.id,item);}else if(key==='edges'){if(edgeIDs.has(item.id))fullEdges.set(item.id,item);}else if(recordSelection.ids.has(item.id)||(!recordSelection.ids.size&&recordSelection.nodeIDs.has(item.node_id)))fullRecords.push(item);return false;}});
  check(signal);const nodes=new Map(b.nodes);for(const [id,item]of fullNodes)nodes.set(id,item);const edgeMap=new Map(fullEdges),years=new Map();for(const [year,edges]of b.years)years.set(year,edges.map(e=>edgeMap.get(e.id)||e));
  return{...b,nodes,years,data:{...b.data,records:fullRecords},recordCount:b.recordCount};
 }
 async function recordPage(b,payload,signal){if(!b.compact)return records(b,payload);const page=records({...b,data:{...b.data,records:[]}},payload),needle=casefold(text(payload.search)),rows=[];let total=0;await parseBundle(b.originalBytes,b.originalCompressed,signal,{wantsItem:key=>key==='records',onItem(key,item){if(!needle||casefold(pyJSON(item)).includes(needle)){if(total>=page.offset&&rows.length<page.limit)rows.push(item);total++;}return false;}});return{records:rows,total,offset:page.offset,limit:page.limit};}
 async function request(path,payload,signal){check(signal);const u=new URL(path,env.location?.href||'https://public-workbench.invalid/');if(env.location&&u.origin!==env.location.origin)throw Error('Pipeline API requests must stay on this site.');if(['/api/config','/api/geography'].includes(u.pathname)){if(!env.PublicWorkbenchAPI?.request)throw Error('The public geography adapter could not load.');return env.PublicWorkbenchAPI.request(path,payload);}
  const p={...Object.fromEntries(u.searchParams),...(payload||{})};if(u.pathname==='/api/pipelines/catalog'){await loadManifest(signal);check(signal);return catalog(manifest,fingerprint);}if(!['/api/pipelines/facets','/api/pipelines/query','/api/pipelines/node','/api/pipelines/records','/api/pipelines/evidence'].includes(u.pathname))throw Error('This operation requires the original local workbench service. Source flow maps and their evidence remain available here.');let b=await loadBundle(p.collection,signal);check(signal);await new Promise(resolve=>setTimeout(resolve,0));check(signal);const proof={fingerprint,bundleSha256:entries.get(p.collection).sha256};let result;if(u.pathname.endsWith('/facets'))result=facets(b);else if(u.pathname.endsWith('/query'))result=query(b,p,proof);else if(u.pathname.endsWith('/node')){b=await hydrate(b,p,'node',signal);result=node(b,p,proof);}else if(u.pathname.endsWith('/records'))result=await recordPage(b,p,signal);else{b=await hydrate(b,p,'evidence',signal);result=evidence(b,p,proof);}check(signal);return result;
 }
 return Object.freeze({request,clearCache(){cache.clear();cacheBytes=0;},cacheInfo(){return{collections:[...cache.keys()],retainedSourceBytes:cacheBytes,decodedSourceSizes:Object.fromEntries([...cache].map(([id,e])=>[id,e.decodedBytes])),compactCollections:[...cache].filter(([,e])=>e.bundle.compact).map(([id])=>id),maxEntries:maxCacheEntries,maxRetainedSourceBytes:maxCacheBytes,singleLargeSourceAllowed:true};}});
}
const helpers={REGION_TYPES,numeric,text,point,displayNode,prepareBundle,catalog,facets,validate,matchesPlace,select,amount,query,node,selectedRecords,records,evidence,createPacketJSONParser,createAPI};
if(typeof module==='object'&&module.exports)module.exports=helpers;
if(typeof window==='object')root.PublicPipelineAPI=createAPI();
})();
