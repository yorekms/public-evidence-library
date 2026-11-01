'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=path.join(root,'public-source'),sceneBuilder=require('../public-source/workbench/static-map-scene.js');
const moduleCode=fs.readFileSync(path.join(source,'world-map-3d.js'),'utf8');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.isConnected=true;this.attributes={};this.value='';this.textContent='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 addEventListener(type,handler){this.listeners[type]=handler;}
 setAttribute(name,value){this.attributes[name]=value;}
}
const geometry={scope:'world',features:[{id:'AAA',name:'Synthetic Alpha',polygons:[[[[0,0],[1,0],[1,1],[0,0]]]],centroid:[.5,.5]},{id:'BBB',name:'Synthetic Beta',polygons:[[[[1,0],[2,0],[2,1],[1,0]]]],centroid:[1.5,.5]}],bounds:[[0,0],[2,1]],provenance:{geometry_sha256:'synthetic-geometry',projection:'Synthetic test plane'}};
function packet(){return{series:{id:'synthetic::annual',dataset_id:'synthetic-dataset',label:'Synthetic annual observations',scope:'world',unit:'synthetic units'},dataset:{id:'synthetic-dataset',sha256:'synthetic-source-fingerprint'},records:[{geo_id:'AAA',geo_name:'Synthetic Alpha',year:2000,value:0,eligible:true,period:'2000 native year',native_extra:'kept'},{geo_id:'BBB',year:2000,value:null,eligible:false,status:'Withheld',raw_value:'(D)'},{geo_id:'AAA',year:2002,value:4,eligible:true,period:'2002 native year'},{geo_id:'BBB',year:2002,value:9,eligible:true}]};}
function fixture({builder=sceneBuilder,rendererFailure=false}={}){
 const renders=[],instances=[],loads=[];
 const document={createElement:tag=>new Element(tag),createTextNode:text=>({nodeType:3,textContent:text})};
 const window={PublicWorkbenchScene:builder,PublicDataMapScene:{mount:(host,options)=>{if(rendererFailure)throw Error('Synthetic renderer failure');const instance={host,options,destroys:0,render:config=>renders.push(config),getRendererInfo:()=>({mode:'webgl'}),destroy(){this.destroys++;}};instances.push(instance);return instance;}}};
 vm.runInNewContext(moduleCode,{window,document,Map,Set,Number,JSON,Math});
 return{api:window.PublicWorldMap3D,host:new Element('section'),renders,instances,loads,loadJSON:async url=>{loads.push(url);return geometry;}};
}
test('3D module preserves source rows, zero and missing flags while filling only absent scope/unit on drawing copies',async()=>{
 const f=fixture(),data=packet(),before=JSON.stringify(data),controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:2000,place:'AAA'}),scene=f.renders[0].scene;
 assert.equal(JSON.stringify(data),before);assert.equal(data.records[0].scope,undefined);assert.equal(data.records[0].unit,undefined);assert.equal(scene.schema,'workbench.map-scene/v1');assert.equal(scene.frames.find(x=>x.year===2000).values.AAA.value,0);assert.equal(scene.frames.find(x=>x.year===2000).values.BBB.value,null);assert.equal(scene.frames.find(x=>x.year===2000).values.BBB.eligible,false);assert.equal(scene.provenance.source_records[0].scope,'world');assert.equal(scene.provenance.source_records[0].unit,'synthetic units');assert.equal(scene.provenance.source_records[0].native_extra,'kept');assert.equal(scene.dataset.sha256,'synthetic-source-fingerprint');assert.deepEqual(f.loads,['/workbench/data/map-geometry/world.json']);controller.destroy();
});
test('all retained calendar frames share one scene and fixed scale; skipped source years stay missing',async()=>{
 const f=fixture(),controller=await f.api.mount({host:f.host,data:packet(),loadJSON:f.loadJSON,year:2000,place:'AAA'}),scene=f.renders[0].scene,scale=JSON.stringify(scene.scale);
 controller.setFrame(2001,'BBB');controller.setFrame(2002,'AAA');assert.equal(f.instances.length,1);assert.equal(f.loads.length,1);assert.equal(f.renders.length,3);assert.ok(f.renders.every(config=>config.scene===scene));assert.equal(JSON.stringify(scene.scale),scale);assert.equal(scene.frames.find(frame=>frame.year===2001).available,false);assert.equal(scene.frames.find(frame=>frame.year===2001).values.AAA.value,null);assert.equal(f.renders[1].year,2001);assert.equal(f.renders[1].focusId,'BBB');assert.equal(f.renders[2].year,2002);assert.equal(f.renders[2].focusId,'AAA');controller.destroy();
});
test('duplicate source country/year rows remain unchanged and are unavailable in 3D rather than aggregated',async()=>{
 const f=fixture(),data=packet();data.records.push({...data.records[0],value:10,period:'Second native record'});const before=JSON.stringify(data),controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:2000,place:'AAA'}),scene=f.renders[0].scene;
 assert.equal(JSON.stringify(data),before);assert.equal(scene.frames.find(frame=>frame.year===2000).values.AAA.value,null);assert.equal(scene.frames.find(frame=>frame.year===2000).values.AAA.eligible,false);assert.equal(scene.frames.find(frame=>frame.year===2000).values.BBB.value,null);assert.equal(JSON.stringify(scene.provenance.ambiguous_country_years),JSON.stringify([['AAA',2000]]));assert.match(scene.provenance.display_note,/no aggregation/i);controller.destroy();
});
test('orbit camera, zoom and focused-place callbacks persist across source-year updates; reset and destroy are bounded',async()=>{
 const f=fixture(),selected=[],controller=await f.api.mount({host:f.host,data:packet(),loadJSON:f.loadJSON,year:2000,place:'AAA',onSelectPlace:id=>selected.push(id)});
 f.instances[0].options.onCameraChange({elevation:70,azimuth:29,height_scale:1.6,zoom:2});controller.setFrame(2002,'BBB');assert.equal(f.renders.at(-1).azimuth,29);assert.equal(f.renders.at(-1).elevation,70);assert.equal(f.renders.at(-1).height_scale,1.6);assert.equal(f.renders.at(-1).zoom,2);f.instances[0].options.onSelectPlace('BBB');assert.deepEqual(selected,['BBB']);controller.zoomBy(100);assert.equal(f.renders.at(-1).zoom,3);controller.zoomBy(.001);assert.equal(f.renders.at(-1).zoom,.5);controller.resetCamera();assert.equal(JSON.stringify(controller.getCamera()),JSON.stringify({elevation:45,azimuth:-60,height_scale:1,zoom:1}));const before=f.renders.length;controller.destroy();controller.destroy();controller.setFrame(2000,'AAA');f.instances[0].options.onSelectPlace('AAA');assert.equal(f.instances[0].destroys,1);assert.equal(f.renders.length,before);assert.deepEqual(selected,['BBB']);assert.equal(f.host.children.length,0);
});
test('a late source-scene build does not mount an obsolete renderer or alter its host',async()=>{
 let release;const delayed=new Promise(resolve=>{release=resolve;});const f=fixture({builder:{build:()=>delayed}});let current=true;const mounting=f.api.mount({host:f.host,data:packet(),loadJSON:f.loadJSON,year:2000,place:'AAA',isCurrent:()=>current});await Promise.resolve();current=false;release({provenance:{}});assert.equal(await mounting,null);assert.equal(f.instances.length,0);assert.equal(f.host.children.length,0);
});
test('pooled source periods, oversized ranges and renderer failures are explicit without source mutation',async()=>{
 const f=fixture(),pooled=packet();pooled.records=pooled.records.map(row=>({...row,year:null,period:'Synthetic pooled period'}));const before=JSON.stringify(pooled);await assert.rejects(f.api.mount({host:f.host,data:pooled,loadJSON:f.loadJSON,year:null,place:'AAA'}),/no unambiguous annual observations/);assert.equal(JSON.stringify(pooled),before);assert.equal(f.loads.length,0);
 const long=packet();long.records[0].year=1900;assert.throws(()=>f.api.sceneInput(long),/80-calendar-year/);const broken=fixture({rendererFailure:true});await assert.rejects(broken.api.mount({host:broken.host,data:packet(),loadJSON:broken.loadJSON,year:2000,place:'AAA'}),/Synthetic renderer failure/);assert.equal(broken.host.children.length,0);
});
test('3D remains opt-in in the shared renderer and every public map consumer explicitly requests it',()=>{
 const shared=fs.readFileSync(path.join(source,'world-maps.js'),'utf8');assert.ok(/enable3D\s*=\s*false/.test(shared),'The shared renderer must require explicit 3D opt-in.');
 for(const name of ['app.js','price-comparisons.js','household-comparisons.js','essentials-comparisons.js']){const code=fs.readFileSync(path.join(source,name),'utf8');assert.ok(/PublicWorldMaps\.render\([\s\S]*?enable3D\s*:\s*true/.test(code),name+' must explicitly enable the original 3D map.');}
 for(const id of ['world-view-3d','world-view-flat','world-3d-host'])assert.ok(shared.includes(id),'Missing existing-panel view control '+id);
});
