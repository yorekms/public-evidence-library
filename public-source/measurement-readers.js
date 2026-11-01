/* Plain-language measure guides and exact native-year readers. No data, notes or requests are created. */
(() => {
'use strict';

const finite=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
const numeric=row=>finite(row?.value)&&row.eligible!==false;
const format=value=>finite(value)?new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(Number(value)):'Unavailable';
const fiscalPerResident=new Set(['fiscal-history::federal-net-per-capita','federal-fiscal-balance::federal-net-per-capita-2023']);

function annualRowsForYear(rows,year){
 if(!finite(year))return[];
 return(Array.isArray(rows)?rows:[]).filter(row=>finite(row?.year)&&Number(row.year)===Number(year));
}

function yearGroups(rows){
 const groups=new Map();
 for(const row of Array.isArray(rows)?rows:[]){
  if(!finite(row?.year))continue;
  const year=Number(row.year);
  if(!groups.has(year))groups.set(year,[]);
  groups.get(year).push(row);
 }
 return new Map([...groups].sort(([a],[b])=>a-b));
}

function fiscalInterpretation(value,placeName='the selected state'){
 if(!finite(value))return null;
 const number=Number(value),place=String(placeName||'the selected state');
 if(number>0)return`Spending attributed to ${place} exceeded revenue attributed to it by $${format(number)} per resident, averaged across its population.`;
 if(number<0)return`Revenue attributed to ${place} exceeded spending attributed to it by $${format(Math.abs(number))} per resident, averaged across its population.`;
 return`Attributed spending and revenue were balanced at the source’s printed precision for ${place}, averaged across its population.`;
}

function publishedBounds(row,series={}){
 const meaning=[row?.interval_meaning,row?.interval_type,row?.uncertainty_type,row?.uncertainty_note,series.interval_meaning,series.interval_type,series.uncertainty_type,series.uncertainty_note].find(value=>typeof value==='string'&&value.trim());
 return{low:finite(row?.low)?Number(row.low):null,high:finite(row?.high)?Number(row.high):null,unit:row?.unit||series.unit||'Source unit not supplied',meaning:meaning||null};
}

const helpers={finite,numeric,format,annualRowsForYear,yearGroups,fiscalInterpretation,publishedBounds};
if(typeof module!=='undefined'&&module.exports)module.exports=helpers;
if(typeof document==='undefined')return;

const create=(tag,cls,text)=>{const element=document.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=String(text);return element;};
const textValue=value=>typeof value==='string'&&value.trim()?value.trim():null;
function paragraph(parent,el,label,value,cls=''){
 const text=textValue(value);if(!text)return;
 const line=el('p',cls),name=el('strong','',label+' ');line.append(name,document.createTextNode(text));parent.append(line);
}

function guide({series={},primer={},questionPrimer={},make}={}){
 questionPrimer=questionPrimer||{};const el=typeof make==='function'?make:create,section=el('section','measurement-guide');
 section.setAttribute('aria-label','Understand this measure');
 section.append(el('h3','','Understand this measure'));
 if(textValue(questionPrimer.title))section.append(el('p','measurement-key-message',questionPrimer.title));
 if(textValue(questionPrimer.overview))section.append(el('p','measurement-overview',questionPrimer.overview));
 if(textValue(series.label))section.append(el('p','measurement-guide-series',series.label));
 paragraph(section,el,'What is measured:',primer.what||series.definition||series.description);
 paragraph(section,el,'Unit:',primer.unit||series.unit);
 paragraph(section,el,'How to read it:',primer.how_to_read);
 paragraph(section,el,'What this does not mean:',primer.does_not_mean);
 paragraph(section,el,'Calculation:',primer.formula,'measurement-formula');
 paragraph(section,el,'Illustrative example:',primer.example,'measurement-example');
 if(textValue(primer.period_note)||textValue(primer.context_note)){const methods=el('details','measurement-methods');methods.append(el('summary','','Reporting periods and source allocation'));paragraph(methods,el,'Reporting period:',primer.period_note,'measurement-period-note');paragraph(methods,el,'Context:',primer.context_note,'measurement-context-note');section.append(methods);}
 return section;
}

function valueSummary(row,series){
 const unit=row.unit||series.unit||'Source unit not supplied';
 if(!finite(row.value))return`Unavailable${row.raw_value!==null&&row.raw_value!==undefined&&String(row.raw_value)!==''?' · source text: '+String(row.raw_value):''}`;
 return`${format(row.value)} ${unit}${row.eligible===false?' · source-ineligible for analysis':''}`;
}

function observations({rows=[],series={},placeName,selectedYear,onYearChange}={}){
 const groups=yearGroups(rows);if(!groups.size)return null;
 const years=[...groups.keys()],section=create('section','observation-reader');
 section.setAttribute('aria-label','Read exact source-year observations');
 section.append(create('h3','','Read an exact source-year observation'));
 section.append(create('p','observation-axis-key','Chart key: K (or k) = 1,000; M = 1,000,000. Axis numbers are reference marks, not individual yearly observations. Choose a source year below to read its actual value.'));
 const label=create('label','observation-year-label','Source year — exact observation'),select=create('select');select.id='observation-year';
 for(const year of years){
  const native=groups.get(year),option=create('option');option.value=String(year);
  option.textContent=native.length===1?`${year} — ${valueSummary(native[0],series)}`:`${year} — ${native.length} separate native observations`;
  select.append(option);
 }
 select.value=finite(selectedYear)&&groups.has(Number(selectedYear))?String(Number(selectedYear)):String(years.at(-1));label.append(select);section.append(label);
 const live=create('div','observation-current');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');section.append(live);
 const render=()=>{
  const year=Number(select.value),native=groups.get(year)||[];live.replaceChildren();
  if(native.length>1)live.append(create('p','observation-multiple','Several native observations share this year. They are displayed separately; no sum or average is inferred.'));
  for(const row of native){
   const record=create('article','observation-record'),name=placeName||row.geo_name||row.geo_id||'Selected place';
   record.append(create('h4','',`${name} · ${year}`));
   record.append(create('p','observation-exact-value',valueSummary(row,series)));
   paragraph(record,create,'Native period:',row.period||String(row.year));
   paragraph(record,create,'Source status:',row.status||'No source-status label supplied.');
   if(row.raw_value!==null&&row.raw_value!==undefined&&String(row.raw_value)!=='')paragraph(record,create,'Original source text:',String(row.raw_value));
   if(finite(row.value)&&row.eligible===false)record.append(create('p','observation-ineligible','The source supplies a numeric value, retained above, but marks this row ineligible for analysis.'));
   const bounds=publishedBounds(row,series);
   if(bounds.low!==null||bounds.high!==null){
    record.append(create('p','observation-bounds',`Published lower bound: ${bounds.low===null?'unavailable':format(bounds.low)}; upper bound: ${bounds.high===null?'unavailable':format(bounds.high)} ${bounds.unit}.`));
    record.append(create('p','observation-interval-meaning',bounds.meaning||'Published bounds are shown as supplied; their interval type and coverage are not specified here. No interval is calculated by this reader.'));
   }
   if(fiscalPerResident.has(series.id)&&numeric(row))record.append(create('p','observation-interpretation',fiscalInterpretation(row.value,name)));
   live.append(record);
  }
 };
 select.addEventListener('change',()=>{render();if(typeof onYearChange==='function')onYearChange(Number(select.value));});render();if(typeof onYearChange==='function'&&String(selectedYear??'')!==select.value)onYearChange(Number(select.value));
 const endpoints=create('div','observation-endpoints');
 const appendEndpoint=(year,labelText)=>{
  const native=groups.get(year),block=create('div','observation-endpoint');
  block.append(create('strong','',`${labelText}: ${year}`));
  for(const row of native)block.append(create('p','',valueSummary(row,series)+(row.period?' · '+row.period:'')));
  if(native.length>1)block.append(create('p','','Separate native observations; not combined.'));
  endpoints.append(block);
 };
 appendEndpoint(years[0],'First retained source observation');
 if(years.length>1)appendEndpoint(years.at(-1),'Last retained source observation');
 section.append(endpoints);
 if(fiscalPerResident.has(series.id))section.append(create('p','observation-accounting-note','This is a state-level accounting balance divided by population. It does not assign an individual payment, tax bill or debt.'));
 return section;
}

window.MeasurementReaders={guide,observations};
})();
