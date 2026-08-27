const CAROUSEL_INTERVAL_MS = 5000;

export function initializePromoHeroCarousels() {
  document.querySelectorAll<HTMLElement>('.promo-hero__media-region').forEach((root) => {
    if (root.dataset.promoHeroReady === 'true') return;
    root.dataset.promoHeroReady = 'true';

    const track = root.querySelector<HTMLOListElement>('.promo-hero__slides');
    const slides = Array.from(root.querySelectorAll<HTMLElement>('.promo-hero__slide'));
    const previousControl = root.querySelector<HTMLButtonElement>('[data-promo-hero-direction="previous"]');
    const nextControl = root.querySelector<HTMLButtonElement>('[data-promo-hero-direction="next"]');

    if (!track || slides.length <= 1 || !previousControl || !nextControl) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const legacyMediaHash = window.location.hash.match(/^#promo-section-[A-Za-z0-9_-]+-media-(\d+)$/);
    let currentIndex = legacyMediaHash
      ? Math.min(slides.length - 1, Math.max(0, Number(legacyMediaHash[1]) - 1))
      : 0;
    let timer = 0;
    let scrollFrame = 0;

    if (legacyMediaHash) {
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, '', cleanUrl);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    }

    const tokenReducesMotion = () => document.body.dataset.promoTokenMotion === 'reduced';
    const motionIsReduced = () => reducedMotion.matches || tokenReducesMotion();

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
    };

    const restartTimer = () => {
      stopTimer();
      if (motionIsReduced() || document.hidden) return;
      timer = window.setInterval(() => goTo(currentIndex + 1), CAROUSEL_INTERVAL_MS);
    };

    previousControl.addEventListener('click', () => {
      goTo(currentIndex - 1);
      restartTimer();
    });
    nextControl.addEventListener('click', () => {
      goTo(currentIndex + 1);
      restartTimer();
    });

    track.addEventListener('scroll', () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        currentIndex = slides.reduce((closest, slide, index) => (
          Math.abs(slide.offsetLeft - track.scrollLeft)
            < Math.abs(slides[closest].offsetLeft - track.scrollLeft) ? index : closest
        ), 0);
      });
    }, { passive: true });

    track.addEventListener('pointerdown', stopTimer);
    track.addEventListener('pointerup', restartTimer);
    track.addEventListener('pointercancel', restartTimer);
    root.addEventListener('mouseenter', stopTimer);
    root.addEventListener('mouseleave', restartTimer);
    root.addEventListener('focusin', stopTimer);
    root.addEventListener('focusout', restartTimer);
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
