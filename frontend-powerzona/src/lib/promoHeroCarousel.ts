const CAROUSEL_INTERVAL_MS = 4000;

function carouselCopy() {
  return document.documentElement.lang.toLowerCase().startsWith('en')
    ? { pause: 'Pause carousel', play: 'Play carousel' }
    : { pause: 'Pausar carrusel', play: 'Reproducir carrusel' };
}

export function initializePromoHeroCarousels() {
  document.querySelectorAll<HTMLElement>('.promo-hero__media-region').forEach((root) => {
    if (root.dataset.promoHeroReady === 'true') return;
    root.dataset.promoHeroReady = 'true';

    const track = root.querySelector<HTMLOListElement>('.promo-hero__slides');
    const slides = Array.from(root.querySelectorAll<HTMLElement>('.promo-hero__slide'));
    const controls = Array.from(root.querySelectorAll<HTMLAnchorElement>('.promo-hero__controls a'));

    if (!track || slides.length <= 1 || controls.length !== slides.length) return;

    const copy = carouselCopy();
    const toggle = document.createElement('button');
    const toggleIcon = document.createElement('span');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const controlsRegion = root.querySelector<HTMLElement>('.promo-hero__controls');
    let currentIndex = Math.max(0, slides.findIndex((slide) => `#${slide.id}` === window.location.hash));
    let pausedByUser = false;
    let timer = 0;
    let scrollFrame = 0;

    toggle.type = 'button';
    toggle.className = 'promo-hero__toggle';
    toggleIcon.setAttribute('aria-hidden', 'true');
    toggle.append(toggleIcon);
    controlsRegion?.append(toggle);

    const tokenReducesMotion = () => document.body.dataset.promoTokenMotion === 'reduced';
    const motionIsReduced = () => reducedMotion.matches || tokenReducesMotion();

    const syncControls = () => {
      controls.forEach((control, index) => {
        if (index === currentIndex) control.setAttribute('aria-current', 'true');
        else control.removeAttribute('aria-current');
      });
    };

    const syncToggle = () => {
      const motionReduced = motionIsReduced();
      const paused = pausedByUser || motionReduced;
      const label = paused ? copy.play : copy.pause;
      toggle.hidden = motionReduced;
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      toggleIcon.textContent = paused ? '▶' : 'Ⅱ';
    };

    const stopTimer = () => {
      window.clearInterval(timer);
      timer = 0;
    };

    const goTo = (index: number, behavior: ScrollBehavior = 'smooth') => {
      currentIndex = (index + slides.length) % slides.length;
      track.scrollTo({
        left: slides[currentIndex]?.offsetLeft || currentIndex * track.clientWidth,
        behavior: motionIsReduced() ? 'auto' : behavior,
      });
      syncControls();
    };

    const restartTimer = () => {
      stopTimer();
      syncToggle();
      if (pausedByUser || motionIsReduced() || document.hidden) return;
      timer = window.setInterval(() => goTo(currentIndex + 1), CAROUSEL_INTERVAL_MS);
    };

    controls.forEach((control, index) => {
      control.addEventListener('click', (event) => {
        event.preventDefault();
        goTo(index);
        window.history.replaceState(null, '', control.hash);
        restartTimer();
      });
    });

    toggle.addEventListener('click', () => {
      pausedByUser = !pausedByUser;
      restartTimer();
    });

    track.addEventListener('scroll', () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        currentIndex = slides.reduce((closest, slide, index) => (
          Math.abs(slide.offsetLeft - track.scrollLeft)
            < Math.abs(slides[closest].offsetLeft - track.scrollLeft) ? index : closest
        ), 0);
        syncControls();
      });
    }, { passive: true });

    track.addEventListener('pointerdown', stopTimer);
    track.addEventListener('pointerup', restartTimer);
    track.addEventListener('pointercancel', restartTimer);
    track.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
      video.addEventListener('play', stopTimer);
      video.addEventListener('pause', restartTimer);
      video.addEventListener('ended', restartTimer);
    });
    reducedMotion.addEventListener('change', restartTimer);
    document.addEventListener('visibilitychange', restartTimer);
    window.addEventListener('resize', () => goTo(currentIndex, 'auto'));
    window.addEventListener('pagehide', () => {
      stopTimer();
      window.cancelAnimationFrame(scrollFrame);
    }, { once: true });

    goTo(currentIndex, 'auto');
    restartTimer();
  });
}
