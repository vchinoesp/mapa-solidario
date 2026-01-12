
// src/js/form_logic.js
// Nueva lógica: CP -> Instalación. Sin provincias. Sin mapa inicial.
// Al enviar: mostramos "final-screen" con textos personalizados y disparamos mapa final simple.


const DATA_URL = '/data/concesionarios.json';

// Campos
const formEl = document.getElementById('cm-form');
const nombreEl = document.getElementById('nombre');
const apellido1El = document.getElementById('apellido1');
const apellido2El = document.getElementById('apellido2');
const emailEl = document.getElementById('email');
const telEl = document.getElementById('telefono');
const cpEl = document.getElementById('cp');
const instEl = document.getElementById('instalacion');
const consentEl = document.getElementById('consent');
const submitEl = formEl?.querySelector('.cm-form__submit');

// Final screen elements
const finalScreenEl = document.getElementById('final-screen');
const finalUserEl = document.getElementById('final-user');
const finalInstallEl = document.getElementById('final-install');

// Dataset en memoria
let DATASET = [];
let INDEX_BY_CP = new Map(); // cp -> [{ name, lat, lng, cp }...]

function normalizeCP(cp) {
    const s = String(cp ?? '').trim();
    const onlyDigits = s.replace(/\D+/g, '');
    if (onlyDigits.length === 5) return onlyDigits;
    // si viene 4 dígitos o menos, no es válido para ES; devolvemos cadena original sin formatear
    return s;
}

function normalizeDataset(dataset) {
    return dataset
        .filter(d =>
            d && typeof d.razonSocial === 'string' && d.razonSocial.trim() &&
            Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)) &&
            String(d.codigoPostal ?? '').trim() !== ''
        )
        .map(d => ({
            name: String(d.razonSocial).trim(),
            lat: Number(d.lat),
            lng: Number(d.lng),
            cp: normalizeCP(d.codigoPostal)
        }));
}

function buildIndexByCP(list) {
    INDEX_BY_CP = new Map();
    for (const it of list) {
        const key = it.cp;
        if (!key) continue;
        if (!INDEX_BY_CP.has(key)) INDEX_BY_CP.set(key, []);
        INDEX_BY_CP.get(key).push(it);
    }
    // Orden alfabético por nombre para estabilidad visual
    for (const [k, arr] of INDEX_BY_CP) {
        arr.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    }
}

async function init() {
    try {
        const res = await fetch(DATA_URL);
        DATASET = normalizeDataset(await res.json());
        buildIndexByCP(DATASET);
    } catch (e) {
        console.error('Error dataset:', e);
    }
}
init();

// --------- Relleno de instalaciones por CP ----------
function fillInstalacionesByCP(cp) {
    instEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Selecciona instalación';
    frag.appendChild(placeholder);

    const list = INDEX_BY_CP.get(cp) ?? [];

    for (const it of list) {
        const opt = document.createElement('option');
        opt.value = it.name;
        opt.textContent = it.name;
        opt.dataset.lat = String(it.lat);
        opt.dataset.lng = String(it.lng);
        opt.dataset.cp = it.cp;
        frag.appendChild(opt);
    }

    instEl.appendChild(frag);
    instEl.disabled = list.length === 0;
}

// --------- Validación ---------
const errors = {
    nombre: '',
    apellido1: '',
    apellido2: '',
    email: '',
    telefono: '',
    cp: '',
    instalacion: '',
    consent: ''
};

function setError(id, msg) {
    errors[id] = msg;
    const p = document.querySelector(`.cm-form__error[data-for="${id}"]`);
    if (p) p.textContent = msg ?? '';
}

function validateEmail(v) {
    // Simple HTML5 pattern is fine, we rely on input[type=email] too
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}
function validatePhone(v) {
    // básico: 9-15 dígitos
    const s = String(v).replace(/\D+/g, '');
    return s.length >= 9 && s.length <= 15;
}
function validateCP(v) {
    return /^\d{5}$/.test(String(v).trim());
}

function validate() {
    let ok = true;

    // Nombre
    if (!nombreEl.value.trim()) { setError('nombre', 'Campo obligatorio.'); ok = false; } else setError('nombre', '');

    // Apellido1
    if (!apellido1El.value.trim()) { setError('apellido1', 'Campo obligatorio.'); ok = false; } else setError('apellido1', '');

    // Apellido2 (opcional)
    setError('apellido2', '');

    // Email
    if (!emailEl.value.trim() || !validateEmail(emailEl.value)) {
        setError('email', 'Introduce un email válido.');
        ok = false;
    } else setError('email', '');

    // Teléfono
    if (!telEl.value.trim() || !validatePhone(telEl.value)) {
        setError('telefono', 'Introduce un teléfono válido.');
        ok = false;
    } else setError('telefono', '');

    // CP
    if (!validateCP(cpEl.value)) {
        setError('cp', 'Código postal de 5 dígitos.');
        ok = false;
    } else {
        // además, debe haber instalaciones para ese CP
        const cp = normalizeCP(cpEl.value);
        const has = (INDEX_BY_CP.get(cp) ?? []).length > 0;
        if (!has) { setError('cp', 'No hay instalaciones para este CP.'); ok = false; }
        else setError('cp', '');
    }

    // Instalación
    if (!instEl.value) { setError('instalacion', 'Selecciona una instalación.'); ok = false; } else setError('instalacion', '');

    // Consentimiento
    if (!consentEl.checked) { setError('consent', 'Debes aceptar el consentimiento.'); ok = false; } else setError('consent', '');

    if (submitEl) submitEl.disabled = !ok;
    return ok;
}

// Eventos
cpEl.addEventListener('input', () => {
    const cp = normalizeCP(cpEl.value);
    if (/^\d{5}$/.test(cp)) {
        fillInstalacionesByCP(cp);
    } else {
        instEl.innerHTML = '<option value="" selected disabled>Selecciona instalación</option>';
        instEl.disabled = true;
    }
    validate();
});
instEl.addEventListener('change', validate);
nombreEl.addEventListener('input', validate);
apellido1El.addEventListener('input', validate);
apellido2El.addEventListener('input', validate);
emailEl.addEventListener('input', validate);
telEl.addEventListener('input', validate);
consentEl.addEventListener('change', validate);

// Submit
formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Datos a enviar (cuando conectemos backend)
    const payload = {
        nombre: nombreEl.value.trim(),
        apellido1: apellido1El.value.trim(),
        apellido2: apellido2El.value.trim(),
        email: emailEl.value.trim(),
        telefono: telEl.value.trim(),
        cp: normalizeCP(cpEl.value),
        instalacion: instEl.value,
    };

    // Obtener coords de la instalación seleccionada
    const selectedOpt = instEl.querySelector(`option[value="${CSS.escape(instEl.value)}"]`);
    const lat = selectedOpt ? Number(selectedOpt.dataset.lat) : undefined;
    const lng = selectedOpt ? Number(selectedOpt.dataset.lng) : undefined;

    // Mostrar pantalla final (ocultamos el formulario)
    if (finalScreenEl) {
        // Rellenar textos
        const nombreCompleto = `${payload.nombre} ${payload.apellido1}`.trim().toUpperCase();
        if (finalUserEl) finalUserEl.textContent = nombreCompleto;
        if (finalInstallEl) finalInstallEl.textContent = payload.instalacion;

        // Intercambio de vistas
        const formCard = document.querySelector('.cm__formCard');
        if (formCard) formCard.setAttribute('hidden', 'true');
        finalScreenEl.removeAttribute('hidden');

        initFinalMaps()
        addFinalMark({ lat, lng, razonSocial: payload.instalacion })


        // Disparar mapa final (simple) si coords OK
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            window.dispatchEvent(new CustomEvent('final:simple', {
                detail: { lat, lng, razonSocial: payload.instalacion }
            }));
        }
    }

});

