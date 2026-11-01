'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const original=Buffer.from('{"records":[{"value":0,"raw_value":"0"},{"value":null,"status":"Withheld"}],"native_field":"kept"}\n');
const packed=zlib.gzipSync(original),sha256=crypto.createHash('sha256').update(original).digest('hex'),logical='/data/evidence/history-test.json';
function fixture({status=200}={}){
 let code=fs.readFileSync(path.join(__dirname,'../worker/index.js'),'utf8');
 code=code.replace('/*PUBLIC_DATA_READ_ONLY*/false','true').replace('/*HISTORICAL_ASSET_MANIFEST*/{}',JSON.stringify({[logical]:{asset:logical+'.gz',bytes:original.length,gzip_bytes:packed.length,sha256}})).replace('export default ','globalThis.worker=');
 const context={Response,Request,URL};vm.createContext(context);vm.runInContext(code,context);
 const requests=[],env={ASSETS:{fetch:async request=>{requests.push(request);return new Response(request.method==='HEAD'?null:packed,{status});}}};
 return{requests,fetch:(method='GET',headers={},url='https://test.invalid'+logical)=>context.worker.fetch(new Request(url,{method,headers}),env)};
}
test('historical transport serves complete lossless source bytes with native JSON type',async()=>{
 const f=fixture(),response=await f.fetch(),body=Buffer.from(await response.arrayBuffer());
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
 assert.equal(response.headers.get('content-encoding'),'gzip');assert.equal(Number(response.headers.get('content-length')),packed.length);
 assert.equal(response.headers.get('x-content-sha256'),sha256);assert.equal(Number(response.headers.get('x-source-bytes')),original.length);
 assert.deepEqual(zlib.gunzipSync(body),original);assert.equal(f.requests[0].url,'https://test.invalid'+logical+'.gz');
});
test('HEAD returns compressed transfer metadata without a body',async()=>{
 const f=fixture(),response=await f.fetch('HEAD');assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,0);
 assert.equal(f.requests[0].method,'HEAD');assert.equal(Number(response.headers.get('content-length')),packed.length);
});
test('conditional cache reads use source identity and never forward partial-read headers',async()=>{
 const f=fixture(),cached=await f.fetch('GET',{'If-None-Match':'"'+sha256+'"'});assert.equal(cached.status,304);assert.equal(f.requests.length,0);
 const read=await f.fetch('GET',{'If-None-Match':'"older"',Range:'bytes=0-9'});assert.equal(read.status,200);
 assert.equal(f.requests[0].headers.has('Range'),false);assert.equal(f.requests[0].headers.has('If-None-Match'),false);
 assert.deepEqual(zlib.gunzipSync(Buffer.from(await read.arrayBuffer())),original);
});
test('unknown histories, write requests and missing stored assets fail explicitly',async()=>{
 const f=fixture();assert.equal((await f.fetch('POST')).status,405);assert.equal(f.requests.length,0);
 assert.equal((await f.fetch('GET',{},'https://test.invalid/data/evidence/history-unknown.json')).status,404);
 const missing=fixture({status:404});assert.equal((await missing.fetch()).status,503);
});
