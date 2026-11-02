/* Source-aware links to separately retained directional commodity records. */
(() => {
'use strict';
const global=typeof window==='undefined'?globalThis:window;
const COVERAGE_CAPTION='Separate source coverage; choose an available period in the flow viewer.';
const FLOWS=Object.freeze({
 coal:Object.freeze({collection:'trade_coal',label:'Open related coal flows',coverage:'Selected international coal customs-export records · retained period 2024.'}),
 rareEarths:Object.freeze({collection:'trade_rare_earths',label:'Related rare-earth-compound exports',coverage:'Selected rare-earth-compound customs exports · retained period 2024. Compounds retain their own product definition and production stage.'})
});
function familyForText(value){
 if(typeof value!=='string')return null;
 if(/\brare[\s\u2010-\u2015-]+earths?\b/i.test(value))return'rareEarths';
 if(/\bcoal\b/i.test(value))return'coal';
 return null;
}
function relatedFlow(series={}){
 if(!series||typeof series!=='object')return null;
 // A declared commodity takes precedence; labels support the original
 // catalogue entries that did not yet carry a commodity field.
 const family=familyForText(series.commodity)||familyForText(series.label);
 if(!family)return null;
 const flow=FLOWS[family];
 return{...flow,href:'/workbench/pipelines.html?collection='+flow.collection,caption:COVERAGE_CAPTION};
}
function entry(series,make){
 const link=relatedFlow(series);if(!link)return null;
 const el=make||((tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;});
 const box=el('aside','world-flow-entry');box.setAttribute('aria-label','Related commodity flow evidence');
 const action=el('a','button small',link.label+' →');action.href=link.href;
 box.append(action,el('p','',link.coverage+' '+link.caption));return box;
}
const api=Object.freeze({relatedFlow,entry});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
global.PublicCommodityFlowLinks=api;
})();
