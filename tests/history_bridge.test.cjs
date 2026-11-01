'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../public-source/workbench/static-api.js'),'utf8');
function fixture(overrides={}){
 const original={id:'retained::one',dataset_id:'retained',label:'Retained source metadata',rows:2,years:[2000,2002],native_field:'preserved'};
 const added={id:'new::history',dataset_id:'new',label:'Supplementary annual history',rows:2,years:[1990,1991],scope:'world'};
 const records=[{geo_id:'AAA',year:1990,value:0,eligible:true,raw_value:'0',native_symbol:'reported'},{geo_id:'AAA',year:1991,value:null,eligible:false,raw_value:'..',status:'Unavailable'}];
 const catalogue={series:[original],datasets:[{id:'retained',sha256:'retained-fingerprint'}],counts:{series:1,datasets:1,records:2},examples:{retained:true}};
 const index={complete:true,series:{'retained::one':{records:2,parts:[{path:'/full-data/retained.json',records:2}]}}};
 const files={
  '/full-data/catalogue.json.gz':catalogue,
  '/full-data/index.json':index,
  '/data/catalogue.json':{series:[{...original,label:'Summary must not replace original'},added],datasets:[{id:'retained',sha256:'summary'}, {id:'new',sha256:'new-fingerprint'}]},
  '/data/evidence-index.json':{'new::history':'evidence/new-history.json'},
  '/data/evidence/new-history.json':{series:added,dataset:{id:'new',sha256:'new-fingerprint'},records,hosted_scope_note:'Synthetic test history'},
  '/full-data/retained.json':{series_id:original.id,records},
  ...overrides
 };
 const requests=[],context={URL,Map,Set,Number,JSON,Math,Promise,Uint8Array,TextDecoder,Response,Blob,fetch:async url=>{
  requests.push(url);return new Response(JSON.stringify(files[url]??{}),{status:files[url]?200:404});
 }};vm.createContext(context);vm.runInContext(code,context);
 return{api:context.PublicWorkbenchAPI,original,catalogue,index,records,requests};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('original explorer adds new histories while retaining original metadata, index and counts',async()=>{
 const f=fixture(),before=JSON.stringify(f.catalogue),result=await f.api.loadCatalogue();
 assert.equal(JSON.stringify(f.catalogue),before);assert.deepEqual(plain(result.series[0]),f.original);
 assert.equal(result.series.length,2);assert.equal(result.datasets[0].sha256,'retained-fingerprint');
 assert.deepEqual(plain(result.counts),{series:2,datasets:2,records:4});
 assert.deepEqual(plain(await f.api.loadIndex()),f.index);assert.equal((await f.api.loadIndex()).series['new::history'],undefined);
});
test('new history bridge preserves zero, null, source symbols and record fields',async()=>{
 const f=fixture(),result=await f.api.loadSeries('new::history');assert.deepEqual(plain(result.records),f.records);
 assert.equal(result.records[0].value,0);assert.equal(result.records[1].value,null);assert.equal(result.records[1].raw_value,'..');
 assert.equal(await f.api.loadSeries('new::history'),result);assert.equal(f.requests.filter(x=>x==='/data/evidence/new-history.json').length,1);
});
test('retained records still load from their immutable source parts',async()=>{
 const f=fixture(),result=await f.api.loadSeries('retained::one');assert.equal(result.series.native_field,'preserved');
 assert.deepEqual(plain(result.records),f.records);assert.ok(f.requests.includes('/full-data/retained.json'));
 assert.ok(!f.requests.includes('/data/evidence/new-history.json'));
});
test('new history bridge rejects unexpected file paths, identifiers and row counts',async()=>{
 const badPath=fixture({'/data/evidence-index.json':{'new::history':'../private.json'}});
 await assert.rejects(badPath.api.loadSeries('new::history'),/absent/);
 const wrongId=fixture({'/data/evidence/new-history.json':{series:{id:'wrong'},records:[]}});
 await assert.rejects(wrongId.api.loadSeries('new::history'),/identity/);
 const wrongCount=fixture({'/data/evidence/new-history.json':{series:{id:'new::history',rows:5},records:[]}});
 await assert.rejects(wrongCount.api.loadSeries('new::history'),/row count/);
});
