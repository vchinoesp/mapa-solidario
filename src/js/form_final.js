
// src/js/form_final.js
// Crea DOM de pantalla final y rellena mensajes. No incluye CSS (usa tus clases).
import { runFinalMapAnimation } from './form_final_map.js';

let finalMounted = false;
let finalRoot;

function buildFinalDOM() {
    finalRoot = document.createElement('section');
    finalRoot.className = 'cm__formCard cm__finalCard';
    finalRoot.setAttribute('id', 'final-card');

    finalRoot.innerHTML = `
    <div class="cm__finalBrand">
      <!-- Replace con tu logo si quieres -->
      <img src="./images/logo_caremakers_form.png" class="img-logo" alt="Dacia CareMakers" />
    </div>

    <div class="cm__finalBody">
      <h2 id="final-name" class="cm__finalTitle">Nombre Usuario</h2>
      <p class="cm__finalText">
        ¡Gracias por ayudarnos a iluminar el mapa de KILÓMETROS QUE IMPORTAN!
      </p>
      <p class="cm__finalSmall">
        Acércate a la pantalla interactiva para ver cómo se ilumina
        <span id="final-concession">Nombre Concesión</span>.
      </p>
    </div>

    <!-- Hueco del mapa (sustituye la ruta del diseño por un mapa real) -->
    <div class="cm__mapCard cm__finalMapCard">
      <div id="final-map" class="cm__map"></div>
      <div class="cm__mapGlow"></div>
    </div>
  `;

    // Inserta justo debajo del main (o donde prefieras)
    const main = document.querySelector('.cm__main');
    main.appendChild(finalRoot);
    finalMounted = true;
}

function fillTexts({ nombre, concesion }) {
    const nameEl = document.getElementById('final-name');
    const concEl = document.getElementById('final-concession');
    if (nameEl) nameEl.textContent = (nombre || '').toUpperCase();
    if (concEl) concEl.textContent = concesion || '';
}

// Escucha el evento del submit y monta la pantalla final con mapa
window.addEventListener('final:show', (evt) => {
    const detail = evt.detail || {};
    if (!finalMounted) buildFinalDOM();
    fillTexts(detail);
    // Lanza animación del mapa final con coords de la concesión
    if (Number.isFinite(detail.lat) && Number.isFinite(detail.lng)) {
        runFinalMapAnimation({
            razonSocial: detail.concesion,
            lat: detail.lat,
            lng: detail.lng
        });
    }
});
