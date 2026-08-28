export function initializePromoFeaturedWorkCarousels(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-featured-work-carousel]').forEach((carousel) => {
    if (carousel.dataset.featuredWorkReady === 'true') return;

    const track = carousel.querySelector<HTMLOListElement>('[data-featured-work-slides]');
    const previous = carousel.querySelector<HTMLButtonElement>('[data-featured-work-previous]');
    const next = carousel.querySelector<HTMLButtonElement>('[data-featured-work-next]');
    const slides = Array.from(track?.children || []).filter((slide): slide is HTMLElement => (
      slide instanceof HTMLElement
    ));
    if (!track || slides.length < 2 || !previous || !next) return;

    carousel.dataset.featuredWorkReady = 'true';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let activeIndex = 0;
    let scrollFrame = 0;

    const motionIsReduced = () => (
      reducedMotion.matches || document.body.dataset.promoTokenMotion === 'reduced'
    );
    const setActiveFromScroll = () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        const trackLeft = track.getBoundingClientRect().left;
        activeIndex = slides.reduce((closest, slide, index) => (
          Math.abs(slide.getBoundingClientRect().left - trackLeft)
            < Math.abs(slides[closest].getBoundingClientRect().left - trackLeft) ? index : closest
        ), 0);
      });
    };
    const show = (index: number) => {
      activeIndex = (index + slides.length) % slides.length;
      slides[activeIndex]?.scrollIntoView({
        behavior: motionIsReduced() ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'start',
      });
    };

    previous.addEventListener('click', () => show(activeIndex - 1));
    next.addEventListener('click', () => show(activeIndex + 1));
    track.addEventListener('scroll', setActiveFromScroll, { passive: true });
    track.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      show(document.documentElement.dir === 'rtl' ? activeIndex - direction : activeIndex + direction);
    });
    window.addEventListener('pagehide', () => window.cancelAnimationFrame(scrollFrame), { once: true });
  });
}
