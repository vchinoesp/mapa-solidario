
// src/js/form_main.js


import '../styles/form_style.scss';
import './form_logic.js';
import './form_map.js';



// Estado inicial: CTA visible, form oculto
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.remove('is-form');
    const btn = document.getElementById('cm-cta-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            document.body.classList.add('is-form');
            const nombreEl = document.getElementById('nombre');
            if (nombreEl) setTimeout(() => nombreEl.focus(), 240);
        });
    }
});




import { setFormMarks } from '/src/js/form_map.js';

const adheridas = [
    { razonSocial: "RENAULT RETAIL GROUP MADRID, S.A. / MAJADAHONDA", lat: 40.457887, lng: -3.871415 },
    { razonSocial: "RENAULT RETAIL GROUP LEVANTE.S.A. / TRES CRUCES", lat: 39.459614, lng: -0.403351 },
    { razonSocial: "SYRSA AUTOMOCION,S.L.", lat: 37.40365, lng: -5.95938 },
    { razonSocial: "CAETANO FORMULA CANARIAS, S.L.", lat: 28.101562, lng: -15.437031 },
    { razonSocial: "ROMBO SOL 2002, S.L.U", lat: 36.508879, lng: -4.867807 }
];

// Pinta exactamente esas marcas pulse
setFormMarks(adheridas);
setAdheridasForm(adheridas);
