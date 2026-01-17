
// === Clave estable (misma fórmula que usa map.js en addActiveSilent)
function computeActiveKey(c){
    const name = (c.Nombre_placa || c.Nombre_placafinal || c.Nombre || '').toString();
    return `act-${name}-${Number(c.lat).toFixed(5)}-${Number(c.lng).toFixed(5)}`;
}

// Si 'activos:loaded' llega antes de renderizar, guardamos el set de claves
let __pendingActiveKeys = null;

import { addAdherido, removeAdherido } from './map.js';

let adheridasCount = 0;
const activeIds = new Set();

function updateCounters() {
    const panelEl = document.getElementById('adheridas');
    const hudEl = document.getElementById('hud-adheridas');
    if (panelEl) panelEl.textContent = adheridasCount;
    if (hudEl) hudEl.textContent = adheridasCount;
}

function applyActiveMarksToList(keysSet) {
    const lista = document.getElementById('lista-concesionarios');
    if (!lista || !(keysSet instanceof Set)) return;
    let applied = 0;
    lista.querySelectorAll('li').forEach(li => {
        const key = li.dataset.key;
        if (key && keysSet.has(key)) {
            if (!li.classList.contains('selected')) li.classList.add('selected');
            if (!activeIds.has(li.dataset.id)) activeIds.add(li.dataset.id);
            applied++;
        }
    });
    console.log('[sidebar] marcados desde activos:loaded →', applied);
}

// Ajusta contador y marca LI cuando el mapa termine de pintar las activas "en frío"
window.addEventListener('activos:loaded', (e) => {
    adheridasCount = e?.detail?.count ?? 0;
    const ids = e?.detail?.ids || [];
    console.log('[sidebar] activos:loaded → count:', adheridasCount, 'ids:', ids.length);

    const keys = new Set(ids);
    __pendingActiveKeys = keys;      // por si la lista no está aún
    applyActiveMarksToList(keys);    // si ya está, marcamos ahora
    updateCounters();
});

// ==== Render de la sidebar
export function renderSidebar(concesionarios) {
    const lista = document.getElementById('lista-concesionarios');
    if (!lista) { console.warn('[sidebar] #lista-concesionarios no encontrado'); return; }
    lista.innerHTML = '';

    const valid = (Array.isArray(concesionarios) ? concesionarios : []).filter(c =>
        typeof c.lat === 'number' && typeof c.lng === 'number' &&
        c.lat >= 27 && c.lat <= 44 && c.lng >= -19 && c.lng <= 6
    );
    console.log('[sidebar] renderSidebar → total:', (Array.isArray(concesionarios) ? concesionarios.length : 0), 'validos:', valid.length);

    valid.forEach((c, index) => {
        const li = document.createElement('li');

        const displayName = c.Nombre_placafinal || c.Nombre || c.Nombre_placa || c.razonSocial || '—';
        const localidad = c.Localidad || c.localidad || '';
        li.textContent = `${displayName} (${localidad})`;

        li.dataset.id = String(index);
        li.dataset.key = computeActiveKey(c); // ← clave estable para cruce

        // Click manual (añadir/quitar con animación)
        li.addEventListener('click', () => {
            const id = li.dataset.id;

            if (li.classList.contains('selected')) {
                // Deseleccionar
                li.classList.remove('selected');
                if (activeIds.has(id)) {
                    activeIds.delete(id);
                    removeAdherido(id);
                    adheridasCount = Math.max(0, adheridasCount - 1);
                    updateCounters();
                }
            } else {
                // Seleccionar
                li.classList.add('selected');
                if (!activeIds.has(id)) {
                    activeIds.add(id);
                    const payload = {
                        ...c,
                        razonSocial: displayName,
                        localidad: localidad
                    };
                    addAdherido(payload, id);
                    adheridasCount += 1;
                    updateCounters();
                }
            }
        });

        lista.appendChild(li);
    });

    // Si el mapa ya mandó las activas en frío, márcalas ahora
    if (__pendingActiveKeys instanceof Set) {
        applyActiveMarksToList(__pendingActiveKeys);
    }
}
