
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Mapa principal
export const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-3.7038, 40.4168],
    zoom: 5
});


map.fitBounds([
    [-9.5, 35.0], // Ceuta y Melilla incluidas
    [4.6, 43.8]
]);


// Mini-mapa Canarias
export const canariasMap = new mapboxgl.Map({
    container: 'canarias-map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-15.5, 28.3],
    zoom: 5.7
});

const adheridosSourceId = 'adheridos';
const adheridosCanariasSourceId = 'adheridos-canarias';

// ✅ Multi-wave animación
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

// ✅ Configuración para ambos mapas
function setupMap(mapInstance, sourceId) {
    mapInstance.addImage('multi-wave-dot', createMultiWaveDot(), { pixelRatio: 2 });
    mapInstance.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    mapInstance.addLayer({
        id: `${sourceId}-wave`,
        type: 'symbol',
        source: sourceId,
        layout: {
            'icon-image': 'multi-wave-dot',
            'icon-size': 0.4,
            'icon-allow-overlap': true
        }
    });
}

map.on('load', () => setupMap(map, adheridosSourceId));
canariasMap.on('load', () => setupMap(canariasMap, adheridosCanariasSourceId));

// ✅ Helpers
function getFeatures(mapInstance, sourceId) {
    const src = mapInstance.getSource(sourceId);
    if (!src) return [];
    const data = src._data || src._options.data;
    return data?.features || [];
}

function setFeatures(mapInstance, sourceId, features) {
    const src = mapInstance.getSource(sourceId);
    if (src) src.setData({ type: 'FeatureCollection', features });
}

// ✅ Detectar Canarias
function isCanarias(lat, lng) {
    return lat >= 27 && lat <= 29.5 && lng >= -18.5 && lng <= -13.5;
}

// ✅ Añadir marcador en el mapa correcto
export function addAdherido(concesionario, id) {
    const feature = {
        type: 'Feature',
        properties: { id, name: concesionario.razonSocial },
        geometry: { type: 'Point', coordinates: [concesionario.lng, concesionario.lat] }
    };

    if (isCanarias(concesionario.lat, concesionario.lng)) {
        const features = getFeatures(canariasMap, adheridosCanariasSourceId);
        if (!features.some(f => f.properties?.id === id)) {
            setFeatures(canariasMap, adheridosCanariasSourceId, [...features, feature]);
        }
    } else {
        const features = getFeatures(map, adheridosSourceId);
        if (!features.some(f => f.properties?.id === id)) {
            setFeatures(map, adheridosSourceId, [...features, feature]);
        }
    }
}

// ✅ Quitar marcador
export function removeAdherido(id) {
    const featuresMain = getFeatures(map, adheridosSourceId);
    const featuresCanarias = getFeatures(canariasMap, adheridosCanariasSourceId);

    setFeatures(map, adheridosSourceId, featuresMain.filter(f => f.properties?.id !== id));
    setFeatures(canariasMap, adheridosCanariasSourceId, featuresCanarias.filter(f => f.properties?.id !== id));
}
