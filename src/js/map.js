
import MapboxLanguage from '@mapbox/mapbox-gl-language';
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// === VISTAS INICIALES (hard-coded; sin persistencia en localStorage)
const DEFAULT_MAIN_VIEW = {
    center: [-4.8256349902215845, 39.93651074944117],
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

// === MAPAS
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

// === CONFIG DE CAPAS (solo “luces”)
const MAIN_SOURCE_PREFIX = 'adheridos-v';
const CAN_SOURCE_PREFIX  = 'adheridos-can-v';
const VARIANT_COUNT = 4;

// Eliminado todo lo relativo a rutas, audio y km acumulados

// === Utilidades básicas
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

function escapeHtml(str) {
    const m = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
    return String(str).replace(/[&<>\"']/g, (s) => m[s]);
}

// === Sprites de ondas (las “luces”)
const WAVE_VARIANTS = [
    { name: 'pulse-cyan-1700',   durationMs: 1700, phaseMs: 0,   colors: ['#8BC53F','#b3cc23','#8b9f1a'], lineWidth: 12 },
    { name: 'pulse-blue-2000',   durationMs: 2000, phaseMs: 160, colors: ['#c2de21','#8b9f1a','#b3cc23'], lineWidth: 13 },
    { name: 'pulse-royal-2300',  durationMs: 2300, phaseMs: 320, colors: ['#7b8d14','#8b9f1a','#c2de21'], lineWidth: 12 },
    { name: 'pulse-magenta-2600',durationMs: 2600, phaseMs: 480, colors: ['#8b9f1a','#c2de21','#b3cc23'], lineWidth: 13 },
];

const SPRITE_WAVE_COUNT = 4, SPRITE_PHASE_PER_WAVE = 0.2, SPRITE_LINE_WIDTH = 3.2;

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

            for (let i = 0; i < SPRITE_WAVE_COUNT; i++) {
                const p = (tCycle + i * SPRITE_PHASE_PER_WAVE) % 1;
                const u = p < 0.5 ? p * 2 : (1 - p) * 2;
                const radius = maxR * u;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                const cIdx = i % colors.length;
                ctx.strokeStyle = colors[cIdx];
                ctx.lineWidth = lineWidth;
                ctx.globalAlpha = 0.10 + 0.90 * easeInOutSine(u);
                const glowFactor = 1 - Math.abs(0.5 - p) * 2;
                ctx.shadowColor = colors[cIdx];
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

function ensureVariantSourcesAndLayers(mapInstance, prefix) {
    addWaveImages(mapInstance);
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sourceId = `${prefix}${i}`;
        const layerId  = `${sourceId}-layer`;
        const spriteName = WAVE_VARIANTS[i].name;

        if (!mapInstance.getSource(sourceId)) {
            mapInstance.addSource(sourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            const cached = (mapInstance.__store && mapInstance.__store[sourceId]) ?? [];
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

// === Cargas y controles de idioma
map.on('load', () => {
    ensureVariantSourcesAndLayers(map, MAIN_SOURCE_PREFIX);
    const languageMain = new MapboxLanguage({ defaultLanguage: 'es' });
    map.addControl(languageMain);
});

canariasMap.on('load', () => {
    ensureVariantSourcesAndLayers(canariasMap, CAN_SOURCE_PREFIX);
    const languageCan = new MapboxLanguage({ defaultLanguage: 'es' });
    canariasMap.addControl(languageCan);
});

// === Spotlight + Billboard (opcional)
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
    <div class="content-text-layer2">Gracias por sumarte al proyecto y llenar el mapa de<br/>
      <strong>KM QUE IMPORTAN</strong>
    </div>
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

        const visibleMs = 5000;
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
            data: {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: { type: 'Point', coordinates } }]
            }
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
                const dur   = ringDurationsMs[i] ?? ringDurationsMs[ringDurationsMs.length - 1];
                const tRaw  = (now - start - delay) / dur;
                const t     = Math.max(0, Math.min(1, tRaw));
                if (t < 1) allDone = false;
                const ease  = 1 - Math.pow(1 - t, 3 - Math.min(2.5, i * 0.35));
                const r     = startRadius + (endRadius - startRadius) * ease;
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

// === Añadir “activos” (luces)
function addEndpoint(mapInstance, endCoords, id) {
    // Endpoints eliminados (no se necesitan). Función mantenida por compat.
}

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
    try { __paintedStableIds.add(id); } catch {}
    return id;
}

export async function loadActivosDesdeJson(url) {
    console.log('[map] loadActivosDesdeJson —', url);
    const res = await fetch(url);
    console.log('[map] fetch', url, '— status', res.status);
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
        console.log('[map] dispatch activos:loaded —', { count, ids: ids.length });
    } catch (e) {
        console.warn('[map] no se pudo emitir activos:loaded', e);
    }
}

// === Cola / Pipeline
const pendingQueue = [];
let isProcessing = false;

function isSystemBusy() {
    return isProcessing || (pendingQueue.length > 0);
}

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
        if (useCanarias) { await expandCanariasFrame(); canariasMap.resize(); await new Promise(r=>setTimeout(r,50)); }

        spot = await runSpotlightMulti(mapInstance, feature.geometry.coordinates, {
            centerDot: { enabled: true, color: '#00C853', opacity: 0.10, radius: 8 },
            cleanupAfter: 'external',
            persistOpacity: 0
        });

        const next = [...getFeatures(mapInstance, sourceId), feature];
        setFeatures(mapInstance, sourceId, next);
        addEndpoint(mapInstance, feature.geometry.coordinates, id);

        try {
            const isBackend = String(id).startsWith('act-'); // ids del backend/mock (clave estable)
            window.dispatchEvent(new CustomEvent('adherido:painted', {
                detail: {
                    id,
                    origin: isBackend ? 'backend' : 'manual',
                    concesionario: { ...concesionario, Nombre: displayName }
                }
            }));
        } catch {}

        await zoomToFocus(mapInstance, feature.geometry.coordinates);
        await showBillboard(
            mapInstance,
            (concesionario.Nombre_placafinal ?? displayName),
            "",
            feature.geometry.coordinates
        );

        // Tras un pequeño dwell, reencuadre suave a la vista por defecto
        await new Promise(res => setTimeout(res, 1000));
        const defaultView = (mapInstance === canariasMap) ? DEFAULT_CAN_VIEW : DEFAULT_MAIN_VIEW;
        await flyToAndWait(mapInstance, { ...defaultView, speed: 0.55, curve: 1.05 });

    } catch (error) {
        console.error(` Error procesando ${id}:`, error);
    } finally {
        try { if (spot?.remove) spot.remove(); } catch {}
        if (useCanarias) { await collapseCanariasFrame(); canariasMap.resize(); }
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
            await new Promise((res) => setTimeout(res, 1500));
        }
    }

    isProcessing = false;
}

function concesionarioExists(id) {
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan  = `${CAN_SOURCE_PREFIX}${i}`;
        if (
            getFeatures(map, sMain).some((f)=> f.properties?.id === id) ||
            getFeatures(canariasMap, sCan).some((f)=> f.properties?.id === id)
        ) return true;
    }
    return pendingQueue.some((item)=> item.id === id);
}

export function addAdherido(concesionario, id) {
    if (concesionarioExists(id)) return;
    pendingQueue.push({ concesionario, id });
    if (!isProcessing) processQueue();
}

export function removeAdherido(id) {
    const qIdx = pendingQueue.findIndex((item) => item.id === id);
    if (qIdx !== -1) pendingQueue.splice(qIdx, 1);

    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan  = `${CAN_SOURCE_PREFIX}${i}`;
        setFeatures(map, sMain, getFeatures(map, sMain).filter((f)=> f.properties?.id !== id));
        setFeatures(canariasMap, sCan, getFeatures(canariasMap, sCan).filter((f)=> f.properties?.id !== id));
    }

    // sincroniza HUD si existe
    const panelCount = document.getElementById('adheridas');
    const hudCount = document.getElementById('hud-adheridas');
    if (panelCount && hudCount) hudCount.textContent = panelCount.textContent;
}

export function getQueueStatus() {
    return {
        pending: pendingQueue.length,
        processing: isProcessing,
    };
}

export function setAnimationDelay(ms) {
    // Si quieres ajustar el delay entre elementos de la cola:
    // En este refactor lo hemos dejado fijo arriba, pero puedes exponer aquí si lo necesitas.
    console.log(`⚙️ Delay (no-op en refactor) → ${ms}ms`);
}

// === Señal global de mapas listos
window.__mapsReady = false;
Promise.all([
    new Promise(res => (map.loaded() ? res() : map.once('load', res))),
    new Promise(res => (canariasMap.loaded() ? res() : canariasMap.once('load', res))),
]).then(() => {
    window.__mapsReady = true;
    window.dispatchEvent(new Event('maps:ready'));
    console.log('[maps] ready');
});

// === Event bridge para adherido:add
window.addEventListener('adherido:add', (e) => {
    try {
        const { concesionario, id } = e.detail ?? {};
        if (!concesionario || typeof id !== 'string') return;
        const normalized = { ...concesionario, Nombre: concesionario.Nombre ?? concesionario.razonSocial };
        addAdherido(normalized, id);
    } catch {}
});

// === Estado y polling (preparados para backend; usa JSON local mientras tanto)
export const __activeNumericIds = new Set();
export const __byNumericId = new Map();

// Set de pintados por ID estable (act-...) para poder detectar “todos”
export const __paintedStableIds = new Set();

if (typeof window !== 'undefined') {
    window.__ACTIVE_IDS__ = window.__ACTIVE_IDS__ ?? __activeNumericIds;
    window.__BY_ID__      = window.__BY_ID__      ?? __byNumericId;
}

export function todosActivos(){ console.log('TODOS ACTIVOS'); }

// Cierre de QR attract eliminado del refactor (no persistimos ni QR ni timers aquí)
// Si más adelante quieres reactivar el attract, lo añadimos de nuevo modular.

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

export async function bootstrapActivos({ phpUrl, localUrls = [] } = {}){
    // Intento “ping” PHP (no usado por ahora)
    try { if (phpUrl) await fetch(phpUrl, { cache: 'no-store' }).catch(()=>{}); } catch {}

    let chosen = null, dataset = null;
    for(const u of localUrls){
        try {
            const json = await __fetchJson(u);
            dataset = __normalizeWithIds(json);
            chosen = u; break;
        } catch {}
    }
    if (!dataset) throw new Error('No se pudo cargar dataset local');

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

// === Mock aleatorio por oleadas (para pruebas locales)
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
    __mockState.randomPoolAfterFirst = Array.isArray(options?.randomPoolAfterFirst) && options.randomPoolAfterFirst.length
        ? options.randomPoolAfterFirst.map(n=>Math.max(0, Number(n)||0)) : null;
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
    } else {
        k = (counts && counts.length) ? counts[counts.length-1] : 1;
    }
    if (!Number.isFinite(k) || k<=0) k=1;
    __mockState.index += 1;

    const fresh = __pickRandomFromPool(k).filter(id=>!__mockState.delivered.has(id));
    fresh.forEach(id=>__mockState.delivered.add(id));
    return fresh;
}

// Registrar “pintados” de backend (para detectar “todos” si lo necesitas)
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
    } catch {}
});

export function startPhpPollingActivos(phpIdsUrl, intervalMs = 30000, options = undefined){
    __configureMock(options);

    async function tick(){
        let ids = null;
        let useMock = __mockState.forced;

        // Si tuvieras PHP operativo, aquí lo llamarías:
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
        if (!Array.isArray(ids) || !ids.length) return;

        const nuevos = ids.filter(id=>!__activeNumericIds.has(id));
        if (!nuevos.length) return;

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
    }

    __waitForMapsReady().then(()=>{ setTimeout(()=>{ tick(); }, 5000); });
    setInterval(tick, Math.max(5000, Number(intervalMs) || 30000));
}
