/* Deterministic, source-attached allocation of selected household essentials. */
(function (root) {
'use strict';
const UNIT='current million EUR', EPS=1e-8;
const CATEGORIES=['food','housing','energy','healthcare'];
const CLASSIFICATIONS=['COICOP 2018','COICOP 1999'];
const ASSUMPTIONS=[
  'Resident category spending is estimated by applying observed domestic category shares to resident household consumption. Equal domestic/resident category composition is an analyst assumption.',
  'Households (S14), the exact country/year, one COICOP classification and additive current-million-EUR values are required. Missing data are not replaced or carried forward.',
  'Housing excludes home energy (CP04 minus CP045), so selecting housing and energy does not count energy twice.',
  'The remainder is aggregate disposable income after the selected estimated consumption categories; other consumption and saving remain. It is not a median cash budget or an official saving rate.',
  'Gross income is before consumption of fixed capital; net income is a separate source basis. National-account housing includes imputed rent, and health excludes social transfers in kind.',
  'Optional bounds are an allocation constraint under coherent national/domestic/tourism aggregates, not a confidence or credible interval. Source discrepancies are retained and never forced equal.',
  'Current-EUR values retain inflation and exchange-rate effects. No GDP PPP, household PPP or price adjustment is applied by this calculation.'
];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const year=v=>finite(v)&&Number.isInteger(v);
function clone(v){if(Array.isArray(v))return v.map(clone);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v))o[k]=clone(v[k]);return o;}return v;}
function empty(row,options){
  const basis=options.income_basis===undefined?'gross':options.income_basis;
  const selected=options.selected_categories===undefined?CATEGORIES.slice():clone(options.selected_categories);
  return {schema:'essentials-costs.allocation-report/v1',available:false,status:'unavailable',reason:null,
    original:clone(row),geo_id:row?.geo_id??null,geo_name:row?.geo_name??null,year:row?.year??null,
    classification:row?.classification??null,unit:UNIT,income_basis:basis,selected_categories:selected,
    income:null,domestic_total:null,resident_consumption:null,
    domestic_components:Object.fromEntries(CATEGORIES.map(k=>[k,null])),
    estimated_resident_components:Object.fromEntries(CATEGORIES.map(k=>[k,null])),
    component_income_shares:Object.fromEntries(CATEGORIES.map(k=>[k,null])),
    native_selected_cost:null,domestic_essential_share:null,estimated_resident_essentials:null,
    remaining_amount:null,remaining_share:null,
    allocation_bounds:{available:false,reason:'Point estimate unavailable.',remaining_share_lower:null,remaining_share_upper:null,
      remaining_amount_lower:null,remaining_amount_upper:null,source_coherence_residuals:{bridge_identity:null,bridge_domestic_vs_category:null,bridge_national_vs_resident:null}},
    assumptions:ASSUMPTIONS.slice()};
}
function estimate(row,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))options={income_basis:'invalid_options'};
  const report=empty(row,options);
  const fail=(status,reason)=>{report.status=status;report.reason=reason;return report;};
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.geo_id!=='string'||!row.geo_id||!year(row.year))return fail('invalid_row','A source row needs an exact country and integer native reporting year.');
  if(!CLASSIFICATIONS.includes(row.classification))return fail('invalid_classification','Use one retained COICOP 2018 or COICOP 1999 source classification.');
  if(row.unit!==UNIT)return fail('incompatible_unit','The allocation requires additive current million EUR, not chain-linked volumes or another currency/scale.');
  if(!['gross','net'].includes(report.income_basis))return fail('invalid_income_basis','Choose gross or net disposable income explicitly.');
  const selected=report.selected_categories;
  if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length||selected.some(k=>!CATEGORIES.includes(k)))return fail('invalid_categories','Choose at least one distinct supported category: food, housing, energy or healthcare.');
  const inputs=row.inputs&&typeof row.inputs==='object'?row.inputs:{};
  function input(name,scope,classification=false,items=null,direction=null){
    const r=inputs[name];
    if(!r||typeof r!=='object'||Array.isArray(r)||!finite(r.value))return {ok:false,reason:'Missing or non-finite '+name+' source value.'};
    if(r.geo_id!==row.geo_id||!year(r.year)||r.year!==row.year)return {ok:false,reason:'The '+name+' source does not match the exact country/reporting year.'};
    if(r.sector!=='S14')return {ok:false,reason:'The '+name+' source must describe households (S14); NPISH totals cannot substitute.'};
    if(r.unit!==UNIT||r.native_unit_code!=='CP_MEUR')return {ok:false,reason:'The '+name+' source must use original additive current million EUR (CP_MEUR).'};
    if(r.territorial_basis!==scope)return {ok:false,reason:'The '+name+' source has an incompatible resident/domestic territorial basis.'};
    if(classification&&r.classification!==row.classification)return {ok:false,reason:'The '+name+' source has a missing or different COICOP classification.'};
    const expectedCategory={domestic_total:'TOTAL',food:'CP01',housing_including_energy:'CP04',energy:'CP045',healthcare:'CP06'}[name];
    if(classification&&r.source_category!==expectedCategory)return {ok:false,reason:'The '+name+' source has a missing or incompatible COICOP category code.'};
    if(items&&!items.includes(r.na_item))return {ok:false,reason:'The '+name+' source has an incompatible income/consumption accounting item.'};
    if(direction&&r.direct!==direction)return {ok:false,reason:'The '+name+' source has an incompatible transaction direction.'};
    if(r.eligible===false)return {ok:false,reason:'The '+name+' source is explicitly ineligible.'};
    return {ok:true,value:r.value};
  }
  const incomeName=report.income_basis==='gross'?'income_gross':'income_net';
  const sourceIncome=input(incomeName,'resident',false,[report.income_basis==='gross'?'B6G':'B6N'],'RECV');
  const total=input('domestic_total','domestic',true),resident=input('resident_consumption','resident',false,['P3','P31_S14','P31_S14_NC'],'PAID');
  for(const [name,r]of [[incomeName,sourceIncome],['domestic_total',total],['resident_consumption',resident]])if(!r.ok)return fail('missing_or_incompatible_input',r.reason);
  const I=sourceIncome.value,D=total.value,R=resident.value;
  report.income=I;report.domestic_total=D;report.resident_consumption=R;
  if(I<=0||D<=0||R<0)return fail('inadmissible_account_totals','Income and domestic total must be positive; resident consumption must be nonnegative.');
  const raw={food:input('food','domestic',true),housing_including_energy:input('housing_including_energy','domestic',true),energy:input('energy','domestic',true),healthcare:input('healthcare','domestic',true)};
  const componentReasons={};
  for(const k of ['food','energy','healthcare']){
    if(raw[k].ok&&raw[k].value>=0)report.domestic_components[k]=raw[k].value;
    else componentReasons[k]=raw[k].ok?'The '+k+' source is negative.':raw[k].reason;
  }
  const housing=raw.housing_including_energy,energy=raw.energy;
  if(housing.ok&&energy.ok&&housing.value>=0&&energy.value>=0&&housing.value>=energy.value)report.domestic_components.housing=housing.value-energy.value;
  else componentReasons.housing=!housing.ok?housing.reason:!energy.ok?energy.reason:'Housing including energy must be nonnegative and at least as large as home energy.';
  report.component_reasons=componentReasons;
  for(const k of selected)if(report.domestic_components[k]===null)return fail('missing_or_incompatible_category',componentReasons[k]);
  const E=selected.reduce((sum,k)=>sum+report.domestic_components[k],0);
  if(!finite(E)||E>D)return fail('inadmissible_category_total','The nonoverlapping selected domestic categories exceed the domestic total.');
  const share=E/D,estimated=R*share,remainder=I-estimated,remainderShare=remainder/I*100;
  if(![estimated,remainder,remainderShare].every(finite))return fail('non_finite_calculation','The allocation calculation did not produce a finite value.');
  report.native_selected_cost=E;report.domestic_essential_share=share;report.estimated_resident_essentials=estimated;
  report.remaining_amount=remainder;report.remaining_share=remainderShare;
  for(const k of CATEGORIES){const c=report.domestic_components[k];if(c!==null){const amount=R*(c/D),percent=amount/I*100;if(finite(amount)&&finite(percent)){report.estimated_resident_components[k]=amount;report.component_income_shares[k]=percent;}}}
  report.available=true;report.status='estimated_proportional_resident_allocation';report.reason=null;
  const bd=input('bridge_domestic','domestic',false,['P31_S14_DC']),bn=input('bridge_national','resident',false,['P31_S14_NC','P31_S14']);
  const abroad=input('resident_abroad','resident',false,['P33']),inbound=input('nonresident_domestic','domestic',false,['P34']);
  for(const r of [bd,bn,abroad,inbound])if(!r.ok){report.allocation_bounds.reason=r.reason;return report;}
  const BD=bd.value,BN=bn.value,A=abroad.value,F=inbound.value;
  const residuals={bridge_identity:BN-(BD+A-F),bridge_domestic_vs_category:BD-D,bridge_national_vs_resident:BN-R};
  report.allocation_bounds.source_coherence_residuals=residuals;
  if(BD<0||BN<0||A<0||F<0||A>BN+EPS||F>BD+EPS){report.allocation_bounds.reason='Bridge totals and tourism flows must be nonnegative and admissible within their corresponding totals.';return report;}
  if(Object.values(residuals).some(v=>Math.abs(v)>EPS)){report.allocation_bounds.reason='Source-coherence check failed; original cross-table and bridge residuals are retained.';return report;}
  const lowCost=Math.max(0,E-F),highCost=Math.min(R,E+A);
  if(lowCost>highCost){report.allocation_bounds.reason='The source-constrained cost bounds are inconsistent.';return report;}
  report.allocation_bounds={available:true,reason:null,label:'Allocation constraint range; not a confidence or credible interval',
    estimated_cost_lower:lowCost,estimated_cost_upper:highCost,
    remaining_amount_lower:I-highCost,remaining_amount_upper:I-lowCost,
    remaining_share_lower:(I-highCost)/I*100,remaining_share_upper:(I-lowCost)/I*100,
    source_coherence_residuals:residuals,absolute_coherence_tolerance_million_EUR:EPS};
  return report;
}
function estimateSelection(packet,country,selectedYear,classification='COICOP 2018',options={}){
  const rows=(packet?.rows||[]).filter(r=>r.geo_id===country&&r.year===selectedYear&&r.classification===classification);
  if(rows.length===1)return estimate(rows[0],options);
  const report=empty(null,options);Object.assign(report,{geo_id:country,year:selectedYear,classification,
    status:rows.length?'ambiguous_source_rows':'no_exact_country_year_classification',reason:rows.length?'Multiple original source rows match; no row is selected or averaged.':'No exact country/year/classification source row is available.'});
  if(rows.length)report.ambiguous_rows=clone(rows);
  return report;
}
const api={estimate,estimateSelection,UNIT,EPS,DEFAULT_CATEGORIES:CATEGORIES.slice()};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.EssentialsCostsMath=api;
})(typeof window!=='undefined'?window:null);
