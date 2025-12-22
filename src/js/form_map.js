
// src/js/form_map.js
import mapboxgl from 'mapbox-gl';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

/* ===========================
   Vistas por defecto (definitivas)
   =========================== */
const DEFAULT_FORM_VIEWS = {
    main: {
        center: [-0.9650825732737474, 39.83517079485031],
        zoom: 4.323536938191295,
        bearing: 0,
        pitch: 0
    },
    canarias: {
        center: [-15.849309015897916, 28.279093379366515],
        zoom: 4.658284818400047,
        bearing: 0,
        pitch: 0
    }
};

/* ===========================
   Detección de Canarias
   =========================== */
function isCanarias(lat, lng) {
    return lat >= 27 && lat <= 29.5 && lng >= -18.5 && lng <= -13.5;
}

/* ===========================
   Variantes pulse (incluye “final” mint)
   =========================== */
const WAVE_VARIANTS = [
    { name: 'pulse-cyan-1700',    durationMs: 1700, phaseMs: 0,   colors: ['#00E5FF', '#00B8FF', '#007BFF'], lineWidth: 4 },
    { name: 'pulse-blue-2000',    durationMs: 2000, phaseMs: 160, colors: ['#00d9ff', '#0077ff', '#004d7a'], lineWidth: 4 },
    { name: 'pulse-royal-2300',   durationMs: 2300, phaseMs: 320, colors: ['#4EB5FF', '#1E6FFF', '#0B3C9E'], lineWidth: 3.8 },
    { name: 'pulse-magenta-2600', durationMs: 2600, phaseMs: 480, colors: ['#FF4DFF', '#CC33FF', '#7A1FFF'], lineWidth: 3.8 },
    // NUEVA: endpoint final (mint/verde-azulado)
    { name: 'pulse-mint-2400',    durationMs: 2400, phaseMs: 240, colors: ['#00FFC6', '#00E2A6', '#00B37E'], lineWidth: 3.6 }
];

const SPRITE_WAVE_COUNT = 4;
const SPRITE_PHASE_PER_WAVE = 0.20;
const SPRITE_LINE_WIDTH  = 3.2;
const SPRITE_SHADOW_BASE = 18;

/* ===========================
   Sprite animado pulse
   =========================== */
function createWaveSprite({ durationMs, phaseMs = 0, colors, lineWidth = SPRITE_LINE_WIDTH }) {
    const size = 220;
    const dot = {
        width: size, height: size, data: new Uint8Array(size * size * 4),
        onAdd() {
            const canvas = document.createElement('canvas');
            canvas.width = this.width; canvas.height = this.height;
            this.context = canvas.getContext('2d', { alpha: true });
            this.context.imageSmoothingEnabled = true;
            this.context.imageSmoothingQuality = 'high';
        },
        render() {
            const ctx = this.context;
            ctx.clearRect(0, 0, this.width, this.height);

            const tCycle = ((performance.now() + phaseMs) % durationMs) / durationMs;
            const cx = this.width / 2, cy = this.height / 2, maxR = (size / 2) - 2;
            const easeInOutSine = (t) => 0.5 * (1 - Math.cos(Math.PI * t));
            ctx.shadowColor = colors[0];

            for (let i = 0; i < SPRITE_WAVE_COUNT; i++) {
                const p = (tCycle + i * SPRITE_PHASE_PER_WAVE) % 1;
                const u = p < 0.5 ? (p * 2) : ((1 - p) * 2);
                const radius = maxR * u;

                ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                const cIdx = i % colors.length;
                ctx.strokeStyle = colors[cIdx];
                ctx.lineWidth = lineWidth;
                ctx.globalAlpha = 0.10 + 0.90 * easeInOutSine(u);
                const glowFactor = 1 - Math.abs(0.5 - p) * 2;
                ctx.shadowBlur = SPRITE_SHADOW_BASE + 10 * glowFactor;
                ctx.stroke();
            }

            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            dot.data.set(imageData.data);

            if (window.__formMapInstance) window.__formMapInstance.triggerRepaint();
            if (window.__formMapCanInstance) window.__formMapCanInstance.triggerRepaint();
            return true;
        }
    };
    return dot;
}

function addWaveImages(mapInstance) {
    WAVE_VARIANTS.forEach(v => {
        if (!mapInstance.hasImage(v.name)) {
            mapInstance.addImage(v.name, createWaveSprite(v), { pixelRatio: 2 });
        }
    });
}

/* ===========================
   Mapas + capas
   =========================== */
const SRC_MAIN       = 'marks-main-src';
const SRC_CAN        = 'marks-can-src';
const LAYER_MAIN_ALL = 'marks-main-symbol';           // no adheridas (azul)
const LAYER_CAN_ALL  = 'marks-can-symbol';            // no adheridas (azul)
const LAYER_MAIN_ADH = 'marks-main-symbol-adheridas'; // adheridas (magenta)
const LAYER_CAN_ADH  = 'marks-can-symbol-adheridas';  // adheridas (magenta)

// NUEVOS: endpoint final persistente en color distinto (mint)
const SRC_FINAL_MAIN = 'final-endpoint-main-src';
const SRC_FINAL_CAN  = 'final-endpoint-can-src';
const LAYER_FINAL_MAIN = 'final-endpoint-main-layer';
const LAYER_FINAL_CAN  = 'final-endpoint-can-layer';

let mapMain, mapCan;
let FEATURES_MAIN = [];
let FEATURES_CAN  = [];

const SPRITE_NO_ADHERIDA = 'pulse-blue-2000';
const SPRITE_ADHERIDA    = 'pulse-magenta-2600';
const SPRITE_FINAL       = 'pulse-mint-2400'; // color distinto para endpoint final

function initMaps() {
    // Península
    mapMain = new mapboxgl.Map({
        container: 'form-map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: DEFAULT_FORM_VIEWS.main.center,
        zoom:   DEFAULT_FORM_VIEWS.main.zoom,
        bearing:DEFAULT_FORM_VIEWS.main.bearing,
        pitch:  DEFAULT_FORM_VIEWS.main.pitch,
        hash: false
    });
    window.__formMapInstance = mapMain;

    // Canarias (inset)
    mapCan = new mapboxgl.Map({
        container: 'form-map-canarias',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: DEFAULT_FORM_VIEWS.canarias.center,
        zoom:   DEFAULT_FORM_VIEWS.canarias.zoom,
        bearing:DEFAULT_FORM_VIEWS.canarias.bearing,
        pitch:  DEFAULT_FORM_VIEWS.canarias.pitch,
        hash: false
    });
    window.__formMapCanInstance = mapCan;

    // Península
    mapMain.on('load', () => {
        addWaveImages(mapMain);

        mapMain.addSource(SRC_MAIN, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        mapMain.addLayer({
            id: LAYER_MAIN_ALL, type: 'symbol', source: SRC_MAIN,
            minzoom: 2, maxzoom: 22, filter: ['==', ['get', 'adherida'], 0],
            layout: { 'icon-image': ['get', 'sprite'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 5, 0.42, 7, 0.52],
                'icon-pitch-alignment': 'map', 'icon-rotation-alignment': 'map'
            }
        });
        mapMain.addLayer({
            id: LAYER_MAIN_ADH, type: 'symbol', source: SRC_MAIN,
            minzoom: 2, maxzoom: 22, filter: ['==', ['get', 'adherida'], 1],
            layout: { 'icon-image': ['get', 'sprite'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 5, 0.42, 7, 0.52],
                'icon-pitch-alignment': 'map', 'icon-rotation-alignment': 'map'
            }
        });

        // Endpoint final persistente (mint)
        mapMain.addSource(SRC_FINAL_MAIN, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        mapMain.addLayer({
            id: LAYER_FINAL_MAIN, type: 'symbol', source: SRC_FINAL_MAIN,
            minzoom: 2, maxzoom: 22,
            layout: {
                'icon-image': SPRITE_FINAL,
                'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.34, 5, 0.46, 7, 0.56]
            }
        });
    });

    // Canarias
    mapCan.on('load', () => {
        addWaveImages(mapCan);

        mapCan.addSource(SRC_CAN, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        mapCan.addLayer({
            id: LAYER_CAN_ALL, type: 'symbol', source: SRC_CAN,
            minzoom: 2, maxzoom: 22, filter: ['==', ['get', 'adherida'], 0],
            layout: { 'icon-image': ['get', 'sprite'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 5, 0.42, 7, 0.52],
                'icon-pitch-alignment': 'map', 'icon-rotation-alignment': 'map'
            }
        });
        mapCan.addLayer({
            id: LAYER_CAN_ADH, type: 'symbol', source: SRC_CAN,
            minzoom: 2, maxzoom: 22, filter: ['==', ['get', 'adherida'], 1],
            layout: { 'icon-image': ['get', 'sprite'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 5, 0.42, 7, 0.52],
                'icon-pitch-alignment': 'map', 'icon-rotation-alignment': 'map'
            }
        });

        // Endpoint final persistente (mint)
        mapCan.addSource(SRC_FINAL_CAN, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        mapCan.addLayer({
            id: LAYER_FINAL_CAN, type: 'symbol', source: SRC_FINAL_CAN,
            minzoom: 2, maxzoom: 22,
            layout: {
                'icon-image': SPRITE_FINAL,
                'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.34, 5, 0.46, 7, 0.56]
            }
        });
    });

    // Primer resize para estado inicial
    requestAnimationFrame(() => { mapMain.resize(); mapCan.resize(); });

    // Observa cambios de tamaño en contenedores y re-lanza resize (evita “no pinta del todo”)
    attachMapResizeObservers();
    // También cuando activamos modo final (por si la transición altera alturas)
    window.addEventListener('final:mode', () => {
        // dos resizes espaciados para cubrir transición CSS
        setTimeout(() => { mapMain.resize(); mapCan.resize(); }, 120);
        setTimeout(() => { mapMain.resize(); mapCan.resize(); }, 360);
    });
}
initMaps();

/* ===========================
   ResizeObserver para asegurar repaint tras cambios de layout
   =========================== */
function attachMapResizeObservers() {
    const ro = new ResizeObserver(() => {
        if (mapMain) mapMain.resize();
        if (mapCan)  mapCan.resize();
    });
    const mainEl = document.getElementById('form-map');
    const canEl  = document.getElementById('form-map-canarias');
    if (mainEl) ro.observe(mainEl);
    if (canEl)  ro.observe(canEl);
}

/* ===========================
   Helpers
   =========================== */
function isValidMark(m) {
    return m && typeof m.razonSocial === 'string' && m.razonSocial.trim() && Number.isFinite(m.lat) && Number.isFinite(m.lng);
}
function toFeature(mark, adherida = false) {
    const spriteName = adherida ? SPRITE_ADHERIDA : SPRITE_NO_ADHERIDA;
    return {
        type: 'Feature',
        properties: { razonSocial: mark.razonSocial, sprite: spriteName, adherida: adherida ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [mark.lng, mark.lat] }
    };
}
function updateSources() {
    const fcMain = { type: 'FeatureCollection', features: FEATURES_MAIN };
    const fcCan  = { type: 'FeatureCollection', features: FEATURES_CAN  };
    const srcMain = mapMain.getSource(SRC_MAIN);
    const srcCan  = mapCan.getSource(SRC_CAN);
    if (srcMain) srcMain.setData(fcMain); else mapMain.once('load', () => mapMain.getSource(SRC_MAIN)?.setData(fcMain));
    if (srcCan) srcCan.setData(fcCan);   else mapCan.once('load', () => mapCan.getSource(SRC_CAN)?.setData(fcCan));
}

/* Estado local de adheridas */
let ADHERIDAS_SET = new Set();
function keyOf(m) { return `${String(m.razonSocial).toLowerCase()}|${m.lat}|${m.lng}`; }

/* API: visibles */
export function setFormMarks(marksArray) {
    try {
        const marks = (marksArray || []).filter(isValidMark);
        const pen = [], can = [];
        for (const m of marks) (isCanarias(m.lat, m.lng) ? can : pen).push(m);
        FEATURES_MAIN = pen.map(m => toFeature(m, ADHERIDAS_SET.has(keyOf(m))));
        FEATURES_CAN  = can.map(m => toFeature(m, ADHERIDAS_SET.has(keyOf(m))));
        updateSources();
        window.FORM_MARKS_MAIN = pen; window.FORM_MARKS_CAN = can;
    } catch (e) { console.error('setFormMarks() error:', e); }
}

/* API: adheridas (magenta) */
export function setAdheridas(marksArray) {
    try {
        const list = (marksArray || []).filter(isValidMark);
        ADHERIDAS_SET = new Set(list.map(keyOf));
        FEATURES_MAIN = FEATURES_MAIN.map(f => {
            const m = { razonSocial: f.properties.razonSocial, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
            const adh = ADHERIDAS_SET.has(keyOf(m));
            f.properties.adherida = adh ? 1 : 0; f.properties.sprite = adh ? SPRITE_ADHERIDA : SPRITE_NO_ADHERIDA; return f;
        });
        FEATURES_CAN = FEATURES_CAN.map(f => {
            const m = { razonSocial: f.properties.razonSocial, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
            const adh = ADHERIDAS_SET.has(keyOf(m));
            f.properties.adherida = adh ? 1 : 0; f.properties.sprite = adh ? SPRITE_ADHERIDA : SPRITE_NO_ADHERIDA; return f;
        });
        updateSources();
    } catch (e) { console.error('setAdheridas() error:', e); }
}

/* ===========================
   FINAL ANIM: (mismo flujo que el evento) → spotlight + zoom + ruta aleatoria + endpoint persistente + flyBack
   =========================== */

const R_EARTH_KM = 6371;
const ROUTE_CONFIG = { targetKm: 50, profile: 'mapbox/driving', maxAttempts: 8 };

function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }
function generateDestinationAtKm(lat, lng, km) {
    const bearing = Math.random() * 2 * Math.PI;
    const dR = km / R_EARTH_KM;
    const lat1 = toRad(lat), lng1 = toRad(lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(dR) * Math.cos(lat1), Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: toDeg(lat2), lng: toDeg(lng2) };
}
async function getDrivingRoute(startLngLat, endLngLat) {
    const coords = `${startLngLat[0]},${startLngLat[1]};${endLngLat[0]},${endLngLat[1]}`;
    const url = `https://api.mapbox.com/directions/v5/${ROUTE_CONFIG.profile}/${coords}` +
        `?alternatives=false&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions HTTP ${res.status}`);
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route?.geometry?.coordinates) throw new Error('Sin geometría de ruta');
    return route.geometry.coordinates;
}
function haversineKm(a, b) {
    const [lng1, lat1] = a, [lng2, lat2] = b;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
    const c = 2 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2));
    return R_EARTH_KM * c;
}
function flyToAndWait(mapInstance, options) {
    return new Promise((resolve) => {
        const onEnd = () => { mapInstance.off('moveend', onEnd); resolve(); };
        mapInstance.on('moveend', onEnd);
        mapInstance.flyTo({ ...options, essential: true });
    });
}
function zoomToFocus(mapInstance, lngLat) {
    const targetZoom = (mapInstance === mapCan) ? 7.2 : 7.8;
    const targetBearing = mapInstance.getBearing();
    const targetPitch = 0;
    return flyToAndWait(mapInstance, { center: lngLat, zoom: targetZoom, bearing: targetBearing, pitch: targetPitch, speed: 0.9, curve: 1.2 });
}
function showIdleStartDot(mapInstance, coords, { color = '#00d9ff' } = {}) {
    const id = `idle-start-dot-${Math.random().toString(36).slice(2)}`;
    mapInstance.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: coords } } });
    mapInstance.addLayer({
        id, type: 'circle', source: id,
        paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': color }
    });
    return id;
}
function removeIdleStartDot(mapInstance, id) {
    if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
    if (mapInstance.getSource(id)) mapInstance.removeSource(id);
}
function animateRouteByLine(mapInstance, lineCoords, { durationMs = 2200, color = '#00d9ff', lineWidth = 3 } = {}) {
    return new Promise(resolve => {
        const routeId = `route-${Math.random().toString(36).slice(2)}`;

        mapInstance.addSource(routeId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [lineCoords[0], lineCoords[0]] } }
        });
        mapInstance.addLayer({
            id: `${routeId}-line`, type: 'line', source: routeId,
            paint: { 'line-color': color, 'line-width': lineWidth, 'line-opacity': 0.85 }
        });
        mapInstance.addLayer({
            id: `${routeId}-glow`, type: 'line', source: routeId,
            paint: { 'line-color': color, 'line-width': lineWidth + 6, 'line-opacity': 0.32, 'line-blur': 4 }
        });
        mapInstance.addSource(`${routeId}-dot`, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: lineCoords[0] } } });
        mapInstance.addLayer({
            id: `${routeId}-dot`, type: 'circle', source: `${routeId}-dot`,
            paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': color }
        });

        const segLen = [], cumLen = [0];
        for (let i = 1; i < lineCoords.length; i++) { const d = haversineKm(lineCoords[i - 1], lineCoords[i]); segLen.push(d); cumLen.push(cumLen[i - 1] + d); }
        const total = cumLen[cumLen.length - 1];
        const startTime = performance.now();

        function frame(now) {
            const t = Math.min((now - startTime) / durationMs, 1);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const targetKm = total * eased;
            let idx = 0; while (idx < cumLen.length - 1 && cumLen[idx + 1] < targetKm) idx++;
            const segStart = lineCoords[idx], segEnd = lineCoords[idx + 1] ?? lineCoords[idx];
            const segDist = segLen[idx] || 1e-6;
            const frac = Math.max(0, Math.min(1, (targetKm - cumLen[idx]) / segDist));
            const currLng = segStart[0] + (segEnd[0] - segStart[0]) * frac;
            const currLat = segStart[1] + (segEnd[1] - segStart[1]) * frac;
            const current = [currLng, currLat];

            const routeSource = mapInstance.getSource(routeId);
            if (routeSource) {
                const coords = lineCoords.slice(0, idx + 1);
                coords.push(current);
                routeSource.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
            }
            const dotSource = mapInstance.getSource(`${routeId}-dot`);
            if (dotSource) dotSource.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: current } });

            if (t < 1) requestAnimationFrame(frame);
            else {
                setTimeout(() => {
                    if (mapInstance.getLayer(`${routeId}-dot`))  mapInstance.removeLayer(`${routeId}-dot`);
                    if (mapInstance.getLayer(`${routeId}-glow`)) mapInstance.removeLayer(`${routeId}-glow`);
                    if (mapInstance.getLayer(`${routeId}-line`)) mapInstance.removeLayer(`${routeId}-line`);
                    if (mapInstance.getSource(`${routeId}-dot`))  mapInstance.removeSource(`${routeId}-dot`);
                    if (mapInstance.getSource(routeId))          mapInstance.removeSource(routeId);
                    resolve();
                }, 300);
            }
        }
        requestAnimationFrame(frame);
    });
}

/** Actualiza el endpoint final persistente (mint) en el mapa correspondiente */
function setFinalEndpoint(map, dest) {
    const isCan = (map === mapCan);
    const srcId = isCan ? SRC_FINAL_CAN : SRC_FINAL_MAIN;
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: dest } }] };
    const src = map.getSource(srcId);
    if (src) src.setData(fc);
}

/** FINAL: ejecución completa */
function runFormFinalAnimation({ razonSocial, lat, lng }) {
    const isCan = isCanarias(lat, lng);
    const map = isCan ? mapCan : mapMain;

    const whenReady = map.loaded() ? Promise.resolve() : new Promise(res => map.once('load', res));
    whenReady.then(async () => {
        addWaveImages(map); // por si acaso

        // Vista inicial REAL (para volver exactamente igual)
        const initialView = {
            center: map.getCenter().toArray(),
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch()
        };

        const dest = [lng, lat];

        // Spotlight
        await (async function runSpotlightMulti(mapInstance, coordinates, {
            rings = 4,
            startRadius = 300,
            endRadius = 10,
            ringDelaysMs = [0, 120, 240, 360],
            ringDurationsMs = [800, 1000, 1150, 1300],
            colors = ['#00d9ff', '#1f9dff', '#0b6ad1', '#084f9a'],
            strokeWidth = 2.2
        } = {}) {
            return new Promise(resolve => {
                const tmpId = `spotlight-${Math.random().toString(36).slice(2)}`;
                mapInstance.addSource(tmpId, { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates } }] } });
                for (let i = 0; i < rings; i++) {
                    const layerId = `${tmpId}-ring-${i}`;
                    mapInstance.addLayer({
                        id: layerId, type: 'circle', source: tmpId,
                        paint: { 'circle-color': colors[i % colors.length], 'circle-opacity': 0.18, 'circle-stroke-color': colors[i % colors.length], 'circle-stroke-width': strokeWidth, 'circle-radius': startRadius, 'circle-blur': 0.4 }
                    });
                }
                const start = performance.now();
                function frame(now) {
                    let allDone = true;
                    for (let i = 0; i < rings; i++) {
                        const delay = ringDelaysMs[i] ?? 0; const dur = ringDurationsMs[i] ?? ringDurationsMs[ringDurationsMs.length - 1];
                        const tRaw = (now - start - delay) / dur; const t = Math.max(0, Math.min(1, tRaw)); if (t < 1) allDone = false;
                        const ease = 1 - Math.pow(1 - t, 3 - Math.min(2.5, i * 0.35));
                        const r = startRadius + (endRadius - startRadius) * ease; const opacity = (0.18 * (1 - t)) + 0.06;
                        const layerId = `${tmpId}-ring-${i}`;
                        if (mapInstance.getLayer(layerId)) {
                            mapInstance.setPaintProperty(layerId, 'circle-radius', r);
                            mapInstance.setPaintProperty(layerId, 'circle-opacity', opacity);
                            mapInstance.setPaintProperty(layerId, 'circle-blur', 0.4 * (1 - t) + 0.1);
                        }
                    }
                    if (!allDone) requestAnimationFrame(frame);
                    else {
                        for (let i = 0; i < rings; i++) { const layerId = `${tmpId}-ring-${i}`; if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId); }
                        if (mapInstance.getSource(tmpId)) mapInstance.removeSource(tmpId);
                        resolve();
                    }
                }
                requestAnimationFrame(frame);
            });
        })(map, dest);

        // Punto idle + zoom
        const idleDotId = showIdleStartDot(map, dest);
        await zoomToFocus(map, dest);

        // Ruta Directions ~50km
        let routeCoords = null;
        for (let attempt = 0; attempt < ROUTE_CONFIG.maxAttempts; attempt++) {
            const destino = generateDestinationAtKm(lat, lng, ROUTE_CONFIG.targetKm);
            const destinoCoords = [destino.lng, destino.lat];
            try {
                const coords = await getDrivingRoute(dest, destinoCoords);
                if (coords && coords.length > 1) {
                    // sanity mínimo
                    let km = 0; for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1], coords[i]);
                    if (km > 2) { routeCoords = coords; break; }
                }
            } catch (e) { /* retry */ }
        }
        if (!routeCoords) routeCoords = [dest, [dest[0] + 0.2, dest[1]]];

        removeIdleStartDot(map, idleDotId);
        await animateRouteByLine(map, routeCoords, { color: '#00d9ff', lineWidth: 3 });

        // PONEMOS endpoint final persistente en color distinto (mint)
        setFinalEndpoint(map, dest);

        // Vuelta exacta a vista inicial
        await flyToAndWait(map, {
            center: initialView.center, zoom: initialView.zoom,
            bearing: initialView.bearing ?? 0, pitch: initialView.pitch ?? 0,
            speed: 0.9, curve: 1.2
        });
    });
}

/* ===========================
   Integraciones con el formulario
   =========================== */

// FlyTo (selección en el form) — se mantiene
window.addEventListener('concesion:selected', (evt) => {
    const { nombre } = evt.detail || {};
    if (!nombre) return;
    const fMain = FEATURES_MAIN.find(x => x.properties.razonSocial === nombre);
    if (fMain) { mapMain.flyTo({ center: fMain.geometry.coordinates, zoom: 7.2, speed: 0.9, curve: 1.25, essential: true }); return; }
    const fCan = FEATURES_CAN.find(x => x.properties.razonSocial === nombre);
    if (fCan) { mapCan.flyTo({ center: fCan.geometry.coordinates, zoom: 7.2, speed: 0.9, curve: 1.25, essential: true }); }
});

// Final/start → ejecuta animación final y deja endpoint mint persistente
window.addEventListener('final:start', (evt) => {
    const { concesion, lat, lng } = evt.detail || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    runFormFinalAnimation({ razonSocial: concesion, lat, lng });
});
