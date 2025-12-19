import MapboxLanguage from '@mapbox/mapbox-gl-language';
import mapboxgl from 'mapbox-gl';



mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const DEFAULT_MAIN_VIEW = {
    center: [-3.6256349902215845, 39.93651074944117],
    zoom: 5.542327120629595,
    bearing: 0,
    pitch: 0
};
const DEFAULT_CAN_VIEW = {
    center: [-15.458668714336568, 28.422603127154147],
    zoom: 5.5485878119318475,
    bearing: 0,
    pitch: 0
};

export const map = new mapboxgl.Map({container: 'map', style: 'mapbox://styles/mapbox/dark-v11', ...DEFAULT_MAIN_VIEW});
export const canariasMap = new mapboxgl.Map({
    container: 'canarias-map',
    style: 'mapbox://styles/mapbox/dark-v11', ...DEFAULT_CAN_VIEW
});

const MAIN_SOURCE_PREFIX = 'adheridos-v';
const CAN_SOURCE_PREFIX = 'adheridos-can-v';
const VARIANT_COUNT = 4;

const ROUTES_HISTORY_SOURCE_ID_MAIN = 'routes-history-main';
const ROUTES_HISTORY_LAYER_ID_MAIN = 'routes-history-main-layer';
const ROUTES_HISTORY_SOURCE_ID_CAN = 'routes-history-can';
const ROUTES_HISTORY_LAYER_ID_CAN = 'routes-history-can-layer';
const ROUTE_ENDPOINTS_SOURCE_ID_MAIN = 'route-endpoints-main';
const ROUTE_ENDPOINTS_GLOW_LAYER_ID_MAIN = 'route-endpoints-main-glow';
const ROUTE_ENDPOINTS_CORE_LAYER_ID_MAIN = 'route-endpoints-main-core';
const ROUTE_ENDPOINTS_SOURCE_ID_CAN = 'route-endpoints-can';
const ROUTE_ENDPOINTS_GLOW_LAYER_ID_CAN = 'route-endpoints-can-glow';
const ROUTE_ENDPOINTS_CORE_LAYER_ID_CAN = 'route-endpoints-can-core';

const ANIMATION_CONFIG = {delayBetweenMs: 1500};
const ROUTE_CONFIG = {targetKm: 50, profile: 'mapbox/driving', maxAttempts: 8};
const pendingQueue = [];
let isProcessing = false;

function ensureMapReady(mapInstance) {
    return new Promise(res => mapInstance.loaded() ? res() : mapInstance.once('load', res));
}

function getFeatures(mapInstance, sourceId) {
    if (!mapInstance.__store) mapInstance.__store = {};
    return mapInstance.__store[sourceId] ?? [];
}

function setFeatures(mapInstance, sourceId, features) {
    if (!mapInstance.__store) mapInstance.__store = {};
    mapInstance.__store[sourceId] = features;
    const src = mapInstance.getSource(sourceId);
    if (src) src.setData({type: 'FeatureCollection', features});
}

function isCanarias(lat, lng) {
    return lat >= 27 && lat <= 29.5 && lng >= -18.5 && lng <= -13.5;
}

function escapeHtml(str) {
    const m = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
    return String(str).replace(/[&<>"']/g, s => m[s]);
}

function pickRandomVariantIndex() {
    return Math.floor(Math.random() * VARIANT_COUNT);
}

let totalKmAcumulados = 0;
let lastDisplayedKm = 0;

function ensureKmHud() {
    if (!document.getElementById('km-acumulados')) {
        const hud = document.createElement('div');
        hud.className = 'hud';
        hud.innerHTML = `
  <div class="hud__item hud__item--big">
    <span class="hud__label">Kilómetros acumulados</span>
    <span class="hud__value" id="km-acumulados">0</span>
  </div>
  <div class="hud__item">
    <span class="hud__label">Concesiones</span>
    <span class="hud__value" id="hud-adheridas">0</span>
  </div>`;
        (map.getContainer().parentElement ?? document.body).appendChild(hud);
    }
}

function animateNumber(el, from, to, {
    duration = 900,
    formatter = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v)),
    easing = (t) => 1 - Math.pow(1 - t, 3)
} = {}) {
    const start = performance.now();

    function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = easing(t);
        const val = from + (to - from) * eased;
        el.textContent = formatter(val);
        if (t < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

function addKmAnimated(km) {
    const el = document.getElementById('km-acumulados');
    const newTotal = totalKmAcumulados + km;
    if (el) animateNumber(el, lastDisplayedKm, newTotal);
    totalKmAcumulados = newTotal;
    lastDisplayedKm = newTotal;
}

function subtractKmAnimated(km) {
    const el = document.getElementById('km-acumulados');
    const newTotal = Math.max(0, totalKmAcumulados - km);
    if (el) animateNumber(el, lastDisplayedKm, newTotal);
    totalKmAcumulados = newTotal;
    lastDisplayedKm = newTotal;
}

const WAVE_VARIANTS = [
    {name: 'pulse-cyan-1700', durationMs: 1700, phaseMs: 0, colors: ['#00E5FF', '#00B8FF', '#007BFF'], lineWidth: 4},
    {name: 'pulse-blue-2000', durationMs: 2000, phaseMs: 160, colors: ['#00d9ff', '#0077ff', '#004d7a'], lineWidth: 4},
    {
        name: 'pulse-royal-2300',
        durationMs: 2300,
        phaseMs: 320,
        colors: ['#4EB5FF', '#1E6FFF', '#0B3C9E'],
        lineWidth: 3.8
    },
    {
        name: 'pulse-magenta-2600',
        durationMs: 2600,
        phaseMs: 480,
        colors: ['#FF4DFF', '#CC33FF', '#7A1FFF'],
        lineWidth: 3.8
    }
];
const SPRITE_WAVE_COUNT = 4, SPRITE_PHASE_PER_WAVE = 0.20, SPRITE_LINE_WIDTH = 3.2, SPRITE_SHADOW_BASE = 18;

function createWaveSprite({durationMs, phaseMs = 0, colors, lineWidth = SPRITE_LINE_WIDTH}) {
    const size = 220;
    const dot = {
        width: size, height: size, data: new Uint8Array(size * size * 4), onAdd() {
            const canvas = document.createElement('canvas');
            canvas.width = this.width;
            canvas.height = this.height;
            this.context = canvas.getContext('2d', {alpha: true});
            this.context.imageSmoothingEnabled = true;
            this.context.imageSmoothingQuality = 'high';
        }, render() {
            const ctx = this.context;
            ctx.clearRect(0, 0, this.width, this.height);
            const tCycle = ((performance.now() + phaseMs) % durationMs) / durationMs;
            const cx = this.width / 2;
            const cy = this.height / 2;
            const maxR = (size / 2) - 2;
            const easeInOutSine = (t) => 0.5 * (1 - Math.cos(Math.PI * t));
            ctx.shadowColor = colors[0];
            for (let i = 0; i < SPRITE_WAVE_COUNT; i++) {
                const p = (tCycle + i * SPRITE_PHASE_PER_WAVE) % 1;
                const u = p < 0.5 ? (p * 2) : ((1 - p) * 2);
                const radius = maxR * u;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
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
            map.triggerRepaint();
            canariasMap.triggerRepaint();
            return true;
        }
    };
    return dot;
}

function addWaveImages(mapInstance) {
    WAVE_VARIANTS.forEach(v => {
        if (!mapInstance.hasImage(v.name)) {
            mapInstance.addImage(v.name, createWaveSprite(v), {pixelRatio: 2});
        }
    });
}

function ensureVariantSourcesAndLayers(mapInstance, prefix) {
    addWaveImages(mapInstance);
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sourceId = `${prefix}${i}`;
        const layerId = `${sourceId}-layer`;
        const spriteName = WAVE_VARIANTS[i].name;
        if (!mapInstance.getSource(sourceId)) {
            mapInstance.addSource(sourceId, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
        }
        if (!mapInstance.getLayer(layerId)) {
            mapInstance.addLayer({
                id: layerId,
                type: 'symbol',
                source: sourceId,
                layout: {'icon-image': spriteName, 'icon-size': 0.42, 'icon-allow-overlap': true}
            });
        }
    }
}

function ensureHistoryAndEndpoints(mapInstance, isCanariasMap) {
    const histSource = isCanariasMap ? ROUTES_HISTORY_SOURCE_ID_CAN : ROUTES_HISTORY_SOURCE_ID_MAIN;
    const histLayer = isCanariasMap ? ROUTES_HISTORY_LAYER_ID_CAN : ROUTES_HISTORY_LAYER_ID_MAIN;
    if (!mapInstance.getSource(histSource)) {
        mapInstance.addSource(histSource, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
    }
    if (!mapInstance.getLayer(histLayer)) {
        mapInstance.addLayer({
            id: histLayer,
            type: 'line',
            source: histSource,
            layout: {'line-join': 'round', 'line-cap': 'round'},
            paint: {'line-color': '#00caff', 'line-width': 2.6, 'line-opacity': 0.58, 'line-blur': 0.6}
        });
    }
    const endSource = isCanariasMap ? ROUTE_ENDPOINTS_SOURCE_ID_CAN : ROUTE_ENDPOINTS_SOURCE_ID_MAIN;
    const endGlowLay = isCanariasMap ? ROUTE_ENDPOINTS_GLOW_LAYER_ID_CAN : ROUTE_ENDPOINTS_GLOW_LAYER_ID_MAIN;
    const endCoreLay = isCanariasMap ? ROUTE_ENDPOINTS_CORE_LAYER_ID_CAN : ROUTE_ENDPOINTS_CORE_LAYER_ID_MAIN;
    if (!mapInstance.getSource(endSource)) {
        mapInstance.addSource(endSource, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
    }
    if (!mapInstance.getLayer(endGlowLay)) {
        mapInstance.addLayer({
            id: endGlowLay,
            type: 'circle',
            source: endSource,
            paint: {'circle-radius': 11, 'circle-color': '#1f9dff', 'circle-opacity': 0.40, 'circle-blur': 1.4}
        });
    }
    if (!mapInstance.getLayer(endCoreLay)) {
        mapInstance.addLayer({
            id: endCoreLay,
            type: 'circle',
            source: endSource,
            paint: {'circle-radius': 5.2, 'circle-color': '#1f9dff', 'circle-opacity': 0.95, 'circle-stroke-width': 0}
        });
    }
}

map.on('load', () => {
    ensureVariantSourcesAndLayers(map, MAIN_SOURCE_PREFIX);
    ensureHistoryAndEndpoints(map, false);
    ensureKmHud();

    const languageMain = new MapboxLanguage({ defaultLanguage: 'es' });
    map.addControl(languageMain);

});
canariasMap.on('load', () => {
    ensureVariantSourcesAndLayers(canariasMap, CAN_SOURCE_PREFIX);
    ensureHistoryAndEndpoints(canariasMap, true);

    const languageCan = new MapboxLanguage({ defaultLanguage: 'es' });
    canariasMap.addControl(languageCan);

});

function concesionarioExists(id) {
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan = `${CAN_SOURCE_PREFIX}${i}`;
        if (getFeatures(map, sMain).some(f => f.properties?.id === id) || getFeatures(canariasMap, sCan).some(f => f.properties?.id === id)) return true;
    }
    return pendingQueue.some(item => item.id === id);
}

const R_EARTH_KM = 6371;

function toRad(d) {
    return d * Math.PI / 180;
}

function toDeg(r) {
    return r * 180 / Math.PI;
}

function haversineKm(a, b) {
    const [lng1, lat1] = a, [lng2, lat2] = b;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
    const c = 2 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2));
    return R_EARTH_KM * c;
}

function lineDistanceKm(coords) {
    let km = 0;
    for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1], coords[i]);
    return km;
}

function generateDestinationAtKm(lat, lng, km) {
    const bearing = Math.random() * 2 * Math.PI;
    const dR = km / R_EARTH_KM;
    const lat1 = toRad(lat);
    const lng1 = toRad(lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(dR) * Math.cos(lat1), Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2));
    return {lat: toDeg(lat2), lng: toDeg(lng2)};
}

async function getDrivingRoute(startLngLat, endLngLat) {
    const coords = `${startLngLat[0]},${startLngLat[1]};${endLngLat[0]},${endLngLat[1]}`;
    const url = `https://api.mapbox.com/directions/v5/${ROUTE_CONFIG.profile}/${coords}` + `?alternatives=false&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions HTTP ${res.status}`);
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route?.geometry?.coordinates) throw new Error('Sin geometría de ruta');
    return route.geometry.coordinates;
}

function flyToAndWait(mapInstance, options) {
    return new Promise((resolve) => {
        const onEnd = () => {
            mapInstance.off('moveend', onEnd);
            resolve();
        };
        mapInstance.on('moveend', onEnd);
        mapInstance.flyTo({...options, essential: true});
    });
}

function zoomToFocus(mapInstance, lngLat) {
    const targetZoom = (mapInstance === canariasMap) ? 7.2 : 7.8;
    const targetBearing = mapInstance.getBearing();
    const targetPitch = 0;
    return flyToAndWait(mapInstance, {
        center: lngLat,
        zoom: targetZoom,
        bearing: targetBearing,
        pitch: targetPitch,
        speed: 0.9,
        curve: 1.2
    });
}

function showIdleStartDot(mapInstance, coords, {color = '#00d9ff'} = {}) {
    const id = `idle-start-dot-${Math.random().toString(36).slice(2)}`;
    mapInstance.addSource(id, {
        type: 'geojson',
        data: {type: 'Feature', geometry: {type: 'Point', coordinates: coords}}
    });
    mapInstance.addLayer({
        id,
        type: 'circle',
        source: id,
        paint: {
            'circle-radius': 6,
            'circle-color': '#fff',
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': color
        }
    });
    return id;
}

function removeIdleStartDot(mapInstance, id) {
    if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
    if (mapInstance.getSource(id)) mapInstance.removeSource(id);
}

function animateRouteByLine(mapInstance, lineCoords, {
    durationMs = 2200,
    color = '#00d9ff',
    lineWidth = 3,
    followCamera = false
} = {}) {
    return new Promise(resolve => {
        const routeId = `route-${Math.random().toString(36).slice(2)}`;
        mapInstance.addSource(routeId, {
            type: 'geojson',
            data: {type: 'Feature', geometry: {type: 'LineString', coordinates: [lineCoords[0], lineCoords[0]]}}
        });
        mapInstance.addLayer({
            id: `${routeId}-line`,
            type: 'line',
            source: routeId,
            paint: {'line-color': color, 'line-width': lineWidth, 'line-opacity': 0.85}
        });
        mapInstance.addLayer({
            id: `${routeId}-glow`,
            type: 'line',
            source: routeId,
            paint: {'line-color': color, 'line-width': lineWidth + 6, 'line-opacity': 0.32, 'line-blur': 4}
        });
        mapInstance.addSource(`${routeId}-dot`, {
            type: 'geojson',
            data: {type: 'Feature', geometry: {type: 'Point', coordinates: lineCoords[0]}}
        });
        mapInstance.addLayer({
            id: `${routeId}-dot`,
            type: 'circle',
            source: `${routeId}-dot`,
            paint: {
                'circle-radius': 6,
                'circle-color': '#fff',
                'circle-opacity': 0.9,
                'circle-stroke-width': 2,
                'circle-stroke-color': color
            }
        });
        const segLen = [];
        const cumLen = [0];
        for (let i = 1; i < lineCoords.length; i++) {
            const d = haversineKm(lineCoords[i - 1], lineCoords[i]);
            segLen.push(d);
            cumLen.push(cumLen[i - 1] + d);
        }
        const total = cumLen[cumLen.length - 1];
        const startTime = performance.now();

        function frame(now) {
            const t = Math.min((now - startTime) / durationMs, 1);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const targetKm = total * eased;
            let idx = 0;
            while (idx < cumLen.length - 1 && cumLen[idx + 1] < targetKm) idx++;
            const segStart = lineCoords[idx];
            const segEnd = lineCoords[idx + 1] ?? lineCoords[idx];
            const segDist = segLen[idx] || 1e-6;
            const frac = Math.max(0, Math.min(1, (targetKm - cumLen[idx]) / segDist));
            const currLng = segStart[0] + (segEnd[0] - segStart[0]) * frac;
            const currLat = segStart[1] + (segEnd[1] - segStart[1]) * frac;
            const current = [currLng, currLat];
            const routeSource = mapInstance.getSource(routeId);
            if (routeSource) {
                const coords = lineCoords.slice(0, idx + 1);
                coords.push(current);
                routeSource.setData({type: 'Feature', geometry: {type: 'LineString', coordinates: coords}});
            }
            const dotSource = mapInstance.getSource(`${routeId}-dot`);
            if (dotSource) dotSource.setData({type: 'Feature', geometry: {type: 'Point', coordinates: current}});
            if (t < 1) {
                requestAnimationFrame(frame);
            } else {
                setTimeout(() => {
                    if (mapInstance.getLayer(`${routeId}-dot`)) mapInstance.removeLayer(`${routeId}-dot`);
                    if (mapInstance.getLayer(`${routeId}-glow`)) mapInstance.removeLayer(`${routeId}-glow`);
                    if (mapInstance.getLayer(`${routeId}-line`)) mapInstance.removeLayer(`${routeId}-line`);
                    if (mapInstance.getSource(`${routeId}-dot`)) mapInstance.removeSource(`${routeId}-dot`);
                    if (mapInstance.getSource(routeId)) mapInstance.removeSource(routeId);
                    resolve();
                }, 300);
            }
        }

        requestAnimationFrame(frame);
    });
}

function addRouteToHistory(mapInstance, lineCoords, id) {
    const isCan = (mapInstance === canariasMap);
    const sourceId = isCan ? ROUTES_HISTORY_SOURCE_ID_CAN : ROUTES_HISTORY_SOURCE_ID_MAIN;
    const features = getFeatures(mapInstance, sourceId);
    const km = lineDistanceKm(lineCoords);
    const newFeature = {
        type: 'Feature',
        properties: {id, km, ts: Date.now()},
        geometry: {type: 'LineString', coordinates: lineCoords}
    };
    setFeatures(mapInstance, sourceId, [...features, newFeature]);
}

function addEndpoint(mapInstance, endCoords, id) {
    const isCan = (mapInstance === canariasMap);
    const sourceId = isCan ? ROUTE_ENDPOINTS_SOURCE_ID_CAN : ROUTE_ENDPOINTS_SOURCE_ID_MAIN;
    const features = getFeatures(mapInstance, sourceId);
    const newFeature = {
        type: 'Feature',
        properties: {id, ts: Date.now()},
        geometry: {type: 'Point', coordinates: endCoords}
    };
    setFeatures(mapInstance, sourceId, [...features, newFeature]);
}

function removeByIdFromSource(mapInstance, sourceId, id, accumulateKm = false) {
    const feats = getFeatures(mapInstance, sourceId);
    let kmRemoved = 0;
    const keep = [];
    for (const f of feats) {
        if (f.properties?.id === id) {
            if (accumulateKm) kmRemoved += Number(f.properties?.km || 0);
        } else {
            keep.push(f);
        }
    }
    setFeatures(mapInstance, sourceId, keep);
    return kmRemoved;
}

function removeRoutesAndEndpointsById(id) {
    let kmRemoved = 0;
    kmRemoved += removeByIdFromSource(map, ROUTES_HISTORY_SOURCE_ID_MAIN, id, true);
    removeByIdFromSource(map, ROUTE_ENDPOINTS_SOURCE_ID_MAIN, id, false);
    kmRemoved += removeByIdFromSource(canariasMap, ROUTES_HISTORY_SOURCE_ID_CAN, id, true);
    removeByIdFromSource(canariasMap, ROUTE_ENDPOINTS_SOURCE_ID_CAN, id, false);
    return kmRemoved;
}

function showBillboard(mapInstance, text, coordinates) {
    return new Promise(resolve => {
        const container = mapInstance.getContainer();
        const el = document.createElement('div');
        el.className = 'billboard';
        el.innerHTML = `<div class="billboard__content"><div class="card-container"><div class="main-card-filtered"></div><div class="glow-layer-1"></div><div class="glow-layer-2"></div><div class="content-text-layer">${escapeHtml(text)}</div><div class="background-glow"></div></div></div>`;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -110%) scale(0.98)';
        el.style.transition = 'opacity 300ms ease, transform 300ms ease';
        container.appendChild(el);
        const update = () => {
            const p = mapInstance.project(coordinates);
            el.style.left = `${p.x}px`;
            el.style.top = `${p.y}px`;
        };
        const onRender = () => update();
        mapInstance.on('render', onRender);
        update();
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translate(-50%, -110%) scale(1)';
        });
        const visibleMs = 2000;
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%, -110%) scale(0.98)';
            const onEnd = () => {
                mapInstance.off('render', onRender);
                el.remove();
                resolve();
            };
            el.addEventListener('transitionend', onEnd, {once: true});
        }, visibleMs);
    });
}

function runSpotlightMulti(mapInstance, coordinates, {
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
        mapInstance.addSource(tmpId, {
            type: 'geojson',
            data: {type: 'FeatureCollection', features: [{type: 'Feature', geometry: {type: 'Point', coordinates}}]}
        });
        for (let i = 0; i < rings; i++) {
            const layerId = `${tmpId}-ring-${i}`;
            mapInstance.addLayer({
                id: layerId,
                type: 'circle',
                source: tmpId,
                paint: {
                    'circle-color': colors[i % colors.length],
                    'circle-opacity': 0.18,
                    'circle-stroke-color': colors[i % colors.length],
                    'circle-stroke-width': strokeWidth,
                    'circle-radius': startRadius,
                    'circle-blur': 0.4
                }
            });
        }
        const start = performance.now();

        function frame(now) {
            let allDone = true;
            for (let i = 0; i < rings; i++) {
                const delay = ringDelaysMs[i] ?? 0;
                const dur = ringDurationsMs[i] ?? ringDurationsMs[ringDurationsMs.length - 1];
                const tRaw = (now - start - delay) / dur;
                const t = Math.max(0, Math.min(1, tRaw));
                if (t < 1) allDone = false;
                const ease = 1 - Math.pow(1 - t, 3 - Math.min(2.5, i * 0.35));
                const r = startRadius + (endRadius - startRadius) * ease;
                const opacity = (0.18 * (1 - t)) + 0.06;
                const layerId = `${tmpId}-ring-${i}`;
                if (mapInstance.getLayer(layerId)) {
                    mapInstance.setPaintProperty(layerId, 'circle-radius', r);
                    mapInstance.setPaintProperty(layerId, 'circle-opacity', opacity);
                    mapInstance.setPaintProperty(layerId, 'circle-blur', 0.4 * (1 - t) + 0.1);
                }
            }
            if (!allDone) {
                requestAnimationFrame(frame);
            } else {
                for (let i = 0; i < rings; i++) {
                    const layerId = `${tmpId}-ring-${i}`;
                    if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
                }
                if (mapInstance.getSource(tmpId)) mapInstance.removeSource(tmpId);
                resolve();
            }
        }

        requestAnimationFrame(frame);
    });
}

// ======================= VISTAS (guardar/restaurar) =======================
const PERSIST_TO_LOCAL_STORAGE = true;
const LS_KEYS = {main: 'vista_inicial_main', can: 'vista_inicial_canarias'};
let initialViewMain = {...DEFAULT_MAIN_VIEW};
let initialViewCan = {...DEFAULT_CAN_VIEW};

function getCurrentView(mapInstance) {
    return {
        center: mapInstance.getCenter().toArray(),
        zoom: mapInstance.getZoom(),
        bearing: mapInstance.getBearing(),
        pitch: mapInstance.getPitch()
    };
}

function applyView(mapInstance, view, {animate = true} = {}) {
    const opts = {center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0};
    if (animate) {
        mapInstance.flyTo({...opts, speed: 0.8, curve: 1.4, essential: true});
    } else {
        mapInstance.jumpTo(opts);
    }
}

function setInitialView(mapInstance, view, target = 'main') {
    if (target === 'main') {
        initialViewMain = {...view};
        if (PERSIST_TO_LOCAL_STORAGE) localStorage.setItem(LS_KEYS.main, JSON.stringify(initialViewMain));
        console.log('💾 Vista inicial MAIN guardada:', initialViewMain);
    } else {
        initialViewCan = {...view};
        if (PERSIST_TO_LOCAL_STORAGE) localStorage.setItem(LS_KEYS.can, JSON.stringify(initialViewCan));
        console.log('💾 Vista inicial CANARIAS guardada:', initialViewCan);
    }
}

function resetToInitialViewAsync(mapInstance) {
    const isCan = (mapInstance === canariasMap);
    const view = isCan ? initialViewCan : initialViewMain;
    return flyToAndWait(mapInstance, {
        center: view.center,
        zoom: view.zoom,
        bearing: view.bearing ?? 0,
        pitch: view.pitch ?? 0,
        speed: 0.8,
        curve: 1.4
    });
}

function resetToInitialViewSync(mapInstance) {
    const isCan = (mapInstance === canariasMap);
    const view = isCan ? initialViewCan : initialViewMain;
    mapInstance.jumpTo({center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0});
}

function resetBothMaps({animate = true} = {}) {
    if (animate) {
        return resetToInitialViewAsync(map).then(() => resetToInitialViewAsync(canariasMap));
    } else {
        resetToInitialViewSync(map);
        resetToInitialViewSync(canariasMap);
        return Promise.resolve();
    }
}

function saveCurrentAsInitial(mapInstance, target = 'main') {
    const curr = getCurrentView(mapInstance);
    setInitialView(mapInstance, curr, target);
}

function loadInitialViewsFromStorage() {
    if (!PERSIST_TO_LOCAL_STORAGE) return;
    try {
        const m = localStorage.getItem(LS_KEYS.main);
        const c = localStorage.getItem(LS_KEYS.can);
        if (m) initialViewMain = JSON.parse(m);
        if (c) initialViewCan = JSON.parse(c);
        console.log('📦 Vistas iniciales cargadas de localStorage');
    } catch (e) {
        console.warn('⚠️ No se pudieron cargar vistas del storage:', e);
    }
}

function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (ev) => {
        const isSave = ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 's';
        const isReset = ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'r';
        if (isSave) {
            saveCurrentAsInitial(map, 'main');
            saveCurrentAsInitial(canariasMap, 'canarias');
            ev.preventDefault();
        } else if (isReset) {
            resetBothMaps({animate: true});
            ev.preventDefault();
        }
    });
}

function setupViewEvents() {
    window.addEventListener('vista-guardar', (e) => {
        const target = e.detail?.target === 'canarias' ? 'canarias' : 'main';
        const mapInst = target === 'main' ? map : canariasMap;
        saveCurrentAsInitial(mapInst, target);
    });
    window.addEventListener('vista-restaurar', (e) => {
        const animate = e.detail?.animate ?? true;
        resetBothMaps({animate});
    });
}

function initViews() {
    loadInitialViewsFromStorage();
    setupKeyboardShortcuts();
    setupViewEvents();
    applyView(map, initialViewMain, {animate: false});
    applyView(canariasMap, initialViewCan, {animate: false});
}

Promise.all([new Promise(res => map.loaded() ? res() : map.once('load', res)), new Promise(res => canariasMap.loaded() ? res() : canariasMap.once('load', res))]).then(initViews);

// ─────────────────────────────────────────────────────────────────────────────
// Flujo por concesionario (cámara quieta + vuelta a vistas iniciales)
// ─────────────────────────────────────────────────────────────────────────────
async function processSingleAdherido(concesionario, id) {
    const useCanarias = isCanarias(concesionario.lat, concesionario.lng);
    const mapInstance = useCanarias ? canariasMap : map;
    const prefix = useCanarias ? CAN_SOURCE_PREFIX : MAIN_SOURCE_PREFIX;
    await ensureMapReady(mapInstance);
    const varIdx = pickRandomVariantIndex();
    const sourceId = `${prefix}${varIdx}`;
    const feature = {
        type: 'Feature',
        properties: {id, name: concesionario.razonSocial},
        geometry: {type: 'Point', coordinates: [concesionario.lng, concesionario.lat]}
    };
    try {
        await showBillboard(mapInstance, concesionario.razonSocial, feature.geometry.coordinates);
        await runSpotlightMulti(mapInstance, feature.geometry.coordinates);
        const idleDotId = showIdleStartDot(mapInstance, feature.geometry.coordinates);
        await zoomToFocus(mapInstance, feature.geometry.coordinates);

        let routeCoords = null;
        for (let attempt = 0; attempt < ROUTE_CONFIG.maxAttempts; attempt++) {
            const destino = generateDestinationAtKm(concesionario.lat, concesionario.lng, ROUTE_CONFIG.targetKm);
            const destinoCoords = [destino.lng, destino.lat];
            try {
                const coords = await getDrivingRoute(feature.geometry.coordinates, destinoCoords);
                if (coords && coords.length > 1 && lineDistanceKm(coords) > 2) {
                    routeCoords = coords;
                    break;
                }
            } catch (e) {/* retry */
            }
        }
        if (!routeCoords) {
            routeCoords = [feature.geometry.coordinates, [feature.geometry.coordinates[0] + 0.2, feature.geometry.coordinates[1]]];
        }
        const kmDeRuta = lineDistanceKm(routeCoords);

        removeIdleStartDot(mapInstance, idleDotId);
        await animateRouteByLine(mapInstance, routeCoords, {followCamera: false});

        const next = [...getFeatures(mapInstance, sourceId), feature];
        setFeatures(mapInstance, sourceId, next);
        addRouteToHistory(mapInstance, routeCoords, id);
        addEndpoint(mapInstance, routeCoords[routeCoords.length - 1], id);
        addKmAnimated(kmDeRuta);

        // Vuelta al zoom/posición inicial de ambos mapas
        await resetBothMaps({animate: true});
    } catch (error) {
        console.error(`❌ Error procesando ${id}:`, error);
    }
}

async function processQueue() {
    if (isProcessing) return;
    if (pendingQueue.length === 0) return;
    isProcessing = true;
    while (pendingQueue.length > 0) {
        const item = pendingQueue.shift();
        await processSingleAdherido(item.concesionario, item.id);
        if (pendingQueue.length > 0) {
            await new Promise(res => setTimeout(res, ANIMATION_CONFIG.delayBetweenMs));
        }
    }
    isProcessing = false;
}

export function addAdherido(concesionario, id) {
    if (concesionarioExists(id)) {
        console.log(`⚠️ Concesionario ${id} ya existe o está en cola, ignorando`);
        return;
    }
    pendingQueue.push({concesionario, id});
    if (!isProcessing) processQueue();
}

export function removeAdherido(id) {
    const qIdx = pendingQueue.findIndex(item => item.id === id);
    if (qIdx !== -1) pendingQueue.splice(qIdx, 1);
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan = `${CAN_SOURCE_PREFIX}${i}`;
        setFeatures(map, sMain, getFeatures(map, sMain).filter(f => f.properties?.id !== id));
        setFeatures(canariasMap, sCan, getFeatures(canariasMap, sCan).filter(f => f.properties?.id !== id));
    }
    const kmRemoved = removeRoutesAndEndpointsById(id);
    if (kmRemoved > 0) subtractKmAnimated(kmRemoved);
    const panelCount = document.getElementById('adheridas');
    const hudCount = document.getElementById('hud-adheridas');
    if (panelCount && hudCount) hudCount.textContent = panelCount.textContent;
    console.log(`🗑️ Concesionario ${id} eliminado (punto, rutas y endpoint). -${kmRemoved.toFixed(1)} km`);
}

export function getQueueStatus() {
    return {pending: pendingQueue.length, processing: isProcessing, config: ANIMATION_CONFIG};
}

export function setAnimationDelay(ms) {
    ANIMATION_CONFIG.delayBetweenMs = ms;
    console.log(`⚙️ Delay ajustado a ${ms}ms`);
}

