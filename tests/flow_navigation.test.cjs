'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../public-source/workbench/static-api.js'),'utf8');
function browser(pathname,stored){
 const location={pathname,href:'https://test.invalid'+pathname,origin:'https://test.invalid',search:''},restored=[];
 const document={getElementById:()=>null,addEventListener:()=>{}},window={location,addEventListener:()=>{}};
 const context={window,document,location,URL,URLSearchParams,Map,Set,JSON,Number,Math,Promise,Uint8Array,TextDecoder,Response,Blob,
  sessionStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
  history:{state:null,replaceState:()=>{},pushState:()=>{}},btoa:v=>Buffer.from(v,'binary').toString('base64'),atob:v=>Buffer.from(v,'base64').toString('binary'),setTimeout,clearTimeout};
 vm.createContext(context);vm.runInContext(code,context);
 return{register:async(capture)=>window.WorkbenchNavigation.register('fixture',{capture:()=>capture,restore:async value=>restored.push(JSON.parse(JSON.stringify(value))),toURL:()=>pathname}),restored};
}
test('flow navigation has its own state and cannot overwrite the retained numerical map selection',async()=>{
 const map={x_series:'historical::coal',view_year:1900,geo_id:'USA'},flow={filters:{collection:'coal_receipts',year:'2023',focus:'VA',direction:'inbound'},node_id:'plant:1',motion:false};
 const stored=new Map([['public-workbench.view.v1',JSON.stringify(map)]]);
 const first=browser('/workbench/pipelines.html',stored);await first.register(flow);
 assert.deepEqual(first.restored,[]);assert.deepEqual(JSON.parse(stored.get('public-workbench.view.v1')),map);assert.deepEqual(JSON.parse(stored.get('public-workbench.flows.v1')),flow);
 const second=browser('/workbench/pipelines.html',stored);await second.register(flow);assert.deepEqual(second.restored,[flow]);
 const numerical=browser('/workbench/',stored);await numerical.register(map);assert.deepEqual(numerical.restored,[map]);assert.deepEqual(JSON.parse(stored.get('public-workbench.flows.v1')),flow);
});
test('flow CSV preserves the complete selected record set, literal zero, unavailable cells and native fields',()=>{
 const {csv}=require('../public-source/workbench/public-pipeline-exports.js'),edges=Array.from({length:1200},(_,i)=>({id:'native-'+i,quantity:i===0?0:i===1?null:i,status:i===1?'Withheld':'Reported',native_note:i===2?'A "quoted", native label':'',record_ids:['source:'+i]}));
 const result=csv(edges);assert.equal(result.trimEnd().split('\r\n').length,1201);assert.match(result,/'?"native-0","0","Reported"/);assert.match(result,/"native-1","","Withheld"/);assert.match(result,/A ""quoted"", native label/);assert.match(result,/native-1199/);
});
test('row-wise evidence JSON keeps all literal source fields and order across encoding chunks',async()=>{
 const {jsonBlob}=require('../public-source/workbench/public-pipeline-exports.js'),source={schema:'test-only',unit:'native µg',edges:Array.from({length:1200},(_,i)=>({id:'source-'+i,value:i===0?0:i===1?null:i,raw:'A "quoted" note\n'+('µ'.repeat(350)),source_fields:{native_id:i}})),records:[{flag:'Withheld',eligible:false}],missing:null};
 assert.deepEqual(JSON.parse(await(await jsonBlob(source)).text()),source);
});
