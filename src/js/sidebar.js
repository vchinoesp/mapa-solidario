
// src/js/sidebar.js

// === Clave estable (MISMA fÃ³rmula que en map.js â†’ addActiveSilent/computeStableId)
function computeActiveKey(c) {
    const name = (c.Nombre_placa ?? c.Nombre_placafinal ?? c.Nombre ?? '').toString();
    return `act-${name}-${Number(c.lat).toFixed(5)}-${Number(c.lng).toFixed(5)}`;
}

// Guardamos claves activas recibidas en frÃ­o por si la lista aÃºn no estÃ¡ renderizada
let __pendingActiveKeys = null;

// Necesitamos estas funciones del mapa (pipeline/cola)
import { addAdherido, removeAdherido } from './map.js';

// Estado local de la sidebar
let adheridasCount = 0;
// Para evitar subir dos veces el contador, conservamos los ids ya contados.
// Ojo: aquÃ­ usamos el MISMO id que incrementa el contador:
//  - En flujo manual: el id es el Ã­ndice de la lista (string).
//  - En flujo backend: usamos la CLAVE ESTABLE (string) que nos llega en 'adherido:painted' vÃ­a concesionario.
const activeIds = new Set();

function updateCounters() {
    const panelEl = document.getElementById('adheridas');
    const hudEl = document.getElementById('hud-adheridas');
    if (panelEl) panelEl.textContent = String(adheridasCount);
    if (hudEl) hudEl.textContent = String(adheridasCount);
}

function applyActiveMarksToList(keysSet) {
    const lista = document.getElementById('lista-concesionarios');
    if (!lista || !(keysSet instanceof Set)) return;
    let applied = 0;
    lista.querySelectorAll('li').forEach((li) => {
        const key = li.dataset.key;
        if (key && keysSet.has(key)) {
            if (!li.classList.contains('selected')) li.classList.add('selected');
            applied++;
        }
    });
    console.log('[sidebar] marcados desde activos:loaded â†’', applied);
}

// === Evento desde el mapa cuando carga activos en frÃ­o (sin animaciÃ³n)
window.addEventListener('activos:loaded', (e) => {
    try {
        adheridasCount = e?.detail?.count ?? 0;
        const ids = Array.isArray(e?.detail?.ids) ? e.detail.ids : [];
        console.log('[sidebar] activos:loaded â†’ count:', adheridasCount, 'ids:', ids.length);

        const keys = new Set(ids); // ids aquÃ­ ya son â€œclaves establesâ€
        __pendingActiveKeys = keys;
        applyActiveMarksToList(keys);
        updateCounters();
    } catch (err) {
        console.warn('[sidebar] activos:loaded handler fallo:', err);
    }
});

// === Render de la sidebar con la lista completa
export function renderSidebar(concesionarios) {
    const lista = document.getElementById('lista-concesionarios');
    if (!lista) {
        console.warn('[sidebar] #lista-concesionarios no encontrado');
        return;
    }

    lista.innerHTML = '';

    const all = Array.isArray(concesionarios) ? concesionarios : [];
    const valid = all.filter(
        (c) =>
            typeof c.lat === 'number' &&
            typeof c.lng === 'number' &&
            c.lat >= 27 &&
            c.lat <= 44 &&
            c.lng >= -19 &&
            c.lng <= 6
    );

    console.log('[sidebar] renderSidebar â†’ total:', all.length, 'validos:', valid.length);

    valid.forEach((c, index) => {
        const li = document.createElement('li');

        const displayName =
            c.Nombre_placafinal ??
            c.Nombre ??
            c.Nombre_placa ??
            c.razonSocial ??
            'â€”';

        const localidad = c.Localidad ?? c.localidad ?? '';

        // Texto visible
        li.textContent = `${displayName} (${localidad})`;

        // id de fila (flujo manual) y â€œclave estableâ€ (cross con mapa)
        li.dataset.id = String(index);
        li.dataset.key = computeActiveKey(c);

        // Clic manual â†’ encola en el pipeline del mapa (spotlight, zoom, billboard, etc.)
        li.addEventListener('click', () => {
            const rowId = li.dataset.id; // Ã­ndice lista (string)
            if (li.classList.contains('selected')) {
                // Deseleccionar
                li.classList.remove('selected');
                if (activeIds.has(rowId)) {
                    activeIds.delete(rowId);
                    removeAdherido(rowId);
                    adheridasCount = Math.max(0, adheridasCount - 1);
                    updateCounters();
                }
            } else {
                // Seleccionar
                li.classList.add('selected');
                if (!activeIds.has(rowId)) {
                    activeIds.add(rowId);

                    // Payload para el mapa (Nombre normalizado)
                    const payload = {
                        ...c,
                        Nombre: displayName,
                        localidad: localidad,
                    };

                    console.log('[sidebar] click â†’ addAdherido', {
                        id: rowId,
                        displayName,
                        lat: c.lat,
                        lng: c.lng,
                    });

                    // OJO: en clic manual mantenemos incremento inmediato (como acordamos)
                    addAdherido(payload, rowId);
                    adheridasCount += 1;
                    updateCounters();
                }
            }
        });

        lista.appendChild(li);
    });

    // Si el mapa ya mandÃ³ los activos en frÃ­o, marcamos ahora
    if (__pendingActiveKeys instanceof Set) {
        applyActiveMarksToList(__pendingActiveKeys);
    }
}

/* === Eventos â€œbackend/mockâ€ ===
   - 'adherido:add': marca el LI correspondiente (NO sube contador).
   - 'adherido:painted': cuando el mapa empieza a pintar, subimos el contador SOLO si origin === 'backend'.
*/

// Marca LI al recibir 'adherido:add' (no sube contador aquÃ­)
window.addEventListener('adherido:add', (e) => {
    try {
        const { concesionario } = e.detail ?? {};
        if (!concesionario) return;

        // Normalizamos Nombre por si viene como razonSocial
        const normalized = {
            ...concesionario,
            Nombre: concesionario.Nombre ?? concesionario.razonSocial,
        };
        const key = computeActiveKey(normalized);

        const lista = document.getElementById('lista-concesionarios');
        if (!lista) return;

        const li = lista.querySelector(`li[data-key="${CSS.escape(key)}"]`);
        if (li && !li.classList.contains('selected')) {
            li.classList.add('selected');
        }
    } catch (err) {
        console.warn('[sidebar] adherido:add handler fallo:', err);
    }
});

// Sube contador cuando el mapa empieza a pintar (solo si origin === 'backend')
window.addEventListener('adherido:painted', (e) => {
    try {
        const { id, concesionario, origin } = e.detail ?? {};
        if (origin !== 'backend') return; // evita doble conteo en flujo manual
        if (typeof id !== 'string') return;

        // Para backend, usamos la CLAVE ESTABLE como id lÃ³gico de conteo
        let keyId = id;

        // Si la UI aÃºn no lo marcÃ³, asegÃºrate de marcar el LI correcto
        const lista = document.getElementById('lista-concesionarios');
        if (lista && concesionario) {
            const normalized = {
                ...concesionario,
                Nombre: concesionario.Nombre ?? concesionario.razonSocial,
            };
            const key = computeActiveKey(normalized);
            keyId = key; // mantenemos coherencia con la clave estable

            const li = lista.querySelector(`li[data-key="${CSS.escape(key)}"]`);
            if (li && !li.classList.contains('selected')) {
                li.classList.add('selected');
            }
        }

        // Subir contador si no estÃ¡ contado ya
        if (!activeIds.has(keyId)) {
            activeIds.add(keyId);
            adheridasCount += 1;
            updateCounters();
        }
    } catch (err) {
        console.warn('[sidebar] adherido:painted handler fallo:', err);
    }
});
