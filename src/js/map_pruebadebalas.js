
// map.js
import mapboxgl from 'mapbox-gl';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ─────────────────────────────────────────────────────────────
// MAPAS
// ─────────────────────────────────────────────────────────────
export const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-3.7038, 40.4168],
    zoom: 4.5
});
map.fitBounds([
    [-8.5, 34.5], // Ceuta y Melilla incluidas
    [4.6, 43.8]
]);

export const canariasMap = new mapboxgl.Map({
    container: 'canarias-map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-15.5, 28.3],
    zoom: 5.7
});

// IDs base (crearemos 4 sources/layers por mapa)
const MAIN_SOURCE_PREFIX = 'adheridos-v';
const CAN_SOURCE_PREFIX  = 'adheridos-can-v';
const VARIANT_COUNT = 4;

// ─────────────────────────────────────────────────────────────
// UTIL: esperar a que el mapa esté listo
// ─────────────────────────────────────────────────────────────
function ensureMapReady(mapInstance) {
    return new Promise(resolve => {
        if (mapInstance.loaded()) return resolve();
        mapInstance.once('load', resolve);
    });
}

// ─────────────────────────────────────────────────────────────
// STORE acoplado al MAPA (persistente y robusto)
// ─────────────────────────────────────────────────────────────
function getFeatures(mapInstance, sourceId) {
    if (!mapInstance.__store) mapInstance.__store = {};
    return mapInstance.__store[sourceId] || [];
}
function setFeatures(mapInstance, sourceId, features) {
    if (!mapInstance.__store) mapInstance.__store = {};
    mapInstance.__store[sourceId] = features;
    const src = mapInstance.getSource(sourceId);
    if (src) src.setData({ type: 'FeatureCollection', features });
}

// ─────────────────────────────────────────────────────────────
// SPRITES: 4 variantes con colores y velocidades diferentes
// ─────────────────────────────────────────────────────────────
const WAVE_VARIANTS = [
    // 0: rápido (cian/azules)
    { name: 'pulse-cyan-1700',   durationMs: 1700, phaseMs: 0,    colors: ['#00E5FF', '#00B8FF', '#007BFF'], lineWidth: 4 },
    // 1: medio (tu paleta original)
    { name: 'pulse-blue-2000',   durationMs: 2000, phaseMs: 160,  colors: ['#00d9ff', '#0077ff', '#004d7a'], lineWidth: 4 },
    // 2: medio-lento (azules profundos)
    { name: 'pulse-royal-2300',  durationMs: 2300, phaseMs: 320,  colors: ['#4EB5FF', '#1E6FFF', '#0B3C9E'], lineWidth: 3.8 },
    // 3: lento (magenta/violeta para distinguir en pruebas)
    { name: 'pulse-magenta-2600',durationMs: 2600, phaseMs: 480,  colors: ['#FF4DFF', '#CC33FF', '#7A1FFF'], lineWidth: 3.8 }
];

function createWaveSprite({ durationMs, phaseMs = 0, colors, lineWidth = 4 }) {
    const size = 200;
    const dot = {
        width: size,
        height: size,
        data: new Uint8Array(size * size * 4),
        onAdd() {
            const canvas = document.createElement('canvas');
            canvas.width = this.width;
            canvas.height = this.height;
            this.context = canvas.getContext('2d');
        },
        render() {
            const ctx = this.context;
            ctx.clearRect(0, 0, this.width, this.height);

            const t = ((performance.now() + phaseMs) % durationMs) / durationMs;
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            const maxRadius = size / 2;

            ctx.shadowBlur = 40;
            ctx.shadowColor = colors[0];

            colors.forEach((color, i) => {
                const progress = (t + i * 0.28) % 1;
                const radius = maxRadius * (1 - progress);
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.globalAlpha = 1 - progress;
                ctx.stroke();
            });

            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            dot.data.set(imageData.data);

            // repintados (comparten sprites entre mapas)
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
            mapInstance.addImage(v.name, createWaveSprite(v), { pixelRatio: 2 });
        }
    });
}

// ─────────────────────────────────────────────────────────────
// SETUP: 4 SOURCES + 4 CAPAS por mapa (sin filtros ni expresiones)
// ─────────────────────────────────────────────────────────────
function ensureVariantSourcesAndLayers(mapInstance, prefix) {
    addWaveImages(mapInstance);

    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sourceId = `${prefix}${i}`;
        const layerId  = `${sourceId}-layer`;
        const spriteName = WAVE_VARIANTS[i].name;

        if (!mapInstance.getSource(sourceId)) {
            mapInstance.addSource(sourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
        }

        if (!mapInstance.getLayer(layerId)) {
            mapInstance.addLayer({
                id: layerId,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'icon-image': spriteName,   // sprite fijo por capa
                    'icon-size': 0.42,
                    'icon-allow-overlap': true
                }
            });
        }
    }
}

map.on('load', () => {
    ensureVariantSourcesAndLayers(map, MAIN_SOURCE_PREFIX);
});
canariasMap.on('load', () => {
    ensureVariantSourcesAndLayers(canariasMap, CAN_SOURCE_PREFIX);
});

// ─────────────────────────────────────────────────────────────
// Canarias
// ─────────────────────────────────────────────────────────────
function isCanarias(lat, lng) {
    return lat >= 27 && lat <= 29.5 && lng >= -18.5 && lng <= -13.5;
}

// ─────────────────────────────────────────────────────────────
// Cola de animaciones (para que no se pisen)
// ─────────────────────────────────────────────────────────────
const queues = new WeakMap(); // mapInstance -> Promise
function enqueue(mapInstance, taskFn) {
    const prev = queues.get(mapInstance) || Promise.resolve();
    const next = prev.then(taskFn).catch(console.error);
    queues.set(mapInstance, next);
}

// ─────────────────────────────────────────────────────────────
// Cartel (billboard) anclado a coordenadas
// ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[s]));
}
function showBillboard(mapInstance, text, coordinates) {
    return new Promise(resolve => {
        const container = mapInstance.getContainer();
        const el = document.createElement('div');
        el.className = 'billboard';
        el.innerHTML = `<div class="billboard__content">${escapeHtml(text)}</div>`;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -110%) scale(0.98)';
        el.style.transition = 'opacity 300ms ease, transform 300ms ease';
        container.appendChild(el);

        const update = () => {
            const p = mapInstance.project(coordinates);
            el.style.left = `${p.x}px`;
            el.style.top  = `${p.y}px`;
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
            el.addEventListener('transitionend', onEnd, { once: true });
        }, visibleMs);
    });
}

// ─────────────────────────────────────────────────────────────
// Foco multi-anillos (círculos que viajan hacia la marca)
// ─────────────────────────────────────────────────────────────
function runSpotlightMulti(mapInstance, coordinates, {
    rings = 4,
    startRadius = 300,
    endRadius   = 10,
    ringDelaysMs = [0, 120, 240, 360],
    ringDurationsMs = [800, 1000, 1150, 1300],
    colors = ['#00d9ff', '#1f9dff', '#0b6ad1', '#084f9a'],
    strokeWidth = 2.2
} = {}) {
    return new Promise(resolve => {
        const tmpId = `spotlight-${Math.random().toString(36).slice(2)}`;

        mapInstance.addSource(tmpId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: { type: 'Point', coordinates } }]
            }
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
                const delay = ringDelaysMs[i] || 0;
                const dur   = ringDurationsMs[i] || ringDurationsMs[ringDurationsMs.length - 1];

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

// ─────────────────────────────────────────────────────────────
// Picker ALEATORIO de variante (puro)
// ─────────────────────────────────────────────────────────────
function pickRandomVariantIndex() {
    return Math.floor(Math.random() * VARIANT_COUNT); // 0..3
}

// ─────────────────────────────────────────────────────────────
// API pública: añadir / quitar adheridos
// ─────────────────────────────────────────────────────────────
export async function addAdherido(concesionario, id) {
    const useCanarias = isCanarias(concesionario.lat, concesionario.lng);
    const mapInstance = useCanarias ? canariasMap : map;
    const prefix      = useCanarias ? CAN_SOURCE_PREFIX : MAIN_SOURCE_PREFIX;

    await ensureMapReady(mapInstance);

    // Decide variante aleatoria y la source correspondiente
    const varIdx   = pickRandomVariantIndex();
    const sourceId = `${prefix}${varIdx}`;

    const feature = {
        type: 'Feature',
        properties: { id, name: concesionario.razonSocial },
        geometry: { type: 'Point', coordinates: [concesionario.lng, concesionario.lat] }
    };

    const current = getFeatures(mapInstance, sourceId);
    const exists = current.some(f => f.properties?.id === id);
    if (exists) return; // evitar duplicados dentro de esa variante

    // Secuencia: cartel -> foco -> añadir a LA source de su variante (sin filtros)
    enqueue(mapInstance, async () => {
        await showBillboard(mapInstance, concesionario.razonSocial, feature.geometry.coordinates);
        await runSpotlightMulti(mapInstance, feature.geometry.coordinates);

        const next = [...getFeatures(mapInstance, sourceId), feature];
        setFeatures(mapInstance, sourceId, next); // ← ACUMULA SIEMPRE en su source
    });
}

export function removeAdherido(id) {
    // Quita en TODAS las variantes de ambos mapas
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan  = `${CAN_SOURCE_PREFIX}${i}`;
        const nextMain = getFeatures(map, sMain).filter(f => f.properties?.id !== id);
        const nextCan  = getFeatures(canariasMap, sCan).filter(f => f.properties?.id !== id);
        setFeatures(map, sMain, nextMain);
        setFeatures(canariasMap, sCan, nextCan);
    }
}
