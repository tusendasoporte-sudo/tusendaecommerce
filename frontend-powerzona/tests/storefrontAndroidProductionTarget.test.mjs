import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const gradle = readFileSync(new URL('../../mobile-storefront/app/build.gradle', import.meta.url), 'utf8');
const registrationClient = readFileSync(new URL(
  '../../mobile-storefront/app/src/main/java/com/tusenda84/storefront/StorefrontRegistrationClient.java',
  import.meta.url,
), 'utf8');
const runner = readFileSync(new URL('../../mobile-storefront/runner/store-app-runner.ps1', import.meta.url), 'utf8');
const directManifest = readFileSync(new URL(
  '../../mobile-storefront/app/src/direct/AndroidManifest.xml', import.meta.url,
), 'utf8');
const playManifest = readFileSync(new URL(
  '../../mobile-storefront/app/src/play/AndroidManifest.xml', import.meta.url,
), 'utf8');
const mainManifest = readFileSync(new URL(
  '../../mobile-storefront/app/src/main/AndroidManifest.xml', import.meta.url,
), 'utf8');
const notifications = readFileSync(new URL(
  '../../mobile-storefront/app/src/main/java/com/tusenda84/storefront/StorefrontNotifications.java',
  import.meta.url,
), 'utf8');
const powerZonaNotificationIcon = readFileSync(new URL(
  '../../mobile-storefront/brands/powerzona/notification_icon.xml', import.meta.url,
), 'utf8');
const powerZonaBrand = JSON.parse(readFileSync(new URL(
  '../../mobile-storefront/brands/powerzona/brand.json', import.meta.url,
), 'utf8'));

test('una release deriva el API productivo desde la URL pública de su tienda', () => {
  assert.match(gradle, /def productionApiBaseUrl = httpsOriginFromStoreUrl\(storeUrl\)/);
  assert.match(
    gradle,
    /release\s*\{[\s\S]*?buildConfigField 'String', 'API_BASE_URL', javaStringLiteral\(productionApiBaseUrl\)/,
  );
});

test('la variante staging conserva el origen alternativo aislado de release', () => {
  assert.match(gradle, /def stagingStoreUrl = apiBaseUrl \? "\$\{apiBaseUrl\}\/t\/\$\{storeKey\}" : ''/);
  assert.match(
    gradle,
    /staging\s*\{[\s\S]*?buildConfigField 'String', 'STORE_URL', javaStringLiteral\(stagingStoreUrl\)/,
  );
});

test('los errores runtime no presentan producción como staging', () => {
  assert.match(registrationClient, /El origen HTTPS de la aplicación no está configurado\./);
  assert.doesNotMatch(registrationClient, /origen HTTPS de staging/i);
  assert.doesNotMatch(registrationClient, /servicios de staging/i);
  assert.doesNotMatch(registrationClient, /configuración de staging/i);
});

test('APK privado y AAB Play reciben manifiestos de instalación distintos', () => {
  assert.match(directManifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
  assert.doesNotMatch(playManifest, /REQUEST_INSTALL_PACKAGES/);
  assert.match(gradle, /release\.manifest\.srcFile\(playBundleMode/);
  assert.match(gradle, /PZ_STOREFRONT_PLAY_BUNDLE/);
  assert.match(gradle, /bundlerelease/);
  assert.match(runner, /PZ_STOREFRONT_PLAY_BUNDLE=true/);
});

test('la firma privada conserva rutas Windows literales sin interpretar unicode', () => {
  assert.match(gradle, /def separator = trimmed\.indexOf\('='\)/);
  assert.match(gradle, /signingProperties\.setProperty/);
  assert.doesNotMatch(gradle, /signingProperties\.load\(/);
});

test('PowerZona usa su PZ monocromatico como icono pequeno sin cambiar el icono grande', () => {
  assert.equal(powerZonaBrand.assets.notification_icon.file, 'notification_icon.xml');
  assert.match(powerZonaBrand.assets.notification_icon.sha256, /^[a-f0-9]{64}$/);
  assert.match(powerZonaNotificationIcon, /android:fillColor="#FFFFFFFF"/);
  assert.match(powerZonaNotificationIcon, /M2,4[\s\S]*M12\.5,4/);
  assert.doesNotMatch(powerZonaNotificationIcon, /M13\.2,1\.5 L4\.4,13\.4/);
  assert.match(gradle, /storefront_notification_icon/);
  assert.match(notifications, /setSmallIcon\(R\.drawable\.storefront_notification_icon\)/);
  assert.match(mainManifest, /default_notification_icon[\s\S]*@drawable\/storefront_notification_icon/);
  assert.match(mainManifest, /android:icon="@drawable\/storefront_icon"/);
});
