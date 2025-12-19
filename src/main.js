import 'mapbox-gl/dist/mapbox-gl.css';
import './style.scss';
import { renderSidebar } from './js/sidebar.js';


window.addEventListener('load', () => {
    fetch('/data/concesionarios.json')        // 👈 desde public/
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(concesionarios => {
            renderSidebar(concesionarios);
        })
        .catch(err => console.error('Error cargando JSON:', err));
});


