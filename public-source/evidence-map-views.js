/* Common map presentation and per-tab choice for the public library. */
(() => {
  'use strict';
  const labels = {
    raised3d: '3D Extruded Polygons', choropleth: 'Choropleth',
    spikes: '3D Spikes', globe: '3D Globe', bivariate: 'Bivariate 3×3'
  };
  const key = 'public-evidence.map-view.v1';
  const finite = Number.isFinite;
  function initial(allowed, requested) {
    if (allowed.includes(requested)) return requested;
    try {
      const saved = sessionStorage.getItem(key);
      if (allowed.includes(saved)) return saved;
    } catch {}
    return allowed.includes('raised3d') ? 'raised3d' : allowed[0];
  }
  function remember(mode) {
    try { if (Object.hasOwn(labels, mode)) sessionStorage.setItem(key, mode); } catch {}
  }
  function node(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function button(label, action) {
    const b = node('button', '', label);
    b.type = 'button'; b.addEventListener('click', action); return b;
  }
  function switcher(modes, select) {
    const nav = node('div', 'map-lab-tabs evidence-mode-tabs');
    nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'Map view');
    for (const mode of modes) {
      const b = button(labels[mode], () => select(mode));
      b.dataset.mode = mode; b.className = 'map-lab-mode-btn'; nav.append(b);
    }
    return nav;
  }
  function mark(nav, mode) {
    for (const b of nav.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }

  function center(feature) {
    if (feature.centroid) return feature.centroid;
    const ring = d3.greatest(feature.polygons.map(p => p[0]), r => Math.abs(d3.polygonArea(r)));
    return ring ? d3.polygonCentroid(ring) : [NaN, NaN];
  }
  function drawSpikes(svg, options) {
    const {geometry, lookup} = options;
    const [[left, bottom],[right, top]] = geometry.bounds;
    const values = geometry.features.map(f => lookup(f.id)?.value).filter(finite);
    const max = Math.max(Math.abs(options.floor || 0), options.ceiling || d3.max(values, Math.abs) || 1);
    const scale = 7.5, height = (top-bottom)*scale*.16, halfWidth = (right-left)*scale*.003;
    const g = d3.select(svg).append('g').attr('class','evidence-spikes').attr('pointer-events','none');
    for (const f of geometry.features) {
      const row = lookup(f.id), v = row?.value;
      if (!finite(v) || v === 0) continue;
      const [cx,cy] = center(f); if (![cx,cy].every(finite)) continue;
      const x=(cx-left)*scale, y=(top-cy)*scale, length=height*Math.sign(v)*Math.sqrt(Math.abs(v)/max);
      g.append('path').attr('d', 'M'+(x-halfWidth)+','+y+'L'+x+','+(y-length)+'L'+(x+halfWidth)+','+y+'Z')
        .attr('fill', row.color || (v < 0 ? '#a95434' : '#185b50')).attr('stroke','#fff').attr('stroke-width',.35);
    }
  }

  async function globe(host, options, current) {
    const {geometry, lookup, selected, onPick, unit, cuts, palette} = options;
    const source = await window.PublicEvidenceComponents.json('/data/world-geometry.json');
    if (!current()) return;
    const byId = new Map(geometry.features.map(f => [f.id,f]));
    const visible = source.features.filter(f => byId.has(f.properties.id)).map(f => {
      const upright = rings => d3.geoArea({type:'Polygon', coordinates:rings}) > 2*Math.PI ? rings.map(r => r.slice().reverse()) : rings;
      const g = f.geometry;
      return {...f, geometry:{...g,coordinates:g.type==='Polygon' ? upright(g.coordinates) : g.coordinates.map(upright)}};
    });
    const chosen = visible.find(f => f.properties.id === selected);
    const focus = chosen ? d3.geoCentroid(chosen) : [0,18];
    let lon = -focus[0], lat = -focus[1], zoom = 1;
    const projection = d3.geoOrthographic().translate([250,185]).clipAngle(90);
    const path = d3.geoPath(projection);
    const svg = d3.create('svg').attr('class','evidence-globe').attr('viewBox','0 0 500 370')
      .attr('role','img').attr('aria-label', options.title + ' · globe');
    const water = svg.append('path').datum({type:'Sphere'}).attr('fill','#dbe9ea').attr('stroke','#78969b');
    const regions = svg.selectAll('path.region').data(visible).join('path').attr('class','region')
      .attr('fill', f => {const row=lookup(f.properties.id);return finite(row?.value)?(row.color || palette[d3.bisectRight(cuts,row.value)]):'#dbdfd8';})
      .attr('stroke',f=>f.properties.id===selected?'#163b32':'#fff').attr('stroke-width',f=>f.properties.id===selected?1.6:.55)
      .on('click',(event,f)=>{const row=lookup(f.properties.id);if(!event.defaultPrevented && row?.id) onPick(row.id);});
    regions.append('title').text(f => {
      const row=lookup(f.properties.id);
      return f.properties.name+' · '+(row?.display || (finite(row?.value)?row.value.toLocaleString('en-US',{maximumFractionDigits:2})+' '+unit:'Unavailable'));
    });
    function paint() {projection.rotate([lon,lat]).scale(172*zoom);water.attr('d',path);regions.attr('d',path);}
    const rotate = (dx,dy) => {lon+=dx;lat=Math.max(-85,Math.min(85,lat+dy));paint();};
    svg.call(d3.drag().clickDistance(4).on('drag', e=>rotate(e.dx*.45,-e.dy*.45)));
    const tools=node('div','evidence-globe-controls');
    for (const [caption,fn] of [['Rotate west',()=>rotate(20,0)],['Rotate east',()=>rotate(-20,0)],['Tilt north',()=>rotate(0,-15)],['Tilt south',()=>rotate(0,15)],['Zoom in',()=>{zoom=Math.min(2.5,zoom*1.25);paint();}],['Zoom out',()=>{zoom=Math.max(.7,zoom/1.25);paint();}]]) tools.append(button(caption,fn));
    host.replaceChildren(svg.node(),tools);paint();
  }

  const bivariateColors = [['#e8e8e8','#b5c0da','#6c83b5'],['#b8d6be','#90b2b3','#567994'],['#73ae80','#5a9178','#2a5a5b']];
  async function bivariate(svg, detail, options, shapes, current) {
    const data = await window.PublicEvidenceComponents.json('/data/economy/gdp.json');
    if (!current()) return;
    const incomes = new Map(data.countries.map(c => [c.iso3,c.rows.find(r=>r[0]===options.year)?.[1]]));
    const pairs = options.geometry.features.map(f => [options.lookup(f.id)?.value, incomes.get(f.id==='KOS'?'XKX':f.id)]);
    const matched = pairs.filter(p => p.every(finite));
    const bins = [0,1].map(i => [d3.quantile(matched.map(p=>p[i]),1/3),d3.quantile(matched.map(p=>p[i]),2/3)]);
    shapes.forEach((s,i)=>{
      const [x,y]=pairs[i];
      if (![x,y].every(finite)) {s.setAttribute('fill','#dbdfd8');s.querySelector('title').textContent=options.geometry.features[i].name+' · matched pair unavailable';return;}
      s.setAttribute('fill',bivariateColors[d3.bisectRight(bins[1],y)][d3.bisectRight(bins[0],x)]);
      s.querySelector('title').textContent=options.geometry.features[i].name+' · '+x.toLocaleString()+' '+options.unit+' · GDP per person '+y.toLocaleString()+' international $';
    });
    const grid=node('table','evidence-biv-key'),cap=grid.createCaption();
    cap.textContent='Rows show GDP per person. Columns show the selected measure.';
    const row=grid.createTHead().insertRow();
    for(const label of ['GDP / measure','Low','Middle','High'])row.append(node('th','',label));
    const ranks=['Low','Middle','High'];
    for(let y=2;y>=0;y--){const tr=grid.insertRow();tr.append(node('th','',ranks[y]));for(let x=0;x<3;x++){const td=tr.insertCell();td.style.backgroundColor=bivariateColors[y][x];td.setAttribute('aria-label',ranks[y]+' GDP, '+ranks[x]+' measure');}}
    detail.replaceChildren(node('p','hr-note',matched.length+' mapped economies have both observations in '+options.year+'. Colors group those economies into thirds on each measure. Gray indicates a missing pair.'));
    if(matched.length) detail.append(grid);
  }

  function enhance(box, svg, legend, options) {
    const flat = node('div','evidence-flat-stage'), other=node('div','evidence-other-stage'), detail=node('div','evidence-mode-detail');
    const isWorld=options.geometry.scope==='world';
    const modes=['raised3d','choropleth','spikes'];
    if(isWorld) modes.push('globe');
    if(isWorld && Number.isInteger(options.year) && options.year>=1990 && options.year<=2025 && options.pairGDP!==false) modes.push('bivariate');
    const query=new URL(location.href).searchParams;
    let mode=initial(modes,query.get('mode')), ticket=0, renderer=null;
    const shapes=Array.from(svg.children).filter(e=>e.localName==='path' && e.querySelector('title'));
    const original=shapes.map(s=>[s.getAttribute('fill'),s.querySelector('title').textContent]);
    const nav=switcher(modes,next=>{
      remember(next);const url=new URL(location.href);url.searchParams.set('mode',next);history.replaceState(null,'',url);show(next);
    });
    box.insertBefore(nav,svg);box.insertBefore(flat,svg);flat.append(svg);box.insertBefore(other,legend);box.append(detail);
    function show(next) {
      const generation=++ticket;mode=next;mark(nav,mode);box.dataset.mapMode=mode;
      renderer?.destroy?.();renderer=null;
      other.replaceChildren();detail.replaceChildren();svg.querySelector('.evidence-spikes')?.remove();
      shapes.forEach((shape,i)=>{shape.setAttribute('fill',original[i][0]);shape.querySelector('title').textContent=original[i][1];});
      flat.hidden=mode==='raised3d'||mode==='globe';other.hidden=!flat.hidden;legend.hidden=mode==='bivariate';
      const current=()=>ticket===generation && box.isConnected;
      const fail=()=>{if(!current())return;show('choropleth');detail.append(node('p','hr-note','This map view could not load. The choropleth shows the same source values.'));};
      if(mode==='raised3d'){
        if(!window.EvidencePolygonMap){queueMicrotask(fail);return;}
        renderer=window.EvidencePolygonMap.mountWhenConnected(other,options,fail);
      } else if(mode==='globe') requestAnimationFrame(()=>{if(current())globe(other,options,current).catch(fail);});
      else if(mode==='spikes'){drawSpikes(svg,options);detail.append(node('p','hr-note','Spike length uses the square root of magnitude. Positive values point up and negative values point down.'));}
      else if(mode==='bivariate') requestAnimationFrame(()=>{if(current())bivariate(svg,detail,options,shapes,current).catch(fail);});
    }
    show(mode);
    return box;
  }
  document.addEventListener('change', e => {
    if (e.target.matches('.map-collection-nav select') && e.target.value) location.assign(e.target.value);
  });
  window.addEventListener('pageshow',()=>document.querySelectorAll('.map-collection-nav select').forEach(s=>s.selectedIndex=0));
  window.EvidenceMapViews=Object.freeze({labels, initial, remember, switcher, mark, enhance});
})();
