const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.className='';this.textContent='';}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
 addEventListener(type,listener){this.listeners[type]=listener;}
 click(){this.listeners.click?.();}
 querySelector(selector){if(selector==='.world-measure-title')return this.title||null;if(selector==='#world-selection p.small')return this.status||null;return null;}
 querySelectorAll(){return[];}
 scrollIntoView(){}
}
function harness(file,extra={}){
 const frames=[],blobs=[],document={createElement:tag=>new Element(tag),body:new Element('body')},window={...extra,PublicWorldMaps:{render:async options=>{frames.push(options);options.root.title=new Element('h2');options.root.status=new Element('p');return Object.fromEntries(options.params);}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),{window,document,URLSearchParams,Blob,URL:{createObjectURL:blob=>(blobs.push(blob),'blob:test'),revokeObjectURL(){}},setTimeout:()=>0,Intl,console});
 return{window,frames,blobs,root:new Element('main'),historyRoot:new Element('section'),globalRoot:new Element('section')};
}
const common={loadJSON:async()=>null,isCurrent:()=>true};
test('PPP timeline keeps export selection and history links on the displayed source year without rebuilding history',async()=>{
 const ids=['wdi::NY.GDP.PCAP.PP.KD','wdi::NY.GDP.MKTP.PP.KD'],packet={schema:'economic-valuation.price-data/v1',base_year:2021,macro_context:{series:ids.map(id=>({id,label:id,unit:'constant 2021 international dollars'})),records:ids.flatMap(id=>[2021,2022].map(year=>({series_id:id,geo_id:'USA',geo_name:'United States',year,value:year})))}};
 const h=harness('price-comparisons.js'),synced=[];let plots=0;
 await h.window.PublicPriceComparisons.render({...common,...h,params:new URLSearchParams({series:ids[0],year:'2021',place:'USA'}),loadJSON:async()=>packet,navigate:()=>assert.fail('timeline must not trigger full navigation'),syncFrame:p=>synced.push(p),plot:()=>plots++});
 const map=h.frames[0];assert.equal(map.enableTimeline,true);map.onFrameChange({series:ids[0],year:'2022',place:'USA'});
 const historyURL=new URL('https://example.test/'+map.historyHrefFor({series:ids[0],year:'2022',place:'USA'}));assert.equal(new URLSearchParams(historyURL.hash.split('?')[1]).get('year'),'2022');
 const download=h.historyRoot.children.flatMap(node=>node.children).find(node=>node.textContent==='Country PPP evidence and sources · JSON');assert.ok(download);download.click();
 const exported=JSON.parse(await h.blobs.at(-1).text());assert.equal(exported.selection.year,'2022');assert.deepEqual(exported.records.map(row=>row.year),[2021,2022]);assert.equal(plots,1);assert.equal(synced.length,1);
});
test('household and essentials timeline frames restore existing country histories and preserve independent navigation settings',async()=>{
 const metric='derived::HFCE_PC_PPP_2021',series=[{id:metric,label:'Household consumption',unit:'constant 2021 international dollars',cross_country_eligible:true}],records=[2021,2022].map(year=>({series_id:metric,geo_id:'USA',year,value:year,status:'published_estimate',...(year===2021?{native_footnote:'2021 only'}:{})})),packet={schema:'household-affordability/v1',series,records,sources:[]},restored=[],navigated=[],synced=[];
 const householdUI={loadPacket:async()=>({data:packet,fingerprint:'source-hash'}),sourceStatus:()=> 'Published estimate',attach:async options=>({capture:()=>options.initialSelection,restore:saved=>restored.push(saved)})};
 const h=harness('household-comparisons.js',{HouseholdAffordabilityUI:householdUI});
 await h.window.PublicHouseholdComparisons.render({...common,...h,params:new URLSearchParams({series:metric,year:'2021',place:'USA',compare:'CHN'}),navigate:p=>navigated.push(p),syncFrame:p=>synced.push(p)});
 const map=h.frames[0];assert.equal(map.enableTimeline,true);map.onFrameChange({series:metric,year:'2022',place:'USA'});assert.equal(restored.at(-1).year,2022);assert.equal(h.root.status.textContent,'Published estimate');assert.equal(h.root.children.some(node=>node.textContent==='2021 only'),false);assert.equal(navigated.length,0);assert.equal(synced.length,1);map.navigate({place:'CAN'});assert.equal(navigated.at(-1).year,'2022');assert.equal(navigated.at(-1).compare,'CHN');
 const globalMetric='fpn::CoHD_PPP',globalPacket={schema:'essentials-costs.global-context/v1',series:[{id:globalMetric,label:'Diet cost',unit:'current PPP dollars per day',cross_country_eligible:true}],records:[2021,2022].map(year=>({series_id:globalMetric,geo_id:'USA',year,value:year,status:'published_estimate'})),sources:[]};let budgetOptions,historyAttached=0;
 const e=harness('essentials-comparisons.js',{HouseholdAffordabilityUI:{...householdUI,attach:async()=>{historyAttached++;return{restore:saved=>restored.push(saved)};}},EssentialsCostsUI:{attach:async options=>(budgetOptions=options,{}),loadPacket:async()=>({data:globalPacket,fingerprint:'global-hash'})}}),params=new URLSearchParams({country:'DEU',year:'2019',classification:'COICOP 2018',income_basis:'net',compare:'FRA',categories:'food,energy',g_series:globalMetric,g_year:'2021',g_place:'USA',g_compare:'CAN'});
 await e.window.PublicEssentialsComparisons.render({...common,...e,params,navigate:p=>navigated.push(p),syncFrame:p=>synced.push(p)});
 const global=e.frames[0];assert.equal(global.enableTimeline,true);global.onFrameChange({series:globalMetric,year:'2022',place:'USA'});assert.equal(restored.at(-1).year,2022);assert.equal(historyAttached,1);assert.equal(e.globalRoot.status.textContent,'Published estimate');
 budgetOptions.onSelectionChange({country:'DEU',year:2020,classification:'COICOP 2018',income_basis:'net',comparison_country:'FRA',selected_categories:['food','energy']});const nav=navigated.at(-1);assert.equal(nav.g_year,'2022');assert.equal(nav.g_series,globalMetric);assert.equal(nav.g_place,'USA');assert.equal(nav.g_compare,'CAN');assert.equal(nav.year,2020);assert.equal(nav.country,'DEU');assert.equal(nav.classification,'COICOP 2018');assert.equal(nav.income_basis,'net');assert.equal(nav.categories,'food,energy');
 const link=new URLSearchParams(global.historyHrefFor({series:globalMetric,place:'USA',year:'2022'}).split('?')[1]);assert.equal(link.get('g_year'),'2022');assert.equal(link.get('year'),'2019');assert.equal(link.get('income_basis'),'net');assert.equal(link.get('g_compare'),'CAN');
});
