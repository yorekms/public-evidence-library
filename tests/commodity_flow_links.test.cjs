'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const links=require('../public-source/commodity-flow-links.js');

test('explicit coal commodities and whole-word source labels expose the retained coal collection',()=>{
 for(const series of [{commodity:'Coal',label:'Production'},{commodity:'Bituminous coal',label:'Annual quantity'},{label:'Coal production · latest available year by country'},{label:'Coal-fired electricity generation'}]){
  const result=links.relatedFlow(series);assert.equal(result.collection,'trade_coal');assert.match(result.label,/related coal flows/i);assert.match(result.caption,/Separate source coverage/);
 }
});

test('rare-earth spelling variants point to related compounds with an explicit product-coverage distinction',()=>{
 for(const text of ['Rare Earths','Rare-earth oxide equivalent','rare–earth mine production','rare earth reserves']){
  const result=links.relatedFlow({commodity:text});assert.equal(result.collection,'trade_rare_earths');assert.match(result.label,/Related rare-earth-compound exports/);assert.match(result.coverage,/own product definition and production stage/);
 }
});

test('word boundaries and restricted source fields avoid unrelated matches',()=>{
 for(const series of [{label:'Charcoal production'},{label:'Political coalitions'},{label:'Coalescence rate'},{label:'Rare earthworm populations'},{label:'rare earthsupply index'},{commodity:'Ammonia, anhydrous'},{label:'Nickel · Ammoniacial liquor precipitate'},{id:'coal-source',label:'Wheat',unit:'coal equivalent',description:'Related rare-earth source metadata'},{label:'Oil',source_url:'https://example.test/coal'},null,{}, {label:123}])assert.equal(links.relatedFlow(series),null,JSON.stringify(series));
});

test('declared commodity takes precedence and no map year, geography or quantity enters the related-source URL',()=>{
 const series={commodity:'Rare earths',label:'Rare earths in coal-bearing deposits',year:1859,place:'ARG',records:[{value:123}]},before=JSON.stringify(series),result=links.relatedFlow(series),url=new URL(result.href,'https://library.example');
 assert.equal(result.collection,'trade_rare_earths');assert.deepEqual([...url.searchParams.keys()],['collection']);assert.equal(url.searchParams.has('year'),false);assert.equal(url.searchParams.has('focus'),false);assert.equal(JSON.stringify(series),before);
});

test('the displayed retained period and collection identifiers agree with the actual frozen pipeline manifest',()=>{
 const file=path.join(__dirname,'../public-source/full-data/support/pipelines/manifest.json.transfer.gz');
 const manifest=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
 for(const series of [{commodity:'Coal'},{commodity:'Rare earths'}]){
  const related=links.relatedFlow(series),collection=manifest.collections.find(item=>item.id===related.collection);assert.ok(collection);assert.deepEqual(collection.years,['2024']);assert.match(related.coverage,/retained period 2024/);
 }
});

test('the contextual entry opens in the same tab and remains absent for unsupported commodities',()=>{
 const make=(tag,cls,text)=>({tag,className:cls,textContent:text,children:[],attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(name,value){this.attributes[name]=value;}});
 const box=links.entry({commodity:'Coal'},make);assert.equal(box.className,'world-flow-entry');assert.equal(box.children[0].tag,'a');assert.equal(box.children[0].target,undefined);assert.equal(box.children[0].href,'/workbench/pipelines.html?collection=trade_coal');assert.match(box.children[1].textContent,/Separate source coverage; choose an available period/);assert.equal(links.entry({commodity:'Wheat'},make),null);
});
