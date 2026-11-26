/* Original research-workbench UI with an explicit public static-data adapter. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const state={token:'',catalog:{datasets:[],series:[],examples:[]},data:new Map(),geographies:new Map(),analysis:null,analysisRequest:null,restoredAnalysis:false,selectionRevision:0,exploreRevision:0,tab:'explore',tableLimit:100,importFile:null,preview:null,noticeTimer:null,studio:null,navigationReady:false};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const numeric=value=>finite(value)?Number(value):null;
const eligible=row=>finite(row?.value)&&row.eligible!==false;
const clone=value=>JSON.parse(JSON.stringify(value));
const fmt=(value,digits=4)=>{if(!finite(value))return '—';const n=Number(value),a=Math.abs(n);return a!==0&&(a<10**(-digits)||a>=1e12)?new Intl.NumberFormat('en-US',{notation:'scientific',maximumFractionDigits:3}).format(n):new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(n);};
const compact=value=>finite(value)?new Intl.NumberFormat('en-US',{notation:'compact',maximumSignificantDigits:3}).format(Number(value)):'—';
const sourceURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const sourceLink=(url,label='Original source')=>sourceURL(url)?`<a href="${esc(sourceURL(url))}" target="_blank" rel="noopener">${esc(label)}</a>`:'';
const scopeName=scope=>({us_states:'U.S. states + DC',us_counties:'U.S. counties and county equivalents',world:'Countries / economies',virginia:'Virginia counties and independent cities',public_retirement_plans:'Named retirement plans',retirement_plans:'Named retirement plans',public_plans:'Named retirement plans',user_defined:'User-defined geographic units'}[scope]||String(scope||'Unspecified geography').replaceAll('_',' '));
const seriesById=id=>state.catalog.series.find(s=>String(s.id)===String(id));
const selectedX=()=>seriesById($('x-series').value);
const selectedY=()=>seriesById($('y-series').value);
const label=s=>s?.label||s?.title||s?.id||'Measure';
const yearsOf=s=>(s?.years||[]).map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
const placesOf=s=>(s?.places||[]).map(p=>typeof p==='string'?{id:p,name:p}:{id:String(p.id),name:p.name||String(p.id)});
const currentYear=()=>$('year').value===''?null:Number($('year').value);
const currentPlace=()=>$('place').value||null;

function notify(message,error=false){$('app-notice').textContent=message;$('app-notice').classList.toggle('error',error);$('app-notice').hidden=!message;}
async function request(path,body){
 if(window.PublicWorkbenchAPI)return window.PublicWorkbenchAPI.request(path,body);
 const options={headers:{Accept:'application/json'}};
 if(body!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.headers['X-Workbench-Token']=state.token;options.body=JSON.stringify(body);}
 const response=await fetch(path,options);let result;
 try{result=await response.json();}catch{throw new Error('The local service did not return a readable response. Check that the Python workbench is running.');}
 if(!response.ok||result?.error){const detail=result?.error||result?.message||('Local request failed ('+response.status+').');throw new Error(typeof detail==='string'?detail:JSON.stringify(detail));}
 return result;
}
function downloadObject(value,filename,type='application/json'){
 const body=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
 const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function localExportURL(value){const u=new URL(value,location.href);if(u.origin!==location.origin||!u.pathname.startsWith('/exports/'))throw new Error('The export service returned an unexpected file location.');return u.href;}
function downloadLocalURL(value){const a=document.createElement('a');a.href=localExportURL(value);a.download='';a.click();}
function showExportLinks(result,model,body){
 const host=$(model?'model-export-result':'explore-export-result'),links=[['Figure · '+body.format.toUpperCase(),result.url],['Source and settings · JSON',result.provenance_url],['Plotted observations · CSV',result.csv_url||result.paired_csv_url]].filter(([,url])=>url);
 host.replaceChildren();const title=document.createElement('strong');title.textContent='Last exported: '+body.title;host.append(title);
 const note=document.createElement('p');note.textContent='The figure downloads once. Save the separate source and settings record to keep its data fingerprint, assumptions and context alongside it.';host.append(note);
 const row=document.createElement('div');row.className='export-file-links';for(const [text,url]of links){const a=document.createElement('a');a.href=localExportURL(url);a.download='';a.textContent=text;if(url===result.provenance_url)a.addEventListener('click',async event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();a.setAttribute('aria-busy','true');
  try{const context=await request(localExportURL(url));downloadObject(context,new URL(url,location.href).pathname.split('/').at(-1));notify('The separate source and settings record downloaded locally. Keep it alongside the figure.');}
  catch(error){notify(error.message,true);}finally{a.removeAttribute('aria-busy');}
 });row.append(a);}host.append(row);host.hidden=false;
}
function csvCell(value){if(value===null||value===undefined)return '""';if(typeof value==='number')return String(value);if(typeof value==='object')value=JSON.stringify(value);let text=String(value);if(/^[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
function downloadCSV(rows,columns,filename){downloadObject([columns,...rows.map(r=>columns.map(k=>r[k]??''))].map(r=>r.map(csvCell).join(',')).join('\r\n'),filename,'text/csv;charset=utf-8');}
function plainValue(value){if(value===null||value===undefined)return 'Not supplied';if(typeof value==='number')return fmt(value,6);if(typeof value==='boolean')return value?'Yes':'No';if(Array.isArray(value))return value.length>8?value.length+' recorded items':value.map(plainValue).join('; ');if(typeof value==='object')return JSON.stringify(value);return String(value);}
function humanKey(key){return String(key).replaceAll('_',' ').replace(/\b[a-z]/,c=>c.toUpperCase());}
function facts(object){return Object.entries(object||{}).filter(([k,v])=>v!==undefined).map(([k,v])=>`<dt>${esc(humanKey(k))}</dt><dd>${esc(plainValue(v))}</dd>`).join('')||'<dt>Not supplied</dt><dd>No diagnostic metadata was returned.</dd>';}

async function switchTab(name,{publish=true}={}){
 state.tab=name;configureContext();document.querySelectorAll('.tab-button').forEach(b=>{const active=b.dataset.tab===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 for(const tab of ['explore','analyze','sources'])$('panel-'+tab).hidden=tab!==name;
 updateStudioLayout();if(name!=='explore')state.studio?.pause();
 if(name==='explore')await renderExplore();if(name==='analyze'&&state.analysis)renderModelChart();
 if(publish)navigationChanged(true);
}
const familyLabel=value=>({food_agriculture:'Food and agriculture',chemicals:'Chemicals and fertilizers',energy:'Energy',forestry:'Forests, wood and paper',metals:'Metals',construction:'Construction materials',industrial_minerals:'Industrial minerals',industrial_gases:'Industrial gases',other:'Other public data'}[value]||humanKey(value));
const stageLabel=value=>({harvested_area:'Harvested or bearing area',yield:'Yield',inventory:'Animal inventory',extraction:'Extraction / mining',production:'Production',processing:'Processing / refining',capacity:'Production capacity',reserves:'Reserves',imports:'Imports',exports:'Exports',food_availability:'Food available for people',feed:'Animal feed',losses:'Recorded food losses',other_uses:'Other non-food uses',use:'Agricultural use',use_intensity:'Use intensity',consumption:'Source-defined consumption',apparent_consumption:'Apparent consumption',reported_consumption:'Reported consumption',generation:'Electricity generation',retail_sales:'Retail energy sales',net_interstate_flow:'Net interstate electricity flow'}[value]||humanKey(value));
function renderResourceFilters(preferred={}){
 const family=preferred.resource_family??$('resource-family').value,stage=preferred.resource_stage??$('resource-stage').value;
 const families=[...new Set(state.catalog.series.map(s=>s.resource_family||'other'))].sort((a,b)=>familyLabel(a).localeCompare(familyLabel(b)));
 $('resource-family').innerHTML='<option value="all">All subjects</option>'+families.map(v=>`<option value="${esc(v)}">${esc(familyLabel(v))}</option>`).join('');
 if(families.includes(family))$('resource-family').value=family;
 const stages=[...new Set(state.catalog.series.filter(s=>$('resource-family').value==='all'||(s.resource_family||'other')===$('resource-family').value).map(s=>s.stage).filter(Boolean))].sort((a,b)=>stageLabel(a).localeCompare(stageLabel(b)));
 $('resource-stage').innerHTML='<option value="all">All stages</option>'+stages.map(v=>`<option value="${esc(v)}">${esc(stageLabel(v))}</option>`).join('');
 if(stages.includes(stage))$('resource-stage').value=stage;
}
function filteredSeries(){const terms=$('series-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean),dataset=$('dataset-filter').value,family=$('resource-family').value,stage=$('resource-stage').value;return state.catalog.series.filter(s=>(dataset==='all'||String(s.dataset_id)===dataset)&&(family==='all'||(s.resource_family||'other')===family)&&(stage==='all'||s.stage===stage)&&terms.every(q=>[label(s),s.unit,s.scope,s.definition,s.dataset_id,s.commodity,s.stage,s.material_basis].join(' ').toLowerCase().includes(q)));}
function renderLibrary(){
 const matches=filteredSeries();$('library-count').textContent=matches.length>160?`${matches.length} matching measures · 160 shown`:`${matches.length} of ${state.catalog.series.length} measures shown`;
 const visible=matches.slice(0,160);$('series-library').innerHTML=visible.map(s=>`<button class="series-item ${s.id===$('x-series').value?'active':''}" data-series="${esc(s.id)}" title="Use this as the explanatory measure"><span>${esc(label(s))}</span><small>${esc(scopeName(s.scope))} · ${esc(s.unit||'unit unspecified')}</small></button>`).join('')+(matches.length>visible.length?'<p class="small muted">Refine the search to see the remaining measures.</p>':'')||'<p class="small muted">No measures match this search.</p>';
 $('series-library').querySelectorAll('[data-series]').forEach(b=>b.addEventListener('click',()=>{ensureSeriesOption('x-series',b.dataset.series);$('x-series').value=b.dataset.series;changeSelection();}));
}
function renderSeriesSelectors(preferred={}){
 const priorX=preferred.x_series||$('x-series').value,priorY=preferred.y_series||$('y-series').value;
 const options=state.catalog.series.map(s=>`<option value="${esc(s.id)}">${esc(label(s)+' · '+scopeName(s.scope))}</option>`).join('');$('x-series').innerHTML=options;$('y-series').innerHTML=options;
 const x=seriesById(priorX)||seriesById(state.catalog.default_series)||state.catalog.series.find(s=>s.id==='bea::SARPI-2')||state.catalog.series.find(s=>/median-household-income/.test(s.id))||state.catalog.series[0];
 const y=seriesById(priorY)||state.catalog.series.find(s=>/median-gross-rent-income-percent/.test(s.id))||state.catalog.series.find(s=>s.id!==x?.id&&s.scope===x?.scope)||state.catalog.series[1]||x;
 if(x)$('x-series').value=x.id;if(y)$('y-series').value=y.id;
}
function ensureSeriesOption(id,value){if(![...$(id).options].some(o=>o.value===value)){const s=seriesById(value);if(s){const option=document.createElement('option');option.value=value;option.textContent=label(s);$(id).append(option);}}}
function renderMetadata(){for(const [id,s]of [['x-meta',selectedX()],['y-meta',selectedY()]]){const years=yearsOf(s);$(id).innerHTML=`<strong>${esc(s?.unit||'Unit unspecified')}</strong><br>${esc(scopeName(s?.scope))}${years.length?' · '+esc(years.length===1?years[0]:years[0]+'–'+years.at(-1)):''}${s?.definition?'<br>'+esc(s.definition.length>220?s.definition.slice(0,217)+'…':s.definition):''}`;}}
function configureContext(preferred={}){
 const x=selectedX(),y=selectedY(),oldYear=preferred.year??currentYear(),oldPlace=preferred.geo_id||currentPlace();
 const xy=yearsOf(x),yy=new Set(yearsOf(y));const common=xy.filter(n=>yy.has(n));const years=state.tab==='explore'?xy:(common.length?common:xy);
 $('year').innerHTML=years.length?years.slice().reverse().map(n=>`<option value="${n}">${n}</option>`).join(''):'<option value="">No annual year supplied</option>';
 if(years.includes(Number(oldYear)))$('year').value=String(oldYear);else if(years.includes(2024))$('year').value='2024';
 const yp=new Set(placesOf(y).map(p=>p.id)),xp=placesOf(x);const shared=xp.filter(p=>yp.has(p.id));const places=state.tab==='explore'?xp:(shared.length?shared:xp);
 $('place').innerHTML=places.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 if(places.some(p=>p.id===oldPlace))$('place').value=oldPlace;else if(places.some(p=>p.id==='VA'))$('place').value='VA';
 const time=$('mode').value==='time_series';$('year-field').hidden=time;$('place-field').hidden=!time;
 $('transform').disabled=!time;$('lag').disabled=!time;if(!time){$('transform').value='levels';$('lag').value='0';}
 let warning='';if(!x||!y)warning='Load a dataset or choose two measurements to begin.';else if(x.id===y.id)warning='Choose different explanatory and outcome measures before running a relationship model.';else if(x.scope!==y.scope)warning='These measures use different native geographies. Explore each one separately, or choose a pair with the same geography before modelling.';else if(!time&&!common.length)warning='The two measures have no matched annual source year. Their individual source values remain available for exploration.';else if(time&&!shared.length)warning='These measures have no shared native place identifier. The workbench will not infer a match from a name.';
 $('selection-warning').textContent=warning;$('selection-warning').hidden=!warning;$('run-analysis').disabled=!!warning;
 const scope=x?.scope;const mapAvailable=['us_states','us_counties','world','virginia'].includes(scope);const mapOption=$('chart-type').querySelector('option[value=map]');mapOption.disabled=!mapAvailable;
 if(!mapAvailable&&$('chart-type').value==='map')$('chart-type').value=time?'time':'bar';
 const canRaise=mapAvailable && yearsOf(x).length>0;
 $('chart-type').querySelector('option[value=map3d]').disabled=!canRaise;
 if(!canRaise && $('chart-type').value==='map3d')$('chart-type').value=mapAvailable?'map':time?'time':'bar';
}
function updateStudioLayout(){const studio=state.tab==='explore'&&$('chart-type').value==='map3d';$('y-series').closest('.variable-field').hidden=studio;$('mode').closest('.selection-context').hidden=studio;document.querySelector('.selection-panel').classList.toggle('studio-selection',studio);$('x-label-text').textContent=studio?'Map measure':'Explanatory measure';$('selection-warning').hidden=studio||!$('selection-warning').textContent;}
function invalidateAnalysis(){state.selectionRevision++;state.analysis=null;state.analysisRequest=null;state.restoredAnalysis=false;$('analysis-results').hidden=true;$('model-export-result').hidden=true;$('results-placeholder').hidden=false;$('analysis-status').textContent='';}
async function changeSelection(preferred={}){
 invalidateAnalysis();renderMetadata();configureContext(preferred);renderLibrary();await renderExplore();navigationChanged(true);
}
async function getSeriesData(id){if(!id)return{records:[]};if(!state.data.has(id)){const result=await request('/api/data?series='+encodeURIComponent(id));state.data.set(id,{series:result.series||seriesById(id),records:result.records||result.data||[]});}const result=state.data.get(id);state.data.delete(id);state.data.set(id,result);while(state.data.size>3){const victim=[...state.data.keys()].find(key=>key!==$('x-series').value&&key!==$('y-series').value);if(victim===undefined)break;state.data.delete(victim);}return result;}
function explorerRows(){const data=state.data.get($('x-series').value)?.records||[];if($('chart-type').value==='map3d'){const year=state.studio?.getYear()??currentYear()??yearsOf(selectedX()).at(-1);return year===null||year===undefined?data:data.filter(r=>r.year===year);}if($('chart-type').value==='time'){const id=currentPlace()||placesOf(selectedX())[0]?.id;return data.filter(r=>String(r.geo_id)===String(id)).sort((a,b)=>(numeric(a.year)??0)-(numeric(b.year)??0));}const year=currentYear();return year===null?data:data.filter(r=>Number(r.year)===year);}
function tableRows(){const q=$('table-query').value.trim().toLowerCase();return explorerRows().filter(r=>[r.geo_name,r.geo_id,r.year,r.period].join(' ').toLowerCase().includes(q));}
function renderTable(){
 const rows=tableRows();$('table-summary').textContent=explorerRows().length+' records';$('table-count').textContent=`${rows.length} records${rows.length>state.tableLimit?' · '+state.tableLimit+' shown':''}`;
 $('raw-table-body').innerHTML=rows.slice(0,state.tableLimit).map(r=>`<tr><td>${esc(r.geo_name||r.geo_id)}<small>${esc(r.geo_id)}</small></td><td>${esc(r.year??'—')}${r.period&&String(r.period)!==String(r.year)?'<small>'+esc(r.period)+'</small>':''}</td><td class="numeric">${finite(r.value)?esc(fmt(r.value,6)):'—'}${finite(r.low)&&finite(r.high)?'<small>'+esc(fmt(r.low,4))+'–'+esc(fmt(r.high,4))+'</small><small>'+esc(selectedX()?.interval_type||selectedX()?.intervalType||'Published source interval')+'</small>':''}</td><td>${esc(r.unit||selectedX()?.unit||'Not supplied')}</td><td>${esc(String(r.status||r.value_status||(finite(r.value)?'Available source value':'Missing source value')).replaceAll('_',' '))}</td></tr>`).join('')||'<tr><td colspan="5">No observations match this selection.</td></tr>';$('more-table').hidden=rows.length<=state.tableLimit;
}
function emptyChart(host,title,message){host.innerHTML=`<div class="empty-chart"><strong>${esc(title)}</strong>${esc(message)}</div>`;}
function svgFigure(host,title,width=900,height=440){host.innerHTML='';const w=Math.max(640,host.clientWidth||width),h=height;const svg=d3.select(host).append('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','img').attr('aria-label',title);svg.append('title').text(title);return{svg,w,h,margin:{left:76,right:30,top:28,bottom:62}};}
function tickFormat(value){return compact(value);}
function simpleAxes(svg,x,y,w,h,margin,{xLabel='',yLabel='',time=false}={}){
 const grid=svg.append('g').attr('class','plot-grid').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w-margin.left-margin.right)).tickFormat(''));grid.select('.domain').remove();
 svg.append('g').attr('class','plot-axis').attr('transform',`translate(0,${h-margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(time?d3.format('d'):tickFormat));
 svg.append('g').attr('class','plot-axis').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(tickFormat));
 if(xLabel)svg.append('text').attr('class','plot-label').attr('x',(margin.left+w-margin.right)/2).attr('y',h-15).attr('text-anchor','middle').text(xLabel.length>90?xLabel.slice(0,87)+'…':xLabel);
 if(yLabel)svg.append('text').attr('class','plot-label').attr('x',margin.left).attr('y',17).text(yLabel.length>100?yLabel.slice(0,97)+'…':yLabel);
}
function expandedDomain(values,includeZero=false){const valid=values.filter(finite).map(Number);if(!valid.length)return[0,1];let lo=d3.min(valid),hi=d3.max(valid);if(includeZero){lo=Math.min(0,lo);hi=Math.max(0,hi);}if(lo===hi){const p=Math.abs(lo)*.1||1;lo-=p;hi+=p;}else{const pad=(hi-lo)*.05;if(!includeZero)lo-=pad;hi+=pad;}return[lo,hi];}
function normalFeature(feature){if(!['Polygon','MultiPolygon'].includes(feature.geometry?.type)||d3.geoArea(feature)<=2*Math.PI)return feature;const copy=clone(feature);if(copy.geometry.type==='Polygon')copy.geometry.coordinates.forEach(r=>r.reverse());else copy.geometry.coordinates.forEach(p=>p.forEach(r=>r.reverse()));return copy;}
async function drawMap(host,rows,metadata,revision){
 const scope=metadata.scope;if(!['us_states','us_counties','world','virginia'].includes(scope)){emptyChart(host,'This source has no native map in the workbench.','Use the place chart or time view. Observations are never reassigned to another geographic boundary.');return;}
 if(!state.geographies.has(scope))state.geographies.set(scope,await request('/api/geography?scope='+encodeURIComponent(scope)));
 if(revision!==state.exploreRevision)return;
 const raw=state.geographies.get(scope),fc=raw.geometry||raw.geojson||raw;const features=(fc.features||[]).filter(f=>String(f.id)!=='ATA').map(normalFeature);if(!features.length){emptyChart(host,'No display outlines are available.','The source observations are still retained in the table.');return;}
 const {svg,w,h}=svgFigure(host,label(metadata)+' by its native geographic units',900,440),values=rows.filter(eligible).map(r=>Number(r.value));const byId=new Map(rows.map(r=>[String(r.geo_id),r]));
 const reference=numeric(metadata.displayReference??metadata.display_reference);let domain,colors;
 if(reference!==null){const spread=Math.max(...values.map(v=>Math.abs(v-reference)),1e-9);domain=[reference===0?-spread:Math.max(0,reference-spread),reference,reference+spread];colors=['#a86444','#f7f4e7','#216d58'];}else{domain=expandedDomain(values,true);colors=['#e9f0dc','#1c6954'];}
 const color=d3.scaleLinear().domain(domain).range(colors).clamp(true);
 const projection=scope==='world'?d3.geoEqualEarth():scope==='virginia'?d3.geoConicConformal().parallels([37,39]).rotate([79,0]):d3.geoAlbersUsa();projection.fitExtent([[15,12],[w-15,h-65]],{type:'FeatureCollection',features});const path=d3.geoPath(projection);const drawableFeatures=features.filter(f=>path(f));
 const paths=svg.append('g').selectAll('path').data(drawableFeatures).join('path').attr('class',f=>'map-state'+(String(f.id)==='VA'?' focal':'')).attr('d',path).attr('fill',f=>eligible(byId.get(String(f.id)))?color(Number(byId.get(String(f.id)).value)):'#d6dad2');
 paths.append('title').text(f=>{const r=byId.get(String(f.id));return`${r?.geo_name||f.properties?.name||f.id}: ${eligible(r)?fmt(r.value,6)+' '+(r.unit||metadata.unit):'Unavailable / excluded; inspect source status'}`;});
 const ramp=svg.append('defs').append('linearGradient').attr('id','explore-map-ramp');domain.forEach((v,i)=>ramp.append('stop').attr('offset',((v-domain[0])/(domain.at(-1)-domain[0])*100)+'%').attr('stop-color',colors[i]));
 const legendWidth=Math.min(w-140,470),lx=(w-legendWidth)/2,ly=h-48;svg.append('rect').attr('x',lx).attr('y',ly).attr('width',legendWidth).attr('height',9).attr('rx',2).attr('fill','url(#explore-map-ramp)');
 const ticks=reference!==null?domain:[domain[0],(domain[0]+domain[1])/2,domain[1]];ticks.forEach((v,i)=>svg.append('text').attr('class','plot-note').attr('x',lx+(v-domain[0])/(domain.at(-1)-domain[0])*legendWidth).attr('y',ly+27).attr('text-anchor',i===0?'start':i===ticks.length-1?'end':'middle').text(reference!==null&&i===1?fmt(v,3):compact(v)));
 const note=document.createElement('div');note.className='map-legend';const matched=rows.filter(r=>eligible(r)&&drawableFeatures.some(f=>String(f.id)===String(r.geo_id))).length;note.textContent=`${matched} source values match native display outlines. Gray marks unavailable or source-ineligible values; their status remains in the table. ${reference!==null?'Neutral reference: '+fmt(reference,3)+'. ':''}The table retains reported places without a drawable outline, including historical codes and regions outside this projection. ${scope==='us_counties'?'County outlines are the retained 2025 Census geography; old county codes are not reassigned.':''}`;host.append(note);
}
function drawBar(host,rows,metadata){
 const observed=rows.filter(eligible).sort((a,b)=>Number(b.value)-Number(a.value));if(!observed.length){emptyChart(host,'No numeric observations in this selection.','Change the source year or inspect the missing-data flags in the table.');return;}
 const shown=observed.slice(0,25),height=Math.max(360,shown.length*29+80);const {svg,w,h}=svgFigure(host,label(metadata)+' by place',900,height),m={left:Math.min(250,Math.max(155,w*.27)),right:65,top:25,bottom:52};
 const domain=expandedDomain(shown.map(r=>r.value),true),x=d3.scaleLinear().domain(domain).nice().range([m.left,w-m.right]),y=d3.scaleBand().domain(shown.map(r=>String(r.geo_id))).range([m.top,h-m.bottom]).padding(.25);
 svg.append('g').attr('class','plot-grid').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickSize(-(h-m.top-m.bottom)).tickFormat('')).select('.domain').remove();
 svg.append('g').attr('class','plot-axis').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(tickFormat));
 svg.append('g').attr('class','plot-axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickSize(0).tickFormat(id=>{const r=shown.find(r=>String(r.geo_id)===id);const name=r?.geo_name||id;return name.length>29?name.slice(0,27)+'…':name;})).select('.domain').remove();
 svg.append('line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',m.top).attr('y2',h-m.bottom).attr('stroke','#95a98f');
 const bars=svg.append('g').selectAll('rect').data(shown).join('rect').attr('x',r=>Math.min(x(0),x(Number(r.value)))).attr('y',r=>y(String(r.geo_id))).attr('width',r=>Math.abs(x(Number(r.value))-x(0))).attr('height',y.bandwidth()).attr('fill',r=>String(r.geo_id)==='VA'?'#1c6954':'#a9bca2');bars.append('title').text(r=>`${r.geo_name}: ${fmt(r.value,6)} ${r.unit||metadata.unit}`);
 svg.append('g').selectAll('text').data(shown).join('text').attr('class','plot-note').attr('x',r=>x(Number(r.value))+(Number(r.value)<0?-5:5)).attr('y',r=>y(String(r.geo_id))+y.bandwidth()/2+4).attr('text-anchor',r=>Number(r.value)<0?'end':'start').text(r=>compact(r.value));
 if(observed.length>25){const note=document.createElement('div');note.className='map-legend';note.textContent='Chart shows the 25 highest available values. The full selection remains in the source table and CSV export.';host.append(note);}
}
function drawTime(host,rows,metadata){
 const validYears=rows.filter(r=>Number.isInteger(Number(r.year))&&r.year!==null);if(!validYears.length){emptyChart(host,'This selection has no annual time records.','Choose an annual series with explicit year identifiers. A pooled survey period is not converted into an annual panel.');return;}
 const unique=new Set(validYears.map(r=>Number(r.year)));if(unique.size!==validYears.length){emptyChart(host,'Several source records share a year for this place.','Choose a more specific series before plotting a time trend; these observations are not implicitly averaged.');return;}
 const values=validYears.filter(eligible);if(!values.length){emptyChart(host,'No numeric time observations are available.','Inspect the retained source flags in the table.');return;}
 const {svg,w,h,margin}=svgFigure(host,label(metadata)+' over source years');const x=d3.scaleLinear().domain(expandedDomain(validYears.map(r=>r.year))).range([margin.left,w-margin.right]),y=d3.scaleLinear().domain(expandedDomain(values.map(r=>r.value),false)).nice().range([h-margin.bottom,margin.top]);
 simpleAxes(svg,x,y,w,h,margin,{xLabel:'Source year',yLabel:metadata.unit||'Source unit unspecified',time:true});
 const sorted=validYears.slice().sort((a,b)=>Number(a.year)-Number(b.year));const segments=[];let segment=[];for(const row of sorted){if(!eligible(row)||(segment.length&&Number(row.year)-Number(segment.at(-1).year)!==1)){if(segment.length)segments.push(segment);segment=[];}if(eligible(row))segment.push(row);}if(segment.length)segments.push(segment);
 const line=d3.line().x(r=>x(Number(r.year))).y(r=>y(Number(r.value)));segments.forEach(segment=>svg.append('path').datum(segment).attr('d',line).attr('fill','none').attr('stroke','#216d58').attr('stroke-width',2));
 svg.append('g').selectAll('circle').data(values).join('circle').attr('cx',r=>x(Number(r.year))).attr('cy',r=>y(Number(r.value))).attr('r',3.5).attr('fill','#216d58').append('title').text(r=>`${r.geo_name||r.geo_id}, ${r.year}: ${fmt(r.value,6)} ${r.unit||metadata.unit}`);
}
async function renderExplore(){
 const revision=++state.exploreRevision,metadata=selectedX(),host=$('explore-chart');if(!metadata){emptyChart(host,'No source measure is loaded.','Import a dataset to begin.');return;}
 updateStudioLayout();const studio=$('chart-type').value==='map3d';$('map-studio').hidden=!studio;host.hidden=studio;$('explore-caption').hidden=studio;document.querySelector('#panel-explore .figure-actions').hidden=studio;if(studio)$('explore-export-result').hidden=true;else state.studio?.pause();
 const selectedId=metadata.id;if(studio)state.studio?.prepareSource(metadata);try{await getSeriesData(selectedId);if(revision!==state.exploreRevision||selectedX()?.id!==selectedId)return;const rows=explorerRows(),n=rows.filter(eligible).length;
 $('explore-title').textContent=label(metadata);$('explore-description').innerHTML=`<p><strong>${esc(scopeName(metadata.scope))}</strong> · ${esc(metadata.unit||'Unit unspecified')} · ${esc($('chart-type').value==='time'?(currentPlace()||'selected place')+' · available source years':currentYear()??'source period not supplied')} ${sourceLink(metadata.source_url,'Source reference')}</p>`;
 if(studio){await state.studio.show(metadata);if(revision===state.exploreRevision)renderTable();return;}
 if(!window.d3)emptyChart(host,'The local chart library is unavailable.','The source table and statistical engine remain available.');else if($('chart-type').value==='map')await drawMap(host,rows,metadata,revision);else if($('chart-type').value==='time')drawTime(host,rows,metadata);else drawBar(host,rows,metadata);
 if(revision!==state.exploreRevision)return;
 $('explore-caption').textContent=`${n} eligible numeric observations in this view; ${rows.length-n} unavailable or source-ineligible observations retained in the table. ${metadata.definition||'Review the source definition and unit before interpreting this pattern.'}`;renderTable();
 }catch(error){if(revision!==state.exploreRevision)return;if(studio)state.studio?.sourceError('The selected source could not be opened. '+error.message);else emptyChart(host,'The selected source could not be opened.',error.message);notify(error.message,true);}
}

function analysisRequest(){const time=$('mode').value==='time_series';return{x_series:$('x-series').value,y_series:$('y-series').value,mode:$('mode').value,year:time?null:currentYear(),geo_id:time?currentPlace():null,transform:time?$('transform').value:'levels',lag:time?Number($('lag').value):0,model:$('model').value,question:$('research-question').value.trim(),prior:{mean:Number($('prior-mean').value),scale:Number($('prior-scale').value),a:Number($('prior-a').value),b:Number($('prior-b').value)}};}
function updateMethodNote(){
 const type=$('model').value;$('prior-panel').hidden=type!=='bayesian';for(const id of ['prior-mean','prior-scale','prior-a','prior-b'])$(id).disabled=type!=='bayesian';
 $('method-note').textContent=type==='correlation'?'Pearson assesses a linear relationship; Spearman assesses a ranked relationship. Small p-values do not establish a causal effect.':type==='ols'?'A straight-line model with an intercept. Robust uncertainty is used for place comparisons; annual time comparisons require attention to serial dependence.':'A linear model that combines an explicit prior with these observations. Inspect both posterior credible intervals and wider predictive intervals, and assess sensitivity to the prior.';
}
async function runAnalysis(event){
 event.preventDefault();if(!$('analysis-form').reportValidity())return;const body=analysisRequest();if(!body.question){$('research-question').setCustomValidity('Write a research question before fitting the model.');$('research-question').reportValidity();return;}
 if($('run-analysis').disabled)return;const revision=state.selectionRevision;$('run-analysis').disabled=true;$('analysis-status').textContent='Fitting the local model and retaining its source record…';notify('');
 try{const result=await request('/api/analyze',body);if(revision!==state.selectionRevision){$('analysis-status').textContent='The selection changed while the analysis ran. Run it again for the current selection.';return;}state.analysis=result;state.analysisRequest=clone(body);state.restoredAnalysis=false;renderAnalysis();$('analysis-status').textContent='Analysis complete. Review the sample, diagnostics and assumptions before interpreting it.';}
 catch(error){$('analysis-status').textContent=error.message;notify(error.message,true);}finally{configureContext();}
}
function summaryItems(result){
 const sample=result.sample||{},summary=result.summary||{};const items=[];
 const n=sample.complete??sample.n??summary.n??result.points?.length;if(n!==undefined)items.push(['Complete observations',n,'After matching and missing-value handling']);
 for(const key of ['pearson_r','r','r_squared','r2','spearman_rho','spearman_r','slope','posterior_slope'])if(finite(summary[key])&&!items.some(item=>item[0]===humanKey(key)))items.push([humanKey(key),summary[key],key.startsWith('posterior')?'Posterior estimate':'Exploratory estimate']);
 if(items.length<3)for(const [key,value]of Object.entries(summary)){if(typeof value==='number'&&!['n',...['pearson_r','r','r_squared','r2','spearman_rho','spearman_r','slope','posterior_slope']].includes(key))items.push([humanKey(key),value,'See the method record for its definition']);if(items.length>=4)break;}
 return items.slice(0,4);
}
function renderAnalysis(){
 const result=state.analysis;if(!result)return;$('results-placeholder').hidden=true;$('analysis-results').hidden=false;
 const model=state.analysisRequest?.model||result.analysis?.model;$('export-model').disabled=state.restoredAnalysis;$('result-title').textContent={correlation:'Correlation assessment',ols:'Linear regression assessment',bayesian:'Bayesian linear regression assessment'}[model]||'Model assessment';if(state.restoredAnalysis)$('result-title').textContent+=' · saved record';$('result-question').textContent=state.analysisRequest?.question||result.analysis?.question||'';
 $('result-summary').innerHTML=summaryItems(result).map(([name,value,note])=>`<div class="result-stat"><span>${esc(name)}</span><strong>${esc(plainValue(value))}</strong><small>${esc(note)}</small></div>`).join('');
 const warnings=Array.isArray(result.warnings)?result.warnings:[];$('result-warnings').hidden=!warnings.length;$('result-warnings').innerHTML='<strong>Interpretation and checks</strong><ul>'+warnings.map(w=>`<li>${esc(typeof w==='string'?w:JSON.stringify(w))}</li>`).join('')+'</ul>';
 const coefficients=Array.isArray(result.coefficients)?result.coefficients:[];$('coefficient-table').innerHTML=coefficients.map(c=>`<tr><td>${esc(c.term||c.name)}</td><td class="numeric">${esc(fmt(c.estimate??c.mean??c.coefficient,6))}</td><td class="numeric">${esc(fmt(c.low??c.lower,6))}</td><td class="numeric">${esc(fmt(c.high??c.upper,6))}</td><td>${esc(c.interval_type||c.intervalType||'No interval supplied for this estimate')}</td><td class="numeric">${esc(fmt(c.pvalue??c.p_value,6))}</td></tr>`).join('')||'<tr><td colspan="6">This assessment does not return regression coefficients. Review its correlation estimates and diagnostics.</td></tr>';
 $('sample-details').innerHTML=facts(result.sample);$('diagnostic-details').innerHTML=facts(result.diagnostics);
 const record={analysis:result.analysis||state.analysisRequest,units:result.units,provenance:result.provenance,sample:result.sample,warnings:result.warnings};$('analysis-record').textContent=JSON.stringify(record,null,2);renderModelChart();
}
function renderModelChart(){
 const result=state.analysis,host=$('model-chart');if(!result)return;const points=(result.points||[]).filter(p=>finite(p.x)&&finite(p.y));if(!window.d3||!points.length){emptyChart(host,'No paired numeric points are available.','Inspect the sample and the analysis record.');return;}
 const {svg,w,h,margin}=svgFigure(host,'Paired observations and fitted relationship',900,440),fit=(result.fit_line||[]).filter(p=>finite(p.x)&&finite(p.estimate??p.fitted??p.mean)).sort((a,b)=>Number(a.x)-Number(b.x));
 const x=d3.scaleLinear().domain(expandedDomain([...points.map(p=>p.x),...fit.map(p=>p.x)])).nice().range([margin.left,w-margin.right]),yvals=[...points.map(p=>p.y),...fit.flatMap(p=>[p.estimate??p.fitted??p.mean,p.low,p.high,p.predictive_low,p.predictive_high]).filter(finite)],y=d3.scaleLinear().domain(expandedDomain(yvals)).nice().range([h-margin.bottom,margin.top]);
 const xmeta=seriesById(state.analysisRequest?.x_series),ymeta=seriesById(state.analysisRequest?.y_series),units=result.units||{};
 simpleAxes(svg,x,y,w,h,margin,{xLabel:(label(xmeta))+' · '+(units.x||xmeta?.unit||'unit unspecified'),yLabel:'Y: '+(units.y||ymeta?.unit||'unit unspecified')});
 const area=(lo,hi)=>d3.area().defined(p=>finite(p[lo])&&finite(p[hi])).x(p=>x(Number(p.x))).y0(p=>y(Number(p[lo]))).y1(p=>y(Number(p[hi])));
 if(fit.some(p=>finite(p.predictive_low)&&finite(p.predictive_high)))svg.append('path').datum(fit).attr('d',area('predictive_low','predictive_high')).attr('fill','#dce0d6').attr('fill-opacity',.65);
 if(fit.some(p=>finite(p.low)&&finite(p.high)))svg.append('path').datum(fit).attr('d',area('low','high')).attr('fill','#9fc4ae').attr('fill-opacity',.55);
 if(fit.length)svg.append('path').datum(fit).attr('d',d3.line().x(p=>x(Number(p.x))).y(p=>y(Number(p.estimate??p.fitted??p.mean)))).attr('stroke','#1d6854').attr('stroke-width',2).attr('fill','none');
 svg.append('g').selectAll('circle').data(points).join('circle').attr('class',p=>'plot-point'+(p.geo_id==='VA'?' focal':'')).attr('cx',p=>x(Number(p.x))).attr('cy',p=>y(Number(p.y))).attr('r',p=>p.geo_id==='VA'?5.5:3.8).append('title').text(p=>`${p.geo_name||p.geo_id||'Observation'}${p.year!==undefined?', '+p.year:''}: X ${fmt(p.x,6)}, Y ${fmt(p.y,6)}${finite(p.residual)?', residual '+fmt(p.residual,6):''}`);
 const bayesian=(state.analysisRequest?.model||result.analysis?.model)==='bayesian';$('model-caption').textContent=`${points.length} complete paired observations. ${fit.length?(bayesian?'The darker band is the 95% posterior credible interval for the fitted mean. The lighter band, when supplied, is the 95% posterior predictive interval for an observation.':'The band, when supplied, represents the engine’s stated uncertainty for the fitted relationship. Read the interval definition and robust-error method below.'):'The plot shows paired observations; no fitted trend has been invented.'} Y: ${label(ymeta)}. A fitted relationship is not evidence of a causal effect.`;
}
async function exportFigure(model=false){
 const button=$(model?'export-model':'export-explore');button.disabled=true;
 try{const body={chart:model?'scatter':$('chart-type').value,format:$('figure-format').value,title:$('figure-title').value.trim()||(model?$('result-title').textContent:label(selectedX())),series_id:$('x-series').value,settings:{year:currentYear(),geo_id:currentPlace(),place_ids:currentPlace()?[currentPlace()]:[],scope:selectedX()?.scope,source_view:true}};if(model){if(!state.analysis)throw new Error('Run an analysis before exporting its fitted figure.');body.analysis=state.analysis;body.settings=clone(state.analysisRequest);}
 if(window.PublicWorkbenchAPI&&!model){await window.PublicWorkbenchAPI.exportFigure({host:$('explore-chart'),body,series:selectedX(),dataset:state.catalog.datasets.find(d=>d.id===selectedX()?.dataset_id),rows:tableRows()});notify('Browser figure and its separate source/settings JSON downloaded. Keep both files together.');return;}
 const result=await request('/api/export-figure',body);if(!result.url)throw new Error('No figure download was returned.');showExportLinks(result,model,body);downloadLocalURL(result.url);notify('Figure downloaded locally. Use the export links to save its separate source and settings record.');}
 catch(error){notify(error.message,true);}finally{button.disabled=false;}
}
function renderSources(){
 $('source-collections').innerHTML=state.catalog.datasets.map(d=>`<article class="source-card"><h3>${esc(d.title||d.id)}</h3><p>${esc(d.description||'Retained source collection.')}</p><p class="source-meta">${esc(d.rows??d.row_count??'—')} retained records${d.source_name?' · '+esc(d.source_name):''}</p>${sourceLink(d.source_url,'Open the source reference')}${d.license?'<p class="source-meta">'+esc(d.license)+'</p>':''}${d.sha256?'<p class="source-meta">Retained data fingerprint</p><code>'+esc(d.sha256)+'</code>':''}</article>`).join('')||'<p>No source collections have been loaded.</p>';
}
function chooseExample(example){
 const req=example.request||example.settings||example;
 if(req.view==='explore'){
  const source=seriesById(req.x_series);if(!source){notify('This source collection is not loaded.',true);return;}
  $('x-series').value=source.id;$('chart-type').value='map3d';$('series-search').value='';$('dataset-filter').value='all';renderResourceFilters({resource_family:source.resource_family||'other',resource_stage:source.stage||'all'});state.studio?.restore({series_id:source.id,year:req.year,focus_id:req.geo_id});
  changeSelection(req);switchTab('explore');return;
 }
const x=seriesById(req.x_series),y=seriesById(req.y_series);if(!x||!y){notify('The example’s source measures are not loaded in this project.',true);return;}
 $('x-series').value=x.id;$('y-series').value=y.id;$('mode').value=req.mode||'cross_section';$('research-question').value=req.question||example.question||('What association is visible between '+label(x)+' and '+label(y)+(req.mode==='time_series'?' through time for the selected place?':' across native places in the selected source year?'));$('model').value=req.model||'ols';$('transform').value=req.transform||'levels';$('lag').value=String(req.lag||0);changeSelection(req);updateMethodNote();switchTab('analyze');
}
function renderExamples(){
 let examples=state.catalog.examples||[];if(!examples.length){const byText=pattern=>state.catalog.series.find(s=>pattern.test(s.id+' '+label(s)));const income=byText(/median.household.income/i),rent=byText(/median.gross.rent.income.percent|rent burden/i);if(income&&rent)examples=[{title:'Income and rental pressure',x_series:income.id,y_series:rent.id,year:2024,mode:'cross_section',model:'ols',question:'Across states in 2024, how is median household income associated with the median renter household’s rent burden?'}];}
 $('example-row').innerHTML=examples.length?'<span>Try a starting question:</span>'+examples.slice(0,5).map((e,i)=>`<button data-example="${i}">${esc(e.title||e.label||e.name||'Example '+(i+1))}</button>`).join(''):'';
 $('example-row').querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>chooseExample(examples[Number(b.dataset.example)])));
}
async function refreshCatalog(preferred={}){
 const result=await request('/api/catalog');state.catalog={...result,datasets:result.datasets||[],series:result.series||[],examples:result.examples||[]};
 $('dataset-filter').innerHTML='<option value="all">All collections</option>'+state.catalog.datasets.map(d=>`<option value="${esc(d.id)}">${esc(d.title||d.id)}</option>`).join('');
 renderResourceFilters(preferred);if(preferred.series_search!==undefined)$('series-search').value=preferred.series_search;if([...$('dataset-filter').options].some(o=>o.value===preferred.dataset_filter))$('dataset-filter').value=preferred.dataset_filter;renderSeriesSelectors(preferred);renderMetadata();configureContext(preferred);renderLibrary();renderSources();renderExamples();$('library-stats').innerHTML=`<strong>${state.catalog.series.length.toLocaleString()}</strong>measure series · ${state.catalog.datasets.length} source collections`;
}
function uiState(){return{...analysisRequest(),chart_type:$('chart-type').value,figure_title:$('figure-title').value,figure_format:$('figure-format').value,tab:state.tab,dataset_filter:$('dataset-filter').value,series_search:$('series-search').value,resource_family:$('resource-family').value,resource_stage:$('resource-stage').value,studio:state.studio?.getState()};}
/* Navigation retains source references and controls, never observations or fitted results. */
function navigationChanged(push=false){if(state.navigationReady)window.WorkbenchNavigation?.changed({push});}
function navigationSourceRef(id){
 const series=seriesById(id),dataset=state.catalog.datasets.find(d=>d.id===series?.dataset_id);
 return series?{series_id:series.id,dataset_id:series.dataset_id,sha256:dataset?.normalized_bundle_sha256||dataset?.sha256||null}:null;
}
function captureLibraryNavigation(){
 return{...uiState(),view_year:currentYear(),view_place:currentPlace(),table_query:$('table-query').value,table_limit:state.tableLimit,source_refs:{x:navigationSourceRef($('x-series').value),y:navigationSourceRef($('y-series').value)}};
}
async function applyLibrarySectionLink(params){
 if(params.get('section')!=='sources')return false;await switchTab('sources',{publish:false});return true;
}
function libraryNavigationURL(settings){
 const query=new URLSearchParams();if(settings.x_series)query.set('series',settings.x_series);
 const studio=settings.chart_type==='map3d'?settings.studio:null,year=studio?.year??settings.view_year??settings.year,place=studio?.focus_id||settings.view_place||settings.geo_id;
 if(Number.isInteger(year))query.set('year',String(year));if(place)query.set('place',place);
 return '/workbench/'+(query.size?'?'+query.toString():'');
}
function describeLibraryNavigation(settings){
 const series=seriesById(settings.x_series),place=settings.chart_type==='map3d'?settings.studio?.focus_id:settings.view_place||settings.geo_id;
 const placeName=placesOf(series).find(p=>p.id===place)?.name||place||'';
 const measure=series?.commodity||label(series),view={map3d:'3D map',map:'Flat map',bar:'Places',time:'History'}[settings.chart_type]||'';
 return [measure,placeName,view].filter(Boolean).join(' · ').slice(0,140);
}
async function restoreLibraryNavigation(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const settings={...value},warnings=[];
 for(const [key,refKey]of [['x_series','x'],['y_series','y']]){
  if(!settings[key])continue;
  const actual=navigationSourceRef(settings[key]),saved=settings.source_refs?.[refKey];
  if(!actual||(saved&&(saved.series_id!==actual.series_id||saved.dataset_id!==actual.dataset_id||(saved.sha256&&saved.sha256!==actual.sha256)))){
   warnings.push(key==='x_series'?'The saved map/source measure is unavailable or has a different source fingerprint.':'The saved outcome measure is unavailable or has a different source fingerprint.');delete settings[key];if(key==='x_series')delete settings.studio;
  }
 }
 // Start with the requested tab so exploration uses X's own native geography and years.
 state.tab=['explore','analyze','sources'].includes(settings.tab)?settings.tab:'explore';
 renderResourceFilters({resource_family:settings.resource_family??'all',resource_stage:settings.resource_stage??'all'});
 $('dataset-filter').value=[...$('dataset-filter').options].some(o=>o.value===settings.dataset_filter)?settings.dataset_filter:'all';
 $('series-search').value=typeof settings.series_search==='string'?settings.series_search:'';
 renderSeriesSelectors(settings);
 for(const [id,key]of [['mode','mode'],['model','model'],['transform','transform'],['lag','lag'],['chart-type','chart_type'],['figure-format','figure_format']]){
  if(settings[key]!==undefined&&[...$(id).options].some(o=>o.value===String(settings[key])))$(id).value=String(settings[key]);
 }
 const preferred={...settings,year:settings.view_year??settings.year,geo_id:settings.view_place||settings.geo_id};
 configureContext(preferred);
 if(preferred.geo_id&&String(currentPlace())!==String(preferred.geo_id))warnings.push('The saved place is not available for this source/comparison; a currently available place is shown.');
 if(preferred.year!==null&&preferred.year!==undefined&&Number(currentYear())!==Number(preferred.year))warnings.push('The saved year is not available for this source/comparison; a currently available year is shown.');
 $('research-question').value=typeof settings.question==='string'?settings.question:'';$('figure-title').value=typeof settings.figure_title==='string'?settings.figure_title:'';
 for(const [id,key]of [['prior-mean','mean'],['prior-scale','scale'],['prior-a','a'],['prior-b','b']])if(finite(settings.prior?.[key]))$(id).value=String(settings.prior[key]);
 $('table-query').value=typeof settings.table_query==='string'?settings.table_query:'';state.tableLimit=Number.isInteger(settings.table_limit)&&settings.table_limit>=100?Math.min(settings.table_limit,10000):100;
 state.studio?.restore(settings.studio);invalidateAnalysis();renderMetadata();renderLibrary();updateMethodNote();
 await switchTab(state.tab,{publish:false});
 // Non-exploration tabs still retain the exact source/table view for the return trip.
 if(state.tab!=='explore')await renderExplore();
 if(warnings.length)notify('Some view settings could not be restored. '+warnings.join(' '),true);
}
async function registerLibraryNavigation(){
 if(window.WorkbenchNavigation){await window.WorkbenchNavigation.register('library',{capture:captureLibraryNavigation,restore:restoreLibraryNavigation,describe:describeLibraryNavigation,section:()=>'library',toURL:libraryNavigationURL});state.navigationReady=true;}
}
async function saveProject(){
 try{$('save-project').disabled=true;const result=await request('/api/project/export',{ui_state:uiState(),analysis:state.analysis});downloadObject(result.project||result,'public-data-workbench-project.json');notify('Project view downloaded with source fingerprints and current controls. Built-in observations stay in the public retained collection; imported datasets are not part of this browser edition.');}
 catch(error){notify(error.message,true);}finally{$('save-project').disabled=false;}
}
async function openProject(file){
 if(!file)return;if(file.size>50*1024*1024){notify('This project file is larger than the 50 MB browser import limit.',true);return;}
 try{const project=JSON.parse(await file.text()),result=await request('/api/project/import',{project});state.data.clear();state.geographies.clear();state.analysis=null;state.studio?.invalidate();const settings=result.ui_state||result.project?.ui_state||project.ui_state||{};
 await refreshCatalog(settings);await restoreLibraryNavigation(settings);const restoredAnalysis=result.analysis||project.analysis;if(restoredAnalysis?.points&&Array.isArray(restoredAnalysis.points)){state.analysis=restoredAnalysis;state.analysisRequest=settings;state.restoredAnalysis=true;renderAnalysis();$('analysis-status').textContent='Saved analysis record restored. Rerun it against the loaded data before exporting a new model figure.';}
 await switchTab(['explore','analyze','sources'].includes(settings.tab)?settings.tab:'explore',{publish:false});navigationChanged(false);notify('Project view reopened in your browser. Source fingerprints were checked against this public collection. New statistical analyses require the original local workbench.');}
 catch(error){notify('The project could not be opened: '+error.message,true);}
}

const ROLE_FIELDS=[['geo_id','Native place identifier'],['geo_name','Place name · optional'],['year','Annual source year · optional'],['metric','Measure name column · optional'],['value','Numeric value column'],['unit','Unit column · optional'],['scope','Geographic scope column · optional'],['source_name','Source name column · optional'],['source_url','Source URL column · optional']];
function columnNames(preview){return(preview.columns||[]).map(c=>typeof c==='string'?c:c.name||c.id||String(c));}
function suggestColumn(role,columns){const aliases={geo_id:['geo_id','geography_id','place_id','state','country','geoid','id','iso3','fips'],geo_name:['geo_name','geography_name','place_name','name','state_name','country_name'],year:['year','fy','source_year','time'],metric:['metric','measure','indicator','series','metric_id'],value:['value','estimate','observation','amount'],unit:['unit','units'],scope:['scope','geography_scope','geography_type'],source_name:['source_name','source','publisher'],source_url:['source_url','url','reference']};return columns.find(c=>(aliases[role]||[]).includes(c.toLowerCase()))||'';}
function renderImportPreview(result){
 state.preview=result;const columns=columnNames(result),rows=result.preview||result.sample||[];$('import-row-count').textContent=`${typeof result.rows==='number'?result.rows:result.row_count??rows.length} rows · ${columns.length} columns`;
 $('import-preview').innerHTML='<table><thead><tr>'+columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,6).map(row=>'<tr>'+columns.map((c,i)=>'<td>'+esc(Array.isArray(row)?row[i]:row[c])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 $('mapping-fields').innerHTML=ROLE_FIELDS.map(([role,name])=>`<label for="map-${role}">${esc(name)}<select id="map-${role}"><option value="">${role==='value'?'Choose a value column…':'No column · use a constant if applicable'}</option>${columns.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`).join('');for(const [role]of ROLE_FIELDS)$('map-'+role).value=suggestColumn(role,columns);
 const sheets=result.workbook_sheets||result.sheet_names||[];$('sheet-label').hidden=!sheets.length;$('import-sheet').innerHTML=sheets.map(s=>{const name=typeof s==='string'?s:s.name;return`<option value="${esc(name)}">${esc(name)}</option>`;}).join('');if(result.sheet)$('import-sheet').value=result.sheet;
 $('import-label').value=state.importFile?.filename.replace(/\.[^.]+$/,'')||'';$('import-preview-stage').hidden=false;
}
async function base64File(file){const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
async function previewImport(file=null,sheet=null){
 if(window.PublicWorkbenchAPI)throw new Error('Dataset import requires the original local Python workbench at http://127.0.0.1:8772/ when it is running on this computer. No dataset is uploaded by this public page.');
 if(file){if(file.size>25*1024*1024)throw new Error('Choose a dataset no larger than 25 MB.');state.importFile={filename:file.name,content_base64:await base64File(file)};}
 if(!state.importFile)return;$('import-status').textContent='Reading the local file and previewing its columns…';$('import-status').classList.remove('error');
 const body={...state.importFile};if(sheet)body.sheet=sheet;const result=await request('/api/preview-import',body);renderImportPreview(result);$('import-status').textContent='Check the column roles, units, geography and source before importing.';
}
async function confirmImport(){
 if(!state.importFile)return;const mapping=Object.fromEntries(ROLE_FIELDS.map(([role])=>[role,$('map-'+role).value||null]));if(!mapping.value)throw new Error('Choose the column containing numeric values.');if(!mapping.geo_id&&!$('import-geo-id').value.trim())throw new Error('Choose a native place identifier column, or enter a fixed identifier for a one-place series.');
 const body={...state.importFile,mapping,constant_unit:$('import-unit').value.trim(),constant_scope:$('import-scope').value,constant_source_url:$('import-source-url').value.trim(),constant_source_name:$('import-source-name').value.trim(),constant_geo_id:$('import-geo-id').value.trim(),constant_geo_name:$('import-geo-name').value.trim(),constant_metric:$('import-label').value.trim(),constant_year:$('import-year').value===''?null:Number($('import-year').value)};if($('import-sheet').value)body.sheet=$('import-sheet').value;
 $('confirm-import').disabled=true;$('import-status').textContent='Importing with the selected measurement roles…';
 try{const result=await request('/api/import',body);state.data.clear();state.studio?.invalidate();invalidateAnalysis();const first=result.series?.[0];await refreshCatalog({x_series:typeof first==='string'?first:first?.id});await renderExplore();$('import-dialog').close();await switchTab('explore',{publish:false});navigationChanged(false);const warnings=(result.warnings||[]).map(w=>typeof w==='string'?w:JSON.stringify(w));notify('Dataset imported locally.'+(warnings.length?' '+warnings.join(' '):' Review its source metadata before modelling.'));}
 finally{$('confirm-import').disabled=false;}
}
function resetImport(){state.importFile=null;state.preview=null;$('import-file').value='';$('import-preview-stage').hidden=true;$('import-status').textContent='';$('import-status').classList.remove('error');for(const id of ['import-unit','import-year','import-geo-id','import-geo-name','import-source-name','import-source-url'])$(id).value='';$('import-scope').value='us_states';$('import-dialog').showModal();}

function wire(){
 state.studio=window.PublicDataMapStudio.mount({request,notify,onYearChange:year=>{if(state.data.has($('x-series').value))renderTable();const s=selectedX();if(s&&$('chart-type').value==='map3d')$('explore-description').innerHTML='<p><strong>'+esc(scopeName(s.scope))+'</strong> · '+esc(s.unit||'Unit unspecified')+' · '+esc(year)+' '+sourceLink(s.source_url,'Source reference')+'</p>';navigationChanged(false);}});
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
 $('resource-family').addEventListener('change',()=>{renderResourceFilters();renderLibrary();});$('resource-stage').addEventListener('change',renderLibrary);$('series-search').addEventListener('input',renderLibrary);$('dataset-filter').addEventListener('change',renderLibrary);$('show-sources').addEventListener('click',()=>switchTab('sources'));
 for(const id of ['x-series','y-series'])$(id).addEventListener('change',()=>changeSelection());$('mode').addEventListener('change',()=>changeSelection());
 for(const id of ['year','place'])$(id).addEventListener('change',async()=>{invalidateAnalysis();await renderExplore();navigationChanged(true);});$('chart-type').addEventListener('change',async()=>{const view=$('chart-type').value;if(view==='map3d'||view==='map')window.EvidenceMapViews.remember(view==='map3d'?'raised3d':'choropleth');state.tableLimit=100;await renderExplore();navigationChanged(true);});
 $('table-query').addEventListener('input',()=>{state.tableLimit=100;renderTable();});$('more-table').addEventListener('click',()=>{state.tableLimit+=200;renderTable();});
 $('analysis-form').addEventListener('submit',runAnalysis);$('research-question').addEventListener('input',()=>{$('research-question').setCustomValidity('');invalidateAnalysis();});
 for(const id of ['model','transform','lag','prior-mean','prior-scale','prior-a','prior-b'])$(id).addEventListener('change',()=>{invalidateAnalysis();updateMethodNote();});
 $('export-explore').addEventListener('click',()=>exportFigure(false));$('export-model').addEventListener('click',()=>exportFigure(true));
 $('download-source-table').addEventListener('click',()=>{const rows=tableRows();const columns=[...new Set(['series_id','geo_id','geo_name','scope','year','period','value','low','high','unit','status','eligible','raw_value','source_id','source_name','source_url',...rows.flatMap(r=>Object.keys(r))])];downloadCSV(rows,columns,'source-observations.csv');});
 $('export-analysis-json').addEventListener('click',()=>{if(state.analysis)downloadObject({request:state.analysisRequest,result:state.analysis},'public-data-analysis.json');});
 $('export-paired-csv').addEventListener('click',()=>{if(state.analysis)downloadCSV(state.analysis.points||[],['geo_id','geo_name','year','x','y','fitted','residual'],'paired-analysis-observations.csv');});
 $('open-import').addEventListener('click',resetImport);$('import-file').addEventListener('change',async e=>{try{if(e.target.files[0])await previewImport(e.target.files[0]);}catch(error){$('import-status').textContent=error.message;$('import-status').classList.add('error');}});
 $('import-sheet').addEventListener('change',async()=>{try{await previewImport(null,$('import-sheet').value);}catch(error){$('import-status').textContent=error.message;$('import-status').classList.add('error');}});
 $('confirm-import').addEventListener('click',async()=>{try{await confirmImport();}catch(error){$('import-status').textContent=error.message;$('import-status').classList.add('error');}});
 $('save-project').addEventListener('click',saveProject);$('open-project').addEventListener('click',()=>$('project-file').click());$('project-file').addEventListener('change',async e=>{try{await openProject(e.target.files[0]);}finally{e.target.value='';}});
 $('retry-load').addEventListener('click',load);
}
async function load(){
 try{if(!location.search && window.EvidenceMapViews.initial(['raised3d','choropleth'])==='choropleth')$('chart-type').value='map';$('loading').hidden=false;$('retry-load').hidden=true;const config=await request('/api/config');state.token=config.token||'';state.studio?.configure(config.animation_formats);$('runtime-note').textContent=config.version?'Version '+config.version:'Python service on this computer';const linkParams=new URLSearchParams(location.search);const linkedSeries=linkParams.get('series');await refreshCatalog(linkedSeries?{x_series:linkedSeries}:{});if(linkedSeries&&state.catalog.series.some(s=>s.id===linkedSeries)){const sy=Number(linkParams.get('year'));state.studio?.restore({series_id:linkedSeries,year:Number.isInteger(sy)&&sy>=1800?sy:undefined,focus_id:linkParams.get('place')||'VA'});}updateMethodNote();$('application').hidden=false;$('loading').hidden=true;await renderExplore();notify('');await applyLibrarySectionLink(linkParams);await registerLibraryNavigation();}
 catch(error){$('loading').querySelector('h1').textContent='The public workbench could not be opened.';$('loading').querySelector('p').textContent=error.message;$('retry-load').hidden=false;notify(error.message,true);}
}
wire();load();
})();
