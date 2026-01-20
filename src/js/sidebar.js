
// src/js/sidebar.js

// === Clave estable (MISMA fórmula que en map.js — addActiveSilent/computeStableId)
function computeActiveKey(c) {
    const name = (c.Nombre_placa ?? c.Nombre_placafinal ?? c.Nombre ?? '').toString();
    return `act-${name}-${Number(c.lat).toFixed(5)}-${Number(c.lng).toFixed(5)}`;
}

// Guardamos claves activas recibidas en frío por si la lista aún no está renderizada
let __pendingActiveKeys = null;

// Necesitamos estas funciones del mapa (pipeline/cola)
import { addAdherido, removeAdherido } from './map.js';

// Estado local de la sidebar
let adheridasCount = 0;

// Para evitar doble conteo, ahora SIEMPRE usamos la CLAVE ESTABLE como ID de conteo.
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
    console.log('[sidebar] marcados desde activos:loaded —', applied);
}

// === Evento desde el mapa cuando carga activos en frío (sin animación)
window.addEventListener('activos:loaded', (e) => {
    try {
        adheridasCount = e?.detail?.count ?? 0;
        const ids = Array.isArray(e?.detail?.ids) ? e.detail.ids : [];
        console.log('[sidebar] activos:loaded — count:', adheridasCount, 'ids:', ids.length);

        // ids ya son claves estables (act-...)
        const keys = new Set(ids);
        __pendingActiveKeys = keys;

        // Los reflejamos visualmente en la lista
        applyActiveMarksToList(keys);

        // NOTA: aquí NO rellenamos activeIds porque el contador en frío
        // ya viene aplicado desde el mapa; mantenemos el set coherente
        // solo cuando se pinte en tiempo real (adherido:painted).

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
    console.log('[sidebar] renderSidebar — total:', all.length, 'validos:', valid.length);

    valid.forEach((c) => {
        const li = document.createElement('li');

        const displayName =
            c.Nombre_placafinal ??
            c.Nombre ??
            c.Nombre_placa ??
            c.razonSocial ??
            '—';

        const localidad = c.Localidad ?? c.localidad ?? '';

        // Texto visible
        li.textContent = `${displayName} (${localidad})`;

        // Normalizamos payload y calculamos la CLAVE ESTABLE (misma que backend)
        const payload = {
            ...c,
            Nombre: displayName,
            localidad: localidad,
        };
        const stableId = computeActiveKey(payload);

        // Clave estable como única “fuente de verdad”
        li.dataset.key = stableId;

        // Clic manual — encola en el pipeline del mapa con la MISMA clave estable que backend
        li.addEventListener('click', () => {
            if (li.classList.contains('selected')) {
                // Deseleccionar manual (si NO quieres permitir esto en el evento, puedes desactivar este bloque)
                li.classList.remove('selected');

                // Si ya estaba contado, decrementamos
                if (activeIds.has(stableId)) {
                    activeIds.delete(stableId);
                    removeAdherido(stableId);
                    adheridasCount = Math.max(0, adheridasCount - 1);
                    updateCounters();
                } else {
                    // Si no estaba contado aún (p.ej., pendiente en cola), solo lo quitamos visualmente
                    removeAdherido(stableId);
                }
            } else {
                // Seleccionar
                li.classList.add('selected');

                // Enviamos al mapa. OJO: NO incrementamos contador aquí; se hará en 'adherido:painted'.
                if (!activeIds.has(stableId)) {
                    console.log('[sidebar] click — addAdherido', {
                        id: stableId,
                        displayName,
                        lat: c.lat,
                        lng: c.lng,
                    });
                    addAdherido(payload, stableId);
                }
            }
        });

        lista.appendChild(li);
    });

    // Si el mapa ya mandó los activos en frío, los marcamos ahora visualmente
    if (__pendingActiveKeys instanceof Set) {
        applyActiveMarksToList(__pendingActiveKeys);
    }
}

/* === Eventos “backend/mock/unificados”
   - 'adherido:add': marca el LI correspondiente (NO sube contador).
   - 'adherido:painted': cuando el mapa empieza a pintar, subimos el contador para ambos orígenes.
*/

// Marca LI al recibir 'adherido:add' (no sube contador aquí)
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

// Sube contador cuando el mapa empieza a pintar (manual y backend usan la misma clave estable)
window.addEventListener('adherido:painted', (e) => {
    try {
        const { id, concesionario /*, origin*/ } = e.detail ?? {};
        if (typeof id !== 'string') return;

        // Aseguramos marcar visualmente el LI, por si aún no estaba marcado
        const lista = document.getElementById('lista-concesionarios');
        let keyId = id;

        if (lista && concesionario) {
            const normalized = {
                ...concesionario,
                Nombre: concesionario.Nombre ?? concesionario.razonSocial,
            };
            const key = computeActiveKey(normalized);
            keyId = key; // coherencia con la clave estable

            const li = lista.querySelector(`li[data-key="${CSS.escape(key)}"]`);
            if (li && !li.classList.contains('selected')) {
                li.classList.add('selected');
            }
        }

        // Subir contador si no está contado ya (clave estable)
        if (!activeIds.has(keyId)) {
            activeIds.add(keyId);
            adheridasCount += 1;
            updateCounters();
        }
    } catch (err) {
        console.warn('[sidebar] adherido:painted handler fallo:', err);
    }
});
