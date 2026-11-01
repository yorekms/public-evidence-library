/* Native raised-region renderer. Local Three.js geometry; no network acquisition.
 * Source values, fixed scale and geometry come from the trusted Python scene.
 */
(() => {
'use strict';
const T=window.WorkbenchTHREE;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const format=x=>finite(x)?new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(x)<1&&x!==0?3:1}).format(x):'Not reported';
const compact=x=>finite(x)?new Intl.NumberFormat('en-US',{notation:'compact',maximumSignificantDigits:3}).format(x):'—';
const COLORS={low:'#e4efe6',high:'#195f50',negative:'#a6654b',neutral:'#f4f2e9',missing:'#d5d8d0',ink:'#213f36',border:'#fafbf5'};
const safeArray=x=>Array.isArray(x)?x:[];
function interpolate(a,b,t){const c1=new T.Color(a).getRGB({},T.SRGBColorSpace),c2=new T.Color(b).getRGB({},T.SRGBColorSpace),f=clamp(t,0,1);return new T.Color().setRGB(c1.r+(c2.r-c1.r)*f,c1.g+(c2.g-c1.g)*f,c1.b+(c2.b-c1.b)*f,T.SRGBColorSpace);}
function scaleInfo(scene){
 const s=scene?.scale||{},min=finite(s.min)?s.min:0,max=finite(s.max)?s.max:1,reference=finite(s.reference)?s.reference:null;
 return{min,max,reference,maxAbs:finite(s.max_abs)&&s.max_abs>0?s.max_abs:Math.max(Math.abs(min),Math.abs(max),1),heightMax:finite(s.height_max)?s.height_max:13};
}
function colorFor(scene,value){
 if(!finite(value))return new T.Color(COLORS.missing);
 const {min,max,reference}=scaleInfo(scene),s=scene?.scale||{};
 const domain=Array.isArray(s.color_domain)&&s.color_domain.length>=2?s.color_domain:(reference===null?[min,max]:[min,reference,max]);
 const colors=Array.isArray(s.color_range)&&s.color_range.length===domain.length?s.color_range:(reference===null?[COLORS.low,COLORS.high]:[COLORS.negative,COLORS.neutral,COLORS.high]);
 if(value<=domain[0])return new T.Color(colors[0]);if(value>=domain.at(-1))return new T.Color(colors.at(-1));
 for(let i=1;i<domain.length;i++)if(value<=domain[i])return interpolate(colors[i-1],colors[i],(value-domain[i-1])/(domain[i]-domain[i-1]||1));return new T.Color(colors.at(-1));
}
function rowAvailable(row){return row&&row.eligible!==false&&finite(row.value);}
function frameFor(scene,year){return safeArray(scene?.frames).find(f=>Number(f.year)===Number(year))||{year,values:{},available:false,missing_count:safeArray(scene?.features).length};}
function normalizeRing(ring){
 const out=safeArray(ring).filter(p=>Array.isArray(p)&&p.length>=2&&finite(p[0])&&finite(p[1])).map(p=>[p[0],p[1]]);
 if(out.length>1&&out[0][0]===out.at(-1)[0]&&out[0][1]===out.at(-1)[1])out.pop();return out;
}
function makeShape(rings){
 const normalized=safeArray(rings).map(normalizeRing).filter(r=>r.length>=3);if(!normalized.length)return null;
 const outer=normalized[0].map(p=>new T.Vector2(...p));if(T.ShapeUtils.isClockWise(outer))outer.reverse();const shape=new T.Shape(outer);
 for(const ring of normalized.slice(1)){const points=ring.map(p=>new T.Vector2(...p));if(!T.ShapeUtils.isClockWise(points))points.reverse();shape.holes.push(new T.Path(points));}
 return shape;
}
function disposeTree(object){if(!object)return;object.traverse(node=>{node.geometry?.dispose();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());else node.material?.dispose();});}
function fitCameraView(points,width,height,topReserve,bottomReserve){
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const point of points){minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
 const plotHeight=Math.max(140,height-topReserve-bottomReserve),aspect=width/height;
 const viewWidth=Math.max(maxX-minX,(maxY-minY)*width/plotHeight,1)*1.08,viewHeight=viewWidth/aspect;
 const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2+(topReserve-bottomReserve)/2*viewHeight/height;
 return{left:centerX-viewWidth/2,right:centerX+viewWidth/2,top:centerY+viewHeight/2,bottom:centerY-viewHeight/2};
}
function mount(host,options={}){
 if(!host||!(host instanceof Element))throw new Error('Choose a map host element.');
 if(!T)throw new Error('The local 3D renderer library did not load. Reopen the complete workbench folder.');
 const wrapper=document.createElement('div');wrapper.className='map-scene';
 const canvas=document.createElement('canvas');canvas.className='map-scene-canvas';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Interactive raised-region map. Drag to orbit, use plus or minus to zoom, and arrow keys to rotate.');wrapper.append(canvas);
 const hud=document.createElement('div');hud.className='map-scene-hud';const kind=document.createElement('span');kind.className='map-scene-kind';kind.textContent='Raised regions';const yearLabel=document.createElement('strong');yearLabel.className='map-scene-year';hud.append(kind,yearLabel);wrapper.append(hud);
 const guide=document.createElement('div');guide.className='map-scene-guide';guide.textContent='Drag to rotate · scroll to zoom';wrapper.append(guide);
 const callout=document.createElement('div');callout.className='map-scene-callout';callout.hidden=true;wrapper.append(callout);
 const tooltip=document.createElement('div');tooltip.className='map-scene-tooltip';tooltip.hidden=true;wrapper.append(tooltip);
 const labelLayer=document.createElement('div');labelLayer.className='map-scene-labels';wrapper.append(labelLayer);
 const legend=document.createElement('div');legend.className='map-scene-legend';wrapper.append(legend);
 const modeNote=document.createElement('div');modeNote.className='map-scene-renderer-note';wrapper.append(modeNote);
 host.replaceChildren(wrapper);
 const state={scene:null,frame:null,year:null,elevation:45,azimuth:-60,height_scale:1,zoom:1,focusId:null,hoverId:null,destroyed:false,entries:[],fitPoints:[],width:900,height:520,drag:null,mode:'webgl',fallbackMessage:'',geometryKey:null,lastOptions:null};
 const world=new T.Scene();world.background=new T.Color('#fbfcf8');
 const camera=new T.OrthographicCamera(-60,60,40,-40,.1,1000);camera.up.set(0,0,1);
 let renderer=null,context2d=null;
 // Probe first so normal unsupported hardware does not produce Three.js console errors.
 try{const context=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});if(!context)throw new Error('WebGL 2 unavailable');renderer=new T.WebGLRenderer({canvas,context,antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor('#fbfcf8',1);}
 catch(error){state.mode='canvas';state.fallbackMessage='Software 3D view · the same values and camera are drawn without WebGL.';const replacement=document.createElement('canvas');replacement.className=canvas.className;replacement.tabIndex=0;replacement.setAttribute('role','img');replacement.setAttribute('aria-label',canvas.getAttribute('aria-label'));canvas.replaceWith(replacement);state.canvas=replacement;context2d=replacement.getContext('2d');}
 const activeCanvas=state.canvas||canvas;
 const ambient=new T.AmbientLight(0xffffff,2.6);world.add(ambient);const light=new T.DirectionalLight(0xffffff,2.0);light.position.set(-70,-100,130);world.add(light);
 let mapGroup=new T.Group();world.add(mapGroup);const raycaster=new T.Raycaster();const mouse=new T.Vector2();
 const hiddenCap=new T.MeshBasicMaterial({visible:false});
 function getCamera(){return{elevation:state.elevation,azimuth:state.azimuth,height_scale:state.height_scale,zoom:state.zoom};}
 function notifyCamera(){options.onCameraChange?.(getCamera());}
 function getRendererInfo(){return{mode:state.mode,message:state.fallbackMessage||'Interactive 3D regions · source-defined heights and fixed scales.'};}
 function dimensions(){const box=wrapper.getBoundingClientRect();state.width=Math.max(240,Math.floor(box.width||host.clientWidth||900));state.height=Math.max(260,Math.floor(box.height||520));state.pixelRatio=Math.min(window.devicePixelRatio||1,2);if(renderer)renderer.setSize(state.width,state.height,false);else{const ratio=Math.min(window.devicePixelRatio||1,2);activeCanvas.width=state.width*ratio;activeCanvas.height=state.height*ratio;activeCanvas.style.width=state.width+'px';activeCanvas.style.height=state.height+'px';context2d?.setTransform(ratio,0,0,ratio,0,0);}updateCamera();draw();}
 function sceneBounds(){const raw=state.scene?.bounds;if(Array.isArray(raw)&&raw.length===2&&raw.flat().every(finite))return raw;return[[-50,-30],[50,30]];}
 function updateCamera(){
  const [[x0,y0],[x1,y1]]=sceneBounds(),scale=scaleInfo(state.scene),hasNegative=(state.scene?.scale?.data_min??scale.min)<0,hasPositive=(state.scene?.scale?.data_max??scale.max)>0;
  const z0=hasNegative?-scale.heightMax*state.height_scale:0,z1=hasPositive?scale.heightMax*state.height_scale:0;
  const target=new T.Vector3((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),r=Math.max(x1-x0,y1-y0,100)*3;
  const el=state.elevation*Math.PI/180,az=state.azimuth*Math.PI/180;
  camera.position.set(target.x+r*Math.cos(el)*Math.cos(az),target.y+r*Math.cos(el)*Math.sin(az),target.z+r*Math.sin(el));camera.lookAt(target);camera.updateMatrixWorld(true);
  // Fit the actual geography rather than the empty corners of its enclosing
  // rectangle. Both fixed height-domain ends are used for every source year.
  const points=[],plane=state.fitPoints.length?state.fitPoints:[[x0,y0],[x0,y1],[x1,y0],[x1,y1]];
  for(const [x,y]of plane)for(const z of[z0,z1])points.push(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  // Keep geography clear of the year/legend/focused-value HTML overlays.
  const stacked=typeof window.matchMedia==='function'?window.matchMedia('(max-width:650px)').matches:state.width<600;
  const view=fitCameraView(points,state.width,state.height,68,stacked?177:124);
  camera.left=view.left;camera.right=view.right;camera.top=view.top;camera.bottom=view.bottom;camera.zoom=state.zoom;camera.updateProjectionMatrix();
 }
 function buildGeometry(){
  disposeTree(mapGroup);world.remove(mapGroup);mapGroup=new T.Group();world.add(mapGroup);state.entries=[];state.fitPoints=[];
  for(const feature of safeArray(state.scene?.features)){
   const id=String(feature.id),entry={feature,id,parts:[],rings:[],topHeight:0,available:false,color:new T.Color(COLORS.missing)};
   for(const polygon of safeArray(feature.polygons)){
    const rings=safeArray(polygon).map(normalizeRing).filter(r=>r.length>=3),shape=makeShape(rings);if(!shape)continue;
    for(const ring of rings)for(const point of ring)state.fitPoints.push(point);
    const topGeometry=new T.ShapeGeometry(shape,1),sideGeometry=new T.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,steps:1,curveSegments:1});
    const topMaterial=new T.MeshBasicMaterial({color:COLORS.missing,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    const sideMaterial=new T.MeshLambertMaterial({color:COLORS.missing,side:T.DoubleSide});
    const top=new T.Mesh(topGeometry,topMaterial),sides=new T.Mesh(sideGeometry,[hiddenCap,sideMaterial]);top.userData.placeId=id;sides.userData.placeId=id;
    const lines=[];for(const ring of rings){const points=ring.concat([ring[0]]).map(p=>new T.Vector3(p[0],p[1],.01));const geo=new T.BufferGeometry().setFromPoints(points);const line=new T.Line(geo,new T.LineBasicMaterial({color:COLORS.border,transparent:true,opacity:.85}));lines.push(line);mapGroup.add(line);}
    const baseline=[];for(const ring of rings){const points=ring.concat([ring[0]]).map(p=>new T.Vector3(p[0],p[1],-.015));const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#aebdb3',transparent:true,opacity:.5}));baseline.push(line);mapGroup.add(line);}
    mapGroup.add(sides,top);entry.parts.push({top,sides,lines,baseline});entry.rings.push(rings);
   }
   state.entries.push(entry);
  }
 }
 function applyFrame(){
  const scale=scaleInfo(state.scene),values=state.frame?.values||{};
  for(const entry of state.entries){const row=values[entry.id],available=rowAvailable(row),h=available?row.value/scale.maxAbs*scale.heightMax*state.height_scale:0,color=colorFor(state.scene,available?row.value:null),selected=entry.id===state.focusId||entry.id===state.hoverId;
   entry.topHeight=h;entry.available=available;entry.color=color;
   for(const part of entry.parts){part.top.position.z=h;part.top.material.color.copy(color);part.sides.scale.z=Math.abs(h);part.sides.position.z=Math.min(0,h);part.sides.visible=available&&Math.abs(h)>1e-8;part.sides.material[1].color.copy(color).multiplyScalar(.72);for(const line of part.lines){line.position.z=h;line.material.color.set(selected?COLORS.ink:COLORS.border);line.material.opacity=selected?1:.9;line.renderOrder=selected?3:1;}}
  }
 }
 function showCallout(){
  const id=state.focusId,feature=state.entries.find(e=>e.id===id)?.feature;if(!feature){callout.hidden=true;return;}
  const row=state.frame?.values?.[id],available=rowAvailable(row);callout.replaceChildren();const title=document.createElement('strong');title.textContent=feature.name||id;const value=document.createElement('span');value.className='map-scene-callout-value';value.textContent=available?format(row.value):'Not reported';const unit=document.createElement('small');unit.textContent=available?(state.scene?.series?.unit||'source units'):(row?.status||'No source value for this year');callout.append(title,value,unit);callout.hidden=false;
 }
 function updateHud(){
  const scene=state.scene,scale=scaleInfo(scene);yearLabel.textContent=state.year===null?'':String(state.year);kind.textContent=state.frame?.available===false?'No source observations this year':'Raised regions';modeNote.textContent=state.mode==='canvas'?state.fallbackMessage:'';modeNote.hidden=state.mode!=='canvas';
  const series=scene?.series||{};activeCanvas.setAttribute('aria-label',`${series.label||'Public data'}; ${state.year}; raised native regions. Height is a source value from zero. Drag to orbit or use arrow keys. Missing values stay flat and gray.`);
  legend.replaceChildren();const legendTitle=document.createElement('strong');legendTitle.textContent=series.unit||'Source units';const ramp=document.createElement('div');ramp.className='map-scene-legend-ramp';
  const stops=Array.from({length:17},(_,i)=>scale.min+(scale.max-scale.min)*i/16);if(scale.reference!==null&&scale.reference>scale.min&&scale.reference<scale.max)stops.push(scale.reference);stops.sort((a,b)=>a-b);
  ramp.style.background='linear-gradient(to right, '+stops.map(value=>colorFor(scene,value).getStyle()+' '+((value-scale.min)/(scale.max-scale.min||1)*100)+'%').join(', ')+')';
  const ticks=document.createElement('div');ticks.className='map-scene-legend-ticks';const middle=scale.reference??(scale.min+scale.max)/2,position=(middle-scale.min)/(scale.max-scale.min||1),tickValues=position>.16&&position<.84?[scale.min,middle,scale.max]:[scale.min,scale.max];
  tickValues.forEach((value,i)=>{const tick=document.createElement('span');tick.textContent=compact(value);tick.style.left=((value-scale.min)/(scale.max-scale.min||1)*100)+'%';tick.style.transform=i===0?'none':i===tickValues.length-1?'translateX(-100%)':'translateX(-50%)';ticks.append(tick);});
  const note=document.createElement('small');note.textContent=(scale.reference===null?'':'Color reference: '+format(scale.reference)+' · ')+'Fixed across the selected years · gray = missing';legend.append(legendTitle,ramp,ticks,note);showCallout();
 }
 function project(x,y,z){const vector=new T.Vector3(x,y,z).project(camera);return[(vector.x+1)*state.width/2,(1-vector.y)*state.height/2,vector.z];}
 function canvasPath(rings,height){const path=new Path2D();for(const ring of rings){ring.forEach((point,i)=>{const p=project(point[0],point[1],height);if(i)path.lineTo(p[0],p[1]);else path.moveTo(p[0],p[1]);});path.closePath();}return path;}
 function drawSoftware(){
  if(!context2d)return;const ctx=context2d;ctx.clearRect(0,0,state.width,state.height);ctx.fillStyle='#fbfcf8';ctx.fillRect(0,0,state.width,state.height);
  const faces=[];for(const entry of state.entries){const color=entry.color.getStyle(),selected=entry.id===state.focusId||entry.id===state.hoverId;
   for(const rings of entry.rings){const top=canvasPath(rings,entry.topHeight),outer=rings[0],depth=outer.reduce((sum,p)=>sum+project(p[0],p[1],entry.topHeight)[2],0)/outer.length;faces.push({path:top,depth,color,selected,entry,top:true});
    if(entry.available&&Math.abs(entry.topHeight)>1e-8)for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],points=[project(a[0],a[1],0),project(b[0],b[1],0),project(b[0],b[1],entry.topHeight),project(a[0],a[1],entry.topHeight)],path=new Path2D();points.forEach((p,j)=>j?path.lineTo(p[0],p[1]):path.moveTo(p[0],p[1]));path.closePath();const shade=entry.color.clone().multiplyScalar(.68).getStyle();faces.push({path,depth:points.reduce((sum,p)=>sum+p[2],0)/4,color:shade,selected:false,entry,top:false});}
   }
  }
  faces.sort((a,b)=>b.depth-a.depth);for(const face of faces){ctx.fillStyle=face.color;ctx.fill(face.path,'evenodd');if(face.top){ctx.strokeStyle=face.selected?COLORS.ink:COLORS.border;ctx.lineWidth=face.selected?1.8:.7;ctx.stroke(face.path);}}
  state.softwareFaces=faces;
 }
 function drawLabels(){
  // Three sparse identifiers locate the focal region and cartographic insets.
  // Exact values remain in the fixed HTML callout and source table.
  labelLayer.replaceChildren();const used=[];
  for(const entry of state.entries.filter(e=>e.id===state.focusId||e.feature.inset)){
   const centroid=entry.feature.centroid;if(!Array.isArray(centroid)||!centroid.every(finite))continue;
   const point=project(centroid[0],centroid[1],entry.topHeight);if(point[0]<18||point[0]>state.width-18||point[1]<68||point[1]>state.height-118)continue;
   const tag=document.createElement('span');tag.className='map-scene-place-label'+(entry.id===state.focusId?' focal':'');tag.textContent=entry.id.length<=4?entry.id:entry.feature.name;tag.title=entry.feature.name||entry.id;
   let x=point[0],y=point[1]-10;if(used.some(p=>Math.abs(p[0]-x)<40&&Math.abs(p[1]-y)<21))y-=23;used.push([x,y]);tag.style.left=x+'px';tag.style.top=y+'px';labelLayer.append(tag);
  }
 }
 function draw(){if(state.destroyed||!state.scene)return;if(renderer)renderer.render(world,camera);else drawSoftware();drawLabels();}
 function hit(event){
  if(!state.scene)return null;const box=activeCanvas.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
  if(renderer){mouse.set(x/box.width*2-1,-y/box.height*2+1);raycaster.setFromCamera(mouse,camera);const meshes=state.entries.flatMap(e=>e.parts.flatMap(p=>[p.top,p.sides]).filter(m=>m.visible));return raycaster.intersectObjects(meshes,false)[0]?.object?.userData?.placeId||null;}
  if(context2d){for(const face of(state.softwareFaces||[]).slice().reverse())if(context2d.isPointInPath(face.path,x*(state.pixelRatio||1),y*(state.pixelRatio||1),'evenodd'))return face.entry.id;}return null;
 }
 function showTooltip(event,id){
  const entry=state.entries.find(e=>e.id===id);if(!entry){tooltip.hidden=true;return;}const row=state.frame?.values?.[id];tooltip.replaceChildren();const strong=document.createElement('strong');strong.textContent=entry.feature.name||id;const value=document.createElement('span');value.textContent=rowAvailable(row)?format(row.value)+' '+(state.scene?.series?.unit||''):'Not reported / excluded';const status=document.createElement('small');status.textContent=[state.year,row?.status].filter(Boolean).join(' · ');tooltip.append(strong,value,status);tooltip.hidden=false;const box=wrapper.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(event.clientX-box.left+12,box.width-tooltip.offsetWidth-10))+'px';tooltip.style.top=Math.max(70,Math.min(event.clientY-box.top+14,box.height-tooltip.offsetHeight-10))+'px';
 }
 function setCamera(settings={},emit=false){
  for(const [key,lo,hi]of[['elevation',15,80],['height_scale',.2,2],['zoom',.5,3]])if(finite(settings[key]))state[key]=clamp(settings[key],lo,hi);
  if(finite(settings.azimuth))state.azimuth=((settings.azimuth+180)%360+360)%360-180;
  if(settings.focusId!==undefined)state.focusId=settings.focusId===null?null:String(settings.focusId);
  applyFrame();updateCamera();draw();updateHud();if(emit)notifyCamera();return getCamera();
 }
 function pointerDown(event){if(event.button!==0)return;state.drag={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};activeCanvas.setPointerCapture?.(event.pointerId);activeCanvas.classList.add('dragging');tooltip.hidden=true;}
 function pointerMove(event){if(state.drag){const dx=event.clientX-state.drag.x,dy=event.clientY-state.drag.y;state.drag.x=event.clientX;state.drag.y=event.clientY;if(Math.hypot(event.clientX-state.drag.startX,event.clientY-state.drag.startY)>4)state.drag.moved=true;setCamera({azimuth:state.azimuth-dx*.35,elevation:state.elevation+dy*.27},true);return;}
  const id=hit(event);if(id!==state.hoverId){state.hoverId=id;applyFrame();draw();}showTooltip(event,id);
 }
 function pointerUp(event){const drag=state.drag;state.drag=null;activeCanvas.classList.remove('dragging');activeCanvas.releasePointerCapture?.(event.pointerId);if(drag&&!drag.moved){const id=hit(event);if(id){state.focusId=id;applyFrame();showCallout();draw();options.onSelectPlace?.(id);}}}
 function pointerLeave(){if(!state.drag){state.hoverId=null;tooltip.hidden=true;applyFrame();draw();}}
 function wheel(event){event.preventDefault();setCamera({zoom:state.zoom*Math.exp(-event.deltaY*.0012)},true);}
 function keyDown(event){const key=event.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(key))return;event.preventDefault();const values=key==='Home'?{elevation:45,azimuth:-60,zoom:1}:key==='ArrowLeft'?{azimuth:state.azimuth-6}:key==='ArrowRight'?{azimuth:state.azimuth+6}:key==='ArrowUp'?{elevation:state.elevation+5}:key==='ArrowDown'?{elevation:state.elevation-5}:key==='-'?{zoom:state.zoom/1.15}:{zoom:state.zoom*1.15};setCamera(values,true);}
 activeCanvas.addEventListener('pointerdown',pointerDown);activeCanvas.addEventListener('pointermove',pointerMove);activeCanvas.addEventListener('pointerup',pointerUp);activeCanvas.addEventListener('pointercancel',pointerUp);activeCanvas.addEventListener('pointerleave',pointerLeave);activeCanvas.addEventListener('wheel',wheel,{passive:false});activeCanvas.addEventListener('keydown',keyDown);
 const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(dimensions):null;resizeObserver?.observe(wrapper);if(!resizeObserver)window.addEventListener('resize',dimensions);
 function render(config={}){
  if(state.destroyed)throw new Error('This map view has been closed.');
  const scene=config.scene||state.scene;if(!scene||!Array.isArray(scene.features)||!Array.isArray(scene.frames))throw new Error('The source service did not return a valid map scene.');
  const changed=scene!==state.scene;state.scene=scene;state.year=config.year??state.year??scene.years?.at(-1)??scene.frames.at(-1)?.year;state.frame=frameFor(scene,state.year);
  for(const key of['elevation','azimuth','height_scale','zoom'])if(finite(config[key]))state[key]=config[key];
  state.elevation=clamp(state.elevation,15,80);state.height_scale=clamp(state.height_scale,.2,2);state.zoom=clamp(state.zoom,.5,3);
  if(config.focusId!==undefined)state.focusId=config.focusId===null?null:String(config.focusId);
  if(changed)buildGeometry();applyFrame();dimensions();updateHud();return{...getRendererInfo(),year:state.year,available:state.frame.available!==false};
 }
 function destroy(){state.destroyed=true;resizeObserver?.disconnect();if(!resizeObserver)window.removeEventListener('resize',dimensions);activeCanvas.removeEventListener('pointerdown',pointerDown);activeCanvas.removeEventListener('pointermove',pointerMove);activeCanvas.removeEventListener('pointerup',pointerUp);activeCanvas.removeEventListener('pointercancel',pointerUp);activeCanvas.removeEventListener('pointerleave',pointerLeave);activeCanvas.removeEventListener('wheel',wheel);activeCanvas.removeEventListener('keydown',keyDown);disposeTree(mapGroup);renderer?.dispose();hiddenCap.dispose();host.replaceChildren();}
 dimensions();return{render,setCamera,getCamera,getRendererInfo,destroy,canvas:activeCanvas};
}
window.PublicDataMapScene=Object.freeze({mount,version:'0.2.0'});
})();
