import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const layout = read('../src/layouts/Layout.astro');
const shell = read('../src/components/StorefrontAppShell.astro');
const hubProxy = read('../src/pages/api/storefront/v1/customer-hub.ts');
const assetLinks = read('../src/pages/.well-known/assetlinks.json.ts');
const checkout = read('../src/pages/checkout.astro');
const manifest = read('../../mobile-storefront/app/src/main/AndroidManifest.xml');
const activity = read('../../mobile-storefront/app/src/main/java/com/tusenda84/storefront/StorefrontActivity.java');
const strings = read('../../mobile-storefront/app/src/main/res/values/strings.xml');
const activityLayout = read('../../mobile-storefront/app/src/main/res/layout/activity_storefront.xml');

test('la experiencia nativa conserva el orden Buscar, Cupones, Inicio, Moneda y Carrito', () => {
  assert.match(layout, /<StorefrontAppShell[^>]+publicPathPrefix/);
  const search = shell.indexOf('aria-label="Buscar"');
  const coupons = shell.indexOf('aria-label="Mis cupones"');
  const home = shell.indexOf('aria-label="Inicio"');
  const currency = shell.indexOf('data-pz-currency-menu');
  const cart = shell.indexOf('aria-label="Abrir carrito"');
  assert.ok(search >= 0 && search < coupons && coupons < home && home < currency && currency < cart);
  assert.match(shell, /<path d="M8 3 4 7l4 4"\/><path d="M4 7h16"\/><path d="m16 21 4-4-4-4"\/><path d="M20 17H4"\/>/);
  assert.ok(shell.includes('TuSenda84Storefront\\/[0-9]'));
  assert.match(shell, /import\.meta\.env\.DEV/);
  assert.match(shell, /body\.pz-storefront-app #cart-floating-btn[^}]+display:\s*none/);
});

test('campana y cartera usan el hub privado y ofrecen su ciclo completo', () => {
  for (const label of [
    'Abrir notificaciones', 'Marcar todas leídas', 'Eliminar leídas', 'Eliminar todas',
    'Pon tu cupón', 'Usar este cupón', 'Quitar',
  ]) assert.match(shell, new RegExp(label));
  for (const action of [
    'notification_mark_read', 'notification_delete', 'notifications_mark_all_read',
    'notifications_delete', 'coupon_claim', 'coupon_select', 'coupon_unselect', 'coupon_remove',
  ]) assert.match(shell, new RegExp(action));
  assert.match(shell, /Las nuevas aparecerán aquí durante 30 días/);
  assert.match(shell, /credentials:\s*'same-origin'/);
  assert.match(hubProxy, /pz_storefront_session/);
  assert.match(hubProxy, /private, no-store/);
  assert.match(hubProxy, /SESSION_PATTERN/);
  assert.match(checkout, /PZCouponWallet\?\.claim/);
  assert.match(checkout, /PZCouponWallet\?\.unselect/);
});

test('la APK sustituye el buscador superior por una campana solo cuando existen notificaciones', () => {
  assert.match(shell, /body\.pz-storefront-app \.public-search-shell/);
  assert.match(shell, /body\.pz-storefront-app \.public-mobile-search/);
  assert.match(shell, /topSearch\.replaceWith\(inboxOpen\)/);
  assert.match(shell, /inboxOpen\.hidden = state\.inbox\.length < 1/);
  assert.match(shell, /\.pz-native-inbox-open\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/);
  assert.match(shell, /\.pz-native-inbox-open svg[^}]+fill:\s*none[^}]+stroke:\s*currentColor/);
  assert.match(shell, /:global\(\.pz-native-notification\)/);
  assert.match(shell, /:global\(\.pz-native-coupon\)/);
});

test('los enlaces HTTPS verificados abren únicamente la ruta de la tienda en la APK firmada', () => {
  assert.match(manifest, /android:autoVerify="true"/);
  assert.match(manifest, /android:host="\$\{storefrontHost\}"/);
  assert.match(manifest, /android:pathPrefix="\$\{storefrontPathPrefix\}"/);
  assert.match(assetLinks, /com\.tusenda84\.powerzona/);
  assert.match(assetLinks, /12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72/);
  assert.match(activity, /openAppLink\(intent\)/);
  assert.match(activity, /StorefrontDeepLink\.isAllowedInternalNavigation/);
});

test('splash y recuperación distinguen internet, VPN o proxy y permiten recargar', () => {
  assert.match(activityLayout, /@\+id\/storefront_splash/);
  assert.match(activityLayout, /@drawable\/storefront_splash/);
  assert.match(activity, /postVisualStateCallback/);
  assert.match(activity, /TRANSPORT_VPN/);
  assert.match(activity, /showConnectivityError\(\)/);
  assert.match(activity, /20_000/);
  assert.match(strings, /<string name="retry">Recargar<\/string>/);
  assert.match(strings, /Desactiva la VPN o el proxy y toca Recargar/);
  assert.match(strings, /Comprueba tu conexión a internet/);
});
