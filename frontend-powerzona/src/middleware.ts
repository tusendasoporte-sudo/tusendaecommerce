import { defineMiddleware } from 'astro:middleware';
import {
  getTemporaryPasswordRedirect,
  isMasterAdmin,
  isStoreUser,
  refreshAuthFromCookie,
  requiresTemporaryPasswordChange,
} from './lib/auth';
import { getLegacyAdminSection, getStoreAdminBasePath, getStoreAdminPath } from './lib/adminRoutes';
import { requireCurrentStoreForAdmin, StoreContextError, STORE_CONTEXT_ERRORS } from './lib/storeContext';
import { getStoreAccessContext } from './lib/storeTeam';
import { hasStorePermission, type StorePermission } from './lib/storeTeamPermissions';
import {
  publicAccessDecision,
  publicSecurityResolverForPath,
  renderPublicUnavailable,
  renderVpnUnavailable,
} from './lib/publicSecurity';
import { optimizePublicCatalogResponse } from './lib/publicCatalogResponse';
import { appendPublicRequestTiming } from './lib/publicRequestTiming';
import { readAdminDeviceToken } from './lib/adminDevice';
import { getAdminAppPolicy, parseNativeAdminAppUserAgent } from './lib/mobileAdminReleases';
import {
  canOpenPromoAdminSection,
  firstAllowedPromoAdminPath,
  getPromoAdminSectionPath,
  normalizePromoAdminSection,
  resolvePromoAdminStore,
} from './lib/promoAdminShell';
import {
  applyPromoPublicHeaders,
  customPromoPublicPath,
  platformPromoPublicPath,
  PROMO_PUBLIC_INTERNAL_PATH,
  PromoPublicShellError,
  promoPublicUnavailable,
  readCustomHostPromoShell,
  readPlatformPromoShell,
} from './lib/promoPublicShell';
import { servePromoPublicRepresentation } from './lib/promoPerformance';
import { promoPublicLogoMediaPath, proxyPromoPublicMedia } from './lib/promoPublicMediaProxy';
import {
  customPromoSeoResource,
  promoSeoResourceResponse,
  readCustomHostPromoSeo,
} from './lib/promoPublicSeo';
import { PROMO_CUSTOM_ANALYTICS_PATH } from './lib/promoPublicAnalytics';
import {
  applyPromoSecurityHeaders,
  promoSecurityUnavailable,
  validatePromoFrontendRequest,
} from './lib/promoSecurity';

type AdminAccessRule = Readonly<{
  any?: readonly StorePermission[];
  all?: readonly StorePermission[];
  primary?: boolean;
}>;

function adminAccessRule(section: string): AdminAccessRule | null {
  const normalized = String(section || '').replace(/^\/+|\/+$/g, '');
  if (!normalized) return { all: ['analytics.view', 'orders.view', 'catalog.view'] };
  if (normalized === 'pageviews' || normalized === 'app-installations' || normalized === 'app-installation-details') {
    return { any: ['analytics.view'] };
  }
  if (normalized === 'profits') return { all: ['orders.view', 'catalog.view'] };
  if (normalized === 'account' || normalized.startsWith('account/') || normalized === 'change-temporary-password') return null;
  if (normalized === 'mobile-app') return null;
  if (normalized === 'team' || normalized.startsWith('team/')) return { primary: true };
  if (normalized === 'products' || normalized.startsWith('products/') || normalized === 'catalog' || normalized.startsWith('catalog/')) return { any: ['catalog.view'] };
  if (normalized === 'orders' || normalized.startsWith('orders/')) return { any: ['orders.view'] };
  if (normalized === 'shipping') return { any: ['shipping.manage'] };
  if (normalized === 'gifts') return { any: ['gifts.manage'] };
  if (normalized === 'expirations') return { any: ['catalog.expirations.manage'] };
  if (normalized === 'promos/raffles') return { any: ['raffles.manage'] };
  if (normalized.startsWith('promos/visuals/')) return { any: ['promotions.manage'] };
  if (normalized === 'promos/new') return { any: ['promotions.manage'] };
  if (normalized === 'promos/coupons/new') return { any: ['coupons.manage'] };
  if (normalized === 'promos') return { any: ['promotions.manage', 'coupons.manage'] };
  if (normalized === 'push-campaigns') return { any: ['marketing.push.manage'] };
  if (normalized === 'notifications') return { any: ['notifications.view'] };
  if (normalized === 'security' || normalized.startsWith('security/')) return { any: ['security.view'] };
  if (normalized === 'store-settings/rating') return { any: ['reviews.manage'] };
  if (normalized === 'store-settings') {
    return { any: ['store.settings.manage', 'reviews.manage', 'landing_qr.manage'] };
  }
  if (normalized === 'organization') return { any: ['promotions.manage', 'catalog.products.visibility'] };
  return { any: [] };
}

function primaryAdminCanReachRafflesGate(section: string, isPrimaryAdmin: boolean) {
  const normalized = String(section || '').replace(/^\/+|\/+$/g, '');
  return normalized === 'promos/raffles' && isPrimaryAdmin;
}

function primaryAdminCanReachSecurityGate(section: string, isPrimaryAdmin: boolean) {
  const normalized = String(section || '').replace(/^\/+|\/+$/g, '');
  return (normalized === 'security' || normalized.startsWith('security/')) && isPrimaryAdmin;
}

function primaryAdminCanReachPushCampaignsGate(section: string, isPrimaryAdmin: boolean) {
  const normalized = String(section || '').replace(/^\/+|\/+$/g, '');
  return normalized === 'push-campaigns' && isPrimaryAdmin;
}

function firstAllowedAdminPath(storeSlug: string, access: { permissions: readonly StorePermission[] }) {
  const candidates: ReadonlyArray<readonly [StorePermission, string]> = [
    ['analytics.view', 'pageviews'],
    ['orders.view', 'orders'],
    ['catalog.expirations.manage', 'expirations'],
    ['catalog.view', 'products'],
    ['shipping.manage', 'shipping'],
    ['gifts.manage', 'gifts'],
    ['promotions.manage', 'promos'],
    ['coupons.manage', 'promos'],
    ['raffles.manage', 'promos/raffles'],
    ['marketing.push.manage', 'push-campaigns'],
    ['notifications.view', 'notifications'],
    ['security.view', 'security'],
    ['store.settings.manage', 'store-settings'],
    ['reviews.manage', 'store-settings'],
    ['landing_qr.manage', 'store-settings'],
  ];
  const match = candidates.find(([permission]) => access.permissions.includes(permission));
  return match ? getStoreAdminPath(storeSlug, match[1]) : '';
}

function renderPermissionBlock(homePath: string) {
  return new Response(`<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>No tienes permiso</title><meta name="robots" content="noindex,nofollow,noarchive"/>
<style>:root{font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#f8fafc}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(560px,100%);padding:28px;border:1px solid #dbe3ef;border-radius:20px;background:#fff;box-shadow:0 20px 60px rgba(15,23,42,.1)}h1{margin:0;font-size:28px}p{color:#64748b;line-height:1.55}a{display:inline-flex;min-height:42px;align-items:center;border-radius:10px;background:#0f172a;color:#fff;padding:0 15px;text-decoration:none;font-weight:800}</style>
</head><body><main><h1>No tienes permiso</h1><p>Tu acceso no incluye esta sección. Si necesitas usarla, consulta al Administrador principal de la tienda.</p><a href="${homePath}">Ir a una sección disponible</a></main></body></html>`, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow,noarchive',
    },
  });
}

function renderPromoPermissionBlock(homePath: string) {
  return new Response(`<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Módulo no disponible</title><meta name="robots" content="noindex,nofollow,noarchive"/>
<style>:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(560px,100%);padding:28px;border:1px solid #d8dfeb;border-radius:20px;background:#fff;box-shadow:0 20px 60px rgba(23,32,51,.1)}span{display:inline-flex;border-radius:999px;background:#f4ecff;color:#6b36a8;padding:6px 10px;font-size:12px;font-weight:800}h1{margin:16px 0 0;font-size:28px}p{color:#667085;line-height:1.55}a{display:inline-flex;min-height:44px;align-items:center;border-radius:10px;background:#6b36a8;color:#fff;padding:0 16px;text-decoration:none;font-weight:800}a:focus-visible{outline:3px solid #d6b8ff;outline-offset:3px}</style>
</head><body><main><span>Tienda Promo</span><h1>Módulo no disponible</h1><p>Tu acceso actual no incluye este módulo. La navegación permanece cerrada hasta que el permiso y la capacidad sean efectivos.</p><a href="${homePath}">Volver al resumen Promo</a></main></body></html>`, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function renderPromoValidationBlock(code: string, status: number) {
  const entitlementBlocked = [
    'blocked_by_plan',
    'promo_capability_denied',
    'promo_site_inactive',
    'store_inactive',
  ].includes(code);
  const title = entitlementBlocked
    ? 'Tienda Promo no habilitada'
    : 'No se pudo validar el acceso Promo';
  const message = entitlementBlocked
    ? 'El panel permanece cerrado porque la tienda, el plan o la capacidad raíz no están operativos. Contacta al Master para revisar la asignación.'
    : 'Por seguridad no se habilitó ningún módulo ni se usó otro tipo de panel como alternativa. Intenta iniciar sesión nuevamente; si continúa, contacta al Master.';
  const responseStatus = entitlementBlocked ? 403 : (status >= 500 && status <= 599 ? status : 503);
  return new Response(`<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Acceso Promo no disponible</title><meta name="robots" content="noindex,nofollow,noarchive"/>
<style>:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(580px,100%);padding:28px;border:1px solid #efd6a8;border-radius:20px;background:#fffaf0;box-shadow:0 20px 60px rgba(23,32,51,.1)}h1{margin:0;font-size:28px}p{color:#765c2b;line-height:1.55}a{display:inline-flex;min-height:44px;align-items:center;border-radius:10px;background:#172033;color:#fff;padding:0 16px;text-decoration:none;font-weight:800}a:focus-visible{outline:3px solid #c8b16a;outline-offset:3px}</style>
</head><body><main><h1>${title}</h1><p>${message}</p><a href="/login">Volver al acceso</a></main></body></html>`, {
    status: responseStatus,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function renderAdminBlock(message: string) {
  return new Response(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Acceso administrativo</title>
    <style>
      :root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f8fafc; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%); }
      main { width: min(520px, 100%); border: 1px solid #fecaca; border-radius: 8px; background: #fff1f2; color: #991b1b; padding: 24px; box-shadow: 0 20px 60px rgba(15, 23, 42, .10); }
      h1 { margin: 0; font-size: 28px; line-height: 1.05; font-weight: 1000; letter-spacing: 0; }
      p { margin: 10px 0 0; color: #7f1d1d; font-size: 14px; line-height: 1.45; font-weight: 850; }
      a { display: inline-flex; margin-top: 18px; min-height: 40px; align-items: center; justify-content: center; border-radius: 8px; background: #0f172a; color: #fff; padding: 10px 13px; text-decoration: none; font-size: 13px; font-weight: 1000; }
    </style>
  </head>
  <body>
    <main>
      <h1>Acceso no disponible</h1>
      <p>${message}</p>
      <a href="/login">Volver al acceso</a>
    </main>
  </body>
</html>`, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestStartedAt = performance.now();
  let authDurationMs = 0;
  let storeDurationMs = 0;
  let permissionDurationMs = 0;
  let promoAccessDurationMs = 0;
  const pathname = context.url.pathname;
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isMasterRoute = pathname === '/master' || pathname.startsWith('/master/');
  const professionalAdminMatch = pathname.match(/^\/t\/([^/]+)\/admin(?:\/(.*))?$/);
  const isProfessionalAdminRoute = Boolean(professionalAdminMatch);
  const isAdminApiRoute = pathname.startsWith('/api/admin/');
  const isAdminAppControlApi = pathname.startsWith('/api/admin/mobile-app/');
  const nativeAdminApp = parseNativeAdminAppUserAgent(context.request.headers.get('user-agent') || '');

  if (context.locals.promoPublicProfile) return await next();

  let promoSecurityDecision;
  try {
    promoSecurityDecision = validatePromoFrontendRequest(context.request);
  } catch (error) {
    return promoSecurityUnavailable(error, pathname);
  }

  const publicLogoMedia = promoPublicLogoMediaPath(pathname);
  if (publicLogoMedia) {
    if (!promoSecurityDecision.platform) return promoPublicUnavailable(404);
    return applyPromoSecurityHeaders(await proxyPromoPublicMedia(context.request, publicLogoMedia));
  }

  if (!promoSecurityDecision.platform) {
    if (pathname === PROMO_CUSTOM_ANALYTICS_PATH) return applyPromoSecurityHeaders(await next());
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') return promoPublicUnavailable(404);
    const seoResource = customPromoSeoResource(pathname);
    if (seoResource) {
      if (context.url.search) return promoPublicUnavailable(404);
      try {
        return promoSeoResourceResponse(await readCustomHostPromoSeo(context.request, seoResource));
      } catch (error) {
        const status = error instanceof PromoPublicShellError ? error.status : 421;
        return promoPublicUnavailable(status === 404 ? 404 : 421);
      }
    }
    const publicPath = customPromoPublicPath(pathname);
    let resolved;
    try {
      resolved = await readCustomHostPromoShell(
        context.request,
        publicPath.allowed && !context.url.search ? publicPath.locale : undefined,
      );
    } catch (error) {
      const status = error instanceof PromoPublicShellError ? error.status : 421;
      return promoPublicUnavailable(status === 404 && publicPath.allowed ? 404 : 421);
    }
    if (!publicPath.allowed || context.url.search) return promoPublicUnavailable(404);
    if (resolved.route.action === 'redirect' && resolved.route.location) {
      return applyPromoPublicHeaders(context.redirect(resolved.route.location, 308), resolved);
    }
    if (!resolved.profile || !resolved.seo) return promoPublicUnavailable(421);
    context.locals.promoPublicProfile = resolved.profile;
    context.locals.promoPublicSeo = resolved.seo;
    const response = await servePromoPublicRepresentation(
      context.request,
      resolved,
      () => context.rewrite(PROMO_PUBLIC_INTERNAL_PATH),
    );
    return applyPromoPublicHeaders(response, resolved);
  }

  const platformPromoPath = platformPromoPublicPath(pathname);
  if (platformPromoPath) {
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') return promoPublicUnavailable(404);
    if (context.url.search) return promoPublicUnavailable(404);
    let resolved;
    try {
      resolved = await readPlatformPromoShell(
        context.request,
        platformPromoPath.publicSlug,
        platformPromoPath.locale,
      );
    } catch (error) {
      const status = error instanceof PromoPublicShellError ? error.status : 503;
      return promoPublicUnavailable(status);
    }
    if (resolved.route.action === 'redirect' && resolved.route.location) {
      return applyPromoPublicHeaders(context.redirect(resolved.route.location, 308), resolved);
    }
    if (!resolved.profile || !resolved.seo) return promoPublicUnavailable(404);
    context.locals.promoPublicProfile = resolved.profile;
    context.locals.promoPublicSeo = resolved.seo;
    const response = await servePromoPublicRepresentation(
      context.request,
      resolved,
      () => context.rewrite(PROMO_PUBLIC_INTERNAL_PATH),
    );
    return applyPromoPublicHeaders(response, resolved);
  }

  if (nativeAdminApp && isAdminApiRoute && !isAdminAppControlApi) {
    const cookie = context.request.headers.get('cookie') || '';
    const apiAuth = await refreshAuthFromCookie(cookie);
    const deviceToken = readAdminDeviceToken(cookie);
    if (apiAuth.authStore.isValid && isStoreUser(apiAuth.authStore.record as any) && deviceToken) {
      const policy = await getAdminAppPolicy(
        import.meta.env.PUBLIC_POCKETBASE_URL,
        apiAuth.authStore.token,
        deviceToken,
        nativeAdminApp,
      );
      if (policy.data?.update_required) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'admin_app_update_required',
          minimum_supported_version_code: policy.data.minimum_supported_version_code,
          portal_path: '/admin/mobile-app',
        }), {
          status: 426,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
        });
      }
    }
  }

  if (!isAdminRoute && !isMasterRoute && !isProfessionalAdminRoute) {
    const resolver = publicSecurityResolverForPath(pathname);
    let securityDurationMs = 0;
    if (resolver) {
      let clientAddress = '';
      try { clientAddress = context.clientAddress; } catch (_) {}
      const securityStartedAt = performance.now();
      const decision = await publicAccessDecision(context.request, clientAddress, resolver);
      securityDurationMs = performance.now() - securityStartedAt;
      if (!decision.allowed) {
        const blockedResponse = decision.reason === 'vpn_or_proxy_detected'
          ? renderVpnUnavailable(context.request.url)
          : renderPublicUnavailable();
        return appendPublicRequestTiming(blockedResponse, {
          securityDurationMs,
          renderDurationMs: 0,
          totalDurationMs: performance.now() - requestStartedAt,
        });
      }
    }
    const renderStartedAt = performance.now();
    const response = await next();
    const renderDurationMs = performance.now() - renderStartedAt;
    const optimizedResponse = optimizePublicCatalogResponse(context.request, response, pathname);
    return resolver
      ? appendPublicRequestTiming(optimizedResponse, {
          securityDurationMs,
          renderDurationMs,
          totalDurationMs: performance.now() - requestStartedAt,
        })
      : optimizedResponse;
  }

  const authStartedAt = performance.now();
  const authPb = await refreshAuthFromCookie(context.request.headers.get('cookie') || '');
  authDurationMs = performance.now() - authStartedAt;
  context.locals.adminAuthPb = authPb;

  if (!authPb.authStore.isValid || !authPb.authStore.record) {
    if (isProfessionalAdminRoute) {
      const storeSlug = professionalAdminMatch?.[1] || '';
      return pathname === getStoreAdminBasePath(storeSlug) ? next() : context.redirect(getStoreAdminBasePath(storeSlug));
    }
    return context.redirect(isMasterRoute ? '/master-login' : '/login');
  }

  if (isMasterRoute) {
    if (!isMasterAdmin(authPb.authStore.record as any)) {
      if (isStoreUser(authPb.authStore.record as any)) return context.redirect('/admin');
      return renderAdminBlock('Este acceso es solo para administracion principal.');
    }
    return next();
  }

  if (isMasterAdmin(authPb.authStore.record as any) && !isProfessionalAdminRoute) {
    return context.redirect('/master');
  }

  try {
    const storeStartedAt = performance.now();
    const adminContext = await requireCurrentStoreForAdmin(authPb, { pathname });
    storeDurationMs = performance.now() - storeStartedAt;
    context.locals.adminContext = adminContext;
    const currentStoreSlug = String(adminContext.store.slug || '').trim().toLowerCase();
    const canonicalAdminPath = getStoreAdminBasePath(currentStoreSlug);
    const temporaryPath = getTemporaryPasswordRedirect(adminContext.user, currentStoreSlug)
      || `${canonicalAdminPath}/change-temporary-password`;
    const normalizedPath = pathname.replace(/\/+$/, '') || '/';
    const isTemporaryRoute = normalizedPath === temporaryPath
      || normalizedPath === '/admin/change-temporary-password';

    if (!adminContext.isMasterSupport && requiresTemporaryPasswordChange(adminContext.user)) {
      if (normalizedPath !== temporaryPath) return context.redirect(temporaryPath);
      return next();
    }

    if (isTemporaryRoute) return context.redirect(canonicalAdminPath);

    const requestedSection = isAdminRoute
      ? getLegacyAdminSection(pathname)
      : String(professionalAdminMatch?.[2] || '');

    const promoAccessStartedAt = performance.now();
    const promoResolution = await resolvePromoAdminStore({
      baseUrl: import.meta.env.PUBLIC_POCKETBASE_URL,
      token: authPb.authStore.token,
      supportStoreId: adminContext.isMasterSupport ? adminContext.storeId : undefined,
    });
    promoAccessDurationMs = performance.now() - promoAccessStartedAt;

    if (promoResolution.kind === 'blocked') {
      return renderPromoValidationBlock(promoResolution.code, promoResolution.status);
    }

    if (promoResolution.kind === 'promo') {
      const projectedPromoStoreSlug = String(promoResolution.context.store.slug || '').trim().toLowerCase();
      if (!projectedPromoStoreSlug || projectedPromoStoreSlug !== currentStoreSlug) {
        return renderPromoValidationBlock('promo_permissions_unavailable', 503);
      }
      context.locals.promoAccessContext = promoResolution.context;
      const promoSection = normalizePromoAdminSection(requestedSection);
      const promoHomePath = firstAllowedPromoAdminPath(currentStoreSlug, promoResolution.context)
        || canonicalAdminPath;

      if (!promoSection) return context.redirect(promoHomePath);
      if (!canOpenPromoAdminSection(promoResolution.context, promoSection)) {
        return renderPromoPermissionBlock(promoHomePath);
      }

      if (isAdminRoute) {
        return context.redirect(getPromoAdminSectionPath(currentStoreSlug, promoSection));
      }

      const routeStoreSlug = String(professionalAdminMatch?.[1] || '').trim().toLowerCase();
      if (routeStoreSlug !== currentStoreSlug) {
        return renderAdminBlock('Este usuario no pertenece a esta tienda.');
      }
      if (promoSection === 'analytics') {
        return context.rewrite('/promo-analytics-admin-internal');
      }
    } else if (promoResolution.kind === 'commerce') {
      if (nativeAdminApp && !adminContext.isMasterSupport && requestedSection !== 'mobile-app'
        && requestedSection !== 'change-temporary-password') {
        const deviceToken = readAdminDeviceToken(context.request.headers.get('cookie') || '');
        if (deviceToken) {
          const policy = await getAdminAppPolicy(
            import.meta.env.PUBLIC_POCKETBASE_URL,
            authPb.authStore.token,
            deviceToken,
            nativeAdminApp,
          );
          if (policy.data) context.locals.adminAppPolicy = policy.data;
          if (policy.data?.update_required) return context.redirect(getStoreAdminPath(currentStoreSlug, 'mobile-app'));
        }
      }
      if (adminContext.isMasterSupport
        && (requestedSection === 'account' || requestedSection.startsWith('account/') || requestedSection === 'change-temporary-password')) {
        return context.redirect(`/master/stores/${encodeURIComponent(adminContext.storeId)}`);
      }
      const accessRule = adminAccessRule(requestedSection);
      if (accessRule) {
        let storeAccess;
        try {
          const permissionStartedAt = performance.now();
          storeAccess = await getStoreAccessContext({
            baseUrl: import.meta.env.PUBLIC_POCKETBASE_URL,
            token: authPb.authStore.token,
            supportStoreId: adminContext.isMasterSupport ? adminContext.storeId : undefined,
          });
          permissionDurationMs = performance.now() - permissionStartedAt;
          context.locals.storeAccessContext = storeAccess;
        } catch (_) {
          return renderAdminBlock('No se pudo validar tus permisos. Inicia sesión nuevamente.');
        }
        const permissionContext = {
          permissions: storeAccess.access.permissions,
          is_primary_admin: storeAccess.access.is_primary_admin,
          blocked_by_plan: storeAccess.access.blocked_by_plan,
        };
        const allowed = primaryAdminCanReachRafflesGate(
          requestedSection,
          storeAccess.access.is_primary_admin === true,
        ) || primaryAdminCanReachSecurityGate(
          requestedSection,
          storeAccess.access.is_primary_admin === true,
        ) || primaryAdminCanReachPushCampaignsGate(
          requestedSection,
          storeAccess.access.is_primary_admin === true,
        ) || (accessRule.primary === true
          ? storeAccess.access.is_primary_admin === true
          : accessRule.all?.length
            ? accessRule.all.every((permission) => hasStorePermission(permissionContext, permission))
            : (accessRule.any || []).some((permission) => hasStorePermission(permissionContext, permission)));
        if (!allowed) {
          const fallback = firstAllowedAdminPath(currentStoreSlug, storeAccess.access);
          if (!requestedSection && fallback && fallback !== canonicalAdminPath) return context.redirect(fallback);
          return renderPermissionBlock(fallback || canonicalAdminPath);
        }
      }

      if (isAdminRoute) {
        return context.redirect(getStoreAdminPath(currentStoreSlug, getLegacyAdminSection(pathname)));
      }

      if (isProfessionalAdminRoute) {
        const routeStoreSlug = String(professionalAdminMatch?.[1] || '').trim().toLowerCase();
        if (routeStoreSlug !== currentStoreSlug) {
          return renderAdminBlock('Este usuario no pertenece a esta tienda.');
        }
      }
    }
  } catch (error) {
    if (error instanceof StoreContextError) {
      if (error.code === STORE_CONTEXT_ERRORS.MASTER_ADMIN) {
        return context.redirect('/master');
      }

      if (error.code === STORE_CONTEXT_ERRORS.UNAUTHENTICATED) {
        return context.redirect('/login');
      }

      return renderAdminBlock(error.message);
    }

    return renderAdminBlock('No se pudo validar el acceso administrativo. Intenta nuevamente.');
  }

  const response = await next();
  const totalDurationMs = performance.now() - requestStartedAt;
  response.headers.append(
    'Server-Timing',
    [
      `pz-auth;dur=${authDurationMs.toFixed(1)}`,
      `pz-store;dur=${storeDurationMs.toFixed(1)}`,
      `pz-promo-access;dur=${promoAccessDurationMs.toFixed(1)}`,
      `pz-permissions;dur=${permissionDurationMs.toFixed(1)}`,
      `pz-admin-total;dur=${totalDurationMs.toFixed(1)}`,
    ].join(', '),
  );
  response.headers.set('X-PZ-Admin-Context', 'request-scoped');
  return response;
});
