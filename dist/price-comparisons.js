/* Published national PPP comparisons. Source values are not deflated or converted again. */
(() => {
'use strict';
const IDS=['wdi::NY.GDP.PCAP.PP.KD','wdi::NY.GDP.MKTP.PP.KD'];
const finite=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
const numeric=row=>finite(row?.value)&&row.eligible!==false;
const format=value=>finite(value)?new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(Number(value)):'Unavailable';
function preparePPP(packet){
 if(packet?.schema!=='economic-valuation.price-data/v1'||Number(packet.base_year)!==2021||!Array.isArray(packet.macro_context?.series)||!Array.isArray(packet.macro_context?.records))throw new Error('The published national PPP source packet has an unsupported format.');
 const supplied=packet.macro_context.series,rows=packet.macro_context.records,index={},bySeries={},metadata=[];
 for(const id of IDS){
  const native=supplied.find(s=>s.id===id);if(!native)throw new Error('A required published PPP definition is unavailable.');
  const records=rows.filter(r=>r.series_id===id);if(!records.length)throw new Error('The published PPP series has no retained source records.');
  const years=[...new Set(records.map(r=>r.year).filter(finite).map(Number))].sort((a,b)=>a-b);
  const places=[...new Map(records.map(r=>[String(r.geo_id),{id:String(r.geo_id),name:r.geo_name||String(r.geo_id)}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const perPerson=id.includes('PCAP');
  const definition=perPerson?'Published national GDP divided by the general population, expressed in constant 2021 international dollars using purchasing-power parities. This is average economic output per person, not household income, a median, wages or a personal spending budget.':'Published national gross domestic product, expressed in constant 2021 international dollars using purchasing-power parities. This is the total size of national economic output, not output per person, government spending or an industry’s value added.';
  const series={id,label:native.label,scope:'world',dataset_id:'published-wdi-ppp-context',unit:native.unit,source_url:native.source_url,definition,description:definition,years,places,rows:records.length,numeric_rows:records.filter(numeric).length,reference_year:2021,publisher_adjusted:true,local_numeric_adjustment:false,publisher_definition:native.definition,published_source_metadata:{...native},limitations:[
   native.estimate_label||'Published national-account estimates: blank observation-status fields do not establish direct measurement.',
   'These values are already expressed in constant 2021 international dollars. No additional inflation factor or PPP conversion is applied here.',
   'World Bank national GDP uses its published account definitions and price basis; it is not forced to match the separate OECD ICIO industry accounts at basic prices.',
   'Reporting conventions, source vintages, revisions and country coverage differ. Native years and missing cells remain unchanged.'
  ]};
  const data={series,records,hosted_scope_note:'Separate national PPP supplement. All retained nonaggregate country/economy records for this published indicator and 2000–2025 source window remain available, including missing cells and native source flags. It is not an industry or shipment conversion.'};
  metadata.push(series);index[id]=true;bySeries[id]=data;
 }
 return{catalogue:{series:metadata,datasets:[{id:'published-wdi-ppp-context',title:'World Bank · published national PPP GDP · constant 2021 international dollars',source_url:'https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.KD',rows:metadata.reduce((sum,s)=>sum+s.rows,0)}]},index,bySeries};
}
const helpers={finite,numeric,preparePPP};if(typeof module!=='undefined'&&module.exports)module.exports=helpers;if(typeof document==='undefined')return;
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadCSV(rows,name){const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))],cell=value=>'"'+String(value!==null&&typeof value==='object'?JSON.stringify(value):value??'').replaceAll('"','""')+'"',text=[columns.map(cell).join(','),...rows.map(r=>columns.map(key=>cell(r[key])).join(','))].join('\r\n'),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let packetPromise;
function sourcePacket(loadJSON){if(!packetPromise)packetPromise=loadJSON('/data/economic-valuation.json').then(packet=>({packet,...preparePPP(packet)})).catch(error=>{packetPromise=null;throw error;});return packetPromise;}
function historyTable(root,rows,series){const details=el('details','source-table');details.append(el('summary','',`Inspect this country’s native history · ${rows.length.toLocaleString()} rows`));const wrap=el('div','table-scroll'),table=el('table'),head=el('thead'),tr=el('tr');for(const title of['Country / economy','Source year','Published value / unit','Source status and footnote'])tr.append(el('th','',title));head.append(tr);table.append(head);const body=el('tbody');for(const r of rows){const row=el('tr'),name=el('td','',r.geo_name||r.geo_id),year=el('td','',finite(r.year)?r.year:'Source-defined period'),value=el('td',numeric(r)?'numeric':'status-value',numeric(r)?format(r.value):'Unavailable / ineligible'),status=el('td','',r.status||'No native status supplied.');name.append(el('small','',r.geo_id));value.append(el('small','',r.unit||series.unit));if(r.native_obs_status)status.append(el('small','','Native observation status: '+r.native_obs_status));if(r.native_footnote)status.append(el('small','',r.native_footnote));row.append(name,year,value,status);body.append(row);}table.append(body);wrap.append(table);details.append(wrap);root.append(details);}
async function render({root,historyRoot,params,loadJSON,navigate,isCurrent,plot}){
 root.replaceChildren(el('p','page-status','Opening the published purchasing-power context…'));historyRoot.replaceChildren();
 try{
  const prepared=await sourcePacket(loadJSON);if(!isCurrent())return;
  const{packet,catalogue,index,bySeries}=prepared;
  if(!window.PublicWorldMaps?.render)throw new Error('The shared world-map component is unavailable.');
  const requested=params.get('series'),selectedMeta=catalogue.series.find(s=>s.id===requested)||catalogue.series[0],years=selectedMeta.years,requestedYear=params.get('year'),year=finite(requestedYear)&&years.includes(Number(requestedYear))?Number(requestedYear):years.includes(2022)?2022:years.at(-1);
  const requestedPlace=params.get('place'),place=selectedMeta.places.some(p=>p.id===requestedPlace)?requestedPlace:'';
  const working=new URLSearchParams({series:selectedMeta.id,...(finite(year)?{year:String(year)}:{}),...(place?{place}:{})});
  const selected=await window.PublicWorldMaps.render({root,catalogue,index,loadEvidence:id=>Promise.resolve(bySeries[id]||null),loadJSON,params:working,navigate,isCurrent,historyHrefFor:({series,place})=>'#prices?'+new URLSearchParams({series,place,...(finite(year)?{year:String(year)}:{}),section:'history'})});
  if(!isCurrent()||!selected)return;
  const series=bySeries[selected.series].series,records=bySeries[selected.series].records;
  const note=el('p','limitation','Published PPP national-account estimates are used directly. Blank native observation statuses do not establish direct measurement; the source methods include official accounts and staff estimates. Missing source cells remain unavailable.');root.append(note);
  historyRoot.replaceChildren(el('h2','','Read the selected country’s actual source history'));
  if(!selected.place){historyRoot.append(el('p','','Choose a measured country/economy in the map controls or select a mapped country. Its retained source-year history and original source fields will appear here.'));return selected;}
  const name=series.places.find(p=>p.id===selected.place)?.name||selected.place,rows=records.filter(r=>String(r.geo_id)===String(selected.place)).slice().sort((a,b)=>Number(a.year)-Number(b.year));
  historyRoot.append(el('p','',name+' · '+series.unit),el('p','source-definition',series.definition));
  if(rows.length&&typeof plot==='function')plot(historyRoot,rows,series,name);else historyRoot.append(el('p','source-only','No native source observations are available for this country and measure. No replacement country, regional allocation or interpolation is inferred.'));
  const count=rows.filter(numeric).length;historyRoot.append(el('p','evidence-summary',`${rows.length.toLocaleString()} retained native rows; ${count.toLocaleString()} eligible numeric values; ${(rows.length-count).toLocaleString()} unavailable or ineligible values retained. The publisher’s constant-2021 PPP values have not been deflated again.`));
  historyTable(historyRoot,rows,series);
  const downloads=el('div','download-row'),csv=el('button','','Download country PPP history · CSV'),json=el('button','','Country PPP evidence and sources · JSON');csv.type=json.type='button';csv.addEventListener('click',()=>downloadCSV(rows,'published-ppp-country-history.csv'));json.addEventListener('click',()=>downloadJSON({schema:'public-evidence.published-ppp-context/v1',selection:selected,source_vintage:packet.source_vintage,series,records:rows,scope:'Published national GDP PPP context, not converted industry or model results.',sources:packet.sources,method_sources:packet.method_sources,limitations:packet.limitations},'published-ppp-country-evidence.json'));downloads.append(csv,json);historyRoot.append(downloads);
  if(params.get('section')==='history')historyRoot.scrollIntoView({block:'start'});
  return selected;
 }catch(error){if(isCurrent()){root.replaceChildren(el('p','error-message','The published purchasing-power comparison could not open: '+error.message));historyRoot.replaceChildren(el('p','','The original public catalogue and local model source accounts remain available. No substitute PPP values were created.'));}}
}
window.PublicPriceComparisons={render};
})();
