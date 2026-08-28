export function initializePromoServiceGalleries(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-promo-gallery-controls]').forEach((controls) => {
    if (controls.dataset.promoGalleryReady === 'true') return;
    const mediaRoot = controls.closest<HTMLElement>('.promo-service-detail__product-media');
    const track = mediaRoot?.querySelector<HTMLElement>('[data-promo-gallery-track]');
    const slides = Array.from(track?.children || []).filter((slide): slide is HTMLElement => (
      slide instanceof HTMLElement
    ));
    const indicators = Array.from(
      controls.querySelectorAll<HTMLButtonElement>('[data-promo-gallery-indicator]'),
    );
    const status = controls.querySelector<HTMLElement>('[data-promo-gallery-status]');
    const previous = controls.querySelector<HTMLButtonElement>('[data-promo-gallery-previous]');
    const next = controls.querySelector<HTMLButtonElement>('[data-promo-gallery-next]');
    if (!track || slides.length < 2 || !previous || !next || indicators.length !== slides.length) return;

    controls.dataset.promoGalleryReady = 'true';
    let activeIndex = 0;
    let scrollFrame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setActive = (index: number) => {
      activeIndex = (index + slides.length) % slides.length;
      indicators.forEach((indicator, indicatorIndex) => {
        const current = indicatorIndex === activeIndex;
        indicator.classList.toggle('is-active', current);
        if (current) indicator.setAttribute('aria-current', 'true');
        else indicator.removeAttribute('aria-current');
      });
      if (status) status.textContent = `${activeIndex + 1}/${slides.length}`;
    };
    const show = (index: number) => {
      const normalizedIndex = (index + slides.length) % slides.length;
      const slide = slides[normalizedIndex];
      if (!slide) return;
      setActive(normalizedIndex);
      const trackRect = track.getBoundingClientRect();
      const slideRect = slide.getBoundingClientRect();
      const left = track.scrollLeft + slideRect.left - trackRect.left;
      track.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
    };
    const syncFromScroll = () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        const trackLeft = track.getBoundingClientRect().left;
        const nearest = slides.reduce((best, slide, index) => {
          const distance = Math.abs(slide.getBoundingClientRect().left - trackLeft);
          return distance < best.distance ? { index, distance } : best;
        }, { index: activeIndex, distance: Number.POSITIVE_INFINITY });
        setActive(nearest.index);
      });
    };

    previous.addEventListener('click', () => show(activeIndex - 1));
    next.addEventListener('click', () => show(activeIndex + 1));
    indicators.forEach((indicator, index) => {
      indicator.addEventListener('click', () => show(index));
    });
    track.addEventListener('scroll', syncFromScroll, { passive: true });
    track.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      show(document.documentElement.dir === 'rtl' ? activeIndex - direction : activeIndex + direction);
    });
    setActive(0);
  });
}
