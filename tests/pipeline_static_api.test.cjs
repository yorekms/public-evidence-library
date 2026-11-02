'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const P=require('../public-source/workbench/pipeline-static-api.js');
const PUBLIC=path.resolve(__dirname,'../public-source'),hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
function close(a,e,label=''){if(e===null||typeof e!=='number')return assert.deepEqual(a,e,label);assert.equal(typeof a,'number',label);assert.ok(Math.abs(a-e)<=Math.max(1e-8,Math.abs(e)*1e-12),`${label}: ${a} != ${e}`);}
function fields(actual,expected,label){for(const[k,v]of Object.entries(expected)){if(typeof v==='number')close(actual[k],v,label+'.'+k);else assert.deepEqual(actual[k],v,label+'.'+k);}}
function queryMatches(actual,expected,label){
 for(const k of['collection','year','metric','counts','additive','records_count','reference_only','bundle_sha256','fingerprint','time_semantics','geographic_scope','regional_reference_counts'])assert.deepEqual(actual[k],expected[k],label+'.'+k);
 close(actual.total,expected.total,label+'.total');actual.fixed_width_domain.forEach((v,i)=>close(v,expected.fixed_width_domain[i],label+'.domain'));
 assert.equal(actual.trend.length,expected.trend.length);actual.trend.forEach((v,i)=>fields(v,expected.trend[i],label+'.trend'));
 assert.equal(hash(actual.nodes.map(n=>n.id).sort()),expected.node_ids_sha256,label+'.nodes');
 for(const sample of expected.node_samples)fields(actual.nodes.find(n=>n.id===sample.id),sample,label+'.node sample');
 assert.equal(hash(actual.links.map(l=>[l.from_id,l.to_id,l.evidence_type,l.source_records,l.measured_records,l.missing_records,l.source_ids,l.sectors])),expected.links_shape_sha256,label+'.links');
 for(const sample of expected.link_samples)fields(actual.links.find(l=>l.id===sample.id),sample,label+'.link sample');
 assert.deepEqual(actual.sources.map(s=>s.id),expected.source_ids,label+'.sources');
 assert.equal(hash(actual.table.map(r=>r.id)),expected.table_ids_sha256,label+'.table');
 for(const sample of expected.table_samples)fields(actual.table.find(r=>r.id===sample.id),sample,label+'.table sample');
}
function nodeMatches(actual,expected,label){
 for(const k of['collection','year','metric','bundle_sha256','record_count','node'])assert.deepEqual(actual[k],expected[k],label+'.'+k);
 assert.equal(actual.history.length,expected.history.length);actual.history.forEach((v,i)=>fields(v,expected.history[i],label+'.history'));
 assert.equal(actual.edges.length,expected.edges_count);assert.equal(hash(actual.edges.map(e=>e.id)),expected.edge_ids_sha256);
 assert.equal(hash(actual.records.map(r=>r.id)),expected.record_ids_sha256);
 for(const sample of expected.record_samples)assert.deepEqual(actual.records.find(r=>r.id===sample.id),sample,label+'.source record');
 assert.deepEqual(actual.sources.map(s=>s.id),expected.source_ids);
}
function apiForFiles(extra={}){return P.createAPI({crypto:crypto.webcrypto,fetch:async url=>{const target=path.resolve(PUBLIC,'.'+new URL(url,'https://example.test').pathname);assert.ok(target.startsWith(PUBLIC+path.sep));try{return new Response(await fs.readFile(target));}catch{return new Response('',{status:404});}},...extra});}

test('original Python source oracle matches all 11 retained collections',async t=>{
 const fixture=JSON.parse(await fs.readFile(path.join(__dirname,'fixtures/pipeline_parity.json'),'utf8')),api=apiForFiles(),catalog=await api.request('/api/pipelines/catalog');
 assert.deepEqual(catalog,fixture.catalog);
 for(const collection of fixture.collections){await t.test(collection.id,async()=>{
  const started=Date.now(),facets=await api.request('/api/pipelines/facets?collection='+collection.id);
  for(const [key,expected]of Object.entries(collection.facets)){assert.equal(facets[key].length,expected.count,key+'.count');assert.equal(hash(facets[key]),expected.sha256,key+'.hash');}
  const baseline=await api.request('/api/pipelines/query',collection.default_query.payload);queryMatches(baseline,collection.default_query.expected,collection.id+'.default');
  for(const q of fixture.queries.filter(q=>q.payload.collection===collection.id))queryMatches(await api.request('/api/pipelines/query',q.payload),q.expected,q.name);
  for(const n of fixture.nodes.filter(n=>n.payload.collection===collection.id))nodeMatches(await api.request('/api/pipelines/node',n.payload),n.expected,n.name);
  t.diagnostic(JSON.stringify({collection:collection.id,elapsed_ms:Date.now()-started,rss_bytes:process.memoryUsage().rss,cache:api.cacheInfo()}));
 });}
 for(const c of fixture.amount_cases)assert.equal(P.amount(c.edge,c.metric),c.expected,c.name);
 for(const c of fixture.helper_cases.numeric)assert.equal(P.numeric(c.value),c.expected);
 for(const c of fixture.helper_cases.point)assert.deepEqual(P.point(c.node),c.expected);
 for(const c of fixture.helper_cases.display_node)assert.deepEqual(P.displayNode(c.node,c.year),c.expected);
 for(const c of fixture.helper_cases.amount)assert.equal(P.amount(c.edge,c.metric),c.expected);
 for(const c of fixture.invalid_payloads)await assert.rejects(api.request('/api/pipelines/query',c.payload),{message:c.expected_error});
 api.clearCache();assert.equal(api.cacheInfo().collections.length,0);
});

function synthetic(){
 const bundle={schema:'ridgeway.pipeline/v1',id:'synthetic',title:'SYNTHETIC source-semantics fixture',years:['2020','2022'],default_year:'2022',default_metric:'q',metrics:[{id:'q',label:'Synthetic native amount',unit:'native tonnes',field:'quantity',additive:true}],sources:[{id:'source',title:'SYNTHETIC source'}],nodes:[{id:'a',type:'facility',label:'A',state:'VA',lon:0,lat:0,record_ids:['global-record-must-not-leak']},{id:'b',type:'chemical_category',label:'B',record_ids:['global-record-must-not-leak']}],edges:[{id:'zero',from_id:'a',to_id:'b',year:'2020',source_id:'source',quantity:0,unit:'native tonnes',eligible:true,evidence_type:'reported',record_ids:['r0'],extra_native_fields:{preserve:['zero','raw']}},{id:'missing',from_id:'a',to_id:'b',year:'2022',source_id:'source',quantity:null,unit:'native tonnes',evidence_type:'reported',record_ids:['r2'],raw_value:'W',extra_native_fields:{preserve:'withheld'}},{id:'negative',from_id:'a',to_id:'b',year:'2022',source_id:'source',quantity:-7,unit:'native tonnes',eligible:true,evidence_type:'accounting',record_ids:['r3']}],records:[{id:'r0',original:0},{id:'r2',original:'W'},{id:'r3',original:-7},{id:'global-record-must-not-leak',original:'unselected shared-node record'}]};
 const original=zlib.gzipSync(Buffer.from(JSON.stringify(bundle))),transfer=zlib.gzipSync(original),split=Math.floor(transfer.length/2),parts=[transfer.subarray(0,split),transfer.subarray(split)],manifestBytes=Buffer.from(JSON.stringify({schema:'ridgeway.pipelines/v1',collections:[{id:'synthetic',file:'synthetic.json.gz',sha256:hash(original)}]})),manifestTransfer=zlib.gzipSync(manifestBytes),urls=new Map();
 const file=(name,originalBytes,stored,packaging,chunks)=>({original_path:'data/pipelines/'+name,filename:name,original_bytes:originalBytes.length,original_sha256:hash(originalBytes),transfer_encoding:packaging,stored_bytes:stored.length,stored_sha256:hash(stored),chunks:chunks.map(([url,bytes])=>{urls.set(url,bytes);return{url,bytes:bytes.length,sha256:hash(bytes)};})});
 const files=[file('manifest.json',manifestBytes,manifestTransfer,'gzip',[['/full-data/support/pipelines/manifest.json.transfer.gz',manifestTransfer]]),file('synthetic.json.gz',original,transfer,'gzip',parts.map((bytes,i)=>['/full-data/support/pipelines/synthetic.json.gz.part-000'+i,bytes]))];
 urls.set('/full-data/support/support-index.json',Buffer.from(JSON.stringify({files})));
 return{bundle,urls,fetch:async url=>urls.has(url)?new Response(urls.get(url)):new Response('',{status:404})};
}

test('multipart integrity, transfer gzip and original gzip are separate verified layers',async()=>{
 const s=synthetic(),api=P.createAPI({crypto:crypto.webcrypto,fetch:s.fetch,compactThresholdBytes:0}),b=P.prepareBundle(s.bundle,'synthetic');
 const result=await api.request('/api/pipelines/query',{collection:'synthetic',year:'2020'});assert.equal(result.total,0);assert.equal(result.links[0].value,0);assert.equal(result.counts.missing,0);assert.equal(result.records_count,4);
 const missing=await api.request('/api/pipelines/query',{collection:'synthetic',year:'2022'});assert.equal(missing.total,-7);assert.equal(missing.counts.missing,1);assert.equal(missing.links.find(l=>l.evidence_type==='reported').value,null);
 const proof={fingerprint:result.fingerprint,bundleSha256:result.bundle_sha256};
 assert.deepEqual(await api.request('/api/pipelines/evidence',{collection:'synthetic',year:'2022'}),P.evidence(b,{collection:'synthetic',year:'2022'},proof));
 assert.deepEqual(await api.request('/api/pipelines/node',{collection:'synthetic',year:'2022',node_id:'b'}),P.node(b,{collection:'synthetic',year:'2022',node_id:'b'},proof));
 assert.deepEqual(await api.request('/api/pipelines/records?collection=synthetic&limit=1&offset=1'),P.records(b,{collection:'synthetic',limit:'1',offset:'1'}));
 const selected=await api.request('/api/pipelines/evidence',{collection:'synthetic',year:'2022'});assert.equal(selected.edges[0].extra_native_fields.preserve,'withheld');assert.ok(!selected.records.some(r=>r.id==='global-record-must-not-leak'));
});

test('fingerprint mismatch rejects the source and never caches a partial bundle',async()=>{
 const s=synthetic(),url=[...s.urls.keys()].find(x=>x.includes('synthetic.json.gz.part'));s.urls.set(url,Buffer.from('corrupt'));
 const api=P.createAPI({crypto:crypto.webcrypto,fetch:s.fetch});await assert.rejects(api.request('/api/pipelines/query',{collection:'synthetic'}),/fingerprint\/length/);assert.deepEqual(api.cacheInfo().collections,[]);
});

test('one cancelled subscriber cannot cancel a second active request',async()=>{
 const s=synthetic(),api=P.createAPI({crypto:crypto.webcrypto,fetch:async(url,options)=>{if(url.includes('synthetic.json.gz'))await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,20);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(Error('cancelled'),{name:'AbortError'}));},{once:true});});return s.fetch(url);}});
 await api.request('/api/pipelines/catalog');const a=new AbortController(),first=api.request('/api/pipelines/query',{collection:'synthetic'},a.signal),second=api.request('/api/pipelines/query',{collection:'synthetic'});a.abort();await assert.rejects(first,{name:'AbortError'});assert.equal((await second).total,-7);
});

test('an already-cancelled request performs no source download',async()=>{let calls=0;const api=P.createAPI({crypto:crypto.webcrypto,fetch:async()=>{calls++;throw Error('unexpected');}}),signal=AbortSignal.abort();await assert.rejects(api.request('/api/pipelines/catalog',null,signal),{name:'AbortError'});assert.equal(calls,0);});

test('incremental parser preserves Unicode/escaping, prototypes and arbitrary boundaries',()=>{
 const original={schema:'test',nodes:[{id:'n',label:'A \\" quote 😀 café',properties:{'__proto__':'literal'}}],records:[0,false,null,'x\\y\nz',{id:'last',raw:'W'}],metadata:{array:[1,2]}};Object.defineProperty(original.metadata,'__proto__',{enumerable:true,value:'literal-safe'});const encoded=JSON.stringify(original);
 for(const width of[1,2,3,7,64]){const p=P.createPacketJSONParser();for(let i=0;i<encoded.length;i+=width)p.feed(encoded.slice(i,i+width));assert.deepEqual(p.feed('',true),JSON.parse(encoded));}
 for(const invalid of['{"records":[1,]}','{"records":[NaN]}','{"records":[1]','{"a":true,}','{"a":1} extra'])assert.throws(()=>P.createPacketJSONParser().feed(invalid,true));
});
