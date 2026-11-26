/* Browser figures retain complete selected evidence, separately from display limits. */
(()=>{'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const save=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);};
function csv(edges){const keys=[...new Set(edges.flatMap(e=>Object.keys(e)))],cell=v=>'"'+String(v&&typeof v==='object'?JSON.stringify(v):v??'').replaceAll('"','""')+'"';return[keys.map(cell).join(','),...edges.map(e=>keys.map(k=>cell(e[k])).join(','))].join('\r\n')+'\r\n';}
async function jsonBlob(value){
 // Native chemical evidence can exceed a browser's single-string limit.
 // Encode rows separately while retaining every key, value and array order.
 const parts=[],buffer=[];let bytes=0;
 const append=text=>{buffer.push(text);bytes+=text.length;if(bytes>=262144){parts.push(buffer.join(''));buffer.length=0;bytes=0;}};
 append('{');let first=true;
 for(const[key,item]of Object.entries(value)){if(item===undefined)continue;if(!first)append(',');first=false;append(JSON.stringify(key)+':');
  if(Array.isArray(item)){append('[');for(let i=0;i<item.length;i++){if(i)append(',');append(JSON.stringify(item[i])??'null');if(i&&i%512===0)await new Promise(resolve=>setTimeout(resolve,0));}append(']');}
  else append(JSON.stringify(item));
 }
 append('}\n');if(buffer.length)parts.push(buffer.join(''));return new Blob(parts,{type:'application/json'});
}
function svgMap(o){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),add=(parent,name,attrs={},text)=>{const e=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;parent.append(e);return e;};
 const offset=76;svg.setAttribute('xmlns',ns);svg.setAttribute('viewBox',`0 0 ${o.width} ${o.height+offset+44}`);
 add(svg,'rect',{width:o.width,height:o.height+offset+44,fill:'#f5f6f0'});
 add(svg,'title',{},o.data.title+' · '+o.data.year);
 add(svg,'text',{x:20,y:28,fill:'#193e34','font-size':19,'font-family':'Arial'},o.data.title+' · '+o.data.year);
 add(svg,'text',{x:20,y:52,fill:'#5d7466','font-size':12,'font-family':'Arial'},o.data.metric.label+' · '+o.data.metric.unit);
 const map=add(svg,'svg',{x:0,y:offset,width:o.width,height:o.height,viewBox:`0 0 ${o.width} ${o.height}`});
 const geo=add(map,'g',{transform:`translate(${o.transform.x},${o.transform.y}) scale(${o.transform.k})`});
 add(geo,'path',{d:d3.geoPath(o.projection)(o.geography),fill:'#dfe8d9',stroke:'#fffef7','stroke-width':.7/o.transform.k});
 const max=o.data.fixed_width_domain[1]||1;
 for(const p of o.selfLoops||[]){const l=p.link,loop=add(map,'circle',{cx:p.a[0],cy:p.a[1],r:10+p.width,fill:'none',stroke:finite(l.value)?l.value<0?'#a16d48':'#217960':'#84968d','stroke-width':p.width,'data-connection-id':l.id,...(!finite(l.value)?{'stroke-dasharray':'5 4'}:{})});add(loop,'title',{},l.from_id+' → '+l.to_id+' · '+(l.value??'Unavailable')+' '+o.data.metric.unit);}
 for(const p of o.paths){const l=p.link,width=p.width??(finite(l.value)?1+7*Math.sqrt(Math.abs(l.value)/max):1.2),stroke=p.strokeColor??(finite(l.value)?l.value<0?'#a16d48':'#217960':'#84968d');
  const samples=Array.from({length:65},(_,i)=>p.q(i/64));let pathData='';
  for(let i=0;i<samples.length;i++){const point=samples[i];const split=!i||Math.hypot(point[0]-samples[i-1][0],point[1]-samples[i-1][1])>o.width*.32;pathData+=(split?'M':'L')+point.join(',');}
  const path=add(map,'path',{d:pathData,fill:'none',stroke,'stroke-width':width,...(!finite(l.value)?{'stroke-dasharray':'5 4'}:{})});add(path,'title',{},l.from_id+' → '+l.to_id+' · '+(l.value??'Unavailable')+' '+o.data.metric.unit);
  const head=p.q(.85),before=p.q(.81),angle=Math.atan2(head[1]-before[1],head[0]-before[0])*180/Math.PI;
  add(map,'path',{d:`M0,0 L${-7-width*.3},${-3-width*.2} L${-7-width*.3},${3+width*.2} Z`,fill:stroke,transform:`translate(${head}) rotate(${angle})`});
 }
 for(const bin of o.positions){add(map,'circle',{cx:bin.x,cy:bin.y,r:bin.r,fill:bin.countryReference?'#1f6f5f':'#fffdf4',stroke:'#277358','stroke-width':1.4});if(bin.nodes.length>1)add(map,'text',{x:bin.x,y:bin.y+4,'text-anchor':'middle',fill:bin.countryReference?'white':'#194c36','font-size':12,'font-family':'Arial'},bin.nodes.length);}
 const ids=[...new Set(o.paths.slice(0,3).flatMap(p=>[p.link.from_id,p.link.to_id]))].slice(0,6);
 for(const id of ids){const node=o.data.nodes.find(n=>n.id===id),point=o.paths.flatMap(p=>[{id:p.link.from_id,p:p.a},{id:p.link.to_id,p:p.b}]).find(p=>p.id===id)?.p;if(node&&point)add(map,'text',{x:point[0]+8,y:point[1]-10,fill:'#254f3a',stroke:'#f5f6f0','stroke-width':3,'paint-order':'stroke','font-size':12,'font-family':'Arial'},node.label);}
 add(svg,'text',{x:20,y:o.height+offset+25,fill:'#5d7466','font-size':11,'font-family':'Arial'},'Schematic paths show reported direction; source evidence and display settings accompany this figure.');
 return new XMLSerializer().serializeToString(svg);
}
async function addRegionalDirections(ctx, svg, width, height, offset) {
 if (!svg?.querySelector('g path')) return;
 const layer = svg.cloneNode(true);
 layer.setAttribute('width',String(width));
 layer.setAttribute('height',String(height));
 const image = new Image();
 image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(layer));
 await image.decode();
 ctx.drawImage(image,0,offset,width,height);
}
async function exportView(o){
 if(o.format==='svg'&&o.settings?.flow_studio?.mode&&o.settings.flow_studio.mode!=='2d')throw Error('SVG export uses the 2D schematic view. Choose 2D Geodesic Flow Map, or choose PNG to capture this displayed map.');
 const name='commodity-flows-'+o.filters.collection+'-'+o.filters.year;
 if(o.format==='gif'){const a=document.createElement('a');a.href='http://127.0.0.1:8772/pipelines.html?'+new URLSearchParams(o.filters);a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open this selection in the local workbench to render GIF →';o.host.replaceChildren(a);return;}
 // Capture the displayed map before source reads yield to another UI change.
 // A later source/year selection must never change this figure's evidence.
 let png=null,vector=null;
 if(o.format==='png'){
  const snapshot=document.createElement('canvas'),ratio=o.canvas.width/o.width,offset=76;
  snapshot.width=o.canvas.width;snapshot.height=Math.ceil((o.height+offset+44)*ratio);const ctx=snapshot.getContext('2d');ctx.scale(ratio,ratio);ctx.fillStyle='#f5f6f0';ctx.fillRect(0,0,o.width,o.height+offset+44);ctx.fillStyle='#193e34';ctx.font='19px Arial';ctx.fillText(o.data.title+' · '+o.data.year,20,28);ctx.font='12px Arial';ctx.fillText(o.settings?.flow_studio?.mode==='raised3d'?'Height counts distinct displayed source endpoints by region':o.data.metric.label+' · '+o.data.metric.unit,20,52);ctx.drawImage(o.canvas,0,offset,o.width,o.height);ctx.fillStyle='#5d7466';ctx.font='11px Arial';ctx.fillText('Schematic paths show reported direction. Complete selected source evidence accompanies this figure.',20,o.height+offset+25);
  if(o.settings?.flow_studio?.mode==='raised3d') {
   await addRegionalDirections(ctx,o.canvas.closest('.map-scene')?.querySelector('.map-scene-flows'),o.width,o.height,offset);
  }
  png=new Promise(resolve=>snapshot.toBlob(resolve,'image/png'));
 }else if(o.format==='svg')vector=svgMap(o);
 const evidence=await window.PublicPipelineAPI.request('/api/pipelines/evidence',o.filters);
 const provenance={...evidence,display_settings:o.settings,displayed_connection_count:o.settings?.flow_studio?.mode==='raised3d'?undefined:o.paths.length+(o.selfLoops||[]).length,displayed_regional_directions:o.settings?.flow_studio?.mode==='raised3d'?o.paths.length:undefined,export_note:'CSV/JSON contain the complete selected source graph. Map display limits affect the figure only. Browser exports re-encode normalized records; bundle SHA-256 identifies the retained original source bundle.'};
 if(o.format==='csv')save(new Blob([csv(evidence.edges)],{type:'text/csv;charset=utf-8'}),name+'.csv');
 else if(o.format==='svg')save(new Blob([vector],{type:'image/svg+xml'}),name+'.svg');
 else if(o.format==='png'){const blob=await png;if(!blob)throw Error('The displayed map could not be saved as PNG.');save(blob,name+'.png');}
 else if(o.format!=='json')throw Error('Choose a supported browser export format.');
 save(await jsonBlob(provenance),name+'-sources.json');
 o.host.textContent='Saved '+o.format.toUpperCase()+' and complete selected source evidence. The original source fingerprints remain attached.';
}
if(typeof module!=='undefined'&&module.exports)module.exports={csv,jsonBlob,exportView};
if(typeof window!=='undefined')window.PublicPipelineExports=Object.freeze({exportView});
})();
