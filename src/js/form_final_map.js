
import mapboxgl from 'mapbox-gl'
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

/* ========= VISTAS ========= */
const MAIN_VIEW = {
    center: [-3.6256, 39.9365],
    zoom: 5.4,
    bearing: 0,
    pitch: 0
}

const CAN_VIEW = {
    center: [-15.4586, 28.4226],
    zoom: 5.55,
    bearing: 0,
    pitch: 0
}

/* ========= UTIL ========= */
function isCanarias(lat, lng) {
    return lat >= 27 && lat <= 29.5 && lng >= -18.5 && lng <= -13.5
}

/* ========= MAPAS ========= */
let mapMain, mapCan
let MAIN_FEATURES = []
let CAN_FEATURES = []

/* ========= WAVE SPRITES (copiado/adaptado) ========= */
const WAVE_VARIANTS = [
    { name: 'pulse-a', durationMs: 1700, phaseMs: 0, colors: ['#646B52', '#8b9f1a', '#c2de21'], lineWidth: 4 },
    { name: 'pulse-b', durationMs: 2100, phaseMs: 240, colors: ['#c2de21', '#8b9f1a'], lineWidth: 3.8 },
]
const SPRITE_COUNT = 4
const PHASE_STEP = 0.2

function createWaveSprite({ durationMs, phaseMs, colors, lineWidth }) {
    const size = 220

    return {
        width: size,
        height: size,
        data: new Uint8Array(size * size * 4),

        onAdd() {
            const canvas = document.createElement('canvas')
            canvas.width = size
            canvas.height = size
            this.ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
        },

        render() {
            const ctx = this.ctx
            ctx.clearRect(0, 0, size, size)
            const t = ((performance.now() + phaseMs) % durationMs) / durationMs
            const cx = size / 2
            const cy = size / 2
            const maxR = cx - 2

            for (let i = 0; i < SPRITE_COUNT; i++) {
                const p = (t + i * PHASE_STEP) % 1
                const u = p < 0.5 ? p * 2 : (1 - p) * 2
                ctx.beginPath()
                ctx.arc(cx, cy, maxR * u, 0, Math.PI * 2)
                ctx.strokeStyle = colors[i % colors.length]
                ctx.lineWidth = lineWidth
                ctx.globalAlpha = 0.15 + 0.8 * u
                ctx.stroke()
            }

            this.data.set(ctx.getImageData(0, 0, size, size).data)
            mapMain?.triggerRepaint()
            mapCan?.triggerRepaint()
            return true
        }
    }
}

/* ========= INIT ========= */
function initMap(container, view) {
    return new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/dark-v11',
        ...view
    })
}

function addSourcesAndLayers(map, sourceId) {
    WAVE_VARIANTS.forEach(v => {
        if (!map.hasImage(v.name)) {
            map.addImage(v.name, createWaveSprite(v), { pixelRatio: 2 })
        }
    })

    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        })
    }

    if (!map.getLayer(sourceId + '-layer')) {
        map.addLayer({
            id: sourceId + '-layer',
            type: 'symbol',
            source: sourceId,
            layout: {
                'icon-image': WAVE_VARIANTS[0].name,
                'icon-size': 0.42,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true
            }
        })
    }
}

/* ========= API PUBLICA ========= */
export function initFinalMaps() {
    mapMain = initMap('final-map', MAIN_VIEW)
    mapCan = initMap('final-map-canarias', CAN_VIEW)

    mapMain.on('load', () => addSourcesAndLayers(mapMain, 'final-main'))
    mapCan.on('load', () => addSourcesAndLayers(mapCan, 'final-can'))

    requestAnimationFrame(() => {
        mapMain.resize()
        mapCan.resize()
    })
}

export function addFinalMark({ lat, lng, razonSocial }) {
    const feature = {
        type: 'Feature',
        properties: { name: razonSocial },
        geometry: { type: 'Point', coordinates: [lng, lat] }
    }

    if (isCanarias(lat, lng)) {
        CAN_FEATURES.push(feature)
        mapCan.getSource('final-can')?.setData({
            type: 'FeatureCollection',
            features: CAN_FEATURES
        })
        mapCan.flyTo({ center: [lng, lat], zoom: 7.2, speed: 0.8 })
    } else {
        MAIN_FEATURES.push(feature)
        mapMain.getSource('final-main')?.setData({
            type: 'FeatureCollection',
            features: MAIN_FEATURES
        })
        mapMain.flyTo({ center: [lng, lat], zoom: 7.6, speed: 0.8 })
    }
}
