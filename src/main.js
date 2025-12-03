
import mapboxgl from 'mapbox-gl';
import gsap from 'gsap';
import './style.scss';

mapboxgl.accessToken = 'TU_TOKEN_MAPBOX_AQUI';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-3.7038, 40.4168],
    zoom: 5
});

const concesionarios = [
    { nombre: 'Madrid', coords: [-3.7038, 40.4168], km: 120 },
    { nombre: 'Barcelona', coords: [2.1734, 41.3851], km: 150 },
    { nombre: 'Sevilla', coords: [-5.9845, 37.3891], km: 90 }
];

let totalKm = 0;
let totalPeople = 0;

function agregarConcesionario(c) {
    totalKm += c.km;
    totalPeople += 1;
    document.getElementById('km').textContent = totalKm.toLocaleString();
    document.getElementById('people').textContent = totalPeople;

    const el = document.createElement('div');
    el.className = 'glow';
    new mapboxgl.Marker(el)
        .setLngLat(c.coords)
        .setPopup(new mapboxgl.Popup().setText(`${c.nombre} - ${c.km} km`))
        .addTo(map);

    // Animación con GSAP (pulsación)
    gsap.fromTo(el, { scale: 0 }, { scale: 1.5, duration: 0.5, yoyo: true, repeat: 1 });
}

let i = 0;
setInterval(() => {
    if (i < concesionarios.length) {
        agregarConcesionario(concesionarios[i]);
        i++;
    }
}, 2000);
