// Inline coordination only; the unchanged engines are separate, hashed assets.
// DOMContentLoaded follows both classic deferred scripts, even if one fails.
(function () {
  if (window.PZ_CART_RUNTIME_READY) return;
  window.PZ_CART_RUNTIME_READY = new Promise((resolve, reject) => {
    const ready = () => {
      if (window.PZCartLiveValidator?.applyCartValidation
        && window.PZPromotions?.loadActivePromotions
        && window.PZPromotions?.loadActiveCoupons) resolve();
      else reject(new Error('No se pudieron cargar las dependencias del carrito. Recarga la pagina e intenta nuevamente.'));
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ready, { once: true });
    } else ready();
  });
  window.PZ_CART_RUNTIME_READY.catch(() => {});
})();
