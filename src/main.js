
import 'mapbox-gl/dist/mapbox-gl.css';
import './style.scss';

import { renderSidebar } from './js/sidebar.js';
import {
    loadActivosDesdeJson,
    bootstrapActivos,
    startPhpPollingActivos
} from './js/map.js';

// ÚNICA fuente local para pruebas
const LOCAL_DATA_URL = '/data/concesionarios_v2_with_ids.json';

// Carga de datos para la sidebar (no bloquea el mapa)
window.addEventListener('load', () => {
    fetch(LOCAL_DATA_URL)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(concesionarios => {
            console.log('[main] sidebar JSON ok:', {
                url: LOCAL_DATA_URL,
                count: Array.isArray(concesionarios) ? concesionarios.length : 0
            });
            renderSidebar(concesionarios);
        })
        .catch((err) => {
            console.error('[main] Error cargando JSON para la sidebar:', err);
            renderSidebar([]); // que no falle la UI
        });
});

// Enciende en frío las activas cuando ambos mapas estén listos
window.addEventListener('maps:ready', async () => {
    console.log('[main] maps:ready — bootstrapActivos (local fallback)');

    try {
        // Bootstrap usando SOLO el JSON local por ahora
        await bootstrapActivos({
            phpUrl: null,              // aún no usamos PHP
            localUrls: [LOCAL_DATA_URL]
        });
    } catch (e1) {
        console.warn('[main] bootstrapActivos falló; intentamos carga directa local:', e1);
        try {
            await loadActivosDesdeJson(LOCAL_DATA_URL);
        } catch (e2) {
            console.error('[main] Error cargando activos desde local:', e2);
        }
    }

    // Si quieres ir probando el flujo de backend con mock aleatorio,
    // puedes activar el polling en modo mock (quita esto si no lo necesitas):
    startPhpPollingActivos(null, 60000, {
        mock: true,
        randomCounts: [1],           // primer tick: 1
        randomPoolAfterFirst: [2,4]  // siguientes ticks: 2 ó 4
    });
});

// Sincroniza contadores globales al cargar activos en frío
window.addEventListener('activos:loaded', (e) => {
    const count = e?.detail?.count ?? 0;
    console.log('[main] activos:loaded — count =', count, 'ids:', e?.detail?.ids?.length ?? 0);

    const panelEl = document.getElementById('adheridas');
    const hudEl = document.getElementById('hud-adheridas');
    if (panelEl) panelEl.textContent = count;
    if (hudEl) hudEl.textContent = count;
});
