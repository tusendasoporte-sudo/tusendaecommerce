/* Shared by the store admin. Native document navigation preserves editor lifecycles. */
(() => {
  if (window.PZAdminNavigation) return;
  const config = window.PZ_ADMIN_NAVIGATION_CONFIG || {};
  const basePath = String(config.basePath || '').replace(/\/$/, '');
  const baseUrl = String(config.baseUrl || '').replace(/\/$/, '');
  const storeId = String(config.storeId || '');
  const sections = new Set(['catalog', 'catalog-detail', 'dashboard', 'profits', 'gifts', 'shipping', 'products', 'orders']);
  const storageKey = `pz-admin-next-page:v1:${storeId}`;
  const nativeFetch = window.fetch.bind(window);
  let pending = null;
  let outstandingReads = 0;
  let idleResolvers = [];
  let documentReady = document.readyState !== 'loading';
  const sidebarClickStates = new WeakMap();

  function authToken() {
    try {
      const cookie = document.cookie.split(';').find((part) => part.trim().startsWith('pb_auth='));
      if (cookie) return JSON.parse(decodeURIComponent(cookie.trim().slice(8))).token || '';
    } catch (_) {}
    return '';
  }

  async function identity() {
    // The server authenticates every destination document again. Use its actor ID
    // so routine token refresh does not invalidate this 15-second, one-use handoff.
    // No credential is persisted in the payload.
    return String(config.actorId || '');
  }

  function clearPrepared() {
    try { sessionStorage.removeItem(storageKey); } catch (_) {}
  }

  function canPrepare() {
    try {
      const probeKey = `${storageKey}:probe`;
      sessionStorage.setItem(probeKey, '1');
      sessionStorage.removeItem(probeKey);
      return Boolean(config.actorId);
    } catch (_) { return false; }
  }

  async function takePrepared(section, params) {
    let value;
    try { value = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) {}
    if (!value) return null;
    if (value.expiresAt < Date.now() || value.path !== location.pathname || value.storeId !== storeId) {
      clearPrepared();
      return null;
    }
    if (value.section !== section || JSON.stringify(value.params || {}) !== JSON.stringify(params)) return null;
    clearPrepared();
    if (!value.identity || value.identity !== await identity()) return null;
    return value.data;
  }

  async function fetchSection(section, signal, params = {}) {
    if (!sections.has(section)) throw new Error('Sección de lectura no disponible.');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` };
    const deviceCookie = document.cookie.split(';').find((part) => part.trim().startsWith('pz_admin_device='));
    const device = deviceCookie ? decodeURIComponent(deviceCookie.trim().slice(16)) : '';
    if (/^[A-Za-z0-9_-]{43}$/.test(device)) headers['X-PZ-Admin-Device'] = device;
    if (config.supportMode) headers['X-PZ-Support-Store'] = storeId;
    const response = await nativeFetch(`${baseUrl}/api/pz/admin/read/${section}-bootstrap`, {
      method: 'POST', headers, body: JSON.stringify({ store_id: storeId, ...params }), cache: 'no-store', signal,
    });
    const result = await response.json();
    if (!response.ok || result?.ok !== true || !result.data) {
      throw new Error(response.status === 403 ? 'No tienes acceso a esta sección.' : 'No se pudo cargar la sección. Intenta nuevamente.');
    }
    return result.data;
  }

  function resolveIdle() {
    if (!documentReady || outstandingReads) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (outstandingReads) return;
      idleResolvers.splice(0).forEach((resolve) => resolve());
    }));
  }

  async function read(section, params = {}) {
    outstandingReads += 1;
    const started = performance.now();
    try {
      return await takePrepared(section, params) || await fetchSection(section, undefined, params);
    } finally {
      performance.measure?.(`pz-admin-read:${section}`, { start: started, end: performance.now() });
      outstandingReads -= 1;
      resolveIdle();
    }
  }

  function afterReady() {
    return new Promise((resolve) => { idleResolvers.push(resolve); resolveIdle(); });
  }

  async function track(work) {
    outstandingReads += 1;
    try { return await work; }
    finally { outstandingReads -= 1; resolveIdle(); }
  }

  function requestFor(url) {
    const path = url.pathname.replace(/\/$/, '');
    if (path === basePath) return { section: 'dashboard', params: {} };
    const relative = path.slice(basePath.length + 1);
    if (!path.startsWith(`${basePath}/`)) return {};
    const detail = relative.match(/^catalog\/category\/([a-z0-9]{15})(?:\/subcategory\/([a-z0-9]{15}))?$/);
    if (detail) return { section: 'catalog-detail', params: {
      category_id: detail[1], ...(detail[2] ? { subcategory_id: detail[2] } : {}),
    } };
    return { section: sections.has(relative) ? relative : '', params: {} };
  }

  function eligibleLink(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.dataset.pzNavigation === 'native') return null;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !basePath || (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`))) return null;
    if (url.pathname === location.pathname && url.search === location.search) return null;
    return { link, url };
  }

  function showSpinner(link) {
    link.classList.add('pz-navigation-pending');
    link.setAttribute('aria-busy', 'true');
    const icon = link.querySelector('.pz-admin-sidebar__nav-icon, .pz-admin-sidebar__settings-subicon, .pz-admin-mobile-bottom-nav__icon, .pz-admin-btn__icon, svg');
    const spinner = document.createElement('span');
    spinner.className = 'pz-navigation-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    if (icon) {
      icon.classList.add('pz-navigation-original-icon');
      icon.before(spinner);
    } else link.prepend(spinner);
    return () => {
      link.classList.remove('pz-navigation-pending');
      link.removeAttribute('aria-busy');
      icon?.classList.remove('pz-navigation-original-icon');
      spinner.remove();
    };
  }

  function reset() {
    if (!pending) return;
    pending.controller.abort();
    clearTimeout(pending.timeout);
    pending.restore();
    pending = null;
  }

  function reportError(message) {
    if (typeof window.adminToast === 'function') return window.adminToast(message, 'error');
    let alert = document.getElementById('pz-navigation-error');
    if (!alert) {
      alert = document.createElement('div');
      alert.id = 'pz-navigation-error';
      alert.setAttribute('role', 'alert');
      document.body.append(alert);
    }
    alert.textContent = message;
    setTimeout(() => alert.remove(), 6000);
  }

  // At window/bubble, existing link/form guards have already handled the click.
  window.addEventListener('click', (event) => {
    if (document.body.classList.contains('sidebar-open')) sidebarClickStates.set(event, true);
  }, true);
  window.addEventListener('click', async (event) => {
    if (event.defaultPrevented) return;
    const target = eligibleLink(event);
    if (!target) return;
    if (sidebarClickStates.has(event)) window.dispatchEvent(new Event('pz:admin-sidebar-open'));
    if (pending) { event.preventDefault(); return; }
    const { link, url } = target;
    const { section, params } = requestFor(url);
    const controller = new AbortController();
    const operation = { controller, restore: showSpinner(link), timeout: null };
    pending = operation;
    operation.timeout = setTimeout(() => {
      if (pending !== operation) return;
      reset(); clearPrepared();
      reportError('La página está tardando demasiado. Vuelve a intentarlo.');
    }, 20000);
    if (!section || !canPrepare()) return; // Keep native navigation when a handoff cannot be stored.
    event.preventDefault();
    try {
      const [data, authIdentity] = await Promise.all([fetchSection(section, controller.signal, params), identity()]);
      if (pending !== operation) return;
      if (authIdentity) {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({
            storeId, section, params, identity: authIdentity, path: url.pathname,
            expiresAt: Date.now() + 15000, data,
          }));
        } catch (_) { clearPrepared(); }
      }
      location.assign(url.href);
    } catch (error) {
      if (pending !== operation) return;
      reset(); clearPrepared();
      reportError(error?.message || 'No se pudo cargar la sección. Intenta nuevamente.');
    }
  });

  document.addEventListener('DOMContentLoaded', () => { documentReady = true; resolveIdle(); }, { once: true });
  window.addEventListener('pageshow', reset);
  window.addEventListener('pagehide', reset);
  window.addEventListener('beforeunload', (event) => {
    // A cancelled native unsaved-changes dialog must leave the link usable.
    queueMicrotask(() => { if (event.defaultPrevented) { reset(); clearPrepared(); } });
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pending) { reset(); clearPrepared(); }
  });
  window.PZAdminNavigation = Object.freeze({ read, track, afterReady, get pending() { return Boolean(pending); } });
})();
