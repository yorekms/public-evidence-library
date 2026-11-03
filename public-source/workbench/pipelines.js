/* Source-typed flow exploration. All measurements and graph evidence come from retained public source bundles. */
(()=>{'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function endpointSummary(links,id,additive=true){
 const selected=links.filter(l=>l.from_id===id||l.to_id===id);
 const out=selected.filter(l=>l.from_id===id&&finite(l.value)),incoming=selected.filter(l=>l.to_id===id&&finite(l.value));
 return{out:out.length&&additive?out.reduce((n,l)=>n+l.value,0):null,in:incoming.length&&additive?incoming.reduce((n,l)=>n+l.value,0):null,connections:selected.length,missing:selected.filter(l=>!finite(l.value)).length};
}
function magnitudeSummary(links,additive=true){const measured=links.filter(l=>finite(l.value));return{value:measured.length&&additive?measured.reduce((n,l)=>n+Math.abs(l.value),0):null,measured:measured.length,missing:links.length-measured.length};}
function magnitudeShare(link,links,additive=true){const sum=magnitudeSummary(links,additive);return finite(link.value)&&sum.value>0?(Math.abs(link.value)/sum.value*100).toFixed(1)+'% of absolute selected amount':'Share unavailable';}
if(typeof document==='undefined'){if(typeof module!=='undefined')module.exports={endpointSummary,magnitudeSummary,magnitudeShare};return;}
const $=id=>document.getElementById(id),S={token:'',catalog:null,c:null,data:null,facets:null,year:'',epoch:0,detailEpoch:0,abort:null,selected:null,hoverLink:null,hoverNode:null,view:'flows',playing:false,motion:!matchMedia('(prefers-reduced-motion: reduce)').matches,transform:d3.zoomIdentity,width:0,height:0,dpr:1,geo:{},projections:{},hits:[],paths:[],timer:null,frame:null,econ:null,econPayload:null,econBaseline:null,econScenario:null,econEpoch:0,prices:null,pricePromise:null,econHistoryCache:new Map(),econHistoryEpoch:0,households:null,householdPromise:null,essentials:null,essentialsPromise:null,flowMode:'2d',flowScale:'sqrt',flowPalette:'spruce',darkStage:false,globeRot:[-35,-18,0],globeScale:1,globeDragging:false,globeDragStart:null,spikeHits:[]};
let sourceChoiceGeneration=0;
const canvas=$('flow-map'),ctx=canvas.getContext('2d');const fmt=v=>finite(v)?v.toLocaleString(undefined,{maximumFractionDigits:3}):'Unavailable';
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
function optionFill(node,rows,label,value,selected){node.replaceChildren(...rows.map(r=>new Option(label(r),value(r))));if([...node.options].some(o=>o.value===selected))node.value=selected;}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function api(path,payload,signal){return window.PublicPipelineAPI.request(path,payload,signal);}

function safeLink(url,label){if(/^\/(?:industry|ownership|global)\.html/.test(url))url='http://127.0.0.1:8772'+url;const a=el('a','',label);if(url.startsWith('/')||/^https?:\/\//.test(url)){a.href=url;if(!url.startsWith('/')){a.target='_blank';a.rel='noopener noreferrer';}}return a;}

// Navigation snapshot adapter: source selections remain separate from evidence packets.
let pipelineNavigationReady=false,pipelineNavigationRestoring=false,pipelineNavigationRestoreEpoch=0;
function pipelineNavigationChanged(push=false){if(pipelineNavigationReady&&!pipelineNavigationRestoring)window.WorkbenchNavigation?.changed({push});}
function capturePipelineNavigation(){
 const camera=S.transform&&[S.transform.k,S.transform.x,S.transform.y].every(Number.isFinite)?{k:S.transform.k,x:S.transform.x/(S.width||1),y:S.transform.y/(S.height||1)}:null;
 return{view:S.view,filters:S.c?filters():{},node_id:S.selected||'',display_limit:$('display-limit').value,motion:S.motion,camera,flow_studio:{mode:S.flowMode,scale:S.flowScale,palette:S.flowPalette,dark_stage:S.darkStage,globe_rotation:[...S.globeRot],globe_scale:S.globeScale},economic:Object.fromEntries(['econ-year','econ-country','econ-sector','econ-metric','econ-percent'].map(id=>[id,$(id).value])),context_settings:window.PipelineContextUI?.settings()||null,context_fingerprint:window.PipelineContextUI?.catalogFingerprint()||null,context_search:$('context-env-search')?.value||'',context_node_id:$('context-site-picker')?.value||'',source_fingerprint:S.catalog?.fingerprint||null,economic_fingerprint:S.econ?.fingerprint||null,economic_prices:S.prices?.capture()||null,household_context:S.households?.capture()||null,essentials_context:S.essentials?.capture()||null};
}
function pipelineNavigationURL(saved){const p=new URLSearchParams();if(saved.view==='economics')p.set('view','economics');for(const key of['collection','year','metric','focus','direction','commodity','sector','transport','search']){const value=saved.filters?.[key];if(value!==undefined&&value!==null&&String(value)!=='')p.set(key,String(value));}if(saved.node_id)p.set('node_id',saved.node_id);return'/workbench/pipelines.html'+(p.size?'?'+p:'');}
function pipelineNavigationDescription(saved){if(saved.view==='economics')return[saved.economic?.['econ-country'],saved.economic?.['econ-year']].filter(Boolean).join(' · ');const c=S.catalog?.collections.find(c=>c.id===saved.filters?.collection);return[c?.title||saved.filters?.collection,saved.filters?.year].filter(Boolean).join(' · ');}
function pipelineNavigationOption(id,value,missing){if(value===undefined||value===null||value==='')return;const node=$(id);if([...node.options].some(o=>o.value===String(value)))node.value=String(value);else missing.push(id.replaceAll('-',' '));}
async function restorePipelineNavigation(saved){
 if(!saved||typeof saved!=='object')return;const restoreEpoch=++pipelineNavigationRestoreEpoch;pipelineNavigationRestoring=true;stopYears();const missing=[],f=saved.filters||{};
 try{
  if(saved.source_fingerprint&&S.catalog?.fingerprint&&saved.source_fingerprint!==S.catalog.fingerprint){status('The saved navigation selection needs a different pipeline source edition. Current source choices remain visible.',true);return;}
  const collection=S.catalog?.collections.find(c=>c.id===f.collection);
  if(collection){const settings={...f,_navigationRestore:true,search:typeof f.search==='string'?f.search.slice(0,300):''};delete settings.node_id;if(settings.direction!==undefined&&![...$('direction').options].some(o=>o.value===String(settings.direction))){delete settings.direction;missing.push('direction');}await choose(collection.id,settings);if(restoreEpoch!==pipelineNavigationRestoreEpoch)return;for(const key of['year','metric','focus','direction','commodity','sector','transport'])if(f[key]!==undefined&&String(filters()[key])!==String(f[key]))missing.push(key);}
  else if(f.collection)missing.push('source pathway');
  pipelineNavigationOption('display-limit',saved.display_limit,missing);
  if(typeof saved.motion==='boolean'){S.motion=saved.motion;$('animate-flow').textContent=S.motion?'Pause motion':'Animate direction';$('animate-flow').setAttribute('aria-pressed',String(S.motion));}
  if(saved.node_id){if(S.data?.nodes.some(n=>n.id===saved.node_id)){await selectNode(saved.node_id,false);if(restoreEpoch!==pipelineNavigationRestoreEpoch)return;}else missing.push('selected endpoint');}
  await S.contextReady;if(restoreEpoch!==pipelineNavigationRestoreEpoch)return;
  if(saved.context_settings){try{window.PipelineContextUI?.restore(saved.context_settings,saved.context_fingerprint||undefined);if(typeof saved.context_search==='string'){$('context-env-search').value=saved.context_search.slice(0,160);$('context-env-search').dispatchEvent(new Event('input',{bubbles:true}));}await window.PipelineContextUI?.flowChanged();if(restoreEpoch!==pipelineNavigationRestoreEpoch)return;if(saved.context_node_id){const picker=$('context-site-picker');if([...picker.options].some(o=>o.value===saved.context_node_id)){picker.value=saved.context_node_id;picker.dispatchEvent(new Event('change',{bubbles:true}));}else missing.push('selected evidence facility');}}catch{missing.push('ownership/environment source edition');}}
  const economic=saved.view==='economics',hasEconomicSettings=!!saved.economic?.['econ-year'];await setView(economic,{baseline:false});if(restoreEpoch!==pipelineNavigationRestoreEpoch)return;
  if(hasEconomicSettings&&!S.econ){await openEconomics({baseline:false});if(restoreEpoch!==pipelineNavigationRestoreEpoch)return;}
  if(economic||hasEconomicSettings){if(saved.economic_fingerprint&&S.econ?.fingerprint&&saved.economic_fingerprint!==S.econ.fingerprint)missing.push('economic source edition');else{S.econEpoch++;S.scenarioEpoch=(S.scenarioEpoch||0)+1;S.econScenario=null;S.econBaseline=null;S.econPayload=null;$('econ-baseline').replaceChildren();for(const id of['econ-year','econ-country','econ-sector','econ-metric'])pipelineNavigationOption(id,saved.economic?.[id],missing);const rawPercent=saved.economic?.['econ-percent'],percent=Number(rawPercent);if(rawPercent==='')$('econ-percent').value='';else if(rawPercent!==undefined&&Number.isFinite(percent)&&percent>=-100&&percent<=100)$('econ-percent').value=String(percent);else if(rawPercent!==undefined)missing.push('demand change');if(saved.economic_prices&&S.prices){try{S.prices.restore(saved.economic_prices,{notify:false});}catch{missing.push('price-source edition');S.prices.setBasis('original',{notify:false});}}if(saved.household_context&&S.households){try{S.households.restore(saved.household_context);}catch{missing.push('household-source edition');}}if(saved.essentials_context&&S.essentials){try{S.essentials.restore(saved.essentials_context);}catch{missing.push('essentials-source edition');}}if(economic){await economicBaseline();if(restoreEpoch!==pipelineNavigationRestoreEpoch)return;}if(saved.economic)$('econ-result').replaceChildren(el('p','small','Economic input settings restored. Calculate the demand scenario explicitly to obtain a new source-attached result.'));}}
  const camera=saved.camera;if(!economic&&camera&&[camera.k,camera.x,camera.y].every(Number.isFinite)&&camera.k>=.65&&camera.k<=40&&Math.abs(camera.x)<=64&&Math.abs(camera.y)<=64)d3.select(canvas).call(zoom.transform,d3.zoomIdentity.translate(camera.x*S.width,camera.y*S.height).scale(camera.k));
  const studio=saved.flow_studio;
  if(studio){
   if(['2d','globe','spikes'].includes(studio.mode))S.flowMode=studio.mode;
   if(['sqrt','linear','log','quantile'].includes(studio.scale))S.flowScale=studio.scale;
   if(Object.hasOwn(FLOW_PALETTES,studio.palette))S.flowPalette=studio.palette;
   if(typeof studio.dark_stage==='boolean')S.darkStage=studio.dark_stage;
   if(Array.isArray(studio.globe_rotation)&&studio.globe_rotation.length===3&&studio.globe_rotation.every(Number.isFinite))S.globeRot=studio.globe_rotation.slice();
   if(finite(studio.globe_scale)&&studio.globe_scale>=.65&&studio.globe_scale<=8)S.globeScale=studio.globe_scale;
   syncFlowStudioControls();P=projection();
  }
  draw();if(missing.length)status('View partly restored. Unavailable saved settings: '+[...new Set(missing)].join(', ')+'. Current source choices remain visible.',true);
 }finally{if(restoreEpoch===pipelineNavigationRestoreEpoch)pipelineNavigationRestoring=false;}
}
async function registerPipelineNavigation(){if(!window.WorkbenchNavigation)return;await window.WorkbenchNavigation.register('pipelines',{capture:capturePipelineNavigation,restore:restorePipelineNavigation,describe:pipelineNavigationDescription,section:saved=>saved.view==='economics'?'economics':'flows',toURL:pipelineNavigationURL});pipelineNavigationReady=true;}
// End navigation snapshot adapter.

function filters(){return {collection:S.c.id,year:S.year,metric:$('metric').value,focus:$('focus').value||'all',direction:$('direction').value,commodity:$('commodity').value,sector:$('sector').value,transport:$('transport').value,search:$('search').value.trim()};}
function stopYears(){S.playing=false;clearTimeout(S.timer);$('play-years').textContent='Play periods';$('play-years').setAttribute('aria-pressed','false');}
function periodControls(){const ys=S.c.years||[],i=ys.indexOf(S.year);$('period').max=Math.max(0,ys.length-1);$('period').value=Math.max(0,i);$('period').setAttribute('aria-valuetext',S.year);$('period-label').textContent=S.year;$('previous').disabled=i<=0;$('next').disabled=i>=ys.length-1;$('play-years').disabled=ys.length<2;$('time-note').textContent=S.c.time_semantics||'Only actual loaded source periods are offered.';const gif=$('export-format').querySelector('option[value=gif]');gif.disabled=ys.length<2||ys.length>24;gif.textContent=gif.disabled?'GIF · needs 2–24 source periods':'GIF · in the local workbench ↗';if(gif.disabled&&$('export-format').value==='gif')$('export-format').value='png';}
function collectionLoading(flag){S.loadingCollection=flag;for(const id of ['focus','direction','metric','commodity','sector','transport','search','virginia','all-places','period','previous','next','play-years','save-view','export','node-picker','browse-records'])$(id).disabled=flag;}
function clearDetail(){S.detailEpoch++;$('detail-title').textContent='Choose an endpoint.';$('detail-intro').textContent='Open its source fields, reported connections and actual history.';$('detail-body').replaceChildren();S.selected=null;}
async function choose(id,settings={}){sourceChoiceGeneration++;if(!settings._navigationRestore){pipelineNavigationRestoreEpoch++;pipelineNavigationRestoring=false;}stopYears();clearTimeout(searchTimer);S.abort?.abort();S.epoch++;S.detailEpoch++;const c=S.catalog.collections.find(c=>c.id===id);if(!c)throw Error('This pathway is not installed.');S.c=c;S.data=null;window.PipelineContextUI?.clear();S.year='';collectionLoading(true);draw();clearDetail();$('collection').value=id;status('Opening '+c.title+'…');$('map-wrap').setAttribute('aria-busy','true');const epoch=S.epoch;S.abort=new AbortController();let fs;try{fs=await api('/api/pipelines/facets?collection='+encodeURIComponent(id),undefined,S.abort.signal);}catch(e){if(epoch!==S.epoch)return;collectionLoading(false);$('export').disabled=true;$('map-wrap').setAttribute('aria-busy','false');throw e;}if(epoch!==S.epoch)return;S.facets=fs;S.year=(c.years||[]).includes(String(settings.year))?String(settings.year):c.default_year||c.years.at(-1);
optionFill($('metric'),c.metrics||[],m=>m.label+' · '+m.unit,m=>m.id,settings.metric||c.default_metric||c.metrics?.[0]?.id);
const places=[{id:'all',label:'All reported places'},...fs.places];let focus=settings.focus??c.default_focus??(id.startsWith('trade_')?'all':id.startsWith('econ_')?'USA':'VA');optionFill($('focus'),places,p=>(p.id==='VA'?'Virginia (VA)':p.label)+(p.kind?' · '+p.kind:''),p=>p.id,focus);if(![...$('focus').options].some(o=>o.value===focus))$('focus').value='all';
for(const [id,key,label] of [['commodity','commodities','All reported materials'],['sector','sectors','All reported sectors'],['transport','transports','All reported channels']]){const rows=[{id:'all',label},...(fs[key]||[]).map(x=>typeof x==='string'?{id:x,label:x}:x)];optionFill($(id),rows,x=>x.label,x=>x.id,settings[id]||'all');$(id).parentElement.hidden=rows.length<3;}
$('direction').value=settings.direction||c.default_direction||'either';$('search').value=settings.search||'';for(const b of document.querySelectorAll('[data-start]'))b.classList.toggle('active',b.dataset.start===id);collectionLoading(false);periodControls();pipelineNavigationChanged(true);await query(true);if(settings.node_id)selectNode(settings.node_id,true);}
async function query(fit=false){if(!S.c||S.loadingCollection||!S.year)return;const epoch=++S.epoch;S.abort?.abort();S.abort=new AbortController();window.PipelineContextUI?.clear();$('map-wrap').setAttribute('aria-busy','true');$('export').disabled=true;status('Reading '+S.c.title+' · '+S.year+'…');try{const data=await api('/api/pipelines/query',filters(),S.abort.signal);if(epoch!==S.epoch)return;S.data=data;render(data);if(fit)fitMap();else draw();$('map-wrap').setAttribute('aria-busy','false');$('export').disabled=false;const localURL='http://127.0.0.1:8772/pipelines.html?'+new URLSearchParams(filters());$('local-flow-context').href=localURL;status(data.counts.source_records.toLocaleString()+' source rows · '+data.counts.connections.toLocaleString()+' endpoint connections · '+data.year+'.');window.PipelineContextUI?.flowChanged();if(S.selected)selectNode(S.selected,false,true);pipelineNavigationChanged(false);}catch(e){if(e.name==='AbortError'||epoch!==S.epoch)return;S.data=null;window.PipelineContextUI?.clear();S.hits=[];S.paths=[];draw();$('counts').replaceChildren();$('flow-diagram').replaceChildren();clearDetail();$('map-empty').hidden=false;$('map-empty').textContent=e.message;$('map-wrap').setAttribute('aria-busy','false');status(e.message,true);}}
function render(d){$('map-title').textContent=d.title+' · '+d.year;$('map-subtitle').textContent=d.metric.label+' · '+d.metric.unit+(d.links.some(l=>l.value<0)?' · brown lines retain negative source values':'');$('scope-note').textContent=d.geographic_scope+' · '+d.time_semantics;$('counts').replaceChildren();for(const [value,label] of [[d.total===null?'Reference view':fmt(d.total),d.total===null?'Quantities not summed':d.metric.unit+' · available selected records'],[d.counts.source_records.toLocaleString(),'Original source rows'],[d.counts.connections.toLocaleString(),'Grouped endpoint connections'],[d.counts.measured.toLocaleString(),d.counts.missing.toLocaleString()+' rows without this measure']]){const card=el('div','count');card.append(el('strong','',value),el('span','',label));$('counts').append(card);}
const picker=$('node-picker');optionFill(picker,[{id:'',label:'Choose a place or reported node'},...d.nodes.slice().sort((a,b)=>a.label.localeCompare(b.label))],n=>n.label,n=>n.id,S.selected||'');
renderDiagram(d);renderTrend(d.trend,d.metric);renderSources($('sources'),d.sources);$('limitations').replaceChildren(...(d.limitations||[]).map(t=>el('li','',t)));$('table-count').textContent='· '+d.table.length+' of '+d.counts.source_records.toLocaleString()+' rows';const lookup=new Map(d.nodes.map(n=>[n.id,n]));$('records-table').replaceChildren();for(const r of d.table){const tr=el('tr');for(const key of ['from_id','to_id']){const td=el('td'),button=el('button','',lookup.get(r[key])?.label||r[key]);button.addEventListener('click',()=>selectNode(r[key],true));td.append(button);tr.append(td);}tr.append(el('td','',fmt(d.metric.field?r[d.metric.field]:null)+' '+d.metric.unit),el('td','',String(r.evidence_type||'Source reference').replaceAll('_',' ')));$('records-table').append(tr);}$('original-records').replaceChildren();$('browse-records').disabled=!d.records_count;resize(false);}
function renderSources(root,sources){root.replaceChildren();for(const s of sources||[]){const div=el('div','source');div.append(safeLink(s.url||'',s.title||s.id),el('p','',s.license||s.reuse||''),el('p','',[s.period_basis,s.observed_as_of].filter(Boolean).join(' · ')));const details=el('details');details.append(el('summary','','Source fields & fingerprint'),el('pre','',JSON.stringify(s,null,2)));div.append(details);root.append(div);}}
function renderTrend(rows,metric,container=$('trend')){container.replaceChildren();const valid=rows.filter(r=>finite(r.value));if(!valid.length){container.append(el('p','small','No additive measured history is offered for this reference view.'));return;}const w=Math.max(300,container.clientWidth||580),h=230,m={left:68,right:22,top:25,bottom:42};const svg=d3.select(container).append('svg').attr('viewBox',[0,0,w,h]);const x=d3.scalePoint().domain(rows.map(r=>r.year)).range([m.left,w-m.right]);const lo=Math.min(0,d3.min(valid,r=>r.value)),hi=Math.max(0,d3.max(valid,r=>r.value));const y=d3.scaleLinear().domain(lo===hi?[lo,lo+1]:[lo,hi]).nice().range([h-m.bottom,m.top]);svg.append('g').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).tickValues(rows.filter((_,i)=>rows.length<(w<450?4:8)||i%Math.ceil(rows.length/(w<450?3:7))===0||i===rows.length-1).map(r=>r.year)));svg.append('g').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('~s')));svg.selectAll('.domain').attr('stroke','#b8c8b5');svg.selectAll('.tick text').attr('font-size',12).attr('fill','#536c57');svg.append('path').datum(rows).attr('d',d3.line().defined(r=>finite(r.value)).x(r=>x(r.year)).y(r=>y(r.value))).attr('fill','none').attr('stroke','#1f6f5f').attr('stroke-width',2);svg.selectAll('circle').data(valid).join('circle').attr('cx',r=>x(r.year)).attr('cy',r=>y(r.value)).attr('r',3.5).attr('fill','#1f6f5f');$('trend-title').textContent=metric.label+' · '+metric.unit;}

const FLOW_PALETTES = {
  spruce: ['#2b5c4f', '#1f7a68', '#289c82', '#6bc294', '#d99b26', '#f0b44c'],
  viridis: ['#440154', '#31688e', '#21918c', '#35b779', '#90d743', '#fde725'],
  ylgnbu: ['#225ea8', '#1d91c0', '#41b6c4', '#7fcdbb', '#c7e9b4', '#edf8b1'],
  diverging: ['#2b6cb0', '#4299e1', '#81e6d9', '#fbd38d', '#ed8936', '#dd6b20']
};

function fmtCompact(v) {
  if (!finite(v)) return 'Unavailable';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function computeNormalizedScore(val, maxVal, sortedPositive) {
  if (!finite(val)) return 0;
  const a = Math.abs(val);
  const m = Math.max(1e-9, maxVal);
  if (S.flowScale === 'linear') return Math.min(1, a / m);
  if (S.flowScale === 'log') return Math.min(1, Math.log10(1 + a) / Math.max(1e-9, Math.log10(1 + m)));
  if (S.flowScale === 'quantile' && sortedPositive && sortedPositive.length > 1) {
    let lo = 0, hi = sortedPositive.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedPositive[mid] < a) lo = mid + 1;
      else hi = mid;
    }
    return lo / (sortedPositive.length - 1);
  }
  return Math.min(1, Math.sqrt(a / m));
}

function samplePaletteColor(t, alpha = 1) {
  const stops = FLOW_PALETTES[S.flowPalette] || FLOW_PALETTES.spruce;
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const c1 = d3.rgb(stops[i]), c2 = d3.rgb(stops[i + 1]);
  const r = Math.round(c1.r + (c2.r - c1.r) * f);
  const g = Math.round(c1.g + (c2.g - c1.g) * f);
  const b = Math.round(c1.b + (c2.b - c1.b) * f);
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

function renderFlowHistogram(shownLinks, maxVal, sortedPositive) {
  const svg = $('flow-legend-svg');
  if (!svg) return;
  svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const add = (p, tag, attrs, txt) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
    if (txt !== undefined) e.textContent = txt;
    p.appendChild(e);
    return e;
  };
  const scaleLabels = { sqrt: '√x Sqrt Scale', linear: 'Linear Scale', log: 'Log₁₀ Scale', quantile: 'Quantile Rank Scale' };
  if ($('flow-legend-title')) {
    $('flow-legend-title').textContent = `Absolute Connection Amounts · ${scaleLabels[S.flowScale] || 'Sqrt Scale'} (${shownLinks.length} shown)`;
  }
  const measured = shownLinks.filter(l => finite(l.value));
  if (!measured.length) {
    add(svg, 'text', { x: 340, y: 36, 'text-anchor': 'middle', fill: S.darkStage ? '#8eb0a1' : '#5d7466', 'font-size': 12 }, 'Reference connections only — no numerical volumes to bin');
    return;
  }
  const binsCount = 28;
  const bins = new Array(binsCount).fill(0);
  for (const l of measured) {
    const norm = computeNormalizedScore(l.value, maxVal, sortedPositive);
    const idx = Math.min(binsCount - 1, Math.max(0, Math.floor(norm * binsCount)));
    bins[idx]++;
  }
  const maxBin = Math.max(1, ...bins);
  const padL = 12, padR = 12, W = 680 - padL - padR, topY = 8, barH = 38;
  const bw = W / binsCount;
  for (let i = 0; i < binsCount; i++) {
    const t = (i + 0.5) / binsCount;
    const h = bins[i] > 0 ? Math.max(4, (bins[i] / maxBin) * barH) : 1.5;
    add(svg, 'rect', {
      x: (padL + i * bw + 1).toFixed(1),
      y: (topY + barH - h).toFixed(1),
      width: Math.max(2, bw - 2).toFixed(1),
      height: h.toFixed(1),
      rx: 2,
      fill: bins[i] > 0 ? samplePaletteColor(t, 0.92) : (S.darkStage ? '#1d362f' : '#dce5d8')
    });
  }
  // Gradient bar underneath
  for (let i = 0; i < binsCount; i++) {
    const t = (i + 0.5) / binsCount;
    add(svg, 'rect', {
      x: (padL + i * bw).toFixed(1),
      y: topY + barH + 3,
      width: (bw + 0.6).toFixed(1),
      height: 5,
      fill: samplePaletteColor(t, 1)
    });
  }
  const unit = S.data?.metric?.unit || '';
  add(svg, 'text', { x: padL, y: 64, fill: S.darkStage ? '#9abcae' : '#536c57', 'font-size': 10.5 }, '0 ' + unit);
  add(svg, 'text', { x: 340, y: 64, 'text-anchor': 'middle', fill: S.darkStage ? '#9abcae' : '#536c57', 'font-size': 10.5 }, 'Median: ' + fmtCompact(sortedPositive[Math.floor(sortedPositive.length / 2)] || 0) + ' ' + unit);
  add(svg, 'text', { x: 680 - padR, y: 64, 'text-anchor': 'end', fill: S.darkStage ? '#9abcae' : '#536c57', 'font-size': 10.5 }, 'Fixed scale max: ' + fmtCompact(maxVal) + ' ' + unit);

  // Amber hover needle if a link or node is hovered
  let hoverVal = null, hoverLabel = '';
  if (S.hoverLink && finite(S.hoverLink.value)) {
    hoverVal = S.hoverLink.value;
    const lookup = new Map((S.data?.nodes || []).map(n => [n.id, n]));
    hoverLabel = (lookup.get(S.hoverLink.from_id)?.label || S.hoverLink.from_id) + ' → ' + (lookup.get(S.hoverLink.to_id)?.label || S.hoverLink.to_id) + ': ' + fmtCompact(hoverVal) + ' ' + unit;
  }
  if (hoverVal !== null) {
    const norm = computeNormalizedScore(hoverVal, maxVal, sortedPositive);
    const nx = padL + norm * W;
    add(svg, 'line', { x1: nx, y1: 2, x2: nx, y2: topY + barH + 10, stroke: '#f0b44c', 'stroke-width': 2.5 });
    add(svg, 'circle', { cx: nx, cy: topY + barH + 5, r: 4, fill: '#f0b44c', stroke: '#10211c', 'stroke-width': 1.2 });
    if ($('flow-legend-stats')) $('flow-legend-stats').textContent = hoverLabel;
  } else if ($('flow-legend-stats')) {
    $('flow-legend-stats').textContent = 'Hover any flow arc or node to inspect';
  }
}

function updateFlowInspector(shownLinks) {
  const d = S.data;
  if (!d || !$('flow-top-list')) return;
  const lookup = new Map(d.nodes.map(n => [n.id, n]));
  const unit = d.metric?.unit || '';
  const focusId = S.hoverNode || S.selected || (S.hoverLink ? S.hoverLink.from_id : null);

  if (focusId && lookup.has(focusId)) {
    const node = lookup.get(focusId);
    const summary=endpointSummary(d.links,focusId,d.additive);
    $('flow-hub-title').textContent = node.label;
    $('flow-hub-subtitle').textContent = [node.stage || node.type, node.state, node.country_iso3].filter(Boolean).join(' · ') || 'Selected reporting endpoint';
    $('flow-hub-subtitle').textContent += summary.missing ? ' · '+summary.missing+' unquantified connections excluded from sums' : '';
    $('flow-hub-out-label').textContent='Reported outbound';
    $('flow-hub-in-label').textContent='Reported inbound';
    $('flow-hub-out').textContent = summary.out===null?'Unavailable':fmtCompact(summary.out)+' '+unit;
    $('flow-hub-in').textContent = summary.in===null?'Unavailable':fmtCompact(summary.in)+' '+unit;
    $('flow-hub-count').textContent = summary.connections.toLocaleString()+' links';
  } else {
    const summary=magnitudeSummary(shownLinks,d.additive);
    $('flow-hub-title').textContent = 'All Displayed Endpoints';
    $('flow-hub-subtitle').textContent = d.title+' ('+d.year+')'+(summary.missing?' · '+summary.missing+' unquantified connections':'');
    $('flow-hub-out-label').textContent='Absolute shown amount';
    $('flow-hub-in-label').textContent='Selected endpoints';
    $('flow-hub-out').textContent=summary.value===null?'Unavailable':fmtCompact(summary.value)+' '+unit;
    $('flow-hub-in').textContent=d.nodes.length.toLocaleString()+' nodes';
    $('flow-hub-count').textContent=shownLinks.length.toLocaleString()+' shown';
  }

  // Populate top pathways list
  const listRoot = $('flow-top-list');
  listRoot.replaceChildren();
  const topLinks = shownLinks.slice(0, 18);
  const maxVal = d.fixed_width_domain?.[1] || d3.max(topLinks, l => Math.abs(l.value || 0)) || 1;
  let totalAll = 0;
  for (const l of d.links) if (finite(l.value)) totalAll += Math.abs(l.value);

  if (!topLinks.length) {
    listRoot.append(el('p', 'small', 'No geographical pathways in current filter.'));
    return;
  }

  topLinks.forEach((l, idx) => {
    const fromLabel = lookup.get(l.from_id)?.label || l.from_id;
    const toLabel = lookup.get(l.to_id)?.label || l.to_id;
    const item = el('button', 'flow-rank-item');
    item.type = 'button';
    if (S.hoverLink === l) item.classList.add('hovered');
    if (S.selected && (l.from_id === S.selected || l.to_id === S.selected)) item.classList.add('selected');

    const topRow = el('div', 'flow-rank-top');
    topRow.append(
      el('span', 'flow-rank-route', `#${idx + 1} ${fromLabel} → ${toLabel}`),
      el('span', 'flow-rank-val', finite(l.value) ? fmtCompact(l.value) + ' ' + unit : 'Ref')
    );

    const track = el('div', 'flow-rank-bar-track');
    const fill = el('div', 'flow-rank-bar-fill');
    const pct = finite(l.value) ? Math.max(4, Math.min(100, Math.sqrt(Math.abs(l.value) / maxVal) * 100)) : 12;
    fill.style.width = pct.toFixed(1) + '%';
    track.append(fill);

    const share = (finite(l.value) && totalAll > 0) ? magnitudeShare(l,d.links,d.additive) : 'Unquantified reference';
    const meta = el('div', 'flow-rank-meta');
    meta.append(
      el('span', '', share),
      el('span', '', (l.source_records || 1) + ' source row' + ((l.source_records || 1) > 1 ? 's' : ''))
    );

    item.append(topRow, track, meta);
    item.addEventListener('pointerenter', () => { S.hoverLink = l; draw(); syncDiagramHover(); });
    item.addEventListener('pointerleave', () => { S.hoverLink = null; draw(); syncDiagramHover(); });
    item.addEventListener('click', () => {
      selectNode(l.from_id, true);
    });
    listRoot.append(item);
  });
}

function syncDiagramHover() {
  const root = $('flow-diagram');
  if (!root || !S.data) return;
  const paths = root.querySelectorAll('path[data-link-idx]');
  paths.forEach(p => {
    const idx = Number(p.getAttribute('data-link-idx'));
    const l = S.data.links[idx];
    if (!l) return;
    const isHov = (S.hoverLink && (S.hoverLink === l || (S.hoverLink.from_id === l.from_id && S.hoverLink.to_id === l.to_id))) ||
                  (S.hoverNode && (l.from_id === S.hoverNode || l.to_id === S.hoverNode));
    const anyHov = !!(S.hoverLink || S.hoverNode);
    p.setAttribute('opacity', isHov ? '1' : (anyHov ? '0.14' : '0.45'));
    p.setAttribute('stroke', isHov ? '#d99b26' : (finite(l.value) ? l.value<0?'#c07848':'#1f6f5f' : '#a1ada3'));
  });
}

function renderDiagram(d){
  const root=$('flow-diagram');root.replaceChildren();const max=12,links=d.links.slice(0,max),lookup=new Map(d.nodes.map(n=>[n.id,n]));
  if(!links.length){root.append(el('p','small','This is an establishment/reference collection. Explore the reported country groups and source records.'));$('diagram-note').textContent='No shipment or product-supplier links are inferred.';return;}
  const sourceIds=[...new Set(links.map(l=>l.from_id))],targetIds=[...new Set(links.map(l=>l.to_id))];
  const rows=Math.max(sourceIds.length,targetIds.length),h=Math.max(230,rows*40+70),w=Math.max(700,root.clientWidth||950),pad=40,leftX=w*.30,rightX=w*.68;
  const svg=d3.select(root).append('svg').attr('viewBox',[0,0,w,h]).style('min-width',w+'px');
  const sy=d3.scalePoint().domain(sourceIds).range([pad+15,h-pad]),ty=d3.scalePoint().domain(targetIds).range([pad+15,h-pad]);
  svg.append('text').attr('x',25).attr('y',22).text('Reported from (Origin)').attr('font-size',12).attr('font-weight',600).attr('fill','#5d7466');
  svg.append('text').attr('x',rightX+12).attr('y',22).text('Reported to (Destination)').attr('font-size',12).attr('font-weight',600).attr('fill','#5d7466');
  const maximum=d.fixed_width_domain[1]||d3.max(links,l=>Math.abs(l.value||0))||1;
  links.forEach((l, idx) => {
    const p=`M${leftX},${sy(l.from_id)} C${leftX+(rightX-leftX)*.42},${sy(l.from_id)} ${leftX+(rightX-leftX)*.58},${ty(l.to_id)} ${rightX},${ty(l.to_id)}`;
    const linkPath=svg.append('path').attr('d',p).attr('data-link-idx', idx).attr('fill','none').attr('stroke',finite(l.value)?l.value<0?'#c07848':'#1f6f5f':'#a1ada3').attr('opacity',S.hoverLink===l?1:(S.hoverLink?0.15:.45)).attr('stroke-width',finite(l.value)?(S.hoverLink===l?4.5:1.5+14*Math.sqrt(Math.abs(l.value)/maximum)):2).attr('stroke-dasharray',finite(l.value)?null:'5 4').style('cursor','pointer');
    linkPath.append('title').text((lookup.get(l.from_id)?.label||l.from_id)+' → '+(lookup.get(l.to_id)?.label||l.to_id)+' · '+fmt(l.value)+' '+d.metric.unit);
    linkPath.on('pointerenter',()=>{S.hoverLink=l;draw();syncDiagramHover();}).on('pointerleave',()=>{S.hoverLink=null;draw();syncDiagramHover();}).on('click',()=>selectNode(l.from_id,true));
  });
  for(const [ids,scale,x,anchor] of [[sourceIds,sy,leftX-11,'end'],[targetIds,ty,rightX+13,'start']])for(const id of ids){
    const label=lookup.get(id)?.label||id;
    const g=svg.append('g').attr('role','button').attr('tabindex',0).style('cursor','pointer').on('click',()=>selectNode(id,true)).on('pointerenter',()=>{S.hoverNode=id;draw();syncDiagramHover();}).on('pointerleave',()=>{S.hoverNode=null;draw();syncDiagramHover();}).on('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(id,true);}});
    g.append('circle').attr('cx',anchor==='end'?leftX:rightX).attr('cy',scale(id)).attr('r',4.5).attr('fill',anchor==='end'?'#d99b26':'#1f6f5f');
    g.append('text').attr('x',x).attr('y',scale(id)+4).attr('text-anchor',anchor).attr('font-size',13).attr('fill','#1a4636').text(label.length>Math.floor(w*.30/7.5)?label.slice(0,Math.floor(w*.30/7.5)-3)+'…':label).append('title').text(label);
  }
  $('diagram-note').textContent='Showing '+links.length+' of '+d.links.length.toLocaleString()+' connections for legibility. Complete selected records remain in CSV/JSON. Layout shows source endpoint roles; it does not fill missing processing or transport stages.';
}

function geographic(){const nodes=S.data?.nodes||[];return nodes.length&&nodes.every(n=>!n.country_iso3||n.country_iso3==='USA')&&nodes.some(n=>n.state||n.scope==='us_states')?'us_states':'world';}
function anchor(n){if(n.map_eligible!==false&&n.physical_location!==false&&finite(n.lon)&&finite(n.lat))return[n.lon,n.lat];if(n.region_anchor_allowed&&['world','us_states'].includes(n.scope)&&n.geo_id){const f=S.geo[n.scope]?.features.find(f=>String(f.id??f.properties?.id)===String(n.geo_id));if(f)return d3.geoCentroid(f);}return null;}
function projection(){
  const scope=geographic();
  if (S.flowMode === 'globe') {
    const baseR = Math.min(S.width, S.height) * 0.42 * (S.globeScale || 1);
    return d3.geoOrthographic()
      .translate([S.width / 2, S.height / 2])
      .scale(baseR)
      .clipAngle(90)
      .rotate(S.globeRot || [-35, -18, 0]);
  }
  return scope==='us_states'?d3.geoAlbersUsa().fitExtent([[25,20],[S.width-25,S.height-25]],S.geo.us_states):d3.geoEqualEarth().fitExtent([[20,20],[S.width-20,S.height-25]],S.geo.world);
}

let P=null;
const zoom=d3.zoom().scaleExtent([.65,40]).filter(e => {
  if (S.flowMode === 'globe' && e.type === 'mousedown') return false;
  return !e.ctrlKey && !e.button;
}).on('zoom',e=>{
  if (S.flowMode === 'globe') {
    S.globeScale = Math.max(0.65, Math.min(8, e.transform.k));
    P = projection();
    draw();
  } else {
    S.transform=e.transform;
    draw();
  }
}).on('end.navigation',()=>pipelineNavigationChanged(false));
d3.select(canvas).call(zoom).on('dblclick.zoom',null);

// Globe drag rotation
canvas.addEventListener('pointerdown', e => {
  if (S.flowMode !== 'globe' || e.button !== 0) return;
  S.globeDragging = true;
  S.globeMoved = false;
  S.globeDragStart = { x: e.clientX, y: e.clientY, rot: [...(S.globeRot || [-35, -18, 0])] };
});
window.addEventListener('pointermove', e => {
  if (!S.globeDragging || S.flowMode !== 'globe' || !S.globeDragStart) return;
  const dx = e.clientX - S.globeDragStart.x;
  const dy = e.clientY - S.globeDragStart.y;
  if (Math.hypot(dx, dy) > 3) S.globeMoved = true;
  const sens = 0.35 / Math.sqrt(S.globeScale || 1);
  S.globeRot = [
    S.globeDragStart.rot[0] + dx * sens,
    Math.max(-80, Math.min(80, S.globeDragStart.rot[1] - dy * sens)),
    0
  ];
  P = projection();
  draw();
});
window.addEventListener('pointerup', () => {
  S.globeDragging = false;
});

function resize(fit=true){const r=$('map-wrap').getBoundingClientRect();if(r.width<1)return;const changed=S.width!==r.width||S.height!==r.height;S.width=r.width;S.height=r.height;S.dpr=Math.min(2,devicePixelRatio||1);canvas.width=S.width*S.dpr;canvas.height=S.height*S.dpr;if(S.geo.world&&S.geo.us_states)P=projection();if(changed&&fit&&S.data)fitMap();else draw();}

function fitMap(){
  if(!S.data||!P)return;
  if (S.flowMode === 'globe') {
    S.globeScale = 1;
    const coords = S.data.nodes.map(anchor).filter(Boolean);
    if (coords.length) {
      // Center globe on primary origin or mean coordinate
      const firstLink = S.data.links[0];
      const primaryNode = firstLink ? S.data.nodes.find(n => n.id === firstLink.from_id) : S.data.nodes[0];
      const c = (primaryNode && anchor(primaryNode)) || coords[0];
      if (c) S.globeRot = [-c[0], -Math.max(-65, Math.min(65, c[1] * 0.7)), 0];
    }
    P = projection();
    draw();
    return;
  }
  P = projection();
  const ps=(S.data.collection==='pharma_registry'?S.data.nodes.filter(n=>n.type==='establishment_registration').map(n=>{const geo=n.state&&n.country_iso3==='USA'?S.geo.us_states:S.geo.world,key=n.state&&n.country_iso3==='USA'?n.state:n.country_iso3,f=geo.features.find(f=>(f.id??f.properties.id)===key);return f?d3.geoCentroid(f):null;}):S.data.nodes.map(anchor)).filter(Boolean).map(p=>P(p)).filter(Boolean);
  if(!ps.length){d3.select(canvas).call(zoom.transform,d3.zoomIdentity);return;}
  const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const k=Math.min(16,Math.max(.8,.82/Math.max((right-left)/S.width,(bottom-top)/S.height,.08)));
  d3.select(canvas).call(zoom.transform,d3.zoomIdentity.translate(S.width/2-k*(left+right)/2,S.height/2-k*(top+bottom)/2).scale(k));
}

function isFrontHemisphere(lonLat) {
  if (!lonLat) return false;
  const rot = S.globeRot || [-35, -18, 0];
  const center = [-rot[0], -rot[1]];
  return d3.geoDistance(lonLat, center) <= Math.PI * 0.505;
}

function draw3DSpike(ctx, x, y, height, radius, topColor, sideColorLeft, sideColorRight, isHighlighted) {
  if (height < 2) return;
  const topY = y - height;
  // Base shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.beginPath();
  ctx.ellipse(x + height * 0.14, y + 2, radius * 1.25, radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Left prism face
  ctx.beginPath();
  ctx.moveTo(x - radius, y);
  ctx.lineTo(x, topY);
  ctx.lineTo(x, y + radius * 0.42);
  ctx.closePath();
  ctx.fillStyle = sideColorLeft;
  ctx.fill();

  // Right prism face
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x, topY);
  ctx.lineTo(x, y + radius * 0.42);
  ctx.closePath();
  ctx.fillStyle = sideColorRight;
  ctx.fill();

  // Crisp highlight spine
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, y + radius * 0.42);
  ctx.strokeStyle = isHighlighted ? '#fff7d6' : topColor;
  ctx.lineWidth = isHighlighted ? 1.8 : 1.0;
  ctx.stroke();

  // Glowing beacon tip
  ctx.beginPath();
  ctx.arc(x, topY, isHighlighted ? 3.5 : 2.3, 0, Math.PI * 2);
  ctx.fillStyle = isHighlighted ? '#ffeaab' : topColor;
  ctx.fill();
  ctx.restore();
}

function draw(time=performance.now()){
  ctx.setTransform(S.dpr,0,0,S.dpr,0,0);
  ctx.clearRect(0,0,S.width,S.height);
  const dark = S.darkStage;
  ctx.fillStyle = dark ? '#081310' : '#e7efe6';
  ctx.fillRect(0,0,S.width,S.height);

  S.hits=[];S.paths=[];S.exportSelfLoops=[];S.spikeHits=[];
  if(!P||!S.geo.world||!S.geo.us_states||!S.data)return;
  P = projection();

  const d=S.data, t = S.flowMode === 'globe' ? d3.zoomIdentity : S.transform;
  const isGlobe = S.flowMode === 'globe';
  const isSpikes = S.flowMode === 'spikes';
  const ySquash = isSpikes ? 0.78 : 1.0;

  // Apply stage transform for 2D / Spikes or render Orthographic Globe
  if (isGlobe) {
    const cx = S.width / 2, cy = S.height / 2, r = P.scale();
    // Outer atmospheric glow
    const atmo = ctx.createRadialGradient(cx, cy, r * 0.88, cx, cy, r * 1.14);
    atmo.addColorStop(0, dark ? 'rgba(38, 128, 104, 0.25)' : 'rgba(42, 118, 96, 0.16)');
    atmo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = atmo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
    ctx.fill();

    // Globe ocean sphere
    const ocean = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.08, cx, cy, r);
    if (dark) {
      ocean.addColorStop(0, '#132e27');
      ocean.addColorStop(1, '#071411');
    } else {
      ocean.addColorStop(0, '#eef5ef');
      ocean.addColorStop(1, '#cde0d4');
    }
    ctx.fillStyle = ocean;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Graticule
    if (d3.geoGraticule) {
      ctx.beginPath();
      d3.geoPath(P, ctx)(d3.geoGraticule().step([30, 30])());
      ctx.strokeStyle = dark ? 'rgba(130, 185, 165, 0.13)' : 'rgba(35, 82, 66, 0.11)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    // Continents & states on globe
    ctx.beginPath();
    d3.geoPath(P, ctx)(S.geo.world);
    ctx.fillStyle = dark ? '#1a3830' : '#d6e3d2';
    ctx.fill();
    ctx.strokeStyle = dark ? '#2f594d' : '#f8faf5';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    if (geographic() === 'us_states') {
      ctx.beginPath();
      d3.geoPath(P, ctx)(S.geo.us_states);
      ctx.strokeStyle = dark ? '#3e6e60' : '#b7c9b3';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // Globe rim border
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = dark ? '#3d7866' : '#8aa899';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else {
    // Subtle graticule background in 2D / Spikes
    ctx.save();
    if (isSpikes) {
      ctx.translate(0, S.height * 0.11);
      ctx.scale(1, ySquash);
    }
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    if (geographic() === 'world' && d3.geoGraticule) {
      ctx.beginPath();
      d3.geoPath(P, ctx)(d3.geoGraticule().step([30, 30])());
      ctx.strokeStyle = dark ? 'rgba(130, 185, 165, 0.09)' : 'rgba(35, 82, 66, 0.08)';
      ctx.lineWidth = 0.6 / t.k;
      ctx.stroke();
    }

    ctx.beginPath();
    d3.geoPath(P, ctx)(S.geo[geographic()]);
    ctx.fillStyle = dark ? '#162d26' : '#dbe5d5';
    ctx.fill();
    ctx.strokeStyle = dark ? '#2c5246' : '#f9fbf6';
    ctx.lineWidth = 0.8 / t.k;
    ctx.stroke();

    if (S.geo.virginia && t.k > 1.5) {
      ctx.beginPath();
      d3.geoPath(P, ctx)(S.geo.virginia);
      ctx.strokeStyle = dark ? '#467a69' : '#b5c6b0';
      ctx.lineWidth = 0.65 / t.k;
      ctx.stroke();
    }
    ctx.restore();
  }

  const projectScreen = (lonLat) => {
    if (!lonLat) return null;
    if (isGlobe && !isFrontHemisphere(lonLat)) return null;
    const p = P(lonLat);
    if (!p) return null;
    if (isGlobe) return p;
    const pt = t.apply(p);
    return isSpikes ? [pt[0], pt[1] * ySquash + S.height * 0.11] : pt;
  };

  const positions = new Map(), geoCoords = new Map();
  for (const n of d.nodes) {
    const a = anchor(n);
    if (a) {
      geoCoords.set(n.id, a);
      const sp = projectScreen(a);
      if (sp) positions.set(n.id, sp);
    }
  }

  const limit = +$('display-limit').value;
  const allDrawable = d.links.filter(l => geoCoords.has(l.from_id) && geoCoords.has(l.to_id));
  const all = d.links.filter(l => positions.has(l.from_id) && positions.has(l.to_id));
  const shown = all.slice(0, limit);
  const maximum = d.fixed_width_domain[1] || d3.max(shown, l => Math.abs(l.value || 0)) || 1;
  const sortedPositive = shown.filter(l=>finite(l.value)).map(l=>Math.abs(l.value)).sort((a,b)=>a-b);

  // Render flows
  for (let i = shown.length - 1; i >= 0; i--) {
    const l = shown[i], a = positions.get(l.from_id), b = positions.get(l.to_id);
    const coordA = geoCoords.get(l.from_id), coordB = geoCoords.get(l.to_id);
    if (!a || !b) continue;

    const isHovered = (S.hoverLink && (l === S.hoverLink || (l.from_id === S.hoverLink.from_id && l.to_id === S.hoverLink.to_id))) ||
                      (S.hoverNode && (l.from_id === S.hoverNode || l.to_id === S.hoverNode));
    const isDimmed = (S.hoverLink || S.hoverNode) && !isHovered;
    const delta = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const norm = computeNormalizedScore(l.value, maximum, sortedPositive);
    const baseWidth = finite(l.value) ? 1.2 + 7.2 * norm : 1.2;
    const width = isHovered ? baseWidth * 1.65 + 2 : (isDimmed ? Math.max(0.65, baseWidth * 0.45) : baseWidth);

    const strokeColor = isHovered
      ? '#f0b44c'
      : isDimmed
        ? (dark ? 'rgba(95, 145, 128, 0.14)' : 'rgba(33, 121, 96, 0.13)')
        : (l.from_id === S.selected || l.to_id === S.selected
            ? '#d99b26'
            : finite(l.value)
              ? (l.value < 0 ? '#c07848' : samplePaletteColor(norm, dark ? 0.84 : 0.78))
              : '#84968d');

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.setLineDash(finite(l.value) ? [] : [5, 4]);
    ctx.beginPath();

    if (delta < 2) {
      ctx.arc(a[0], a[1], 10 + width, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      S.exportSelfLoops.push({ link: l, a, width });
      continue;
    }

    let q, c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - Math.min(135, delta * 0.26)];
    if ((geographic() === 'world' || isGlobe) && coordA && coordB && d3.geoInterpolate) {
      const interp = d3.geoInterpolate(coordA, coordB);
      const samples = [];
      const steps = 28;
      for (let st = 0; st <= steps; st++) {
        const u = st / steps;
        const pt = interp(u);
        const sp = projectScreen(pt);
        if (sp) {
          // Add subtle loft in 3D globe or spikes mode
          const loft = (isGlobe || isSpikes) ? Math.sin(u * Math.PI) * Math.min(48, delta * 0.16) : 0;
          samples.push([sp[0], sp[1] - loft, u]);
        }
      }
      if (samples.length > 1) {
        let started = false;
        for (let k = 0; k < samples.length; k++) {
          const cur = samples[k];
          if (!started) { ctx.moveTo(cur[0], cur[1]); started = true; }
          else {
            const prev = samples[k - 1];
            if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > S.width * 0.32) {
              ctx.moveTo(cur[0], cur[1]);
            } else {
              ctx.lineTo(cur[0], cur[1]);
            }
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const midSample = samples[Math.floor(samples.length / 2)];
        if (midSample) c = [midSample[0], midSample[1]];
        q = (u) => {
          const clamped = Math.max(0, Math.min(1, u));
          const pt = interp(clamped);
          const sp = projectScreen(pt);
          const loft = (isGlobe || isSpikes) ? Math.sin(clamped * Math.PI) * Math.min(48, delta * 0.16) : 0;
          return sp ? [sp[0], sp[1] - loft] : [(1 - clamped) * a[0] + clamped * b[0], (1 - clamped) * a[1] + clamped * b[1]];
        };
      } else {
        ctx.moveTo(...a);
        ctx.quadraticCurveTo(...c, ...b);
        ctx.stroke();
        ctx.setLineDash([]);
        q = (u) => [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
      }
    } else {
      ctx.moveTo(...a);
      ctx.quadraticCurveTo(...c, ...b);
      ctx.stroke();
      ctx.setLineDash([]);
      q = (u) => [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
    }

    const head = q(0.85), before = q(0.81), angle = Math.atan2(head[1] - before[1], head[0] - before[0]);
    if (Math.hypot(head[0] - before[0], head[1] - before[1]) < S.width * 0.25) {
      ctx.save();
      ctx.translate(...head);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-7 - width * 0.3, -3 - width * 0.2);
      ctx.lineTo(-7 - width * 0.3, 3 + width * 0.2);
      ctx.closePath();
      ctx.fillStyle = isHovered ? '#f0b44c' : strokeColor;
      ctx.fill();
      ctx.restore();
    }

    if (S.motion && !isDimmed) {
      ctx.fillStyle = isHovered ? '#fff2bd' : (dark ? '#eefcf6' : '#ffffff');
      for (let k = 0; k < 2; k++) {
        const u = (time / 5800 + i * 0.071 + k * 0.5) % 1;
        const p = q(u);
        ctx.beginPath();
        ctx.arc(p[0], p[1], isHovered ? 2.8 : 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    S.paths.push({ link: l, a, b, c, q, width, strokeColor });
  }

  // Compute node outbound & inbound totals for hub sizing and 3D spikes
  const nodeStats = new Map();
  for (const l of shown) {
    const val = d.additive&&finite(l.value)?Math.abs(l.value):0;
    const sFrom = nodeStats.get(l.from_id) || { out: 0, in: 0, total: 0, deg: 0 };
    sFrom.out += val; sFrom.total += val; sFrom.deg++;
    nodeStats.set(l.from_id, sFrom);

    const sTo = nodeStats.get(l.to_id) || { out: 0, in: 0, total: 0, deg: 0 };
    sTo.in += val; sTo.total += val; sTo.deg++;
    nodeStats.set(l.to_id, sTo);
  }
  let maxNodeTotal = 1;
  for (const st of nodeStats.values()) if (st.total > maxNodeTotal) maxNodeTotal = st.total;

  // Bin colocated nodes
  const bins = new Map();
  for (const n of d.nodes) {
    const p = positions.get(n.id);
    if (!p || p[0] < -20 || p[0] > S.width + 20 || p[1] < -20 || p[1] > S.height + 20) continue;
    const key = Math.floor(p[0] / 24) + ',' + Math.floor(p[1] / 24), bin = bins.get(key) || { x: 0, y: 0, nodes: [] };
    bin.x += p[0]; bin.y += p[1]; bin.nodes.push(n); bins.set(key, bin);
  }

  const binList = [...bins.values()].sort((a, b) => a.y - b.y);
  for (const b of binList) {
    b.x /= b.nodes.length;
    b.y /= b.nodes.length;
    let binOut = 0, binIn = 0, binTotal = 0;
    for (const n of b.nodes) {
      const st = nodeStats.get(n.id);
      if (st) { binOut += st.out; binIn += st.in; binTotal += st.total; }
    }
    const isSel = b.nodes.some(n => n.id === S.selected || n.id === S.hoverNode);
    const isExporter = binOut >= binIn && binOut > 0;
    b.r = b.nodes.length === 1
      ? (binTotal > 0 ? 4.5 + Math.sqrt(binTotal / maxNodeTotal) * 5.5 : 4.8)
      : Math.min(19, 8 + Math.log10(b.nodes.length) * 5);

    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI);
    ctx.fillStyle = isSel ? '#f0b44c' : (b.nodes.length === 1 && isExporter ? '#fef3dc' : '#fffdf4');
    ctx.fill();
    ctx.strokeStyle = isSel ? '#b16c1f' : (isExporter ? '#d99b26' : '#1f6f5f');
    ctx.lineWidth = isSel ? 2.4 : 1.6;
    ctx.stroke();

    if (b.nodes.length > 1) {
      ctx.fillStyle = '#194c36';
      ctx.font = '600 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.nodes.length), b.x, b.y);
    }

    // Draw 3D Hub Spikes in Mode 3
    if (isSpikes && binTotal > 0) {
      const ratio = binTotal > 0 ? Math.sqrt(binTotal / maxNodeTotal) : Math.min(1, Math.log10(b.nodes.length + 1) / 2.5);
      const spikeH = Math.max(12, ratio * 115);
      const spikeR = Math.max(4.5, Math.min(11, b.r * 0.95));
      if (isExporter) {
        draw3DSpike(ctx, b.x, b.y, spikeH, spikeR, '#ffd27d', '#e09f2d', '#9e6810', isSel);
      } else {
        draw3DSpike(ctx, b.x, b.y, spikeH, spikeR, '#6fd4b5', '#289c82', '#165b4c', isSel);
      }
      b.spikeTopY = b.y - spikeH;
      b.spikeR = spikeR;
    }
    S.hits.push(b);
  }

  // Labels for top endpoints
  const rank = new Map();
  for (const l of shown) for (const k of ['from_id', 'to_id']) rank.set(l[k], (rank.get(l[k]) || 0) + Math.abs(l.value || 1));
  const ranked = [...rank].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const ids = [...(S.selected && positions.has(S.selected) ? [S.selected] : []), ...ranked.filter(id => id !== S.selected)].slice(0, 7);
  ctx.font = '600 12px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const labelRows = ids.map(id => {
    const n = d.nodes.find(n => n.id === id), p = positions.get(id);
    if (!n || !p) return null;
    const text = n.label.length > 27 ? n.label.slice(0, 24) + '…' : n.label;
    return { id, x: p[0], y: p[1], text, width: ctx.measureText(text).width, selected: id === S.selected };
  }).filter(Boolean);
  const reserved = [], caption = document.querySelector('.map-caption');
  if (caption) {
    const c = caption.getBoundingClientRect(), r = canvas.getBoundingClientRect();
    reserved.push({ left: c.left - r.left - 4, right: c.right - r.left + 4, top: c.top - r.top - 4, bottom: c.bottom - r.top + 4 });
  }
  for (const label of PipelineLabelLayout.place(labelRows, S.width, S.height, reserved)) {
    const box = label.box, nearest = [Math.max(box.left, Math.min(box.right, label.x)), Math.max(box.top, Math.min(box.bottom, label.y))];
    if (Math.hypot(nearest[0] - label.x, nearest[1] - label.y) > 18) {
      ctx.beginPath();
      ctx.strokeStyle = dark ? '#6e9988' : '#7b8b7c';
      ctx.lineWidth = 0.8;
      ctx.moveTo(label.x, label.y);
      ctx.lineTo(...nearest);
      ctx.stroke();
    }
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = dark ? '#0b1814' : '#f5f7ef';
    ctx.strokeText(label.text, label.textX, label.textY);
    ctx.fillStyle = dark ? '#e8f4ee' : '#1c4432';
    ctx.fillText(label.text, label.textX, label.textY);
  }

  // Establishment references have no invented site coordinates: show reported-country groups explicitly.
  if (d.collection === 'pharma_registry') {
    const groups = new Map();
    for (const n of d.nodes) {
      if (n.type !== 'establishment_registration') continue;
      const iso = n.country_iso3;
      if (!iso) continue;
      const key = n.state && iso === 'USA' ? n.state : iso;
      const geo = n.state && iso === 'USA' ? S.geo.us_states : S.geo.world;
      const f = geo.features.find(f => (f.id ?? f.properties.id) === key);
      if (!f) continue;
      const sp = projectScreen(d3.geoCentroid(f));
      if (!sp) continue;
      const g = groups.get(key) || { nodes: [], x: sp[0], y: sp[1], country: key };
      g.nodes.push(n);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      g.r = Math.min(22, 5 + Math.sqrt(g.nodes.length));
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, 2 * Math.PI);
      ctx.fillStyle = '#1f6f5fbb';
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(g.nodes.length), g.x, g.y);
      g.countryReference = true;
      S.hits.push(g);
    }
  }

  const mapped = geoCoords.size;
  const countryGroups = S.hits.some(h => h.countryReference);
  $('map-empty').hidden = !!(mapped || countryGroups);
  $('map-empty').textContent = 'These records do not supply map-eligible endpoint locations. Their source relationships remain available in the diagram, selector, table and exports.';
  $('map-coverage').textContent = (countryGroups ? 'Country markers count registration reference rows, not surveyed factory locations. ' : mapped.toLocaleString() + ' endpoint anchors located; ') + (shown.length.toLocaleString() + ' of ' + allDrawable.length.toLocaleString() + ' geographically drawable connections shown; ' + d.links.length.toLocaleString() + ' total selected connections. Regional anchors are representative; complete records remain available.');

  renderFlowHistogram(shown, maximum, sortedPositive);
  updateFlowInspector(shown);
  window.PipelineContextUI?.draw();
}

function animate(now){if(S.motion&&S.data&&S.paths.length&&!document.hidden)draw(now);S.frame=requestAnimationFrame(animate);}S.frame=requestAnimationFrame(animate);

function hit(e){
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  const node=S.hits.find(b=>{
    if (Math.hypot(x-b.x,y-b.y)<b.r+5) return true;
    if (S.flowMode==='spikes' && b.spikeTopY!==undefined) {
      if (Math.abs(x-b.x)<=(b.spikeR||6)+4 && y>=b.spikeTopY-4 && y<=b.y+4) return true;
    }
    return false;
  });
  if(node)return{node};
  let best=null,dist=8;
  for(const p of S.paths)for(let u=.05;u<1;u+=.05){const a=p.q(u),d=Math.hypot(x-a[0],y-a[1]);if(d<dist){dist=d;best=p;}}
  return best?{path:best}:null;
}

function renderHoverCard(h) {
  const tip = $('map-tooltip');
  if (!h || !S.data) { tip.hidden = true; return; }
  const d = S.data, unit = d.metric?.unit || '';
  const lookup = new Map(d.nodes.map(n => [n.id, n]));
  let totalAll = 0;
  for (const l of d.links) if (finite(l.value)) totalAll += Math.abs(l.value);

  tip.replaceChildren();
  if (h.node) {
    if (h.node.countryReference) {
      tip.append(
        el('div', 'flow-hover-kicker', 'Country Reference Marker'),
        el('div', 'flow-hover-title', h.node.country + ' · ' + h.node.nodes.length.toLocaleString() + ' registrations'),
        el('div', 'flow-hover-note', 'Counts registration reference rows, not surveyed physical factory coordinates.')
      );
    } else if (h.node.nodes.length === 1) {
      const n = h.node.nodes[0];
      let outSum = 0, inSum = 0, linksCount = 0;
      for (const l of d.links) {
        if (l.from_id === n.id) { linksCount++; if (finite(l.value)) outSum += l.value; }
        if (l.to_id === n.id) { linksCount++; if (finite(l.value)) inSum += l.value; }
      }
      tip.append(
        el('div', 'flow-hover-kicker', [n.type || 'Endpoint', n.state, n.country_iso3].filter(Boolean).join(' · ')),
        el('div', 'flow-hover-title', n.label)
      );
      const grid = el('div', 'flow-hover-metrics');
      for (const [k, v] of [['Outbound', outSum ? fmtCompact(outSum) + ' ' + unit : '0'], ['Inbound', inSum ? fmtCompact(inSum) + ' ' + unit : '0'], ['Links', String(linksCount)]]) {
        const cell = el('div');
        cell.append(el('span', '', k), el('strong', '', v));
        grid.append(cell);
      }
      tip.append(grid, el('div', 'flow-hover-note', 'Click to inspect full endpoint evidence & history'));
    } else {
      tip.append(
        el('div', 'flow-hover-kicker', 'Colocated Endpoint Cluster'),
        el('div', 'flow-hover-title', h.node.nodes.length + ' reporting endpoints at this anchor'),
        el('div', 'flow-hover-note', 'Click to zoom into cluster or choose from the endpoint selector.')
      );
    }
  } else if (h.path) {
    const l = h.path.link;
    const fromN = lookup.get(l.from_id)?.label || l.from_id;
    const toN = lookup.get(l.to_id)?.label || l.to_id;
    const rankIdx = d.links.indexOf(l) + 1;
    const share = (finite(l.value) && totalAll > 0) ? magnitudeShare(l,d.links,d.additive) : 'Ref';
    tip.append(
      el('div', 'flow-hover-kicker', String(l.evidence_type || 'Reported Flow').replaceAll('_', ' ')),
      el('div', 'flow-hover-title', fromN + ' → ' + toN)
    );
    const grid = el('div', 'flow-hover-metrics');
    for (const [k, v] of [['Volume', fmtCompact(l.value) + ' ' + unit], ['Rank / Share', (rankIdx ? '#' + rankIdx + ' · ' : '') + share], ['Source Rows', String(l.source_records || 1)]]) {
      const cell = el('div');
      cell.append(el('span', '', k), el('strong', '', v));
      grid.append(cell);
    }
    tip.append(grid);
    if (l.sectors && l.sectors.length) {
      tip.append(el('div', 'flow-hover-note', 'Sector: ' + l.sectors[0].slice(0, 85)));
    }
  }
  tip.hidden = false;
}

canvas.addEventListener('mousemove',e=>{
  const h=hit(e),tip=$('map-tooltip');
  const prevLink = S.hoverLink, prevNode = S.hoverNode;
  S.hoverLink = h?.path?.link || null;
  S.hoverNode = (h?.node && h.node.nodes.length === 1) ? h.node.nodes[0].id : null;
  if (prevLink !== S.hoverLink || prevNode !== S.hoverNode) {
    draw();
    syncDiagramHover();
  }
  if(!h){tip.hidden=true;return;}
  renderHoverCard(h);
  const r=canvas.getBoundingClientRect();
  tip.style.left=Math.max(8,Math.min(S.width-328,e.clientX-r.left+14))+'px';
  tip.style.top=Math.max(8,Math.min(S.height-145,e.clientY-r.top-55))+'px';
});
canvas.addEventListener('mouseleave',()=>{
  $('map-tooltip').hidden=true;
  if (S.hoverLink || S.hoverNode) {
    S.hoverLink = null;
    S.hoverNode = null;
    draw();
    syncDiagramHover();
  }
});
canvas.addEventListener('click',e=>{
  if(e.defaultPrevented || S.globeMoved)return;
  const h=hit(e);
  if(h?.node){
    if(h.node.countryReference){$('focus').value=h.node.country;query(true);}
    else if(h.node.nodes.length===1)selectNode(h.node.nodes[0].id,true);
    else if(S.flowMode !== 'globe'){const xy=S.transform.invert([h.node.x,h.node.y]),k=Math.min(40,S.transform.k*2);d3.select(canvas).call(zoom.transform,d3.zoomIdentity.translate(S.width/2-xy[0]*k,S.height/2-xy[1]*k).scale(k));}
  }else if(h?.path)selectNode(h.path.link.from_id,false);
});
canvas.addEventListener('keydown',e=>{if(['+','=','-','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')fitMap();else d3.select(canvas).call(zoom.scaleBy,e.key==='-'?1/1.7:1.7);}});

function syncFlowStudioControls(){
 for(const btn of document.querySelectorAll('[data-flow-mode]')){const active=btn.dataset.flowMode===S.flowMode;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));}
 $('flow-scale-select').value=S.flowScale;$('flow-palette-select').value=S.flowPalette;
 $('map-card')?.classList.toggle('dark-stage',S.darkStage);$('flow-theme-btn').classList.toggle('active',S.darkStage);$('flow-theme-btn').textContent=S.darkStage?'Light Stage':'Dark Stage';
}
// Wire up High-Density Flow Studio Mode Tabs, Scale, Palette, and Dark Stage controls
for (const btn of document.querySelectorAll('[data-flow-mode]')) {
  btn.addEventListener('click', () => {
    S.flowMode = btn.dataset.flowMode;
    for (const b of document.querySelectorAll('[data-flow-mode]')) {
      const active = b.dataset.flowMode === S.flowMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    P = projection();
    fitMap();
    pipelineNavigationChanged(false);
  });
}
$('flow-scale-select')?.addEventListener('change', e => {
  S.flowScale = e.target.value;
  draw();pipelineNavigationChanged(false);
});
$('flow-palette-select')?.addEventListener('change', e => {
  S.flowPalette = e.target.value;
  draw();pipelineNavigationChanged(false);
});
$('flow-theme-btn')?.addEventListener('click', () => {
  S.darkStage = !S.darkStage;
  $('map-card')?.classList.toggle('dark-stage', S.darkStage);
  $('flow-theme-btn').classList.toggle('active', S.darkStage);
  $('flow-theme-btn').textContent = S.darkStage ? 'Light Stage' : 'Dark Stage';
  draw();pipelineNavigationChanged(false);
});

async function selectNode(id,focus=true,preserve=false){if(!id||!S.data)return;if(!preserve)stopYears();const epoch=++S.detailEpoch;S.selected=id;$('node-picker').value=id;pipelineNavigationChanged(!preserve);draw();if(focus){const n=S.data.nodes.find(n=>n.id===id),a=n&&anchor(n);if(a&&S.flowMode==='globe'){S.globeRot=[-a[0],-a[1],0];P=projection();draw();}else{const p=a&&P(a);if(p){const k=Math.max(5,S.transform.k);d3.select(canvas).call(zoom.transform,d3.zoomIdentity.translate(S.width/2-k*p[0],S.height/2-k*p[1]).scale(k));}}}$('detail-title').textContent='Reading source evidence…';try{const d=await api('/api/pipelines/node?'+new URLSearchParams({...filters(),node_id:id}));if(epoch!==S.detailEpoch)return;$('detail-title').textContent=d.node.label;$('detail-intro').textContent=[d.node.type,d.node.state,d.node.country_iso3,d.year].filter(Boolean).join(' · ');const root=$('detail-body');root.replaceChildren();for(const [label,value] of [['Selected source relationships',d.edges.length],['Original auxiliary rows',d.record_count]]){const p=el('p','fact');p.append(el('strong','',fmt(value)),el('span','',label));root.append(p);}if(d.node.physical_location===false)root.append(el('p','small','This is a reporting/reference location, not an asserted physical processing location.'));for(const [label,value] of [['Original endpoint fields',d.node],['Selected connection records',d.edges],['Original auxiliary records · first 300',d.records]]){const details=el('details');details.append(el('summary','',label),el('pre','',JSON.stringify(value,null,2)));root.append(details);}renderTrend(d.history,d.metric);$('trend-title').textContent=d.node.label+' · '+d.metric.label+' · '+d.metric.unit;const related=el('div');if(d.node.industry_asset_id)related.append(safeLink('/industry.html?collection=eia_plants&asset_id='+encodeURIComponent(d.node.industry_asset_id)+'&year='+encodeURIComponent(S.year),'Inspect EIA plant reporting ↗'));if(d.node.ownership_asset_id)related.append(safeLink('/ownership.html?collection=msha&asset_id='+encodeURIComponent(d.node.ownership_asset_id),'Inspect source mine/facility record ↗'));if(d.node.eia_plant_id||d.node.eia_plant_code)related.append(safeLink('/industry.html?collection=eia_plants&asset_id='+encodeURIComponent('eia::plant::'+(d.node.eia_plant_id||d.node.eia_plant_code)),'Inspect EIA plant reporting ↗'));if(d.node.msha_id)related.append(safeLink('/ownership.html?collection=msha&asset_id='+encodeURIComponent('msha:'+d.node.msha_id),'Inspect source mine/facility record ↗'));root.append(related);window.PipelineContextUI?.nodeSelected(id);pipelineNavigationChanged(false);}catch(e){if(epoch===S.detailEpoch)$('detail-title').textContent='Evidence unavailable: '+e.message;}}
async function step(delta){const ys=S.c.years,i=ys.indexOf(S.year),j=Math.max(0,Math.min(ys.length-1,i+delta));S.year=ys[j];periodControls();pipelineNavigationChanged(!S.playing);await query(false);}
async function play(){if(S.playing){stopYears();return;}S.playing=true;$('play-years').textContent='Pause periods';$('play-years').setAttribute('aria-pressed','true');if(S.year===S.c.years.at(-1)){S.year=S.c.years[0];periodControls();await query(false);}const tick=async()=>{if(!S.playing)return;if(S.year===S.c.years.at(-1)){stopYears();return;}await step(1);if(S.playing)S.timer=setTimeout(tick,1300);};S.timer=setTimeout(tick,1300);}
async function setView(economic,options={}){stopYears();S.view=economic?'economics':'flows';$('flow-view').hidden=economic;$('flow-filters').hidden=economic;$('economics-view').hidden=!economic;$('show-flows').classList.toggle('active',!economic);$('show-economics').classList.toggle('active',economic);if(economic)await openEconomics(options);else resize(true);pipelineNavigationChanged(true);}
async function openEconomics(options={}){try{if(!S.econ){S.econ=await api('/api/economics/catalog');const c=S.econ;optionFill($('econ-year'),c.years,y=>y,y=>y,c.default_year||c.years.at(-1));optionFill($('econ-country'),c.countries,x=>x.label,x=>x.id,'USA');optionFill($('econ-sector'),c.sectors,x=>x.label,x=>x.id,'D');optionFill($('econ-metric'),c.metrics,x=>x.label+' · '+x.unit,x=>x.id,'value_added');renderSources($('econ-sources'),c.sources);for(const t of c.limitations||[])$('econ-sources').append(el('p','small',t));}await ensureEconomicPrices();await ensureEconomicHouseholds();await ensureEconomicEssentials();if(options.baseline!==false)await economicBaseline();}catch(e){$('econ-status').textContent=e.message;$('econ-status').className='error';}}
function econPayload(){return{year:$('econ-year').value,country:$('econ-country').value,sector:$('econ-sector').value,metric:$('econ-metric').value,percent:Number($('econ-percent').value)};}
function simpleTable(rows,columns){const wrap=el('div','economic-table'),table=el('table'),head=el('thead'),tr=el('tr');for(const c of columns)tr.append(el('th','',c.label));head.append(tr);table.append(head);const body=el('tbody');for(const r of rows){const tr=el('tr');for(const c of columns){const v=r[c.key];tr.append(el('td','',typeof v==='number'?(typeof c.format==='function'?c.format(v):fmt(v)):v??'Unavailable'));}body.append(tr);}table.append(body);wrap.append(table);return wrap;}
function bars(root,rows,key,title,unit){root.append(el('h4','',title));const rs=rows.filter(r=>finite(r[key])).slice().sort((a,b)=>Math.abs(b[key])-Math.abs(a[key])).slice(0,12);if(!rs.length){root.append(el('p','small','No comparable numerical rows are supplied for this selection.'));return;}const w=Math.max(640,root.clientWidth||850),h=rs.length*34+65,m={left:Math.max(155,Math.min(230,w*.23)),right:100,top:10,bottom:40},svg=d3.select(root).append('div').attr('class','economic-chart').append('svg').attr('viewBox',[0,0,w,h]).style('min-width',w+'px');const x=d3.scaleLinear().domain([Math.min(0,d3.min(rs,r=>r[key])),Math.max(0,d3.max(rs,r=>r[key]))]).nice().range([m.left,w-m.right]),y=d3.scaleBand().domain(rs.map(r=>r.id||r.label)).range([m.top,h-m.bottom]).padding(.3);svg.append('g').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format('~s'))).selectAll('text').attr('font-size',12);for(const r of rs){const yi=y(r.id||r.label);svg.append('rect').attr('x',Math.min(x(0),x(r[key]))).attr('y',yi).attr('height',y.bandwidth()).attr('width',Math.abs(x(r[key])-x(0))).attr('fill',r.id===$('econ-country').value?'#1f6f5f':'#a6b4a7');svg.append('text').attr('x',m.left-10).attr('y',yi+y.bandwidth()/2+4).attr('text-anchor','end').attr('font-size',13).text(String(r.label||r.id).slice(0,Math.floor(m.left/7.2)));svg.append('text').attr('x',w-m.right+8).attr('y',yi+y.bandwidth()/2+4).attr('text-anchor','start').attr('font-size',12).text(d3.format(',.2f')(r[key]));}root.append(el('p','small',unit+' · up to 12 largest absolute values shown; complete country table below.'));}
function renderEconomicMap(root,d){const values=new Map(d.rows.map(r=>[r.id,r.value])),vs=d.rows.filter(r=>finite(r.value)).map(r=>r.value),max=d3.max(vs,v=>Math.abs(v))||1;const projection=d3.geoNaturalEarth1().fitExtent([[15,15],[835,385]],S.geo.world),path=d3.geoPath(projection),svg=d3.select(root).append('div').attr('class','economic-chart').append('svg').attr('viewBox',[0,0,850,420]).attr('aria-label','Country map of '+d.metric.label);const color=d3.scaleSqrt().domain([0,max]).range(['#eff3e9','#155f4e']);svg.selectAll('path').data(S.geo.world.features).join('path').attr('d',path).attr('fill',f=>{const v=values.get(f.id??f.properties.id);return !finite(v)?'#d4dbd1':v<0?'#a86e4b':color(v);}).attr('stroke',f=>(f.id??f.properties.id)===d.country?'#9b753c':'#fffefa').attr('stroke-width',f=>(f.id??f.properties.id)===d.country?1.8:.5).style('cursor','pointer').on('click',(_,f)=>{const id=f.id??f.properties.id;if([...$('econ-country').options].some(o=>o.value===id)){$('econ-country').value=id;economicBaseline();}}).append('title').text(f=>(f.properties.name||f.id)+' · '+fmt(values.get(f.id??f.properties.id))+' '+d.metric.unit);root.append(el('p','small','Selected year: '+d.year+' · '+d.metric.unit+' · gray = unavailable · positive scale 0–'+fmt(max)));root.append(el('p','small','Color uses a square-root scale for the selected year; warm brown marks negative source values. Click an economy to inspect its source accounts. The unit shown follows the reporting basis above; a common U.S. deflator does not remove foreign-country inflation, exchange-rate changes or industry-specific price changes.'));}
async function ensureEconomicPrices(){
 if(!S.pricePromise)S.pricePromise=window.EconomicValuationUI.attach({root:$('economic-price-controls'),contextRoot:$('economic-ppp-context'),getBaseline:()=>S.econBaseline,getScenario:()=>S.econScenario,getSettings:econPayload,getGeometry:()=>S.geo.world,onBasisChange:()=>{if(S.econBaseline)renderEconomicBaseline(S.econBaseline);if(S.econScenario)renderEconomicScenario(S.econScenario);pipelineNavigationChanged(false);}}).then(controller=>{S.prices=controller;for(const id of['econ-ppp-metric','econ-ppp-compare'])$(id)?.addEventListener('change',()=>pipelineNavigationChanged(false));return controller;}).catch(error=>{$('economic-price-controls').replaceChildren(el('p','error','Price-comparison sources could not be loaded: '+error.message+'. Original current-USD accounts remain available.'));return null;});
 return S.pricePromise;
}
async function ensureEconomicHouseholds(){
 if(!S.householdPromise)S.householdPromise=window.HouseholdAffordabilityUI.attach({root:$('economic-household-context'),getSettings:econPayload,getBaseline:()=>S.econBaseline,getScenario:()=>S.econScenario,onSelectionChange:()=>pipelineNavigationChanged(false)}).then(controller=>{S.households=controller;return controller;}).catch(error=>{$('economic-household-context').replaceChildren(el('p','error','Household sources could not be opened: '+error.message+'. Original economic accounts remain available.'));return null;});
 return S.householdPromise;
}
async function ensureEconomicEssentials(){
 if(!S.essentialsPromise)S.essentialsPromise=window.EssentialsCostsUI.attach({root:$('economic-essentials-context'),getSettings:econPayload,getBaseline:()=>S.econBaseline,getScenario:()=>S.econScenario,onSelectionChange:()=>pipelineNavigationChanged(false)}).then(controller=>{S.essentials=controller;return controller;}).catch(error=>{$('economic-essentials-context').replaceChildren(el('p','error','Essential-category sources could not be opened: '+error.message+'. Original economic accounts remain available.'));return null;});
 return S.essentialsPromise;
}
function economicReport(raw){return S.prices?window.EconomicValuationMath.report(raw,S.prices.basis(),S.prices.data):{original:raw,adjusted:raw,valuation:{basis:'original',unit:'million current USD',status:'original_source_values',multiplier:1}};}
function priceLabel(report){return report.valuation.basis==='original'?'Original source values · million current USD':'Derived reporting values · million 2021 USD · common U.S. GDP-deflator basis';}
function renderEconomicBaseline(original){
 const report=economicReport(original),d=report.adjusted,unit=report.valuation.unit,root=$('econ-baseline');root.replaceChildren();root.append(el('h3','',(d.selected?.label||d.country)+' · '+d.year),el('p','economic-note',d.metric.label+' · '+priceLabel(report)));
 if(report.valuation.status==='unavailable_price_factor')root.append(el('p','error',report.valuation.missing_reason));
 bars(root,d.rows,'value','Country comparison for the selected industry',unit);renderEconomicMap(root,d);
 const rows=d.rows.map((r,i)=>({...r,original_value:original.rows[i]?.value})),columns=[{key:'label',label:'Economy'},{key:'value',label:d.metric.label+' · '+unit},{key:'output',label:'Gross output · '+unit},{key:'value_added',label:'Value added · '+unit}];if(report.valuation.basis!=='original')columns.splice(1,0,{key:'original_value',label:'Original measure · million current USD'});root.append(simpleTable(rows,columns));
 const componentLabels={employee_compensation:'Employee compensation',net_taxes_on_production:'Other taxes on production',consumption_fixed_capital:'Consumption of fixed capital',net_operating_surplus:'Net operating surplus'},components=Object.entries(componentLabels).map(([id,label])=>({id,label,value:d.selected?.national_components?.[id]}));bars(root,components,'value','Selected economy: national-account components',unit+' · separate national IOT source; components are not forced to match the global ICIO value-added row.');
 const details=el('details');details.append(el('summary','','Original source baseline, reporting adjustment and national components'),el('pre','',JSON.stringify({original_selected:original.selected,displayed_selected:d.selected,valuation:report.valuation},null,2)));root.append(details);const history=el('section','economic-price-history');root.append(history);renderEconomicPriceHistory(history,original);S.prices?.update();S.households?.update();S.essentials?.update();
}
async function renderEconomicPriceHistory(root,original){
 const epoch=++S.econHistoryEpoch,years=S.econ?.years||[],p={country:original.country,sector:original.sector,metric:original.metric.id};root.append(el('h4','',(original.selected?.label||original.country+' · '+original.sector)+' · source-year comparison'),el('p','small',original.metric.label+'. The source values and common 2021-dollar reporting values remain side by side. This common U.S. price basis does not identify country-specific real industry growth.'));
 const host=el('div');root.append(host);host.append(el('p','small','Reading the three source-year baselines; no scenario is calculated.'));
 try{const results=await Promise.all(years.map(year=>{if(String(year)===String(original.year))return original;const key=JSON.stringify([S.econ.fingerprint,year,p.country,p.sector,p.metric]);if(!S.econHistoryCache.has(key))S.econHistoryCache.set(key,api('/api/economics/baseline',{...p,year}).catch(error=>{S.econHistoryCache.delete(key);throw error;}));return S.econHistoryCache.get(key);}));if(epoch!==S.econHistoryEpoch||S.econBaseline!==original)return;const reports=results.map(result=>S.prices?window.EconomicValuationMath.report(result,'constant_usd',S.prices.data):null),rows=results.map((result,i)=>({year:result.year,original:result.rows.find(r=>r.id===p.country)?.value,adjusted:reports[i]?.adjusted.rows.find(r=>r.id===p.country)?.value??null,multiplier:reports[i]?.valuation.multiplier??null,status:reports[i]?.valuation.status==='derived_common_us_price_adjustment'?'Calculated U.S. price adjustment':reports[i]?.valuation.status==='unavailable_price_factor'?'Price factor unavailable':'Price sources unavailable'}));host.replaceChildren(simpleTable(rows,[{key:'year',label:'Source year'},{key:'original',label:'Original measure · million current USD'},{key:'adjusted',label:'Derived measure · million 2021 USD'},{key:'multiplier',label:'U.S. deflator multiplier',format:v=>finite(v)?v.toLocaleString('en-US',{maximumFractionDigits:12}):'Unavailable'},{key:'status',label:'Adjustment status'}]));
 const download=el('button','','Download this industry’s source-year comparison · JSON');download.type='button';download.addEventListener('click',()=>{const evidence={schema:'economic-valuation.industry-history/v1',selected:{...p,years},source_economic_fingerprint:S.econ.fingerprint,price_packet_sha256:S.prices?.fingerprint||null,original_year_results:results,constant2021_reporting_reports:reports,interpretation:'Same source country/industry/measure across actual model years. Common U.S. GDP-price basis; not sector-specific real output. No scenario run for this history.'},url=URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)+'\n'],{type:'application/json'})),a=el('a');a.href=url;a.download='industry-original-and-constant2021-history.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});host.append(download);
 }catch(error){if(epoch===S.econHistoryEpoch)host.replaceChildren(el('p','error','The source-year comparison could not open: '+error.message));}
}
async function economicBaseline(){const epoch=++S.econEpoch;S.scenarioEpoch=(S.scenarioEpoch||0)+1;const p=econPayload();S.econPayload=p;S.econScenario=null;S.econBaseline=null;S.households?.update();S.essentials?.update();$('econ-result').replaceChildren();$('econ-baseline').replaceChildren();$('econ-status').className='';$('econ-status').textContent='Reading acquired source accounts…';$('econ-refresh').disabled=true;try{const d=await api('/api/economics/baseline',p);if(epoch!==S.econEpoch)return;S.econBaseline=d;renderEconomicBaseline(d);$('econ-run').disabled=d.selected?.scenario_eligible===false;$('econ-status').textContent='Original source baseline loaded. Reporting-price views preserve the source accounts and model inputs.';}catch(e){if(epoch===S.econEpoch){S.econBaseline=null;$('econ-status').textContent=e.message;$('econ-status').className='error';}}finally{if(epoch===S.econEpoch)$('econ-refresh').disabled=false;}}

function renderEconomicScenario(original){const report=economicReport(original),d=report.adjusted,unit=report.valuation.unit,root=$('econ-result');root.replaceChildren(el('p','',d.shock_definition),el('p','economic-note',priceLabel(report)));if(report.valuation.status==='unavailable_price_factor')root.append(el('p','error',report.valuation.missing_reason));root.append(el('p','fact','Final-demand change: '+fmt(d.final_demand_change)+' '+unit),el('p','fact','Modeled global output change: '+fmt(d.totals.output_change)+' '+unit),el('p','fact','Modeled global value-added change: '+fmt(d.totals.value_added_change)+' '+unit));bars(root,d.country_changes,'value_added_change','Modeled value-added changes by economy',unit);const rows=d.country_changes.map((r,i)=>({...r,original_value_added_change:original.country_changes[i]?.value_added_change})),columns=[{key:'label',label:'Economy'},{key:'output_change',label:'Output change · '+unit},{key:'value_added_change',label:'Value-added change · '+unit}];if(report.valuation.basis!=='original')columns.splice(1,0,{key:'original_value_added_change',label:'Original value-added change · million current USD'});root.append(simpleTable(rows,columns));const assumptions=el('ul');for(const t of[...d.assumptions||[],...report.valuation.limitations||[]])assumptions.append(el('li','small',t));root.append(assumptions);const raw=el('details');raw.append(el('summary','','Original scenario, reporting values, price sources and original-unit diagnostics'),el('pre','',JSON.stringify(report,null,2)));root.append(raw);S.prices?.update();S.households?.update();S.essentials?.update();}
async function runScenario(){const epoch=S.scenarioEpoch=(S.scenarioEpoch||0)+1,baselineEpoch=S.econEpoch,p=econPayload();S.econPayload=p;$('econ-result').replaceChildren(el('p','small','Calculating the original-unit global accounting response. The first solve for a source year may take longer.'));$('econ-run').disabled=true;$('econ-export').disabled=true;try{const d=await api('/api/economics/scenario',p);if(epoch!==S.scenarioEpoch||baselineEpoch!==S.econEpoch)return;S.econScenario=d;renderEconomicScenario(d);}catch(e){if(epoch===S.scenarioEpoch&&baselineEpoch===S.econEpoch){S.econScenario=null;$('econ-result').replaceChildren(el('p','error',e.message));}}finally{if(epoch===S.scenarioEpoch&&baselineEpoch===S.econEpoch){$('econ-run').disabled=false;$('econ-export').disabled=false;}}}
function exportLinks(root,result){root.replaceChildren();for(const f of result.files||[])root.append(safeLink(f.url,f.name));if(result.note)root.append(el('p','small',result.note));}
for(const id of ['focus','direction','metric','commodity','sector','transport'])$(id).addEventListener('change',()=>{stopYears();clearDetail();pipelineNavigationChanged(true);query(true);});$('collection').addEventListener('change',()=>choose($('collection').value).catch(e=>status(e.message,true)));let searchTimer;$('search').addEventListener('input',()=>{clearTimeout(searchTimer);stopYears();searchTimer=setTimeout(()=>{clearDetail();pipelineNavigationChanged(false);query(true);},350);});$('virginia').onclick=()=>{if([...$('focus').options].some(o=>o.value==='VA')){$('focus').value='VA';pipelineNavigationChanged(true);query(true);}else choose('coal_domestic',{focus:'VA',direction:'outbound'});};$('all-places').onclick=()=>{$('focus').value='all';pipelineNavigationChanged(true);query(true);};$('node-picker').onchange=()=>selectNode($('node-picker').value,true);$('display-limit').onchange=()=>draw();$('animate-flow').onclick=()=>{S.motion=!S.motion;$('animate-flow').textContent=S.motion?'Pause motion':'Animate direction';$('animate-flow').setAttribute('aria-pressed',String(S.motion));draw();pipelineNavigationChanged(false);};$('animate-flow').textContent=S.motion?'Pause motion':'Animate direction';$('animate-flow').setAttribute('aria-pressed',String(S.motion));$('zoom-in').onclick=()=>d3.select(canvas).call(zoom.scaleBy,1.7);$('zoom-out').onclick=()=>d3.select(canvas).call(zoom.scaleBy,1/1.7);$('fit').onclick=fitMap;$('previous').onclick=()=>{stopYears();step(-1);};$('next').onclick=()=>{stopYears();step(1);};$('play-years').onclick=play;$('period').oninput=()=>{stopYears();S.year=S.c.years[+$('period').value];periodControls();pipelineNavigationChanged(false);query(false);};for(const b of document.querySelectorAll('[data-start]'))b.onclick=()=>choose(b.dataset.start,{focus:b.dataset.start==='coal_domestic'?'VA':undefined,direction:b.dataset.start==='coal_domestic'?'outbound':undefined}).catch(e=>status(e.message,true));
$('export').onclick=async()=>{stopYears();$('export').disabled=true;$('export-result').textContent='Preparing the selected source view…';try{await window.PublicPipelineExports.exportView({format:$('export-format').value,filters:filters(),data:S.data,canvas,paths:S.paths,selfLoops:S.exportSelfLoops||[],positions:S.hits,geography:S.geo[geographic()],projection:P,transform:S.flowMode==='globe'?d3.zoomIdentity:S.transform,width:S.width,height:S.height,settings:capturePipelineNavigation(),host:$('export-result')});}catch(e){$('export-result').textContent=e.message;}finally{$('export').disabled=false;}};
$('save-view').onclick=()=>{const p={schema:'ridgeway.pipeline-view/v1',fingerprint:S.catalog.fingerprint,filters:filters(),node_id:S.selected,display_limit:$('display-limit').value,context_settings:window.PipelineContextUI?.settings(),context_fingerprint:window.PipelineContextUI?.catalogFingerprint()};const url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='Pipeline_View_'+S.c.id+'_'+S.year+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('open-view').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1024*1024)throw Error('This saved view is too large.');const p=JSON.parse(await file.text());if(p.schema!=='ridgeway.pipeline-view/v1'||p.fingerprint!==S.catalog.fingerprint)throw Error('This view needs its matching pipeline source edition.');await choose(p.filters.collection,{...p.filters,node_id:p.node_id});if(['40','80','200','1000'].includes(p.display_limit))$('display-limit').value=p.display_limit;draw();if(p.context_settings){window.PipelineContextUI?.restore(p.context_settings,p.context_fingerprint);window.PipelineContextUI?.flowChanged();}status('Saved pipeline view restored with verified source fingerprints.');pipelineNavigationChanged(false);}catch(e){status(e.message,true);}finally{e.target.value='';}};
$('browse-records').onclick=async()=>{try{const d=await api('/api/pipelines/records?'+new URLSearchParams({collection:S.c.id,limit:100,search:$('search').value}));$('original-records').replaceChildren(el('p','small','First '+d.records.length+' of '+d.total.toLocaleString()+' matching auxiliary source rows.'),el('pre','',JSON.stringify(d.records,null,2)));}catch(e){$('original-records').textContent=e.message;}};
$('show-flows').onclick=()=>setView(false);$('show-economics').onclick=()=>{window.open('http://127.0.0.1:8772/pipelines.html?view=economics','_blank','noopener,noreferrer');};$('econ-refresh').onclick=economicBaseline;for(const id of ['econ-year','econ-country','econ-sector','econ-metric'])$(id).onchange=economicBaseline;$('econ-percent').oninput=()=>{S.scenarioEpoch=(S.scenarioEpoch||0)+1;S.econScenario=null;$('econ-run').disabled=S.econBaseline?.selected?.scenario_eligible===false;$('econ-export').disabled=false;$('econ-result').replaceChildren(el('p','small','Demand change edited. Calculate again for a source-attached result.'));};$('econ-run').onclick=runScenario;$('econ-export').onclick=async()=>{try{const p=S.econScenario?{...S.econPayload,mode:'scenario',assessment_context:window.PipelineContextUI?.assessment(),global_assessment_context:window.GlobalAssessmentBridge?.assessment()}:{...econPayload(),mode:'baseline',assessment_context:window.PipelineContextUI?.assessment(),global_assessment_context:window.GlobalAssessmentBridge?.assessment()};exportLinks($('econ-export-result'),await api('/api/economics/export',p));}catch(e){$('econ-status').textContent=e.message;}};
new ResizeObserver(()=>resize(true)).observe($('map-wrap'));
(async()=>{try{const [config,catalog,world,states,va]=await Promise.all([api('/api/config'),api('/api/pipelines/catalog'),api('/api/geography?scope=world'),api('/api/geography?scope=us_states'),api('/api/geography?scope=virginia').catch(()=>null)]);S.token=config.token;S.catalog=catalog;S.contextReady=window.PipelineContextUI?.attach({state:S,api,filters,projection:()=>P,geographic,setView,focusPoint:point=>{const p=P&&P(point);if(p){const k=Math.max(5,S.transform.k);d3.select(canvas).call(zoom.transform,d3.zoomIdentity.translate(S.width/2-k*p[0],S.height/2-k*p[1]).scale(k));}}});S.geo={world:PipelineGeometry.orient(world),us_states:PipelineGeometry.orient(states),virginia:va?PipelineGeometry.orient(va):null};if(!catalog.collections.length)throw Error('No pipeline sources are installed.');optionFill($('collection'),catalog.collections,c=>c.title,c=>c.id,'coal_receipts');$('collection').disabled=false;for(const b of document.querySelectorAll('[data-start]'))b.disabled=!catalog.collections.some(c=>c.id===b.dataset.start);const p=new URLSearchParams(location.search);const initMode=p.get('flow_mode'),initDark=p.get('dark_stage')==='1';if(initMode&&['2d','globe','spikes'].includes(initMode)){S.flowMode=initMode;for(const b of document.querySelectorAll('[data-flow-mode]')){const act=b.dataset.flowMode===initMode;b.classList.toggle('active',act);b.setAttribute('aria-pressed',String(act));}}if(initDark){S.darkStage=true;$('map-card')?.classList.add('dark-stage');if($('flow-theme-btn')){$('flow-theme-btn').classList.add('active');$('flow-theme-btn').textContent='Light Stage';}}p.delete('flow_mode');p.delete('dark_stage');const id=catalog.collections.some(c=>c.id===p.get('collection'))?p.get('collection'):'trade_coal';const initialSourceChoice=sourceChoiceGeneration+1;await choose(id,{...(!p.has('collection')?{focus:'all',direction:'either'}:{}),...Object.fromEntries(p.entries())});await S.contextReady;if(sourceChoiceGeneration!==initialSourceChoice){const current=new URL(location.href);current.searchParams.delete('view');history.replaceState(null,'',current.pathname+current.search);}await registerPipelineNavigation();}catch(e){status('The pipeline workspace could not open: '+e.message,true);$('map-empty').hidden=false;$('map-empty').textContent='The retained public source could not load. Check your connection and reload this page.';}})();
})();
