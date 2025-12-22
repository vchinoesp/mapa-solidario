
// src/js/form_final_map.js
import mapboxgl from 'mapbox-gl';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Vista inicial (igual a la “main” del formulario)
const DEFAULT_VIEW = {
    center: [-0.9650825732737474, 39.83517079485031],
    zoom: 4.323536938191295,
    bearing: 0,
    pitch: 0
};

// Variantes pulse (mismo look que el mapa principal)
const WAVE_VARIANTS = [
    { name: 'pulse-blue-2000',    durationMs: 2000, phaseMs: 160, colors: ['#00d9ff', '#0077ff', '#004d7a'], lineWidth: 4 },
    { name: 'pulse-magenta-2600', durationMs: 2600, phaseMs: 480, colors: ['#FF4DFF', '#CC33FF', '#7A1FFF'], lineWidth: 3.8 }
];

const SPRITE_WAVE_COUNT = 4, SPRITE_PHASE_PER_WAVE = 0.20,
    SPRITE_LINE_WIDTH  = 3.2, SPRITE_SHADOW_BASE = 18;

function createWaveSprite({ durationMs, phaseMs = 0, colors, lineWidth = SPRITE_LINE_WIDTH }) {
    const size = 220;
    const dot = {
        width: size, height: size, data: new Uint8Array(size * size * 4),
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
            const cx = this.width / 2, cy = this.height / 2, maxR = (size / 2) - 2;
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

            if (window.__finalMapInstance) window.__finalMapInstance.triggerRepaint();
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

/** Utilidad: genera una ruta “orgánica” (bezier) del origen al destino */
function makeBezierRoute(origin, dest) {
    const [lng0, lat0] = origin;
    const [lng1, lat1] = dest;

    // Control points con pequeñas desviaciones para que sea “S” orgánica
    const dx = lng1 - lng0, dy = lat1 - lat0;
    const mx = lng0 + dx * 0.5, my = lat0 + dy * 0.5;
    const nx = lng0 + dx * 0.25, ny = lat0 + dy * 0.25;
    const px = lng0 + dx * 0.75, py = lat0 + dy * 0.75;
    const off = 0.6 * (Math.sign(dy || 1)) * (1 / (Math.abs(dx) + 0.5)); // offset lateral

    const c1 = [nx - off, ny + off]; // primer control
    const c2 = [px + off, py - off]; // segundo control

    const points = [];
    const steps = 120;
    const cubic = (t, p0, p1, p2, p3) => {
        const u = 1 - t;
        return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
    };

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lng = cubic(t, lng0, c1[0], c2[0], lng1);
        const lat = cubic(t, lat0, c1[1], c2[1], lat1);
        points.push([lng, lat]);
    }
    return points;
}

let map;
let routeSourceId = 'final-route-src';
let pulseSourceId = 'final-pulse-src';
let routeLayerId  = 'final-route-layer';
let pulseLayerId  = 'final-pulse-layer';

function buildMapIfNeeded() {
    if (map) return map;
    map = new mapboxgl.Map({
        container: 'final-map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: DEFAULT_VIEW.center,
        zoom: DEFAULT_VIEW.zoom,
        bearing: DEFAULT_VIEW.bearing,
        pitch: DEFAULT_VIEW.pitch
    });
    window.__finalMapInstance = map;

    map.on('load', () => {
        addWaveImages(map);

        // Fuente y capa de la ruta
        map.addSource(routeSourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: routeLayerId,
            type: 'line',
            source: routeSourceId,
            paint: {
                'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.6, 6, 4.2, 8, 6.0],
                'line-opacity': 0.95,
                'line-cap': 'round',
                'line-join': 'round',
                // Gradiente azul → magenta usando line-progress
                'line-gradient': [
                    'interpolate', ['linear'], ['line-progress'],
                    0.0, '#00E5FF',
                    0.5, '#00d9ff',
                    1.0, '#FF4DFF'
                ]
            }
        });

        // Fuente y capa del pulse en destino
        map.addSource(pulseSourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: pulseLayerId,
            type: 'symbol',
            source: pulseSourceId,
            layout: {
                'icon-image': 'pulse-magenta-2600', // adherida → magenta
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-size': [
                    'interpolate', ['linear'], ['zoom'],
                    3, 0.30,
                    5, 0.42,
                    7, 0.52
                ]
            }
        });
    });

    return map;
}

/** Anima la ruta y la cámara: fly a destino, dibuja ruta y vuelve a vista inicial */
export function runFinalMapAnimation({ razonSocial, lat, lng }) {
    const m = buildMapIfNeeded();

    // Espera a que el estilo esté cargado
    const whenReady = m.loaded() ? Promise.resolve() : new Promise(res => m.once('load', res));

    whenReady.then(() => {
        // 1) Destino + pulse
        const dest = [lng, lat];
        const pulseFC = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: { razonSocial },
                geometry: { type: 'Point', coordinates: dest }
            }]
        };
        m.getSource(pulseSourceId)?.setData(pulseFC);

        // 2) FlyTo al destino (ligero zoom)
        m.flyTo({ center: dest, zoom: 6.8, speed: 0.9, curve: 1.25, essential: true });

        // 3) Ruta desde la vista inicial al destino (bezier orgánica) + animación
        const origin = DEFAULT_VIEW.center;
        const routePoints = makeBezierRoute(origin, dest);
        const routeFC = { type: 'FeatureCollection', features: [] };
        m.getSource(routeSourceId)?.setData(routeFC);

        let idx = 0;
        const step = () => {
            if (idx >= routePoints.length) {
                // 4) Pequeña pausa y volver a vista inicial
                setTimeout(() => {
                    m.flyTo({ center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom, speed: 0.9, curve: 1.2, essential: true });
                    // Opcional: limpiar la ruta tras volver
                    setTimeout(() => {
                        m.getSource(routeSourceId)?.setData({ type: 'FeatureCollection', features: [] });
                    }, 800);
                }, 700);
                return;
            }
            const seg = routePoints.slice(0, idx + 1);
            const feature = {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: seg }
            };
            m.getSource(routeSourceId)?.setData({ type: 'FeatureCollection', features: [feature] });
            idx += 2; // velocidad de dibujado (ajusta al gusto)
            requestAnimationFrame(step);
        };

        // Arranca animación tras un pequeño delay para sincronizar con el flyTo
        setTimeout(step, 280);
    });
}
