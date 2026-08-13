import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ADMIN_DEVICE_COOKIE_NAME,
  ADMIN_DEVICE_HEADER_NAME,
  ADMIN_DEVICE_MAX_AGE_SECONDS,
  ADMIN_DEVICE_MESSAGES,
  adminDeviceHeaders,
  ensureAdminDeviceToken,
  extractAdminDeviceErrorCode,
  generateAdminDeviceToken,
  getAdminDeviceLoginMessage,
  getCookieValue,
  isValidAdminDeviceToken,
  readAdminDeviceToken,
  serializeAdminDeviceCookie,
} from '../src/lib/adminDevice.ts';

const TOKEN = 'A'.repeat(43);
const authSource = readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../src/pages/login.astro', import.meta.url), 'utf8');

test('genera 32 bytes aleatorios y los codifica en 43 caracteres base64url', () => {
  let receivedLength = 0;
  const token = generateAdminDeviceToken({
    getRandomValues(bytes) {
      receivedLength = bytes.length;
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
      return bytes;
    },
  });
  assert.equal(receivedLength, 32);
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(isValidAdminDeviceToken(token), true);
});

test('rechaza tokens truncados, con padding o caracteres no URL-safe', () => {
  for (const token of ['A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}=`, `${'A'.repeat(42)}+`]) {
    assert.equal(isValidAdminDeviceToken(token), false);
  }
});

test('parsea cookies sin confundir nombres parciales ni valores codificados', () => {
  const header = `other=1; ${ADMIN_DEVICE_COOKIE_NAME}=${encodeURIComponent(TOKEN)}; suffix=2`;
  assert.equal(getCookieValue(header, ADMIN_DEVICE_COOKIE_NAME), TOKEN);
  assert.equal(readAdminDeviceToken(header), TOKEN);
  assert.equal(readAdminDeviceToken(`${ADMIN_DEVICE_COOKIE_NAME}=invalid`), '');
  assert.equal(getCookieValue('pz_admin_device_extra=value', ADMIN_DEVICE_COOKIE_NAME), '');
});

test('serializa cookie anual Path root SameSite Lax y Secure solo en HTTPS', () => {
  const insecure = serializeAdminDeviceCookie(TOKEN, false);
  const secure = serializeAdminDeviceCookie(TOKEN, true);
  assert.match(insecure, /^pz_admin_device=/);
  assert.match(insecure, /Path=\//);
  assert.match(insecure, /SameSite=Lax/);
  assert.match(insecure, new RegExp(`Max-Age=${ADMIN_DEVICE_MAX_AGE_SECONDS}`));
  assert.equal(insecure.includes('Secure'), false);
  assert.match(secure, /; Secure$/);
  assert.equal(secure.includes('Domain='), false);
  assert.equal(secure.includes('HttpOnly'), false);
});

test('reutiliza cookie existente sin generar ni escribir otra', () => {
  let generated = false;
  const documentMock = {
    cookie: `${ADMIN_DEVICE_COOKIE_NAME}=${TOKEN}`,
  };
  const result = ensureAdminDeviceToken(documentMock, {
    getRandomValues(bytes) {
      generated = true;
      return bytes;
    },
  }, 'https:');
  assert.equal(result, TOKEN);
  assert.equal(generated, false);
  assert.equal(documentMock.cookie, `${ADMIN_DEVICE_COOKIE_NAME}=${TOKEN}`);
});

test('crea y persiste cookie cuando no existe', () => {
  const documentMock = { cookie: '' };
  const result = ensureAdminDeviceToken(documentMock, {
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    },
  }, 'https:');
  assert.equal(isValidAdminDeviceToken(result), true);
  assert.match(documentMock.cookie, /^pz_admin_device=/);
  assert.match(documentMock.cookie, /Secure/);
});

test('construye únicamente el header privado cuando el token es válido', () => {
  assert.deepEqual(adminDeviceHeaders(TOKEN), { [ADMIN_DEVICE_HEADER_NAME]: TOKEN });
  assert.deepEqual(adminDeviceHeaders('invalid'), {});
});

test('login y refresh del SDK adjuntan el header sin cambiar la firma SSR', () => {
  assert.match(authSource, /authWithPassword\(email, password, \{/);
  assert.match(authSource, /authRefresh\(\{ headers \}\)/);
  assert.match(authSource, /readAdminDeviceToken\(cookieHeader\)/);
  assert.match(authSource, /export async function refreshAuthFromCookie\(cookieHeader = ''\)/);
  assert.equal(authSource.includes('localStorage'), false);
});

test('refresh limpia auth al faltar o invalidarse el dispositivo de tienda', () => {
  const refresh = authSource.slice(
    authSource.indexOf('export async function refreshAuthFromCookie'),
    authSource.indexOf('export function getCurrentUser'),
  );
  assert.match(refresh, /catch \(_\)/);
  assert.match(refresh, /authPb\.authStore\.clear\(\)/);
});

test('Master sin cookie sigue enviando una petición de refresh sin header de dispositivo', () => {
  assert.deepEqual(adminDeviceHeaders(readAdminDeviceToken('pb_auth=master')), {});
  assert.match(authSource, /const headers = token \? \{ \[ADMIN_DEVICE_HEADER_NAME\]: token \} : \{\}/);
});

test('extrae códigos seguros de PocketBase sin reflejar detalles internos', () => {
  assert.equal(extractAdminDeviceErrorCode({ response: { data: { code: 'device_revoked' } } }), 'device_revoked');
  assert.equal(extractAdminDeviceErrorCode({ response: { data: { code: { code: 'store_device_limit_reached' } } } }), 'store_device_limit_reached');
  assert.equal(extractAdminDeviceErrorCode({ response: { data: {
    device_required: { code: 'device_required', message: 'safe' },
  } } }), 'device_required');
  assert.equal(extractAdminDeviceErrorCode(new Error('private database path')), '');
});

test('mapea límites, revocación, indisponibilidad y credenciales a mensajes seguros', () => {
  assert.equal(getAdminDeviceLoginMessage({ code: 'user_device_limit_reached' }), ADMIN_DEVICE_MESSAGES.limit);
  assert.equal(getAdminDeviceLoginMessage({ code: 'store_device_limit_reached' }), ADMIN_DEVICE_MESSAGES.limit);
  assert.equal(getAdminDeviceLoginMessage({ code: 'device_revoked' }), ADMIN_DEVICE_MESSAGES.unauthorized);
  assert.equal(getAdminDeviceLoginMessage({ code: 'device_required' }), ADMIN_DEVICE_MESSAGES.unauthorized);
  assert.equal(getAdminDeviceLoginMessage({ code: 'device_authorization_unavailable' }), ADMIN_DEVICE_MESSAGES.unavailable);
  assert.equal(getAdminDeviceLoginMessage(new Error('password=secret')), ADMIN_DEVICE_MESSAGES.credentials);
});

test('los mensajes del cartel de acceso conservan los caracteres en español', () => {
  assert.equal(
    ADMIN_DEVICE_MESSAGES.limit,
    'Se alcanzó el límite de dispositivos autorizados. Pide al Master Admin que revoque uno antes de continuar.',
  );
  assert.equal(ADMIN_DEVICE_MESSAGES.unauthorized, 'Este dispositivo no está autorizado para acceder. Contacta al Master Admin.');
  assert.equal(ADMIN_DEVICE_MESSAGES.unavailable, 'No se pudo validar este dispositivo. Intenta nuevamente más tarde.');
  assert.equal(ADMIN_DEVICE_MESSAGES.credentials, 'Email o contraseña incorrectos.');
  assert.equal(Object.values(ADMIN_DEVICE_MESSAGES).some((message) => message.includes('Ã')), false);
});

test('login visual usa el mapper central y no expone IDs, digest ni token', () => {
  assert.match(loginSource, /getAdminDeviceLoginMessage\(error\)/);
  assert.equal(loginSource.includes('device_digest'), false);
  assert.equal(loginSource.includes(ADMIN_DEVICE_HEADER_NAME), false);
  assert.equal(loginSource.includes(TOKEN), false);
});
