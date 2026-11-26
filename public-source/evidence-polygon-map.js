/* Adapt each explorer's projected boundaries and source values to the library's native 3D scene. */
(() => {
  'use strict';
  const cameras = new Map();
  const finite = Number.isFinite;
  const openCamera = Object.freeze({elevation: 58, azimuth: -90, height_scale: 1, zoom: 1});
  const controllers = new Map();
  let observer;

  function watchDetachment() {
    if (observer) return;
    observer = new MutationObserver(() => {
      for (const [host, controller] of controllers) {
        if (!host.isConnected) controller.destroy();
      }
      if (!controllers.size) {
        observer.disconnect();
        observer = null;
      }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
  }

  function makeFrame(settings) {
    const values = Object.create(null);
    const pickIds = new Map();
    let minimum = 0, maximum = 0, available = false;
    for (const feature of settings.geometry.features) {
      const source = settings.lookup(feature.id);
      const value = finite(source?.value) ? source.value : null;
      const id = String(feature.id);
      values[id] = {value, eligible: value !== null, color: source?.color, display: source?.display, status: source?.status};
      if (source?.id !== null && source?.id !== undefined) pickIds.set(id, source.id);
      if (value !== null) {
        available = true;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
    const low = Math.min(minimum, finite(settings.floor) ? settings.floor : 0);
    const high = Math.max(maximum, finite(settings.ceiling) ? settings.ceiling : 0);
    const span = Math.max(...settings.geometry.bounds[1].map((n, i) => n - settings.geometry.bounds[0][i]));
    return {
      pickIds,
      frame: {year: settings.year ?? 0, available, values},
      scale: {
        min: low, max: high || (low < 0 ? 0 : 1), max_abs: settings.polygonHeightCap || Math.max(-low, high) || 1,
        height_cap: settings.polygonHeightCap, height_floor: settings.polygonHeightFloor,
        height_max: span * .13, data_min: low, data_max: high,
        color_cuts: settings.cuts, color_bins: settings.palette, color_labels: settings.labels
      }
    };
  }

  function mount(host, settings) {
    controllers.get(host)?.destroy();
    const api = window.PublicDataMapScene;
    if (!api) throw Error('The library’s 3D map could not load.');
    const view = document.createElement('div');
    view.className = 'ep-map-viewport';
    const controls = document.createElement('div');
    controls.className = 'ep-camera';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', '3D map camera');
    host.replaceChildren(view, controls);
    let current = settings, geometry, scene, picks, controller, native;
    const inputs = [];
    const key = () => current.cameraKey || 'explorers';
    const reset = () => ({...openCamera});
    function sync(camera) {
      for (const {field, input, output, unit} of inputs) {
        input.value = String(camera[field]);
        output.value = Number(camera[field].toFixed(2)) + unit;
      }
    }
    function setCamera(fields) {
      const result = native.setCamera(fields);
      cameras.set(key(), result);
      sync(result);
      return result;
    }
    function resetCamera() { return setCamera(reset()); }
    function zoomBy(factor) { return setCamera({zoom: native.getCamera().zoom * factor}); }
    function addButton(label, action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      controls.append(button);
    }
    function update(next) {
      current = next;
      const prepared = makeFrame(current);
      picks = prepared.pickIds;
      if (geometry !== current.geometry) {
        geometry = current.geometry;
        scene = {features: geometry.features, bounds: geometry.bounds};
      }
      Object.assign(scene, {
        series: {label: current.title, unit: current.unit || 'Source units'},
        frames: [prepared.frame], scale: prepared.scale, flows: current.flows || [],
        period_label: current.period ?? (current.year === undefined ? '' : String(current.year)),
        scale_note: current.scaleNote || 'Height measures distance from zero. Gray marks unavailable values.'
      });
      const camera = cameras.get(key()) || reset();
      native.render({scene, year: prepared.frame.year, focusId: current.selected ?? null, ...camera});
      sync(camera);
    }
    function destroy() {
      if (controller && controllers.get(host) === controller) controllers.delete(host);
      native?.destroy();
      host.replaceChildren();
    }
    try {
      native = api.mount(view, {
        onSelectPlace: id => {
          if (picks.has(id)) current.onPick?.(picks.get(id));
        },
        canSelectPlace: id => picks.has(id),
        homeCamera: openCamera,
        onCameraChange: camera => { cameras.set(key(), camera); sync(camera); }
      });
      for (const [label, field, min, max, step, unit] of [
        ['Tilt', 'elevation', 15, 80, 1, '°'], ['Rotate', 'azimuth', -180, 180, 1, '°'],
        ['Height emphasis', 'height_scale', .2, 2, .05, '×']
      ]) {
        const wrap = document.createElement('label');
        const input = document.createElement('input');
        const output = document.createElement('output');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.setAttribute('aria-label', label + ' of 3D map');
        input.addEventListener('input', () => setCamera({[field]: Number(input.value)}));
        wrap.append(label + ' ', output, input);
        controls.append(wrap);
        inputs.push({field, input, output, unit});
      }
      addButton('Zoom in', () => zoomBy(1.2));
      addButton('Zoom out', () => zoomBy(1/1.2));
      addButton('Reset view', resetCamera);
      update(settings);
      controller = {update, destroy, getCamera: native.getCamera, resetCamera, zoomBy,
        getRendererInfo: native.getRendererInfo};
      controllers.set(host, controller);
      watchDetachment();
      return controller;
    } catch (err) {
      destroy();
      throw err;
    }
  }

  // Some views construct the complete panel in memory, then attach it at once.
  // One frame is enough for that attachment. Abandoned panels never allocate a renderer.
  function mountWhenConnected(host, settings, onError) {
    let instance, queued = 0, closed = false, next = settings;
    function start() {
      if (closed || !host.isConnected) return;
      try { instance = mount(host, next); }
      catch (err) { if (onError) onError(err); else throw err; }
    }
    if (host.isConnected) start();
    else queued = requestAnimationFrame(start);
    return {
      update(value) { next = value; instance?.update(value); },
      destroy() { closed = true; cancelAnimationFrame(queued); instance?.destroy(); },
      getCamera: () => instance?.getCamera(), zoomBy: factor => instance?.zoomBy(factor),
      resetCamera: () => instance?.resetCamera(), getRendererInfo: () => instance?.getRendererInfo()
    };
  }
  window.EvidencePolygonMap = Object.freeze({mount, mountWhenConnected});
})();
