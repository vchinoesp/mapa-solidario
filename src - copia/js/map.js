// map.js - VERSIÓN CON COLA SECUENCIAL SIMPLE
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
    [-8.5, 34.5],
    [4.6, 43.8]
]);

export const canariasMap = new mapboxgl.Map({
    container: 'canarias-map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-15.5, 28.3],
    zoom: 5.7
});

const MAIN_SOURCE_PREFIX = 'adheridos-v';
const CAN_SOURCE_PREFIX  = 'adheridos-can-v';
const VARIANT_COUNT = 4;

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE LA COLA
// ─────────────────────────────────────────────────────────────
const ANIMATION_CONFIG = {
    delayBetweenMs: 1500,    // 1.5 segundos entre cada animación
};

// Cola de concesionarios pendientes
const pendingQueue = [];
let isProcessing = false;

// ─────────────────────────────────────────────────────────────
// UTIL
// ─────────────────────────────────────────────────────────────
function ensureMapReady(mapInstance) {
    return new Promise(resolve => {
        if (mapInstance.loaded()) return resolve();
        mapInstance.once('load', resolve);
    });
}

// ─────────────────────────────────────────────────────────────
// STORE
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
// SPRITES
// ─────────────────────────────────────────────────────────────
const WAVE_VARIANTS = [
    { name: 'pulse-cyan-1700',   durationMs: 1700, phaseMs: 0,    colors: ['#00E5FF', '#00B8FF', '#007BFF'], lineWidth: 4 },
    { name: 'pulse-blue-2000',   durationMs: 2000, phaseMs: 160,  colors: ['#00d9ff', '#0077ff', '#004d7a'], lineWidth: 4 },
    { name: 'pulse-royal-2300',  durationMs: 2300, phaseMs: 320,  colors: ['#4EB5FF', '#1E6FFF', '#0B3C9E'], lineWidth: 3.8 },
    { name: 'pulse-magenta-2600',durationMs: 2600, phaseMs: 480,  colors: ['#FF4DFF', '#CC33FF', '#7A1FFF'], lineWidth: 3.8 }
];

const SPRITE_WAVE_COUNT = 4;
const SPRITE_PHASE_PER_WAVE = 0.20;
const SPRITE_LINE_WIDTH = 3.2;
const SPRITE_SHADOW_BASE = 18;

function createWaveSprite({ durationMs, phaseMs = 0, colors, lineWidth = SPRITE_LINE_WIDTH }) {
    const size = 220;
    const dot = {
        width: size,
        height: size,
        data: new Uint8Array(size * size * 4),
        onAdd() {
            const canvas = document.createElement('canvas');
            canvas.width = this.width;
            canvas.height = this.height;
            this.context = canvas.getContext('2d', { alpha: true });
            this.context.imageSmoothingEnabled = true;
            this.context.imageSmoothingQuality = 'high';
        },
        render() {
            const ctx = this.context;
            ctx.clearRect(0, 0, this.width, this.height);

            const tCycle = ((performance.now() + phaseMs) % durationMs) / durationMs;
            const cx = this.width / 2;
            const cy = this.height / 2;
            const maxR = (size / 2) - 2;

            const easeInOutSine = (t) => 0.5 * (1 - Math.cos(Math.PI * t));
            ctx.shadowColor = colors[0];

            const waveCount = SPRITE_WAVE_COUNT;
            const phasePerWave = SPRITE_PHASE_PER_WAVE;

            for (let i = 0; i < waveCount; i++) {
                const p = (tCycle + i * phasePerWave) % 1;
                const u = p < 0.5 ? (p * 2) : ((1 - p) * 2);
                const radius = maxR * u;

                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);

                const cIdx = i % colors.length;
                ctx.strokeStyle = colors[cIdx];
                ctx.lineWidth = lineWidth;
                const alpha = 0.10 + 0.90 * easeInOutSine(u);
                ctx.globalAlpha = alpha;

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
            mapInstance.addImage(v.name, createWaveSprite(v), { pixelRatio: 2 });
        }
    });
}

// ─────────────────────────────────────────────────────────────
// SETUP
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
                    'icon-image': spriteName,
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
// Utilidades
// ─────────────────────────────────────────────────────────────
function isCanarias(lat, lng) {
    return lat >= 27 && lat <= 29.5 && lng >= -18.5 && lng <= -13.5;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[s]));
}

function pickRandomVariantIndex() {
    return Math.floor(Math.random() * VARIANT_COUNT);
}

// ─────────────────────────────────────────────────────────────
// Billboard
// ─────────────────────────────────────────────────────────────
function showBillboard(mapInstance, text, coordinates) {
    return new Promise(resolve => {
        const container = mapInstance.getContainer();
        const el = document.createElement('div');
        el.className = 'billboard';

        el.innerHTML = `
            <div class="billboard__content">
                <div class="card-container">
                    <div class="main-card-filtered"></div>
                    <div class="glow-layer-1"></div>
                    <div class="glow-layer-2"></div>
                    <div class="content-text-layer">
                        ${escapeHtml(text)}
                    </div>
                    <div class="background-glow"></div>
                </div>
            </div>
        `;

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
// Spotlight
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
// VERIFICAR SI YA EXISTE (en todas las variantes)
// ─────────────────────────────────────────────────────────────
function concesionarioExists(id) {
    // Verificar en ambos mapas, todas las variantes
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan  = `${CAN_SOURCE_PREFIX}${i}`;

        const mainFeatures = getFeatures(map, sMain);
        const canFeatures = getFeatures(canariasMap, sCan);

        if (mainFeatures.some(f => f.properties?.id === id) ||
            canFeatures.some(f => f.properties?.id === id)) {
            return true;
        }
    }

    // Verificar en la cola pendiente
    return pendingQueue.some(item => item.id === id);
}

// ─────────────────────────────────────────────────────────────
// GENERAR PUNTO ALEATORIO A ~50KM
// ─────────────────────────────────────────────────────────────
function generateRandomPointAt50km(lat, lng) {
    // ~50km en grados (aproximadamente 0.45 grados a latitudes medias de España)
    const radiusInDegrees = 0.45;

    // Ángulo aleatorio
    const angle = Math.random() * Math.PI * 2;

    // Ajustar por latitud (los grados de longitud son más cortos en latitudes altas)
    const latCos = Math.cos(lat * Math.PI / 180);

    const deltaLat = radiusInDegrees * Math.sin(angle);
    const deltaLng = (radiusInDegrees * Math.cos(angle)) / latCos;

    return {
        lat: lat + deltaLat,
        lng: lng + deltaLng
    };
}

// ─────────────────────────────────────────────────────────────
// ANIMACIÓN DE RECORRIDO (línea que se dibuja progresivamente)
// ─────────────────────────────────────────────────────────────
function animateRoute(mapInstance, startCoords, endCoords, {
    durationMs = 1500,
    color = '#00d9ff',
    lineWidth = 3
} = {}) {
    return new Promise(resolve => {
        const routeId = `route-${Math.random().toString(36).slice(2)}`;

        // Crear source para la ruta
        mapInstance.addSource(routeId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [startCoords, startCoords] // Inicialmente sin longitud
                }
            }
        });

        // Añadir capa de la línea principal
        mapInstance.addLayer({
            id: `${routeId}-line`,
            type: 'line',
            source: routeId,
            paint: {
                'line-color': color,
                'line-width': lineWidth,
                'line-opacity': 0.8
            }
        });

        // Añadir capa de glow
        mapInstance.addLayer({
            id: `${routeId}-glow`,
            type: 'line',
            source: routeId,
            paint: {
                'line-color': color,
                'line-width': lineWidth + 6,
                'line-opacity': 0.3,
                'line-blur': 4
            }
        });

        // Añadir punto animado que se mueve por la línea
        mapInstance.addSource(`${routeId}-dot`, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: startCoords
                }
            }
        });

        mapInstance.addLayer({
            id: `${routeId}-dot`,
            type: 'circle',
            source: `${routeId}-dot`,
            paint: {
                'circle-radius': 6,
                'circle-color': '#ffffff',
                'circle-opacity': 0.9,
                'circle-stroke-width': 2,
                'circle-stroke-color': color
            }
        });

        // Animación
        const startTime = performance.now();

        function frame(now) {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / durationMs, 1);

            // Easing suave
            const eased = t < 0.5
                ? 2 * t * t
                : 1 - Math.pow(-2 * t + 2, 2) / 2;

            // Interpolar coordenadas
            const currentLng = startCoords[0] + (endCoords[0] - startCoords[0]) * eased;
            const currentLat = startCoords[1] + (endCoords[1] - startCoords[1]) * eased;
            const currentCoords = [currentLng, currentLat];

            // Actualizar línea
            const routeSource = mapInstance.getSource(routeId);
            if (routeSource) {
                routeSource.setData({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [startCoords, currentCoords]
                    }
                });
            }

            // Actualizar punto
            const dotSource = mapInstance.getSource(`${routeId}-dot`);
            if (dotSource) {
                dotSource.setData({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: currentCoords
                    }
                });
            }

            if (t < 1) {
                requestAnimationFrame(frame);
            } else {
                // Fade out al finalizar
                setTimeout(() => {
                    // Fade out gradual
                    let opacity = 0.8;
                    const fadeInterval = setInterval(() => {
                        opacity -= 0.1;
                        if (opacity <= 0) {
                            clearInterval(fadeInterval);

                            // Limpiar
                            if (mapInstance.getLayer(`${routeId}-dot`)) mapInstance.removeLayer(`${routeId}-dot`);
                            if (mapInstance.getLayer(`${routeId}-glow`)) mapInstance.removeLayer(`${routeId}-glow`);
                            if (mapInstance.getLayer(`${routeId}-line`)) mapInstance.removeLayer(`${routeId}-line`);
                            if (mapInstance.getSource(`${routeId}-dot`)) mapInstance.removeSource(`${routeId}-dot`);
                            if (mapInstance.getSource(routeId)) mapInstance.removeSource(routeId);

                            resolve();
                        } else {
                            if (mapInstance.getLayer(`${routeId}-line`)) {
                                mapInstance.setPaintProperty(`${routeId}-line`, 'line-opacity', opacity);
                            }
                            if (mapInstance.getLayer(`${routeId}-glow`)) {
                                mapInstance.setPaintProperty(`${routeId}-glow`, 'line-opacity', opacity * 0.4);
                            }
                            if (mapInstance.getLayer(`${routeId}-dot`)) {
                                mapInstance.setPaintProperty(`${routeId}-dot`, 'circle-opacity', opacity);
                            }
                        }
                    }, 50);
                }, 300); // Espera un poco antes de empezar el fade
            }
        }

        requestAnimationFrame(frame);
    });
}

// ─────────────────────────────────────────────────────────────
// PROCESAR UN SOLO CONCESIONARIO (con animación completa)
// ─────────────────────────────────────────────────────────────
async function processSingleAdherido(concesionario, id) {
    const useCanarias = isCanarias(concesionario.lat, concesionario.lng);
    const mapInstance = useCanarias ? canariasMap : map;
    const prefix      = useCanarias ? CAN_SOURCE_PREFIX : MAIN_SOURCE_PREFIX;

    await ensureMapReady(mapInstance);

    const varIdx   = pickRandomVariantIndex();
    const sourceId = `${prefix}${varIdx}`;

    const feature = {
        type: 'Feature',
        properties: { id, name: concesionario.razonSocial },
        geometry: { type: 'Point', coordinates: [concesionario.lng, concesionario.lat] }
    };

    try {
        console.log(`🎬 Iniciando animación para: ${concesionario.razonSocial}`);

        // 1. Mostrar billboard
        await showBillboard(mapInstance, concesionario.razonSocial, feature.geometry.coordinates);

        // 2. Spotlight
        await runSpotlightMulti(mapInstance, feature.geometry.coordinates);

        // 3. Generar punto destino aleatorio a ~50km
        const destino = generateRandomPointAt50km(concesionario.lat, concesionario.lng);
        const destinoCoords = [destino.lng, destino.lat];

        console.log(`🛣️  Trazando recorrido hacia [${destino.lat.toFixed(4)}, ${destino.lng.toFixed(4)}]`);

        // 4. Animar recorrido
        await animateRoute(mapInstance, feature.geometry.coordinates, destinoCoords);

        // 5. Añadir el punto al mapa
        const next = [...getFeatures(mapInstance, sourceId), feature];
        setFeatures(mapInstance, sourceId, next);

        console.log(`✅ ${concesionario.razonSocial} añadido correctamente`);
    } catch (error) {
        console.error(`❌ Error procesando ${id}:`, error);
    }
}

// ─────────────────────────────────────────────────────────────
// PROCESADOR DE COLA (uno por uno con pausa entre cada uno)
// ─────────────────────────────────────────────────────────────
async function processQueue() {
    if (isProcessing) {
        console.log('⏳ Ya hay un procesamiento en curso');
        return;
    }

    if (pendingQueue.length === 0) {
        console.log('✓ Cola vacía');
        return;
    }

    isProcessing = true;
    console.log(`🚀 Iniciando procesamiento de ${pendingQueue.length} concesionarios...`);

    while (pendingQueue.length > 0) {
        const item = pendingQueue.shift(); // Sacar el primero

        // Procesar este concesionario
        await processSingleAdherido(item.concesionario, item.id);

        // Pausa antes del siguiente (si quedan más)
        if (pendingQueue.length > 0) {
            console.log(`⏸️  Pausa de ${ANIMATION_CONFIG.delayBetweenMs}ms... (${pendingQueue.length} restantes)`);
            await new Promise(resolve => setTimeout(resolve, ANIMATION_CONFIG.delayBetweenMs));
        }
    }

    console.log('✅ Cola procesada completamente');
    isProcessing = false;
}

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────
export function addAdherido(concesionario, id) {
    // Verificar duplicados
    if (concesionarioExists(id)) {
        console.log(`⚠️ Concesionario ${id} ya existe o está en cola, ignorando`);
        return;
    }

    // Añadir a la cola
    pendingQueue.push({ concesionario, id });
    console.log(`📥 "${concesionario.razonSocial}" añadido a la cola (posición ${pendingQueue.length})`);

    // Iniciar procesamiento si no está en marcha
    if (!isProcessing) {
        processQueue();
    }
}

export function removeAdherido(id) {
    // Quitar de la cola si está pendiente
    const queueIndex = pendingQueue.findIndex(item => item.id === id);
    if (queueIndex !== -1) {
        pendingQueue.splice(queueIndex, 1);
        console.log(`🗑️ Concesionario ${id} eliminado de la cola`);
    }

    // Quitar de todas las variantes de ambos mapas
    for (let i = 0; i < VARIANT_COUNT; i++) {
        const sMain = `${MAIN_SOURCE_PREFIX}${i}`;
        const sCan  = `${CAN_SOURCE_PREFIX}${i}`;
        const nextMain = getFeatures(map, sMain).filter(f => f.properties?.id !== id);
        const nextCan  = getFeatures(canariasMap, sCan).filter(f => f.properties?.id !== id);
        setFeatures(map, sMain, nextMain);
        setFeatures(canariasMap, sCan, nextCan);
    }

    console.log(`🗑️ Concesionario ${id} eliminado de los mapas`);
}

// Función para obtener el estado de la cola
export function getQueueStatus() {
    return {
        pending: pendingQueue.length,
        processing: isProcessing,
        config: ANIMATION_CONFIG
    };
}

// Función para ajustar el delay entre animaciones
export function setAnimationDelay(milliseconds) {
    ANIMATION_CONFIG.delayBetweenMs = milliseconds;
    console.log(`⚙️ Delay ajustado a ${milliseconds}ms`);
}