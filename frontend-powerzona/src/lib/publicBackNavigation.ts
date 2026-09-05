const CATALOG_PATH = /^(?:\/|\/(?:buscar|regalos)\/?|\/(?:categoria|subcategoria|producto)\/[a-zA-Z0-9_-]+\/?)$/;
const PARENT_PATH = /^(?:\/|\/(?:categoria|subcategoria)\/[a-zA-Z0-9_-]+\/?)$/;
const ANCHOR_STORAGE_KEY = 'pz-public-back-anchor-v1';
const ANCHOR_TTL_MS = 60_000;

type HistoryEntry = { key: string; index: number; url: string | null };
type PublicNavigation = {
  currentEntry: HistoryEntry | null;
  canGoBack: boolean;
  entries: () => HistoryEntry[];
  back: () => { committed: Promise<unknown>; finished: Promise<unknown> };
};

// Only the immediately preceding entry may be reused. Referrer/history.length
// cannot prove its destination (new tabs, redirects and forward/back traversal).
export function getPublicBackPlan(
  href: string,
  currentHref: string,
  currentEntry: HistoryEntry | null,
  entries: HistoryEntry[],
) {
  try {
    if (!currentEntry?.key || currentEntry.index < 1) return null;
    if (!entries.some(entry => entry.index === currentEntry.index && entry.key === currentEntry.key)) return null;
    const previous = entries.find(entry => entry.index === currentEntry.index - 1);
    if (!previous?.key || !previous.url || previous.key === currentEntry.key) return null;
    const current = new URL(currentHref);
    const target = new URL(href, current);
    const prior = new URL(previous.url);
    if (currentEntry.url !== current.href) return null;
    if ([current, target, prior].some(url => !/^https?:$/.test(url.protocol)
      || url.origin !== current.origin || url.username || url.password || url.search)) return null;

    const prefix = current.pathname.match(/^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*(?=\/|$)/)?.[0] || '';
    const pathInStore = (url: URL) => {
      if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return '';
      return url.pathname.slice(prefix.length).replace(/\/$/, '') || '/';
    };
    const sourcePath = pathInStore(current);
    const targetPath = pathInStore(target);
    if (!CATALOG_PATH.test(sourcePath) || !PARENT_PATH.test(targetPath)
      || targetPath !== pathInStore(prior) || targetPath === sourcePath) return null;
    // The category button promises the home category section, not home-at-top.
    // Preserve that anchor even if the older history entry had no fragment.
    const categoryAnchor = targetPath === '/' && target.hash === '#categorias';
    if (!categoryAnchor && (target.hash || prior.hash)) return null;
    if (categoryAnchor && prior.hash && prior.hash !== '#categorias') return null;
    return { key: previous.key, href: target.href, categoryAnchor };
  } catch {
    return null;
  }
}

const installedDocuments = new WeakSet<Document>();

export function installPublicBackNavigation(doc = document, win = window) {
  if (doc.body?.dataset.pzPublicBack !== 'true' || installedDocuments.has(doc)) return;
  const navigation = (win as unknown as { navigation?: PublicNavigation }).navigation;
  if (!navigation || typeof navigation.entries !== 'function' || typeof navigation.back !== 'function') return;
  installedDocuments.add(doc);
  let pending = false;

  const clearAnchor = () => {
    try { win.sessionStorage.removeItem(ANCHOR_STORAGE_KEY); } catch { /* Storage is optional. */ }
  };
  const onPageShow = () => {
    pending = false;
    // This is a short-lived scroll instruction, never a catalog/cart data cache.
    // Match the browser's exact entry key so no other tab/store consumes it.
    try {
      const stored = win.sessionStorage.getItem(ANCHOR_STORAGE_KEY);
      clearAnchor();
      if (!stored) return;
      const instruction = JSON.parse(stored);
      const entry = navigation.currentEntry;
      if (!entry?.key || instruction.key !== entry.key || !Number.isFinite(instruction.expiresAt)
        || instruction.expiresAt < Date.now() || instruction.expiresAt > Date.now() + ANCHOR_TTL_MS) return;
      const target = new URL(instruction.href);
      const current = new URL(win.location.href);
      if (target.origin !== current.origin || target.search || current.search
        || target.pathname.replace(/\/$/, '') !== current.pathname.replace(/\/$/, '')
        || target.hash !== '#categorias') return;
      win.requestAnimationFrame(() => {
        if (navigation.currentEntry?.key !== entry.key || win.location.href !== current.href) return;
        // Replace only the fragment; preserve state belonging to other features.
        current.hash = target.hash;
        win.history.replaceState(win.history.state, '', current.href);
        doc.getElementById('categorias')?.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    } catch { /* A denied storage read must not break ordinary navigation. */ }
  };
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof win.Element
      ? event.target.closest<HTMLAnchorElement>('a[data-pz-inner-back][href]') : null;
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')
      || anchor.relList.contains('external') || anchor.closest('[aria-disabled="true"], [data-pz-no-history-back]')) return;
    if (pending) { event.preventDefault(); return; }
    let plan: ReturnType<typeof getPublicBackPlan>;
    try {
      plan = navigation.canGoBack
        ? getPublicBackPlan(anchor.href, win.location.href, navigation.currentEntry, navigation.entries()) : null;
    } catch { return; }
    if (!plan) return; // The original accessible anchor remains the fallback.
    clearAnchor();
    if (plan.categoryAnchor) {
      try {
        win.sessionStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify({
          key: plan.key, href: plan.href, expiresAt: Date.now() + ANCHOR_TTL_MS,
        }));
      } catch { return; } // Without storage, retain normal #categorias navigation.
    }
    const sourceKey = navigation.currentEntry?.key;
    const sourceHref = win.location.href;
    try {
      pending = true;
      const result = navigation.back();
      event.preventDefault();
      void result.committed.catch(() => {});
      void result.finished.catch((error: unknown) => {
        pending = false;
        clearAnchor();
        // Do not override user cancellation, another navigation or a form guard.
        if ((error as { name?: string })?.name === 'InvalidStateError'
          && navigation.currentEntry?.key === sourceKey && win.location.href === sourceHref) {
          win.location.assign(plan.href);
        }
      });
    } catch {
      pending = false;
      clearAnchor(); // Synchronous failure leaves the link's default action intact.
    }
  };

  doc.addEventListener('click', onClick);
  win.addEventListener('pageshow', onPageShow);
  if (doc.readyState === 'complete') onPageShow();
  return () => {
    doc.removeEventListener('click', onClick);
    win.removeEventListener('pageshow', onPageShow);
    installedDocuments.delete(doc);
  };
}
