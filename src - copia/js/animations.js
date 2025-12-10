
import gsap from 'gsap';

export function pulseAnimation(element) {
    gsap.fromTo(element, { scale: 0.6, opacity: 0.6 }, {
        scale: 1.6, opacity: 1, duration: 0.6, yoyo: true, repeat: 1, ease: 'power2.out'
    });
}
