
/* ===== map.js (patched) ===== */
import MapboxLanguage from '@mapbox/mapbox-gl-language';
import mapboxgl from 'mapbox-gl';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_MAIN_VIEW = {
    center: [-3.6256349902215845, 39.93651074944117],
    zoom: 5.542327120629595,
    bearing: 0,
    pitch: 0,
};
const DEFAULT_CAN_VIEW = {
    center: [-15.458668714336568, 28.422603127154147],
    zoom: 5.5485878119318475,
    bearing: 0,
    pitch: 0,
};
export const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/vchinoesp/cmkgqrg0z000u01qxfpcg39pb',
    ...DEFAULT_MAIN_VIEW,
});
export const canariasMap = new mapboxgl.Map({
    container: 'canarias-map',
    style: 'mapbox://styles/vchinoesp/cmkgqrg0z000u01qxfpcg39pb',
    ...DEFAULT_CAN_VIEW,
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
const ANIMATION_CONFIG = { delayBetweenMs: 1500 };
const ROUTE_CONFIG = { targetKm: 50, profile: 'mapbox/driving', maxAttempts: 8 };
const FOCUS_CONFIG = { dwellMs: 1000, zoomOutAfterDwell: true };

/* 🔈 AUDIO */
const AUDIO_CONFIG = {
    enabled: false,
    volume: 0.85,
    groups: [
        ['/sounds/aplausos.mp3'],
        ['/sounds/ovacion.mp3'],
    ],
};
function makeAudioGroups() {
    return AUDIO_CONFIG.groups.map(urls =>
        urls.map(src => {
            const a = new Audio(src);
            a.preload = 'auto';
            a.volume = AUDIO_CONFIG.volume;
            a.crossOrigin = 'anonymous';
            a.addEventListener('error', () => console.warn('⚠️ Audio error:', src));
            return a;
        })
    );
}
const _audioGroups = makeAudioGroups();
let _audioUnlocked = false;
function ensureAudioUnlockedOnce() {
    if (_audioUnlocked) return;
    const unlock = () => {
        Promise.all(
            _audioGroups.flat().map(a => a.play().then(() => a.pause()).catch(() => {}))
        ).finally(() => { _audioUnlocked = true; });
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart',unlock, { once: true });
}
export function setAudioEnabled(enabled) { AUDIO_CONFIG.enabled = !!enabled; }
function pickPlayableAudioFromGroup(group) {
    const HAVE_ENOUGH_DATA = 4;
    const a = group.find(x => x.readyState >= HAVE_ENOUGH_DATA) ?? group[0];
    return a;
}
function playApplauseRandom() {
    if (!AUDIO_CONFIG.enabled) return;
    ensureAudioUnlockedOnce();
    const idx = Math.random() < 0.5 ? 0 : 1;
    const a = pickPlayableAudioFromGroup(_audioGroups[idx]);
    try { a.currentTime = 0; a.volume = AUDIO_CONFIG.volume; a.play().catch(()=>{}); } catch {}
}

/* utils */
function wait(ms) { return new Promise((res) => setTimeout(res, ms)); }

/* FEATURE FLAGS */
const FEATURE_FLAGS = { routeAnimationEnabled: false };
export function setRouteAnimationEnabled(enabled) {
    FEATURE_FLAGS.routeAnimationEnabled = !!enabled;
    console.log(`🛺️ Animación de ruta ${FEATURE_FLAGS.routeAnimationEnabled ? 'ACTIVADA' : 'DESACTIVADA'}`);
}
export function getFeatureFlags() { return { ...FEATURE_FLAGS }; }

const pendingQueue = [];
let isProcessing = false;
/* Actividad del sistema = cola o procesando */
function isSystemBusy() {
    return isProcessing || (pendingQueue.length > 0);
}
function ensureMapReady(mapInstance) {
    return new Promise((res) => (mapInstance.loaded() ? res() : mapInstance.once('load', res)));
}
function getFeatures(mapInstance, sourceId) {
    if (!mapInstance.__store) mapInstance.__store = {};
    return mapInstance.__store[sourceId] ?? [];
}
function setFeatures(mapInstance, sourceId, features) {
    if (!mapInstance.__store) mapInstance.__store = {};
    mapInstance.__store[sourceId] = features;
    const src = mapInstance.getSource(sourceId);
    if (src) src.setData({ type: 'FeatureCollection', features });
}
function isCanarias(lat, lng) {
    return lat >= 27 && lat <= 29.5 && lng >= -18.5 && lng <= -13.5;
}

/* Canarias frame expansion helpers */
const CANARIAS_FRAME_SELECTOR = '.canarias-frame';
const CANARIASMAP_FRAME_SELECTOR = '.canarias-map-into';
function getCanariasFrame() { return document.querySelector(CANARIAS_FRAME_SELECTOR); }
function getCanariasMapFrame() { return document.querySelector(CANARIASMAP_FRAME_SELECTOR); }
function waitTransitionEnd(el) {
    return new Promise((resolve) => {
        if (!el) { resolve(); return; }
        const onEnd = (e) => {
            if (e.propertyName === 'width' || e.propertyName === 'height') {
                el.removeEventListener('transitionend', onEnd);
                resolve();
            }
        };
        el.addEventListener('transitionend', onEnd);
        setTimeout(() => { try { el.removeEventListener('transitionend', onEnd); } catch {} resolve(); }, 600);
    });
}
let _smoothResizeTimer = null;
function startSmoothResize(mapInstance) {
    stopSmoothResize();
    _smoothResizeTimer = setInterval(() => mapInstance.resize(), 16);
}
function stopSmoothResize() {
    if (_smoothResizeTimer) { clearInterval(_smoothResizeTimer); _smoothResizeTimer = null; }
}
async function expandCanariasFrame() {
    const frame = getCanariasFrame();
    const inner = getCanariasMapFrame();
    if (!frame || !inner) return;
    startSmoothResize(canariasMap);
    frame.classList.add('expanded');
    inner.classList.add('expanded');
    await Promise.all([waitTransitionEnd(frame), waitTransitionEnd(inner)]);
    stopSmoothResize();
}
async function collapseCanariasFrame() {
    const frame = getCanariasFrame();
    const inner = getCanariasMapFrame();
    if (!frame || !inner) return;
    startSmoothResize(canariasMap);
    frame.classList.remove('expanded');
    inner.classList.remove('expanded');
    await Promise.all([waitTransitionEnd(frame), waitTransitionEnd(inner)]);
    stopSmoothResize();
}

/* HTML helpers */
function escapeHtml(str) {
    const m = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
    return String(str).replace(/[&<>\\"']/g, (s) => m[s]);
}

/* HUD KM */
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
function animateNumber(
    el, from, to,
    { duration = 900, formatter = (v)=> new Intl.NumberFormat('es-ES').format(Math.round(v)), easing = (t)=> 1 - Math.pow(1 - t, 3) } = {}
) {
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

/* Sprites / Waves
* '#b3cc23', '#8b9f1a', '#7b8d14', '#c2de21'
* */

const WAVE_VARIANTS = [
    { name: 'pulse-cyan-1700', durationMs: 1700, phaseMs: 0, colors: ['#8BC53F', '#b3cc23', '#8b9f1a'], lineWidth: 12 },
    { name: 'pulse-blue-2000', durationMs: 2000, phaseMs: 160, colors: ['#c2de21', '#8b9f1a', '#b3cc23'], lineWidth: 13 },
    { name: 'pulse-royal-2300', durationMs: 2300, phaseMs: 320, colors: ['#7b8d14', '#8b9f1a', '#c2de21'], lineWidth: 12 },
    { name: 'pulse-magenta-2600',durationMs: 2600, phaseMs: 480, colors: ['#8b9f1a', '#c2de21', '#b3cc23'], lineWidth: 13 },
];
const SPRITE_WAVE_COUNT = 4, SPRITE_PHASE_PER_WAVE = 0.2, SPRITE_LINE_WIDTH = 3.2, SPRITE_SHADOW_BASE = 18;
function createWaveSprite({ durationMs, phaseMs = 0, colors, lineWidth = 3.2 }) {
    const size = 360;
    const dot = {
        width: size, height: size, data: new Uint8Array(size * size * 4),
        onAdd() {
            const canvas = document.createElement('canvas');
            canvas.width = this.width; canvas.height = this.height;
            this.context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
            this.context.imageSmoothingEnabled = true;
            this.context.imageSmoothingQuality = 'high';
        },
        render() {
            const ctx = this.context;
            ctx.clearRect(0, 0, this.width, this.height);
            const tCycle = ((performance.now() + phaseMs) % durationMs) / durationMs;
            const cx = this.width / 2, cy = this.height / 2;
            const maxR = size / 2 - 2;
            const easeInOutSine = (t)=> 0.5 * (1 - Math.cos(Math.PI * t));
            ctx.shadowColor = colors[0];
            for (let i = 0; i < SPRITE_WAVE_COUNT; i++) {
                const p = (tCycle + i * 0.2) % 1;
                const u = p < 0.5 ? p * 2 : (1 - p) * 2;
                const radius = maxR * u;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                const cIdx = i % colors.length;
                ctx.strokeStyle = colors[cIdx];
                ctx.lineWidth = lineWidth;
                ctx.globalAlpha = 0.10 + 0.90 * easeInOutSine(u);
                const glowFactor = 1 - Math.abs(0.5 - p) * 2;
                ctx.shadowBlur = 18 + 10 * glowFactor;
                ctx.stroke();
            }
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            dot.data.set(imageData.data);
            map.triggerRepaint(); canariasMap.triggerRepaint();
            return true;
        },
    };
    return dot;
}
function addWaveImages(mapInstance) {
    WAVE_VARIANTS.forEach((v) => {
        if (!mapInstance.hasImage(v.name)) {
            mapInstance.addImage(v.name, createWaveSprite(v), { pixelRatio: 2 });
        }
    });
}
// === FIX A: re-sync al crear sources ===
function ensureVariantSourcesAndLayers(mapInstance, prefix) {
    addWaveImages(mapInstance);
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sourceId = `${prefix}${i}`;
        const layerId = `${sourceId}-layer`;
        const spriteName = WAVE_VARIANTS[i].name;
        if (!mapInstance.getSource(sourceId)) {
            mapInstance.addSource(sourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            const cached = (mapInstance.__store && mapInstance.__store[sourceId])
                ?? [];
            if (cached.length) {
                const src = mapInstance.getSource(sourceId);
                if (src) src.setData({ type: 'FeatureCollection', features: cached });
            }
        }
        if (!mapInstance.getLayer(layerId)) {
            mapInstance.addLayer({
                id: layerId,
                type: 'symbol',
                source: sourceId,
                minzoom: 0,
                maxzoom: 24,
                layout: {
                    'icon-image': spriteName,
                    'icon-size': 0.42,
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                    'icon-anchor': 'center',
                    'symbol-z-order': 'source',
                },
            });
        }
    }
}
function ensureHistoryAndEndpoints(mapInstance, isCanariasMap) {
    const histSource = isCanariasMap ? ROUTES_HISTORY_SOURCE_ID_CAN : ROUTES_HISTORY_SOURCE_ID_MAIN;
    const histLayer = isCanariasMap ? ROUTES_HISTORY_LAYER_ID_CAN : ROUTES_HISTORY_LAYER_ID_MAIN;
    if (!mapInstance.getSource(histSource)) {
        mapInstance.addSource(histSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!mapInstance.getLayer(histLayer)) {
        mapInstance.addLayer({
            id: histLayer, type: 'line', source: histSource,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#646B52', 'line-width': 2.6, 'line-opacity': 0.58, 'line-blur': 0.6 },
        });
    }
    const endSource = isCanariasMap ? ROUTE_ENDPOINTS_SOURCE_ID_CAN : ROUTE_ENDPOINTS_SOURCE_ID_MAIN;
    const endGlowLay = isCanariasMap ? ROUTE_ENDPOINTS_GLOW_LAYER_ID_CAN : ROUTE_ENDPOINTS_GLOW_LAYER_ID_MAIN;
    const endCoreLay = isCanariasMap ? ROUTE_ENDPOINTS_CORE_LAYER_ID_CAN : ROUTE_ENDPOINTS_CORE_LAYER_ID_MAIN;
    if (!mapInstance.getSource(endSource)) {
        mapInstance.addSource(endSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!mapInstance.getLayer(endGlowLay)) {
        mapInstance.addLayer({
            id: endGlowLay, type: 'circle', source: endSource, minzoom: 8,
            paint: { 'circle-radius': 11, 'circle-color': '#646B52', 'circle-opacity': 0.01, 'circle-blur': 1.4 },
        });
    }
    if (!mapInstance.getLayer(endCoreLay)) {
        mapInstance.addLayer({
            id: endCoreLay, type: 'circle', source: endSource, minzoom: 8,
            paint: { 'circle-radius': 5.2, 'circle-color': '#e6f97b', 'circle-opacity': 0.00, 'circle-stroke-width': 0 },
        });
    }
}
map.on('load', () => {
    ensureVariantSourcesAndLayers(map, MAIN_SOURCE_PREFIX);
    ensureHistoryAndEndpoints(map, false);
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
        if (
            getFeatures(map, sMain).some((f)=> f.properties?.id === id)
            || getFeatures(canariasMap, sCan).some((f)=> f.properties?.id === id)
        ) return true;
    }
    return pendingQueue.some((item)=> item.id === id);
}

/* Haversine / rutas */
const R_EARTH_KM = 6371;
const toRad = (d)=> (d * Math.PI) / 180;
const toDeg = (r)=> (r * 180) / Math.PI;
function haversineKm(a, b) {
    const [lng1, lat1] = a, [lng2, lat2] = b;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
    const c = 2 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2));
    return R_EARTH_KM * c;
}
function lineDistanceKm(coords) { let km = 0; for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i-1], coords[i]); return km; }
function generateDestinationAtKm(lat, lng, km) {
    const bearing = Math.random() * 2 * Math.PI;
    const dR = km / R_EARTH_KM;
    const lat1 = toRad(lat), lng1 = toRad(lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(
        Math.sin(bearing) * Math.sin(dR) * Math.cos(lat1),
        Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
    );
    return { lat: toDeg(lat2), lng: toDeg(lng2) };
}
async function getDrivingRoute(startLngLat, endLngLat) {
    const coords = `${startLngLat[0]},${startLngLat[1]};${endLngLat[0]},${endLngLat[1]}`;
    const url =
        `https://api.mapbox.com/directions/v5/${ROUTE_CONFIG.profile}/${coords}`
        + `?alternatives=false&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions HTTP ${res.status}`);
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route?.geometry?.coordinates) throw new Error('Sin geometría de ruta');
    return route.geometry.coordinates;
}
const SAFE_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
function flyToAndWait(mapInstance, options) {
    return new Promise((resolve) => {
        const onEnd = () => { mapInstance.off('moveend', onEnd); resolve(); };
        mapInstance.on('moveend', onEnd);
        mapInstance.flyTo({ ...options, padding: SAFE_PADDING, essential: true });
    });
}
function zoomToFocus(mapInstance, lngLat) {
    const targetZoom = mapInstance === canariasMap ? 7.2 : 7.8;
    const targetBearing = mapInstance.getBearing();
    const targetPitch = 0;
    return flyToAndWait(mapInstance, {
        center: lngLat, zoom: targetZoom, bearing: targetBearing, pitch: targetPitch,
        speed: 0.9, curve: 1.2,
    });
}

/* estilos del billboard */
function ensureBillboardStyles() {
    if (document.getElementById('billboard-style')) return;
    const style = document.createElement('style');
    style.id = 'billboard-style';
    style.textContent = `
.billboard { position: absolute; pointer-events: none; }
.billboard__content { position: relative; border-radius: 12px; backdrop-filter: blur(4px); }
.billboard__arrow {
  position: absolute; left: 50%; bottom: -10px; width: 0; height: 0;
  border-left: 10px solid transparent; border-right: 10px solid transparent;
  border-top: 12px solid rgba(100,107,82,1);
  transform: translateX(-50%);
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.25));
}`;
    document.head.appendChild(style);
}
function showIdleStartDot(mapInstance, coords, { color = '#646B52' } = {}) {
    const id = `idle-start-dot-${Math.random().toString(36).slice(2)}`;
    mapInstance.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: coords } } });
    mapInstance.addLayer({
        id, type: 'circle', source: id,
        paint: { 'circle-radius': 6, 'circle-color': '#646B52', 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': color },
    });
    return id;
}
function removeIdleStartDot(mapInstance, id) {
    if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
    if (mapInstance.getSource(id)) mapInstance.removeSource(id);
}

/* Línea animada */
function animateRouteByLine(
    mapInstance,
    lineCoords,
    { durationMs = 2200, color = '#646B5210', lineWidth = 3, followCamera = false } = {}
) {
    return new Promise((resolve) => {
        const routeId = `route-${Math.random().toString(36).slice(2)}`;
        mapInstance.addSource(routeId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [lineCoords[0], lineCoords[0]] } },
        });
        mapInstance.addLayer({ id: `${routeId}-line`, type: 'line', source: routeId, paint: { 'line-color': '#646B52', 'line-width': lineWidth, 'line-opacity': 0.85 } });
        mapInstance.addLayer({ id: `${routeId}-glow`, type: 'line', source: routeId, paint: { 'line-color': '#646B52', 'line-width': lineWidth + 6, 'line-opacity': 0.32, 'line-blur': 4 } });
        mapInstance.addSource(`${routeId}-dot`, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: lineCoords[0] } } });
        mapInstance.addLayer({
            id: `${routeId}-dot`, type: 'circle', source: `${routeId}-dot`,
            paint: { 'circle-radius': 6, 'circle-color': '#646B52', 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': color === '#646B5210' ? '#646B52' : color },
        });
        const segLen = [], cumLen = [0];
        for (let i = 1; i < lineCoords.length; i++) { const d = haversineKm(lineCoords[i - 1], lineCoords[i]); segLen.push(d); cumLen.push(cumLen[i - 1] + d); }
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
                routeSource.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
            }
            const dotSource = mapInstance.getSource(`${routeId}-dot`);
            if (dotSource) dotSource.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: current } });
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
    const isCan = mapInstance === canariasMap;
    const sourceId = isCan ? ROUTES_HISTORY_SOURCE_ID_CAN : ROUTES_HISTORY_SOURCE_ID_MAIN;
    const features = getFeatures(mapInstance, sourceId);
    const km = lineDistanceKm(lineCoords);
    const newFeature = { type: 'Feature', properties: { id, km, ts: Date.now() }, geometry: { type: 'LineString', coordinates: lineCoords } };
    setFeatures(mapInstance, sourceId, [...features, newFeature]);
}
function addEndpoint(mapInstance, endCoords, id) {
    const isCan = mapInstance === canariasMap;
    const sourceId = isCan ? ROUTE_ENDPOINTS_SOURCE_ID_CAN : ROUTE_ENDPOINTS_SOURCE_ID_MAIN;
    const features = getFeatures(mapInstance, sourceId);
    const newFeature = { type: 'Feature', properties: { id, ts: Date.now() }, geometry: { type: 'Point', coordinates: endCoords } };
    setFeatures(mapInstance, sourceId, [...features, newFeature]);
}
function removeByIdFromSource(mapInstance, sourceId, id, accumulateKm = false) {
    const feats = getFeatures(mapInstance, sourceId);
    let kmRemoved = 0;
    const keep = [];
    for (const f of feats) {
        if (f.properties?.id === id) {
            if (accumulateKm) kmRemoved += Number(f.properties?.km ?? 0);
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

/* Billboard con flecha */
function showBillboard(mapInstance, text, nombre, coordinates) {
    return new Promise((resolve) => {
        ensureBillboardStyles();
        const container = mapInstance.getContainer();
        const el = document.createElement('div');
        el.className = 'billboard';
        el.innerHTML = `
<div class="billboard__content">
  <div class="card-container">
    <div class="content-text-layer">${escapeHtml(text)}</div>
    <span class="linea-sep-billboard"></span>
    <div class="content-text-layer2">Gracias por sumarte al proyecto y para llenar<br/> el mapa de <strong>KM QUE IMPORTAN</strong></div>
  </div>
  <span class="billboard__arrow"></span>
</div>`;
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
        const visibleMs = 4000;
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%, -110%) scale(0.98)';
            const onEnd = () => {
                mapInstance.off('render', onRender);
                el.remove();
                resolve();
            };
            el.addEventListener('transitionend', onEnd, { once: true });
        }, visibleMs);
    });
}

/* Spotlight multi */
function runSpotlightMulti(
    mapInstance,
    coordinates,
    {
        rings = 4,
        startRadius = 300,
        endRadius = 10,
        ringDelaysMs = [0, 120, 240, 360],
        ringDurationsMs = [800, 1000, 1150, 1300],
        colors = ['#b3cc23', '#8b9f1a', '#7b8d14', '#c2de21'],
        strokeWidth = 2.2,
        centerDot = { enabled: true, color: '#00C853', opacity: 0.10, radius: 8 },
        cleanupAfter = 'external',
        persistOpacity = 0
    } = {}
) {
    return new Promise((resolve) => {
        const tmpId = `spotlight-${Math.random().toString(36).slice(2)}`;
        mapInstance.addSource(tmpId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates } }] }
        });
        const ringIds = [];
        for (let i = 0; i < rings; i++) {
            const layerId = `${tmpId}-ring-${i}`;
            ringIds.push(layerId);
            mapInstance.addLayer({
                id: layerId, type: 'circle', source: tmpId,
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
        const hasCenter = centerDot?.enabled;
        const centerId = `${tmpId}-core`;
        if (hasCenter) {
            mapInstance.addLayer({
                id: centerId, type: 'circle', source: tmpId,
                paint: {
                    'circle-color': centerDot.color ?? '#00C853',
                    'circle-opacity': Math.max(0, Math.min(1, centerDot.opacity ?? 0.10)),
                    'circle-radius': centerDot.radius ?? 8,
                    'circle-stroke-width': 0
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
                const opacity = 0.18 * (1 - t) + 0.06;
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
                if (cleanupAfter === 'time') {
                    ringIds.forEach((layerId) => { if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId); });
                    if (hasCenter && mapInstance.getLayer(centerId)) mapInstance.removeLayer(centerId);
                    if (mapInstance.getSource(tmpId)) mapInstance.removeSource(tmpId);
                    resolve();
                } else {
                    ringIds.forEach((layerId) => {
                        if (mapInstance.getLayer(layerId)) {
                            mapInstance.setPaintProperty(layerId, 'circle-radius', endRadius);
                            mapInstance.setPaintProperty(layerId, 'circle-opacity', 0.08);
                            mapInstance.setPaintProperty(layerId, 'circle-blur', 0.1);
                        }
                    });
                    resolve({
                        id: tmpId,
                        remove: () => {
                            ringIds.forEach((layerId) => { if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId); });
                            if (hasCenter && mapInstance.getLayer(centerId)) mapInstance.removeLayer(centerId);
                            if (mapInstance.getSource(tmpId)) mapInstance.removeSource(tmpId);
                        }
                    });
                }
            }
        }
        requestAnimationFrame(frame);
    });
}

/* ======================= VISTAS ======================= */
const PERSIST_TO_LOCAL_STORAGE = true;
const LS_KEYS = { main: 'vista_inicial_main', can: 'vista_inicial_canarias' };
let initialViewMain = { ...DEFAULT_MAIN_VIEW };
let initialViewCan = { ...DEFAULT_CAN_VIEW };
function getCurrentView(mapInstance) {
    return {
        center: mapInstance.getCenter().toArray(),
        zoom: mapInstance.getZoom(),
        bearing: mapInstance.getBearing(),
        pitch: mapInstance.getPitch(),
    };
}
function applyView(mapInstance, view, { animate = true } = {}) {
    const opts = { center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0 };
    if (animate) {
        mapInstance.flyTo({ ...opts, padding: SAFE_PADDING, speed: 0.8, curve: 1.4, essential: true });
    } else {
        mapInstance.jumpTo(opts);
    }
}
function setInitialView(mapInstance, view, target = 'main') {
    if (target === 'main') {
        initialViewMain = { ...view };
        if (PERSIST_TO_LOCAL_STORAGE) localStorage.setItem(LS_KEYS.main, JSON.stringify(initialViewMain));
        console.log('📝 Vista inicial MAIN guardada:', initialViewMain);
    } else {
        initialViewCan = { ...view };
        if (PERSIST_TO_LOCAL_STORAGE) localStorage.setItem(LS_KEYS.can, JSON.stringify(initialViewCan));
        console.log('📝 Vista inicial CANARIAS guardada:', initialViewCan);
    }
}
async function flyToSmart(mapInstance, cameraOpts, {
    preloadDuration = 0, animateDuration = 1600, speed = 0.55, curve = 1.05, screenSpeed = undefined,
} = {}) {
    await new Promise((resolve) => {
        const onEnd = () => { mapInstance.off('moveend', onEnd); resolve(); };
        try {
            mapInstance.on('moveend', onEnd);
            mapInstance.flyTo({ ...cameraOpts, padding: SAFE_PADDING, preloadOnly: true, duration: preloadDuration, essential: true });
            setTimeout(() => { mapInstance.off('moveend', onEnd); resolve(); }, 500);
        } catch {
            mapInstance.off('moveend', onEnd); resolve();
        }
    });
    return flyToAndWait(mapInstance, {
        ...cameraOpts, padding: SAFE_PADDING, duration: animateDuration, speed, curve, ...(screenSpeed ? { screenSpeed } : {}), essential: true,
    });
}
function resetToInitialViewAsync(mapInstance) {
    const isCan = mapInstance === canariasMap;
    const view = isCan ? initialViewCan : initialViewMain;
    const centerOk = Array.isArray(view.center) && view.center.length === 2 && Number.isFinite(view.center[0]) && Number.isFinite(view.center[1]);
    const safeView = centerOk ? view : (isCan ? DEFAULT_CAN_VIEW : DEFAULT_MAIN_VIEW);
    return flyToSmart(mapInstance, {
        center: safeView.center, zoom: safeView.zoom, bearing: safeView.bearing ?? 0, pitch: safeView.pitch ?? 0,
    }, { preloadDuration: 0, animateDuration: 1600, speed: 0.55, curve: 1.05 });
}
function resetToInitialViewSync(mapInstance) {
    const isCan = mapInstance === canariasMap;
    const view = isCan ? initialViewCan : initialViewMain;
    mapInstance.jumpTo({ center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0 });
}
function resetBothMaps({ animate = true } = {}) {
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
            resetBothMaps({ animate: true });
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
        resetBothMaps({ animate });
    });
}
function initViews() {
    loadInitialViewsFromStorage();
    setupKeyboardShortcuts();
    setupViewEvents();
    applyView(map, initialViewMain, { animate: false });
    applyView(canariasMap, initialViewCan, { animate: false });
}

/* Barrido preventivo de cualquier spotlight residual */
function cleanupSpotlights(mapInstance) {
    const style = mapInstance.getStyle?.();
    if (!style) return;
    (style.layers ?? [])
        .filter(l => l.id.startsWith('spotlight-'))
        .forEach(l => { if (mapInstance.getLayer(l.id)) mapInstance.removeLayer(l.id); });
    Object.keys(style.sources ?? {})
        .filter(id => id.startsWith('spotlight-'))
        .forEach(id => { if (mapInstance.getSource(id)) mapInstance.removeSource(id); });
}

/* ===== Carga JSON nuevo (activos al iniciar, sin animación) ===== */
function addActiveSilent(c) {
    const useCanarias = isCanarias(c.lat, c.lng);
    const mapInstance = useCanarias ? canariasMap : map;
    const prefix = useCanarias ? CAN_SOURCE_PREFIX : MAIN_SOURCE_PREFIX;
    const varIdx = Math.floor(Math.random() * VARIANT_COUNT);
    const sourceId = `${prefix}${varIdx}`;
    const idBase = (c.Nombre_placa ?? c.Nombre_placafinal ?? c.Nombre ?? '').toString();
    const id = `act-${idBase}-${Number(c.lat).toFixed(5)}-${Number(c.lng).toFixed(5)}`;
    const feature = {
        type: 'Feature',
        properties: { id, name: (c.Nombre_placafinal ?? c.Nombre ?? c.Nombre_placa) },
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] }
    };
    const next = [...getFeatures(mapInstance, sourceId), feature];
    setFeatures(mapInstance, sourceId, next);
    addEndpoint(mapInstance, feature.geometry.coordinates, id);
    // >>> NUEVO: marcar como pintado (carga en frío)
    try { __paintedStableIds.add(id); } catch {}
    return id;
}
// === FIX B: carga en frío sin esperar a ensureMapReady ===
export async function loadActivosDesdeJson(url) {
    console.log('[map] loadActivosDesdeJson ‑', url);
    const res = await fetch(url);
    console.log('[map] fetch', url, '‑ status', res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`);
    const data = await res.json();
    const total = Array.isArray(data) ? data.length : 0;
    const actives = (Array.isArray(data) ? data : [])
        .filter(c => c && c.activo && Number.isFinite(c.lat) && Number.isFinite(c.lng));
    console.log('[map] JSON total:', total, 'activos:', actives.length);
    const ids = [];
    actives.forEach(c => { const id = addActiveSilent(c); if (id) ids.push(id); });
    const count = ids.length;
    try {
        window.dispatchEvent(new CustomEvent('activos:loaded', { detail: { count, ids } }));
        console.log('[map] dispatch activos:loaded ‑', { count, ids: ids.length });
    } catch (e) {
        console.warn('[map] no se pudo emitir activos:loaded', e);
    }
}

/* Flujo por concesionario */
async function processSingleAdherido(concesionario, id) {
    const useCanarias = isCanarias(concesionario.lat, concesionario.lng);
    const mapInstance = useCanarias ? canariasMap : map;
    const prefix = useCanarias ? CAN_SOURCE_PREFIX : MAIN_SOURCE_PREFIX;
    await ensureMapReady(mapInstance);
    cleanupSpotlights(mapInstance);
    const varIdx = Math.floor(Math.random() * VARIANT_COUNT);
    const sourceId = `${prefix}${varIdx}`;
    const displayName = concesionario.Nombre ?? concesionario.razonSocial;
    const feature = {
        type: 'Feature',
        properties: { id, name: displayName },
        geometry: { type: 'Point', coordinates: [concesionario.lng, concesionario.lat] }
    };
    let spot = null;
    try {
        if (useCanarias) { await expandCanariasFrame(); canariasMap.resize(); await wait(50); }
        spot = await runSpotlightMulti(mapInstance, feature.geometry.coordinates, {
            centerDot: { enabled: true, color: '#00C853', opacity: 0.10, radius: 8 },
            cleanupAfter: 'external',
            persistOpacity: 0
        });
        // PINTADO: añadimos el punto a la capa y el endpoint
        const next = [...getFeatures(mapInstance, sourceId), feature];
        setFeatures(mapInstance, sourceId, next);
        addEndpoint(mapInstance, feature.geometry.coordinates, id);
        // Avisamos a la sidebar de que el pintado ha empezado (para subir el contador en backend)
        try {
            const isBackend = String(id).startsWith('act-'); // ids del PHP/mock (clave estable)
            window.dispatchEvent(new CustomEvent('adherido:painted', {
                detail: {
                    id, // si es backend ya es clave estable; si es manual, la sidebar lo normaliza a estable con concesionario
                    origin: isBackend ? 'backend' : 'manual',
                    concesionario: { ...concesionario, Nombre: displayName }
                }
            }));
        } catch {}
        playApplauseRandom();
        await zoomToFocus(mapInstance, feature.geometry.coordinates);
        await showBillboard(
            mapInstance,
            (concesionario.Nombre_placafinal ?? displayName),
            "",
            feature.geometry.coordinates
        );
        if (!FEATURE_FLAGS.routeAnimationEnabled) {
            if (FOCUS_CONFIG.zoomOutAfterDwell) {
                await wait(FOCUS_CONFIG.dwellMs);
                await resetBothMaps({ animate: true });
            }
            return;
        }
    } catch (error) {
        console.error(`❒ Error procesando ${id}:`, error);
    } finally {
        try { if (spot?.remove) spot.remove(); } catch {}
        if (useCanarias) { await collapseCanariasFrame(); canariasMap.resize(); }
    }
}

/* ======================= COLA ======================= */
async function processQueue() {
    if (isProcessing) return;
    if (pendingQueue.length === 0) return;
    isProcessing = true;
    // actividad ‑ apaga attract
    deactivateQrAttract();
    while (pendingQueue.length > 0) {
        const item = pendingQueue.shift();
        await processSingleAdherido(item.concesionario, item.id);
        if (pendingQueue.length > 0) {
            await new Promise((res) => setTimeout(res, ANIMATION_CONFIG.delayBetweenMs));
        }
    }
    isProcessing = false;
    // reprograma inactividad (no rearmará si TodosMarcados bloqueó el QR)
    resetQrIdleTimer();
}
export function addAdherido(concesionario, id) {
    resetQrIdleTimer(); // interacción: pospone attract
    if (concesionarioExists(id)) {
        console.log(`⚠ ™️ Concesionario ${id} ya existe o está en cola, ignorando`);
        return;
    }
    pendingQueue.push({ concesionario, id });
    if (!isProcessing) processQueue();
}
export function removeAdherido(id) {
    const qIdx = pendingQueue.findIndex((item) => item.id === id);
    if (qIdx !== -1) pendingQueue.splice(qIdx, 1);
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan = `${CAN_SOURCE_PREFIX}${i}`;
        setFeatures(map, sMain, getFeatures(map, sMain).filter((f)=> f.properties?.id !== id));
        setFeatures(canariasMap, sCan, getFeatures(canariasMap, sCan).filter((f)=> f.properties?.id !== id));
    }
    const kmRemoved = removeRoutesAndEndpointsById(id);
    if (kmRemoved > 0) subtractKmAnimated(kmRemoved);
    const panelCount = document.getElementById('adheridas');
    const hudCount = document.getElementById('hud-adheridas');
    if (panelCount && hudCount) hudCount.textContent = panelCount.textContent;
    console.log(`🔸️ Concesionario ${id} eliminado (punto, rutas y endpoint). -${kmRemoved.toFixed(1)} km`);
}
export function getQueueStatus() {
    return {
        pending: pendingQueue.length,
        processing: isProcessing,
        config: ANIMATION_CONFIG,
        flags: { ...FEATURE_FLAGS },
    };
}
export function setAnimationDelay(ms) {
    ANIMATION_CONFIG.delayBetweenMs = ms;
    console.log(`⚙️ Delay ajustado a ${ms}ms`);
}

/* ======================================================
 ❤️ IDLE / ATTRACT MODE (QR + MAP DIM con auto-revert)
====================================================== */
const QR_IDLE_TIME_MS = 50000;
const QR_ATTRACT_MAX_ONSCREEN_MS = 20000;
let qrIdleTimer = null;
let qrAttractRevertTimer = null;
let qrAttractActive = false;
/* NUEVO: bloqueo permanente tras TodosMarcados() */
let qrDisabled = false;

function getQrEl() { return document.querySelector('.content-qr'); }
function getDimOverlay() { return document.querySelector('.map-dim-overlay'); }
function clearTimers() {
    if (qrIdleTimer) { clearTimeout(qrIdleTimer); qrIdleTimer = null; }
    if (qrAttractRevertTimer) { clearTimeout(qrAttractRevertTimer); qrAttractRevertTimer = null; }
}
function activateQrAttract() {
    if (qrDisabled) return; // << bloqueo tras TodosMarcados
    if (isSystemBusy()) {
        deactivateQrAttract();
        resetQrIdleTimer();
        return;
    }
    if (qrAttractActive) return;
    const qr = getQrEl(); const dim = getDimOverlay();
    if (!qr || !dim) return;
    qr.classList.add('qr-attract');
    dim.classList.add('active');
    qrAttractActive = true;
    if (qrAttractRevertTimer) clearTimeout(qrAttractRevertTimer);
    qrAttractRevertTimer = setTimeout(() => {
        deactivateQrAttract();
        resetQrIdleTimer();
    }, QR_ATTRACT_MAX_ONSCREEN_MS);
}
function deactivateQrAttract() {
    const qr = getQrEl(); const dim = getDimOverlay();
    if (qrAttractActive) {
        if (qr) qr.classList.remove('qr-attract');
        if (dim) dim.classList.remove('active');
        qrAttractActive = false;
    } else {
        // asegúrate de quitar clases residuales
        if (qr) qr.classList.remove('qr-attract');
        if (dim) dim.classList.remove('active');
    }
    if (qrAttractRevertTimer) { clearTimeout(qrAttractRevertTimer); qrAttractRevertTimer = null; }
}
function resetQrIdleTimer() {
    if (qrDisabled) { // << bloqueo tras TodosMarcados
        deactivateQrAttract();
        clearTimers();
        return;
    }
    deactivateQrAttract();
    if (qrIdleTimer) clearTimeout(qrIdleTimer);
    qrIdleTimer = setTimeout(() => {
        if (qrDisabled) { deactivateQrAttract(); clearTimers(); return; } // doble seguro
        if (isSystemBusy()) {
            resetQrIdleTimer();
            return;
        }
        activateQrAttract();
    }, QR_IDLE_TIME_MS);
}
function setupQrIdleListeners() {
    const events = [ 'mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel' ];
    events.forEach((evt) => { window.addEventListener(evt, resetQrIdleTimer, { passive: true }); });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { clearTimers(); }
        else { resetQrIdleTimer(); }
    });
    resetQrIdleTimer();
}

/* --- Señal global de mapas listos --- */
window.__mapsReady = false;
Promise.all([
    new Promise(res => (map.loaded() ? res() : map.once('load', res))),
    new Promise(res => (canariasMap.loaded() ? res() : canariasMap.once('load', res))),
]).then(() => {
    window.__mapsReady = true;
    window.dispatchEvent(new Event('maps:ready'));
    console.log('[maps] ready');
});

/* === Listener para adherir concesiones vía eventos (normaliza Nombre y delega en addAdherido) === */
window.addEventListener('adherido:add', (e) => {
    try {
        const { concesionario, id } = e.detail ?? {};
        if (!concesionario || typeof id !== 'string') return;
        const normalized = { ...concesionario, Nombre: concesionario.Nombre ?? concesionario.razonSocial };
        addAdherido(normalized, id);
    } catch {}
});
// Llama a esta función una sola vez al cargar tu app
setupQrIdleListeners();

/* === ADD-ONLY BOOTSTRAP & POLLING (FINAL) ===
 - ESM-safe init (sin TDZ)
 - Mock aleatorio por oleadas (IDs inactivos al inicio)
 - Primer tick tras window.__mapsReady
 - Parada automática cuando TODOS ACTIVOS → todosActivos()
================================================ */
// Estado global (esm-safe)
export const __activeNumericIds = new Set();
export const __byNumericId = new Map();
/* NUEVO: set de pintados por ID estable (act-...) */
export const __paintedStableIds = new Set();

let __pollTimer = null;
// Persistencia opcional HMR
if (typeof window !== 'undefined') {
    window.__ACTIVE_IDS__ = window.__ACTIVE_IDS__ ?? __activeNumericIds;
    window.__BY_ID__ = window.__BY_ID__ ?? __byNumericId;
}

/* API pública solicitada */
export function todosActivos(){
    console.log('TODOS ACTIVOS');
    // (no paramos aquí; la parada total se decide cuando además estén pintados)
}
/* NUEVO: función pública para detener QR cuando TODAS estén marcadas */
export function TodosMarcados() {
    qrDisabled = true;       // bloquea cualquier rearme futuro del QR
    try { deactivateQrAttract(); } catch {}
    try { clearTimers(); } catch {}
    console.log('[QR] TodosMarcados() → attract desactivado y timers limpiados');
}

// Helpers locales
function __computeStableId(c){
    const name = (c.Nombre_placa ?? c.Nombre_placafinal ?? c.Nombre ?? '').toString();
    return `act-${name}-${Number(c.lat).toFixed(5)}-${Number(c.lng).toFixed(5)}`;
}
async function __fetchJson(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
    return res.json();
}
function __normalizeWithIds(list){
    const arr = Array.isArray(list) ? list : [];
    return arr.map((c, idx) => ({ ...c, id: Number.isFinite(c?.id) ? Number(c.id) : idx }));
}
function __waitForMapsReady(timeoutMs = 5000){
    return new Promise((resolve)=>{
        const start = performance.now();
        function check(){
            if (window.__mapsReady === true) return resolve();
            if (performance.now() - start > timeoutMs) return resolve();
            requestAnimationFrame(check);
        }
        check();
    });
}

/* NUEVO: comprobación compuesta para parar el QR */
function __areAllActivePainted() {
    const total = __byNumericId.size;
    const active = __activeNumericIds.size;
    return total > 0 && active >= total && __paintedStableIds.size >= total;
}
function __tryStopQrWhenComplete() {
    if (__areAllActivePainted()) {
        TodosMarcados(); // << LLAMADA EXACTA CUANDO “TODOS MARCADOS”
        return true;
    }
    return false;
}

// Bootstrap de datos (PHP → locales) + relleno estructuras
export async function bootstrapActivos({ phpUrl, localUrls = [] } = {}){
    try { if (phpUrl) await fetch(phpUrl, { cache: 'no-store' }).catch(()=>{}); } catch {}
    let chosen = null, dataset = null;
    for(const u of localUrls){
        try {
            const json = await __fetchJson(u);
            dataset = __normalizeWithIds(json);
            chosen = u; break;
        } catch {}
    }
    if (!dataset) throw new Error('No se pudo cargar dataset local (primary/fallback)');
    __byNumericId.clear();
    __activeNumericIds.clear();
    for(const c of dataset){
        const idn = Number(c.id);
        __byNumericId.set(idn, c);
        if (c && c.activo === true) __activeNumericIds.add(idn);
    }
    if (chosen){
        try { await loadActivosDesdeJson(chosen); }
        catch(e){ console.warn('[bootstrapActivos] loadActivosDesdeJson falló:', e); }
    }
    // Prepara pool inactivo para mock
    __mockState.pool = new Set(Array.from(__byNumericId.keys()).filter((id)=>!__activeNumericIds.has(id)));
}

// Mock aleatorio por oleadas
const __mockState = {
    forced: false,
    randomCounts: [],
    index: 0,
    delivered: new Set(),
    pool: new Set(),
    randomPoolAfterFirst: null
};
function __configureMock(options){
    __mockState.forced = !!options?.mock;
    __mockState.randomCounts = Array.isArray(options?.randomCounts)
        ? options.randomCounts.map(n=>Math.max(0, Number(n) || 0)) : [];
    __mockState.index = 0;
    __mockState.delivered.clear();
    __mockState.randomPoolAfterFirst = Array.isArray(options?.randomPoolAfterFirst) && options.randomPoolAfterFirst.length ? options.randomPoolAfterFirst.map(n=>Math.max(0, Number(n)||0)) : null;
}
function __pickRandomFromPool(k){
    const arr = Array.from(__mockState.pool);
    if (!arr.length || k<=0) return [];
    const picked = [];
    for(let i=0;i<k && arr.length;i++){
        const r = Math.floor(Math.random()*arr.length);
        const id = arr.splice(r,1)[0];
        __mockState.pool.delete(id);
        picked.push(id);
    }
    return picked;
}
function __getNextMockBatch(){
    const counts = __mockState.randomCounts;
    let k;
    if (counts && counts.length && __mockState.index < counts.length) {
        k = counts[__mockState.index];
    } else if (__mockState.randomPoolAfterFirst && __mockState.randomPoolAfterFirst.length) {
        const pool = __mockState.randomPoolAfterFirst;
        k = pool[Math.floor(Math.random()*pool.length)] || 1;
    } else { k = (counts && counts.length) ? counts[counts.length-1] : 1;}
    if (!Number.isFinite(k) || k<=0) k=1;
    __mockState.index += 1;
    const fresh = __pickRandomFromPool(k).filter(id=>!__mockState.delivered.has(id));
    fresh.forEach(id=>__mockState.delivered.add(id));
    return fresh;
}

/* NUEVO: registrar “pintados” de backend para poder parar QR */
window.addEventListener('adherido:painted', (e) => {
    try {
        const { id, origin, concesionario } = e.detail ?? {};
        if (origin !== 'backend') return; // solo backend cuenta para “todos”
        if (typeof id === 'string' && id.startsWith('act-')) {
            __paintedStableIds.add(id);
        } else if (concesionario) {
            const sid = __computeStableId(concesionario);
            __paintedStableIds.add(sid);
        }
        __tryStopQrWhenComplete();
    } catch {}
});

export function startPhpPollingActivos(phpIdsUrl, intervalMs = 30000, options = undefined){
    stopPhpPollingActivos();
    __configureMock(options);
    function __checkAllActiveAndStopIfSo(){
        const total = __byNumericId.size;
        const current = __activeNumericIds.size;
        if (total>0 && current>=total){
            stopPhpPollingActivos();
            try { todosActivos(); } catch {}
            try { window.dispatchEvent(new CustomEvent('activos:all', { detail: { total } })); } catch {}
            console.log('… [poll] Todos activos. Polling detenido.');
            // Si además ya están pintados, cierra QR; si no, espera al pintado que complete
            if (!__tryStopQrWhenComplete()) {
                const onceHandler = () => {
                    if (__tryStopQrWhenComplete()) {
                        window.removeEventListener('adherido:painted', onceHandler);
                    }
                };
                window.addEventListener('adherido:painted', onceHandler);
            }
            return true;
        }
        return false;
    }
    async function tick(){
        if (__checkAllActiveAndStopIfSo()) return;
        let ids = null;
        let useMock = __mockState.forced;
        if (!useMock && phpIdsUrl){
            try {
                const res = await fetch(phpIdsUrl, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (Array.isArray(json)) ids = json.map(n=>Number(n)).filter(Number.isFinite);
                else useMock = true;
            } catch { useMock = true; }
        }
        if (useMock) ids = __getNextMockBatch();
        if (!Array.isArray(ids) || !ids.length){ __checkAllActiveAndStopIfSo(); return; }
        const nuevos = ids.filter(id=>!__activeNumericIds.has(id));
        if (!nuevos.length){ __checkAllActiveAndStopIfSo(); return; }
        console.log('🧩 [poll] nuevos ids activos:', nuevos, 'mapsReady=', window.__mapsReady, 'forcedMock=', __mockState.forced);
        for(const idn of nuevos){
            const concesionario = __byNumericId.get(idn);
            if (!concesionario) continue;
            __activeNumericIds.add(idn);
            const normalized = { ...concesionario, Nombre: concesionario.Nombre ?? concesionario.razonSocial };
            const stable = __computeStableId(concesionario);
            try {
                window.dispatchEvent(new CustomEvent('adherido:add', { detail: { concesionario: normalized, id: stable } }));
            } catch {}
        }
        __checkAllActiveAndStopIfSo();
    }
    __waitForMapsReady().then(()=>{ setTimeout(()=>{ tick(); }, 5000); });
    __pollTimer = setInterval(tick, Math.max(5000, Number(intervalMs) || 30000));
}
export function stopPhpPollingActivos(){
    if (__pollTimer){ clearInterval(__pollTimer); __pollTimer = null; }
}
