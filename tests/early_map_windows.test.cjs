'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sceneBuilder=require('../public-source/workbench/static-map-scene.js');
const wrapper=fs.readFileSync(path.join(__dirname,'../public-source/world-map-3d.js'),'utf8');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.isConnected=true;this.attributes={};this.value='';this.textContent='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 addEventListener(type,handler){this.listeners[type]=handler;}
 setAttribute(name,value){this.attributes[name]=value;}
}
const geometry={scope:'world',features:[{id:'AAA',name:'Synthetic Alpha',polygons:[[[[0,0],[1,0],[1,1],[0,0]]]],centroid:[.5,.5]},{id:'BBB',name:'Synthetic Beta',polygons:[[[[1,0],[2,0],[2,1],[1,0]]]],centroid:[1.5,.5]}],bounds:[[0,0],[2,1]],provenance:{geometry_sha256:'synthetic-early-boundaries',projection:'Synthetic test plane'}};
function packet(records){return{series:{id:'synthetic::long-history',dataset_id:'synthetic-early-source',label:'Synthetic early history',scope:'world',unit:'native units'},dataset:{id:'synthetic-early-source',sha256:'synthetic-source-fingerprint'},records};}
function fixture(builder=sceneBuilder){
 const renders=[],instances=[],loads=[];
 const document={createElement:tag=>new Element(tag),createTextNode:text=>({nodeType:3,textContent:text})};
 const window={PublicWorkbenchScene:builder,PublicDataMapScene:{mount:(host,options)=>{const instance={host,options,destroys:0,render:config=>renders.push(config),getRendererInfo:()=>({mode:'webgl'}),destroy(){this.destroys++;}};instances.push(instance);return instance;}}};
 vm.runInNewContext(wrapper,{window,document,Map,Set,Number,JSON,Math});
 return{api:window.PublicWorldMap3D,host:new Element('section'),renders,instances,loads,loadJSON:async url=>{loads.push(url);return geometry;}};
}
const same=(actual,expected)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected));
function deferredBuilder(){
 const jobs=new Map(),calls=[];
 return{jobs,calls,build(options){const start=options.payload.start_year;calls.push(start);if(start===1900)return sceneBuilder.build(options);return new Promise((resolve,reject)=>jobs.set(start,{release:()=>sceneBuilder.build(options).then(resolve,reject)}));}};
}

test('125-year histories retain zero, missing flags and native rows with one signed scale across bounded scenes',async()=>{
 const data=packet([{geo_id:'AAA',year:1900,value:0,native_flag:'Published zero'},{geo_id:'AAA',year:1901,value:500,period:'first native row'},{geo_id:'AAA',year:1901,value:900,period:'second native row'},{geo_id:'BBB',year:1950,value:-50},{geo_id:'AAA',year:2024,value:20},{geo_id:'BBB',year:2023,value:100000,eligible:false,status:'Source ineligible'},{geo_id:'UNMAPPED',year:1900,value:9000000}]),before=JSON.stringify(data);
 const f=fixture(),controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:2024,place:'AAA'}),recent=f.renders.at(-1).scene;
 assert.ok(recent.frames.length<=80);same(recent.scale.color_domain,[-50,0,50]);same(recent.scale.locked_years,[1900,2024]);assert.equal(recent.scale.data_min,-50);assert.equal(recent.scale.data_max,20);assert.equal(recent.scale.max_abs,50);
 await controller.setFrame(1900,'AAA');const early=f.renders.at(-1).scene;
 assert.ok(early.frames.length<=80);assert.equal(early.frames.find(x=>x.year===1900).values.AAA.value,0);assert.equal(early.frames.find(x=>x.year===1901).values.AAA.eligible,false);assert.equal(early.frames.find(x=>x.year===1901).values.AAA.value,null);assert.equal(early.frames.find(x=>x.year===1902).available,false);same(early.scale,recent.scale);same(early.provenance.full_history_years,[1900,2024]);same(early.provenance.ambiguous_country_years,[['AAA',1901]]);assert.equal(JSON.stringify(data),before);assert.equal(f.instances.length,1);controller.destroy();
});

test('returning between early and recent windows reuses a mounted renderer and retains the chosen camera',async()=>{
 const calls=[],builder={build:options=>(calls.push(options.payload.start_year),sceneBuilder.build(options))};
 const f=fixture(builder),data=packet([{geo_id:'AAA',year:1900,value:100},{geo_id:'AAA',year:1980,value:1},{geo_id:'AAA',year:2060,value:30}]),controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:1900});
 same(controller.getCamera(),{elevation:80,azimuth:-90,height_scale:1,zoom:1});
 f.instances[0].options.onCameraChange({elevation:61,azimuth:-120,height_scale:1.3,zoom:1.4});
 await controller.setFrame(1980,'BBB');await controller.setFrame(1900,'AAA');same(calls,[1900,1980]);assert.equal(f.renders.at(-1).year,1900);assert.equal(f.renders.at(-1).elevation,61);assert.equal(f.renders.at(-1).azimuth,-120);assert.equal(f.renders.at(-1).height_scale,1.3);assert.equal(f.renders.at(-1).zoom,1.4);assert.equal(f.renders.at(-1).focusId,'AAA');assert.equal(f.instances.length,1);assert.equal(f.loads.length,1);controller.resetCamera();same(controller.getCamera(),{elevation:80,azimuth:-90,height_scale:1,zoom:1});controller.destroy();
});

test('a slower obsolete window cannot repaint over the latest scrubbed year or selected country',async()=>{
 const builder=deferredBuilder(),f=fixture(builder),data=packet([{geo_id:'AAA',year:1900,value:100},{geo_id:'AAA',year:1980,value:1},{geo_id:'BBB',year:2060,value:30}]);
 const controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:1900}),old=controller.setFrame(1980,'AAA'),latest=controller.setFrame(2060,'BBB');
 assert.equal(f.renders.at(-1).year,1900);assert.match(f.host.children.at(-1).textContent,/Loading.*2060/);
 builder.jobs.get(2060).release();await latest;assert.equal(f.renders.at(-1).year,2060);assert.equal(f.renders.at(-1).focusId,'BBB');const count=f.renders.length;
 builder.jobs.get(1980).release();await old;assert.equal(f.renders.length,count);assert.equal(f.renders.at(-1).year,2060);assert.equal(f.host.children.at(-1).textContent,'');controller.destroy();
});

test('destroying while an old window loads prevents late renders and callbacks',async()=>{
 const builder=deferredBuilder(),f=fixture(builder),selected=[],data=packet([{geo_id:'AAA',year:1900,value:100},{geo_id:'AAA',year:1980,value:1}]);
 const controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:1900,onSelectPlace:id=>selected.push(id)}),waiting=controller.setFrame(1980,'AAA'),count=f.renders.length;
 controller.destroy();controller.destroy();builder.jobs.get(1980).release();await waiting;f.instances[0].options.onSelectPlace('AAA');await controller.setFrame(1900,'AAA');assert.equal(f.renders.length,count);assert.equal(f.instances[0].destroys,1);assert.equal(f.host.children.length,0);same(selected,[]);
});

test('an all-missing middle window draws unavailable cells with exact native flags and no injected source observations',async()=>{
 const middle=[{geo_id:'BBB',year:1980,value:null,eligible:false,status:'Not reported',raw_value:'..',native_flag:'M'},{geo_id:'AAA',year:1981,value:123,eligible:false,status:'Excluded by source',raw_value:'S',low:120,high:125},{geo_id:'UNMAPPED',year:1982,value:9000,eligible:true,status:'Native economy without polygon'}];
 const data=packet([{geo_id:'AAA',year:1900,value:100},...middle,{geo_id:'AAA',year:2060,value:200}]),before=JSON.stringify(data),f=fixture(),controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:1900}),initial=f.renders.at(-1).scene;
 await controller.setFrame(1980,'BBB');const missing=f.renders.at(-1).scene;
 assert.equal(f.renders.at(-1).year,1980);assert.equal(f.host.children.at(-1).textContent,'');assert.equal(missing.provenance.all_missing_window,true);same(missing.scale,initial.scale);assert.equal(missing.frames.length,80);assert.ok(missing.frames.every(frame=>frame.numeric_count===0&&frame.missing_count===geometry.features.length));assert.ok(missing.frames.every(frame=>Object.values(frame.values).every(row=>row.eligible===false||row.value===null)));
 const withheld=missing.frames.find(frame=>frame.year===1980).values.BBB;assert.equal(withheld.value,null);assert.equal(withheld.eligible,false);assert.equal(withheld.status,'Not reported');const excluded=missing.frames.find(frame=>frame.year===1981).values.AAA;assert.equal(excluded.value,123);assert.equal(excluded.eligible,false);assert.equal(excluded.low,120);assert.equal(excluded.high,125);assert.equal(missing.frames.find(frame=>frame.year===1983).available,false);
 assert.equal(missing.provenance.source_records.length,middle.length);same(missing.provenance.source_records.map(row=>row.year),[1980,1981,1982]);assert.equal(missing.provenance.source_records[0].raw_value,'..');assert.equal(missing.provenance.source_records[0].native_flag,'M');assert.equal(missing.provenance.table_only_records,1);assert.equal(missing.provenance.selected_record_sha256,await sceneBuilder.sha256(sceneBuilder.canonical(missing.provenance.source_records)));
 await controller.setFrame(2060,'AAA');assert.equal(f.renders.at(-1).year,2060);assert.equal(f.renders.at(-1).scene.frames.find(frame=>frame.year===2060).values.AAA.value,200);assert.equal(f.host.children.at(-1).textContent,'');assert.equal(JSON.stringify(data),before);controller.destroy();
});

test('an initially all-missing early window mounts without borrowing the template year as a source observation',async()=>{
 const early=[{geo_id:'BBB',year:1900,value:null,eligible:false,status:'Withheld',raw_value:'(D)'},{geo_id:'AAA',year:1901,value:999,eligible:false,status:'Ineligible by source'},{geo_id:'UNMAPPED',year:1902,value:888,eligible:true}];
 const data=packet([...early,{geo_id:'AAA',year:2024,value:5,status:'Published'}]),before=JSON.stringify(data),f=fixture(),controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:1900,place:'BBB'}),missing=f.renders.at(-1).scene;
 assert.ok(controller);assert.equal(f.instances.length,1);assert.equal(f.renders.at(-1).year,1900);assert.equal(f.host.children.at(-1).textContent,'');assert.equal(missing.provenance.all_missing_window,true);assert.equal(missing.frames.length,80);same(missing.years,[...Array(80)].map((_,i)=>1900+i));same(missing.provenance.source_records.map(row=>row.year),[1900,1901,1902]);assert.ok(missing.provenance.source_records.every(row=>row.year!==2024));assert.equal(missing.provenance.source_records[0].raw_value,'(D)');assert.ok(missing.frames.every(frame=>frame.numeric_count===0));same(missing.scale.locked_years,[1900,2024]);same(missing.scale.color_domain,[0,5]);
 await controller.setFrame(2024,'AAA');const recent=f.renders.at(-1).scene;assert.equal(recent.frames.find(frame=>frame.year===2024).values.AAA.value,5);same(recent.scale,missing.scale);assert.equal(f.host.children.at(-1).textContent,'');assert.equal(JSON.stringify(data),before);controller.destroy();
});

test('unrelated window errors stay visible and do not trigger an invented all-missing fallback',async()=>{
 const builder={...sceneBuilder,build:options=>options.payload.start_year===1980?Promise.reject(Error('Synthetic window build unavailable')):sceneBuilder.build(options)},f=fixture(builder),data=packet([{geo_id:'AAA',year:1900,value:100},{geo_id:'BBB',year:1980,value:1},{geo_id:'AAA',year:2060,value:200}]),controller=await f.api.mount({host:f.host,data,loadJSON:f.loadJSON,year:1900}),count=f.renders.length;
 await controller.setFrame(1980,'BBB');assert.equal(f.renders.length,count);assert.match(f.host.children.at(-1).textContent,/could not load.*Synthetic window build unavailable/);assert.match(f.host.children.at(-1).textContent,/complete source rows remain available/);
 await controller.setFrame(2060,'AAA');assert.equal(f.renders.at(-1).year,2060);assert.equal(f.host.children.at(-1).textContent,'');controller.destroy();
});
