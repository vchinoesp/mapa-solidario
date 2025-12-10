
import { addAdherido, removeAdherido } from './map.js';

let adheridasCount = 0;
const activeIds = new Set();

export function renderSidebar(concesionarios) {
    const lista = document.getElementById('lista-concesionarios');
    lista.innerHTML = '';

    const valid = concesionarios.filter(c =>
        typeof c.lat === 'number' && typeof c.lng === 'number' &&
        c.lat >= 27 && c.lat <= 44 && c.lng >= -19 && c.lng <= 6
    );

    valid.forEach((c, index) => {
        const li = document.createElement('li');
        li.textContent = `${c.razonSocial} (${c.localidad})`;
        li.dataset.id = String(index);

        li.addEventListener('click', () => {
            const id = li.dataset.id;

            if (li.classList.contains('selected')) {
                li.classList.remove('selected');
                if (activeIds.has(id)) {
                    activeIds.delete(id);
                    removeAdherido(id);
                    adheridasCount = Math.max(0, adheridasCount - 1);
                    document.getElementById('adheridas').textContent = adheridasCount;
                }
            } else {
                li.classList.add('selected');
                if (!activeIds.has(id)) {
                    activeIds.add(id);
                    addAdherido(c, id);
                    adheridasCount += 1;
                    document.getElementById('adheridas').textContent = adheridasCount;
                }
            }
        });

        lista.appendChild(li);
    });
}
