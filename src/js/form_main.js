
// src/js/form_main.js
import '../styles/form_style.scss';
import './form_logic.js';
import './form_final_map.js'; // se usará al mostrar la pantalla final

// Foco inicial en nombre para agilizar la interacción
document.addEventListener('DOMContentLoaded', () => {
    const nombreEl = document.getElementById('nombre');
    if (nombreEl) setTimeout(() => nombreEl.focus(), 180);
});
