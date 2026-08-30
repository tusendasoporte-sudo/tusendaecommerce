export const PROMO_ADMIN_FEEDBACK_TIMEOUT_MS = 6000;
export const PROMO_ADMIN_FEEDBACK_SELECTOR = '[data-promo-feedback]';

export function observePromoAdminFeedback(
  root: HTMLElement,
  timeoutMs = PROMO_ADMIN_FEEDBACK_TIMEOUT_MS,
) {
  const timers = new Map<HTMLElement, number>();
  const view = root.ownerDocument.defaultView;
  if (!view || typeof MutationObserver === 'undefined') return () => {};

  function cancel(element: HTMLElement) {
    const timer = timers.get(element);
    if (timer !== undefined) view.clearTimeout(timer);
    timers.delete(element);
  }

  function schedule(element: HTMLElement, reveal = false) {
    cancel(element);
    if (!element.textContent?.trim()) return;
    if (reveal) element.hidden = false;
    if (element.hidden) return;
    const timer = view.setTimeout(() => {
      element.hidden = true;
      timers.delete(element);
    }, timeoutMs);
    timers.set(element, timer);
  }

  function feedbackFor(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest<HTMLElement>(PROMO_ADMIN_FEEDBACK_SELECTOR) || null;
  }

  root.querySelectorAll<HTMLElement>(PROMO_ADMIN_FEEDBACK_SELECTOR).forEach((element) => schedule(element));
  const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
    if (mutation.type === 'attributes') {
      const feedback = mutation.target instanceof HTMLElement && mutation.target.matches(PROMO_ADMIN_FEEDBACK_SELECTOR)
        ? mutation.target
        : null;
      if (feedback && !feedback.hidden) schedule(feedback);
      return;
    }
    const feedback = feedbackFor(mutation.target);
    if (feedback) schedule(feedback, true);
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(PROMO_ADMIN_FEEDBACK_SELECTOR)) schedule(node as HTMLElement);
      node.querySelectorAll<HTMLElement>(PROMO_ADMIN_FEEDBACK_SELECTOR).forEach((element) => schedule(element));
    });
  }));
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['hidden'],
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    timers.forEach((timer) => view.clearTimeout(timer));
    timers.clear();
  };
}
