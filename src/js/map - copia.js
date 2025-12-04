
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

const adheridosSourceId = 'adheridos';
const adheridosCanariasSourceId = 'adheridos-canarias';

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
// STORE robusto de features (no usamos propiedades privadas)
// ─────────────────────────────────────────────────────────────
const featureStore = new WeakMap(); // mapInstance -> Map<sourceId, Feature[]>
function getStore(mapInstance) {
    let m = featureStore.get(mapInstance);
    if (!m) { m = new Map(); featureStore.set(mapInstance, m); }
    return m;
}
function getFeatures(mapInstance, sourceId) {
    const m = getStore(mapInstance);
    return m.get(sourceId) || [];
}
function setFeatures(mapInstance, sourceId, features) {
    const m = getStore(mapInstance);
    m.set(sourceId, features);
    const src = mapInstance.getSource(sourceId);
    if (src) src.setData({ type: 'FeatureCollection', features });
}

// ─────────────────────────────────────────────────────────────
// SPRITE ÚNICO (como en la versión inicial)
// ─────────────────────────────────────────────────────────────
function createMultiWaveDot() {
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
            const duration = 2000;
            const t = (performance.now() % duration) / duration;
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            const colors = ['#00d9ff', '#0077ff', '#004d7a'];
            const maxRadius = size / 2;
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#00d9ff';
            colors.forEach((color, i) => {
                const progress = (t + i * 0.3) % 1;
                const radius = maxRadius * (1 - progress);
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.lineWidth = 4;
                ctx.globalAlpha = 1 - progress;
                ctx.stroke();
            });
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            dot.data.set(imageData.data);
            map.triggerRepaint();
            canariasMap.triggerRepaint();
            return true;
        }
    };
    return dot;
}

// ─────────────────────────────────────────────────────────────
// SETUP: fuente + capa (idéntico a tu versión inicial)
// ─────────────────────────────────────────────────────────────
function setupMap(mapInstance, sourceId) {
    if (!mapInstance.hasImage('multi-wave-dot')) {
        mapInstance.addImage('multi-wave-dot', createMultiWaveDot(), { pixelRatio: 2 });
    }

    if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
    }

    if (!mapInstance.getLayer(`${sourceId}-wave`)) {
        mapInstance.addLayer({
            id: `${sourceId}-wave`,
            type: 'symbol',
            source: sourceId,
            layout: {
                'icon-image': 'multi-wave-dot',   // ← sprite fijo, como antes
                'icon-size': 0.4,
                'icon-allow-overlap': true
            }
        });
    }
}

map.on('load', () => setupMap(map, adheridosSourceId));
canariasMap.on('load', () => setupMap(canariasMap, adheridosCanariasSourceId));

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
// API pública: añadir / quitar adheridos
// ─────────────────────────────────────────────────────────────
export async function addAdherido(concesionario, id) {
    const useCanarias = isCanarias(concesionario.lat, concesionario.lng);
    const mapInstance = useCanarias ? canariasMap : map;
    const sourceId    = useCanarias ? adheridosCanariasSourceId : adheridosSourceId;

    await ensureMapReady(mapInstance);

    const feature = {
        type: 'Feature',
        properties: { id, name: concesionario.razonSocial },
        geometry: { type: 'Point', coordinates: [concesionario.lng, concesionario.lat] }
    };

    const features = getFeatures(mapInstance, sourceId);
    const exists = features.some(f => f.properties?.id === id);
    if (exists) return; // evitar duplicados

    enqueue(mapInstance, async () => {
        await showBillboard(mapInstance, concesionario.razonSocial, feature.geometry.coordinates);
        await runSpotlightMulti(mapInstance, feature.geometry.coordinates);

        const cur = getFeatures(mapInstance, sourceId);
        setFeatures(mapInstance, sourceId, [...cur, feature]); // ← se acumulan y se mantienen
    });
}

export function removeAdherido(id) {
    const featuresMain = getFeatures(map, adheridosSourceId);
    const featuresCanarias = getFeatures(canariasMap, adheridosCanariasSourceId);
    setFeatures(map, adheridosSourceId, featuresMain.filter(f => f.properties?.id !== id));
    setFeatures(canariasMap, adheridosCanariasSourceId, featuresCanarias.filter(f => f.properties?.id !== id));
}
