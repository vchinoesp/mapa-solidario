
import 'mapbox-gl/dist/mapbox-gl.css';
import './style.scss';
import { renderSidebar } from './js/sidebar.js';
import { loadActivosDesdeJson, bootstrapActivos, startPhpPollingActivos } from './js/map.js';

const PRIMARY_URL = '/data/concesionarios_v2.json';
const FALLBACK_URL = '/data/concesionarios.json';

// Carga de datos para la sidebar (sin bloquear el mapa)
window.addEventListener('load', () => {
    fetch(PRIMARY_URL)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(concesionarios => {
            console.log('[main] sidebar JSON ok:', { url: PRIMARY_URL, count: Array.isArray(concesionarios) ? concesionarios.length : 0 });
            renderSidebar(concesionarios);
        })
        .catch(async (err) => {
            console.warn('[main] fallo en primaria â†’ probamos fallback:', PRIMARY_URL, 'â†’', FALLBACK_URL, err);
            try {
                const res2 = await fetch(FALLBACK_URL);
                if (!res2.ok) throw new Error(`Fallback HTTP ${res2.status}`);
                const json2 = await res2.json();
                console.log('[main] sidebar JSON fallback ok:', { fallbackUrl: FALLBACK_URL, count: Array.isArray(json2) ? json2.length : 0 });
                renderSidebar(json2);
            } catch (e2) {
                console.error('[main] Error cargando JSON para la sidebar:', e2);
            }
        });
});

// Enciende en frÃ­o las activas cuando ambos mapas estÃ¡n listos
window.addEventListener('maps:ready', async () => {
    console.log('[main] maps:ready â†’ bootstrapActivos (PHPâ†’local) + polling');
    try {
        // Bootstrap de datos: intenta PHP (aunque aÃºn no se use su retorno), y usa locales (primaryâ†’fallback)
        await bootstrapActivos({
            phpUrl: '/api/concesionarios.php',
            localUrls: ['/data/concesionarios_v2_with_ids.json', PRIMARY_URL, FALLBACK_URL]
        });
    } catch (e1) {
        console.warn('[main] bootstrapActivos fallÃ³; intentamos fallback directo:', e1);
        try {
            await loadActivosDesdeJson(PRIMARY_URL);
        } catch (e2) {
            console.warn('[main] loadActivosDesdeJson primaria fallÃ³; probamos fallback', e2);
            try {
                await loadActivosDesdeJson(FALLBACK_URL);
            } catch (e3) {
                console.error('[main] Error cargando activos (primaria y fallback):', e3);
            }
        }
    }

    // Arranca polling de IDs activos cada ~30s (cuando el PHP estÃ© operativo devolverÃ¡ [ids numÃ©ricos])

    startPhpPollingActivos('/api/activos.php', 80000, {
        mock: true,
        randomCounts: [1],           // <- primer tick: 1
        randomPoolAfterFirst: [2,4]  // <- ticks siguientes: elige aleatoriamente 2 Ã³ 4
    });

});

// Sincroniza contadores globales al cargar activos en frÃ­o
window.addEventListener('activos:loaded', (e) => {
    const count = e?.detail?.count ?? 0;
    console.log('[main] activos:loaded â†’ count =', count, 'ids:', e?.detail?.ids?.length ?? 0);
    const panelEl = document.getElementById('adheridas');
    const hudEl = document.getElementById('hud-adheridas');
    if (panelEl) panelEl.textContent = count;
    if (hudEl) hudEl.textContent = count;
});
