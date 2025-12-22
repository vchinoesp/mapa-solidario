
// src/js/form_logic.js
// Lógica de selects + envío + marcaje de adheridas en el <select>.
// Al enviar: oculta formulario por alpha y colapsa sin hueco, cambia el titular y lanza 'final:start'.

const DATA_URL = '/data/concesionarios.json';

const formEl   = document.getElementById('cm-form');
const nombreEl = document.getElementById('nombre');
const provEl   = document.getElementById('provincia');
const concEl   = document.getElementById('concesion');
const submitEl = formEl.querySelector('.cm-form__submit');

const titleEl  = document.querySelector('.cm__title');

const SELECT_CONFIG = { disableAdheridas: false };

let DATASET = [];
let provincias = [];
let concesionesPorProv = new Map();
let ADHERIDAS_SET = new Set();

function uniqueSorted(list) {
    return Array.from(new Set(list.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
}
function keyOfItem(d) {
    return `${String(d.razonSocial || '').toLowerCase()}|${Number(d.lat)}|${Number(d.lng)}`;
}

function buildIndex(dataset) {
    provincias = uniqueSorted(dataset.map(d => String(d.provincia || '').trim()));
    concesionesPorProv = new Map();
    for (const p of provincias) concesionesPorProv.set(p, []);

    for (const d of dataset) {
        const p = String(d.provincia || '').trim();
        const name = String(d.razonSocial || '').trim();
        if (!p || !name) continue;
        concesionesPorProv.get(p)?.push({
            name, lat: d.lat, lng: d.lng, provincia: p,
            key: keyOfItem(d)
        });
    }

    for (const p of provincias) {
        const arr = concesionesPorProv.get(p) || [];
        const seen = new Set();
        const dedup = arr.filter(x => {
            const k = x.name.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        }).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        concesionesPorProv.set(p, dedup);
    }
}

function fillProvincias() {
    provEl.innerHTML = '<option value="" selected disabled>Selecciona tu provincia</option>';
    for (const p of provincias) {
        const opt = document.createElement('option');
        opt.value = p; opt.textContent = p;
        provEl.appendChild(opt);
    }
}

/** Select SIN “No adheridas”: adheridas primero, data-adherida="1" */
function fillConcesiones(prov) {
    concEl.innerHTML = '';
    concEl.disabled = true;

    const list = concesionesPorProv.get(prov) || [];
    const frag = document.createDocumentFragment();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Selecciona tu concesión';
    frag.appendChild(placeholder);

    if (!list.length) { concEl.appendChild(frag); return; }

    const adheridas = [], noAdheridas = [];
    for (const item of list) (ADHERIDAS_SET.has(item.key) ? adheridas : noAdheridas).push(item);

    const appendOption = (it, isAdh) => {
        const opt = document.createElement('option');
        opt.value = it.name;
        opt.textContent = it.name;
        opt.dataset.lat = String(it.lat ?? '');
        opt.dataset.lng = String(it.lng ?? '');
        opt.dataset.key = it.key;
        opt.dataset.adherida = isAdh ? '1' : '0';
        if (isAdh && SELECT_CONFIG.disableAdheridas) opt.disabled = true;
        return opt;
    };

    adheridas.forEach(it => frag.appendChild(appendOption(it, true)));
    noAdheridas.forEach(it => frag.appendChild(appendOption(it, false)));

    concEl.appendChild(frag);
    concEl.disabled = false;
}

function validate() {
    const ok = nombreEl.value.trim().length > 1 && provEl.value && concEl.value;
    submitEl.disabled = !ok;
}

async function init() {
    try {
        const res = await fetch(DATA_URL);
        DATASET = await res.json();
        buildIndex(DATASET);
        fillProvincias();
        window.dispatchEvent(new CustomEvent('dataset:loaded', { detail: { dataset: DATASET }}));
    } catch (e) { console.error('Error dataset:', e); }
}
init();

provEl.addEventListener('change', (e) => {
    const prov = e.target.value;
    fillConcesiones(prov); validate();
    window.dispatchEvent(new CustomEvent('province:changed', { detail: { provincia: prov }}));
});

concEl.addEventListener('change', validate);
nombreEl.addEventListener('input', validate);

formEl.addEventListener('submit', (e) => {
    e.preventDefault();

    const nombre    = nombreEl.value.trim();
    const provincia = provEl.value;
    const concesion = concEl.value;

    const selectedOpt = concEl.querySelector(`option[value="${CSS.escape(concesion)}"]`);
    const lat = selectedOpt ? Number(selectedOpt.dataset.lat) : undefined;
    const lng = selectedOpt ? Number(selectedOpt.dataset.lng) : undefined;

    // 1) Mensaje final en el titular
    if (titleEl) {
        titleEl.classList.add('is-fading');
        setTimeout(() => {
            titleEl.innerHTML = `
        <span class="cm__finalName">${(nombre || '').toUpperCase()}</span><br/>
        <strong>¡Gracias por ayudarnos a iluminar el mapa de KILÓMETROS QUE IMPORTAN!</strong><br/>
        <span class="cm__finalHint">Acércate a la pantalla interactiva para ver cómo se ilumina <em>${concesion}</em>.</span>
      `;
            titleEl.classList.remove('is-fading');
            titleEl.classList.add('is-finalText');
        }, 160);
    }

    // 2) Modo final → colapsa CTA y Form sin dejar hueco
    document.body.classList.add('is-final');

    // Notifica al mapa (para asegurar resize durante la transición)
    window.dispatchEvent(new Event('final:mode'));

    // 3) Lanza animación final sobre el mismo mapa
    const payload = { nombre, provincia, concesion, lat, lng };
    window.dispatchEvent(new CustomEvent('final:start', { detail: payload }));

    submitEl.disabled = true;
});

/* API pública: adheridas en el SELECT */
export function setAdheridasForm(marksArray) {
    try {
        const list = Array.isArray(marksArray) ? marksArray : [];
        ADHERIDAS_SET = new Set(
            list
                .filter(m => m && typeof m.razonSocial === 'string' && m.razonSocial.trim() && Number.isFinite(m.lat) && Number.isFinite(m.lng))
                .map(m => `${m.razonSocial.toLowerCase()}|${m.lat}|${m.lng}`)
        );
        if (provEl.value) { fillConcesiones(provEl.value); validate(); }
    } catch (e) { console.error('setAdheridasForm() error:', e); }
}
