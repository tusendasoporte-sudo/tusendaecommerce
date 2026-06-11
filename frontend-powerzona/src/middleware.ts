import { defineMiddleware } from 'astro:middleware';
import { refreshAuthFromCookie } from './lib/auth';
import { requireCurrentStoreForAdmin, StoreContextError, STORE_CONTEXT_ERRORS } from './lib/storeContext';

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

  if (!isAdminRoute && !isMasterRoute) {
    return next();
  }

  const authPb = await refreshAuthFromCookie(context.request.headers.get('cookie') || '');

  if (!authPb.authStore.isValid || !authPb.authStore.record) {
    return context.redirect('/login');
  }

  if (isMasterRoute) {
    return next();
  }

  try {
    await requireCurrentStoreForAdmin(authPb);
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
