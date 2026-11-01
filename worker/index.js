/* Full public sources live in immutable R2 objects; existing public assets stay separate. */
const SOURCES=/*PUBLIC_DATA_MANIFEST*/{};
const READ_ONLY=/*PUBLIC_DATA_READ_ONLY*/false;
const HISTORIES=/*HISTORICAL_ASSET_MANIFEST*/{};
const MAX_BYTES=20000000;
function answer(message,status=200,headers={}){return new Response(JSON.stringify({message}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
function equal(left,right){if(typeof left!=='string'||typeof right!=='string')return false;let difference=left.length^right.length;for(let i=0;i<Math.max(left.length,right.length);i++)difference|=(left.charCodeAt(i)||0)^(right.charCodeAt(i)||0);return difference===0;}
function source(path){return Object.prototype.hasOwnProperty.call(SOURCES,path)?SOURCES[path]:null;}
function key(info){return 'sha256/'+info.sha256;}
function contentType(path){return path.endsWith('.json')?'application/json; charset=utf-8':path.endsWith('.tsv')?'text/tab-separated-values; charset=utf-8':path.endsWith('.txt')||path.endsWith('.md')?'text/plain; charset=utf-8':path.endsWith('.gz')?'application/gzip':'application/octet-stream';}
function matches(object,info){return Boolean(object)&&object.size===info.bytes&&object.customMetadata?.sha256===info.sha256;}
async function ingest(request,env,path){
 if(READ_ONLY||!env.PUBLIC_DATA_INGEST_TOKEN)return answer('Not found.',404);
 if(!equal(request.headers.get('X-Public-Data-Ingest-Token'),env.PUBLIC_DATA_INGEST_TOKEN))return answer('Unauthorized.',401);
 if(request.method!=='PUT')return answer('Method not allowed.',405,{Allow:'PUT'});
 const logical=path.slice('/__data_ingest'.length),info=source(logical);if(!info)return answer('Unknown public source path.',404);
 const checksum=request.headers.get('X-Content-SHA256')||'',length=request.headers.get('Content-Length')||'';
 if(!/^[a-fA-F0-9]{64}$/.test(checksum)||checksum.toLowerCase()!==info.sha256)return answer('Source checksum must match the published source manifest.',400);
 if(!/^\d+$/.test(length)||Number(length)!==info.bytes||Number(length)>MAX_BYTES)return answer('Source length must match the bounded published source manifest.',400);
 const existing=await env.BUCKET.head(key(info));if(existing){if(matches(existing,info))return new Response(JSON.stringify({status:'already-present',path:logical,bytes:info.bytes,sha256:info.sha256}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-SHA256':info.sha256}});return answer('An incompatible immutable source object already exists.',409);}
 const stored=await env.BUCKET.put(key(info),request.body,{sha256:info.sha256,onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:info.sha256,bytes:String(info.bytes)},httpMetadata:{contentType:'application/octet-stream'}});
 if(!stored){const concurrent=await env.BUCKET.head(key(info));if(!matches(concurrent,info))return answer('A concurrent immutable upload could not be verified.',409);}
 else if(!matches(stored,info))return answer('Stored source metadata differs from the published source manifest.',500);
 return new Response(JSON.stringify({status:'stored',path:logical,bytes:info.bytes,sha256:info.sha256}),{status:201,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-SHA256':info.sha256}});
}
async function publicSource(request,env,path){
 if(!['GET','HEAD'].includes(request.method))return answer('Method not allowed.',405,{Allow:'GET, HEAD'});
 const info=source(path);if(!info)return answer('Public source not found.',404);
 const object=request.method==='HEAD'?await env.BUCKET.head(key(info)):await env.BUCKET.get(key(info));
 if(!object)return answer('This retained public source has not yet been published.',404);
 if(!matches(object,info))return answer('The retained public source could not be verified.',503);
 const headers={'Content-Type':contentType(path),'Content-Length':String(info.bytes),'X-Content-SHA256':info.sha256,ETag:'"'+info.sha256+'"','Cache-Control':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff'};
 if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
 return new Response(request.method==='HEAD'?null:object.body,{headers});
}
async function historicalSource(request,env,path){
 if(!['GET','HEAD'].includes(request.method))return answer('Method not allowed.',405,{Allow:'GET, HEAD'});
 const info=HISTORIES[path];if(!info)return answer('Historical source not found.',404);
 const etag='"'+info.sha256+'"';
 if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':'public, max-age=0, must-revalidate'}});
 const url=new URL(request.url);url.pathname=info.asset;
 const asset=await env.ASSETS.fetch(new Request(url,{method:request.method,headers:{'Accept-Encoding':'identity'}}));
 if(!asset.ok)return answer('Historical source asset could not be loaded.',503);
 // The stored asset is lossless transport gzip. Browsers decode it before
 // JSON parsing; the checksum identifies the complete original JSON bytes.
 const headers={'Content-Type':'application/json; charset=utf-8','Content-Encoding':'gzip','Content-Length':String(info.gzip_bytes),'X-Content-SHA256':info.sha256,'X-Source-Bytes':String(info.bytes),ETag:etag,'Cache-Control':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff'};
 return new Response(request.method==='HEAD'?null:asset.body,{headers,encodeBody:'manual'});
}
export default {async fetch(request,env){try{const path=new URL(request.url).pathname;if(path.startsWith('/__data_ingest/'))return await ingest(request,env,path);if(path.startsWith('/full-data/'))return await publicSource(request,env,path);if(path.startsWith('/data/evidence/history-'))return await historicalSource(request,env,path);return env.ASSETS?await env.ASSETS.fetch(request):answer('The public asset binding is unavailable.',503);}catch{return answer('Public source storage is temporarily unavailable.',503);}}};
