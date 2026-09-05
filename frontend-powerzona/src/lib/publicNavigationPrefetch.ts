export const PUBLIC_PREFETCH_LIMIT = 3;
export const PUBLIC_PREFETCH_INTENT_DELAY_MS = 200;

const SLUG = '[a-zA-Z0-9_-]+';
const CATALOG_DOCUMENT = new RegExp(`^/(?:categoria|subcategoria|producto)/${SLUG}/?$`);
const CATALOG_SOURCE = new RegExp(`^(?:/|/(?:buscar|regalos)/?|/(?:categoria|subcategoria|producto)/${SLUG}/?)$`);

// Only ordinary catalog documents in the current store. Never prefetch query
// parameters (searches, previews, tokens), actions, private pages or other stores.
export function getPublicPrefetchUrl(href: string, currentHref: string) {
  try {
    const current = new URL(currentHref);
    const target = new URL(href, current);
    if (!/^https?:$/.test(current.protocol) || target.origin !== current.origin
      || target.username || target.password || target.search || target.hash) return '';
    const storePrefix = current.pathname.match(/^\/t\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\/|$)/)?.[0] || '';
    const sourcePath = current.pathname.slice(storePrefix.length) || '/';
    if (!CATALOG_SOURCE.test(sourcePath)) return '';
    const targetPath = storePrefix && target.pathname.startsWith(`${storePrefix}/`)
      ? target.pathname.slice(storePrefix.length)
      : storePrefix ? '' : target.pathname;
    if (!CATALOG_DOCUMENT.test(targetPath)) return '';
    if (target.pathname.replace(/\/$/, '') === current.pathname.replace(/\/$/, '')) return '';
    return target.href;
  } catch {
    return '';
  }
}

type NetworkState = { saveData?: boolean; effectiveType?: string };

export function canPrefetchPublicNavigation(online: boolean, connection?: NetworkState) {
  return online !== false && !connection?.saveData
    && !/^(?:slow-2g|2g|3g)$/.test(connection?.effectiveType || '');
}

const installedDocuments = new WeakSet<Document>();

// Reuses Astro's low-priority HTML prefetch and HTTP cache. It does not render
// the target, execute its scripts, replace navigation or touch cart storage.
export function installPublicNavigationPrefetch(
  prefetch: (url: string) => void,
  doc = document,
  win = window,
) {
  if (doc.body?.dataset.pzPublicPrefetch !== 'true' || installedDocuments.has(doc)) return;
  installedDocuments.add(doc);
  const attempted = new Set<string>();
  let pending: HTMLAnchorElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = null;
  };
  const allowedNow = () => doc.readyState === 'complete'
    && doc.visibilityState === 'visible'
    && attempted.size < PUBLIC_PREFETCH_LIMIT
    && canPrefetchPublicNavigation(win.navigator.onLine,
      (win.navigator as Navigator & { connection?: NetworkState }).connection);
  const anchorFrom = (target: EventTarget | null) => target instanceof win.Element
    ? target.closest<HTMLAnchorElement>('a[href]') : null;
  const targetUrl = (anchor: HTMLAnchorElement | null) => {
    if (!anchor?.isConnected || anchor.hasAttribute('download')
      || (anchor.target && anchor.target !== '_self') || anchor.relList.contains('external')
      || anchor.closest('[data-pz-no-prefetch], [aria-disabled="true"], #cart-sidebar')
      || anchor.dataset.astroPrefetch === 'false') return '';
    return getPublicPrefetchUrl(anchor.href, win.location.href);
  };
  const run = (anchor: HTMLAnchorElement) => {
    cancel();
    if (!allowedNow()) return;
    const url = targetUrl(anchor);
    if (!url || attempted.has(url)) return;
    attempted.add(url);
    try { prefetch(url); } catch { /* Navigation must still work if prefetch fails. */ }
  };
  const schedule = (anchor: HTMLAnchorElement | null) => {
    if (pending === anchor) return;
    cancel();
    if (!anchor || !allowedNow()) return;
    const url = targetUrl(anchor);
    if (!url || attempted.has(url)) return;
    pending = anchor;
    timer = setTimeout(() => run(anchor), PUBLIC_PREFETCH_INTENT_DELAY_MS);
  };
  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') schedule(anchorFrom(event.target));
  };
  const onLeave = (event: FocusEvent | PointerEvent) => {
    if (anchorFrom(event.target) === pending && anchorFrom(event.relatedTarget) !== pending) cancel();
  };
  const onFocus = (event: FocusEvent) => schedule(anchorFrom(event.target));
  const onTouch = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || event.button !== 0 || !event.isPrimary
      || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = anchorFrom(event.target);
    if (anchor) run(anchor);
  };

  doc.addEventListener('pointerover', onPointerOver, { passive: true });
  doc.addEventListener('pointerout', onLeave, { passive: true });
  doc.addEventListener('focusin', onFocus, { passive: true });
  doc.addEventListener('focusout', onLeave, { passive: true });
  doc.addEventListener('pointerdown', onTouch, { passive: true });
  doc.addEventListener('visibilitychange', cancel);
  win.addEventListener('pagehide', cancel);
  return () => {
    cancel();
    doc.removeEventListener('pointerover', onPointerOver);
    doc.removeEventListener('pointerout', onLeave);
    doc.removeEventListener('focusin', onFocus);
    doc.removeEventListener('focusout', onLeave);
    doc.removeEventListener('pointerdown', onTouch);
    doc.removeEventListener('visibilitychange', cancel);
    win.removeEventListener('pagehide', cancel);
    installedDocuments.delete(doc);
  };
}
