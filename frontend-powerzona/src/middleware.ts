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

type AdminAccessRule = Readonly<{
  any?: readonly StorePermission[];
  all?: readonly StorePermission[];
  primary?: boolean;
}>;

function adminAccessRule(section: string): AdminAccessRule | null {
  const normalized = String(section || '').replace(/^\/+|\/+$/g, '');
  if (!normalized) return { all: ['analytics.view', 'orders.view', 'catalog.view'] };
  if (normalized === 'pageviews') return { any: ['analytics.view'] };
  if (normalized === 'profits') return { all: ['orders.view', 'catalog.view'] };
  if (normalized === 'account' || normalized === 'change-temporary-password') return null;
  if (normalized === 'team' || normalized.startsWith('team/')) return { primary: true };
  if (normalized === 'products' || normalized.startsWith('products/') || normalized === 'catalog' || normalized.startsWith('catalog/')) return { any: ['catalog.view'] };
  if (normalized === 'orders' || normalized.startsWith('orders/')) return { any: ['orders.view'] };
  if (normalized === 'shipping') return { any: ['shipping.manage'] };
  if (normalized === 'gifts') return { any: ['gifts.manage'] };
  if (normalized === 'expirations') return { any: ['catalog.expirations.manage'] };
  if (normalized === 'promos/raffles') return { any: ['raffles.manage'] };
  if (normalized === 'promos') return { any: ['promotions.manage', 'coupons.manage'] };
  if (normalized === 'notifications') return { any: ['notifications.view'] };
  if (normalized === 'security' || normalized.startsWith('security/')) return { any: ['security.view'] };
  if (normalized === 'store-settings') {
    return { any: ['store.settings.manage', 'reviews.manage', 'landing_qr.manage'] };
  }
  if (normalized === 'organization') return { any: ['promotions.manage', 'catalog.products.visibility'] };
  return { any: [] };
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
  const pathname = context.url.pathname;
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isMasterRoute = pathname === '/master' || pathname.startsWith('/master/');
  const professionalAdminMatch = pathname.match(/^\/t\/([^/]+)\/admin(?:\/(.*))?$/);
  const isProfessionalAdminRoute = Boolean(professionalAdminMatch);

  if (!isAdminRoute && !isMasterRoute && !isProfessionalAdminRoute) {
    return next();
  }

  const authPb = await refreshAuthFromCookie(context.request.headers.get('cookie') || '');

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

  if (isMasterAdmin(authPb.authStore.record as any)) {
    return context.redirect('/master');
  }

  try {
    const adminContext = await requireCurrentStoreForAdmin(authPb);
    const currentStoreSlug = String(adminContext.store.slug || '').trim().toLowerCase();
    const canonicalAdminPath = getStoreAdminBasePath(currentStoreSlug);
    const temporaryPath = getTemporaryPasswordRedirect(adminContext.user, currentStoreSlug)
      || `${canonicalAdminPath}/change-temporary-password`;
    const normalizedPath = pathname.replace(/\/+$/, '') || '/';
    const isTemporaryRoute = normalizedPath === temporaryPath
      || normalizedPath === '/admin/change-temporary-password';

    if (requiresTemporaryPasswordChange(adminContext.user)) {
      if (normalizedPath !== temporaryPath) return context.redirect(temporaryPath);
      return next();
    }

    if (isTemporaryRoute) return context.redirect(canonicalAdminPath);

    const requestedSection = isAdminRoute
      ? getLegacyAdminSection(pathname)
      : String(professionalAdminMatch?.[2] || '');
    const accessRule = adminAccessRule(requestedSection);
    if (accessRule) {
      let storeAccess;
      try {
        storeAccess = await getStoreAccessContext({
          baseUrl: import.meta.env.PUBLIC_POCKETBASE_URL,
          token: authPb.authStore.token,
        });
      } catch (_) {
        return renderAdminBlock('No se pudo validar tus permisos. Inicia sesión nuevamente.');
      }
      const permissionContext = {
        permissions: storeAccess.access.permissions,
        is_primary_admin: storeAccess.access.is_primary_admin,
        blocked_by_plan: storeAccess.access.blocked_by_plan,
      };
      const allowed = accessRule.primary === true
        ? storeAccess.access.is_primary_admin === true
        : accessRule.all?.length
          ? accessRule.all.every((permission) => hasStorePermission(permissionContext, permission))
          : (accessRule.any || []).some((permission) => hasStorePermission(permissionContext, permission));
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

  return next();
});
