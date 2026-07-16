export const ADMIN_DEVICE_COOKIE_NAME = 'pz_admin_device';
export const ADMIN_DEVICE_HEADER_NAME = 'X-PZ-Admin-Device';
export const ADMIN_DEVICE_TOKEN_BYTES = 32;
export const ADMIN_DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const ADMIN_DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const ADMIN_DEVICE_MESSAGES = Object.freeze({
  limit: 'Se alcanzÃ³ el lÃ­mite de dispositivos autorizados. Pide al Master Admin que revoque uno antes de continuar.',
  unauthorized: 'Este dispositivo no estÃ¡ autorizado para acceder. Contacta al Master Admin.',
  unavailable: 'No se pudo validar este dispositivo. Intenta nuevamente mÃ¡s tarde.',
  credentials: 'Email o contrasena incorrectos.',
});

type CryptoLike = Pick<Crypto, 'getRandomValues'>;
type CookieDocument = Pick<Document, 'cookie'>;

export function isValidAdminDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && ADMIN_DEVICE_TOKEN_PATTERN.test(value);
}

export function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  if (typeof btoa !== 'function') throw new Error('admin_device_encoding_unavailable');
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generateAdminDeviceToken(cryptoSource: CryptoLike = globalThis.crypto) {
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') {
    throw new Error('admin_device_crypto_unavailable');
  }
  const bytes = new Uint8Array(ADMIN_DEVICE_TOKEN_BYTES);
  cryptoSource.getRandomValues(bytes);
  const token = encodeBase64Url(bytes);
  if (!isValidAdminDeviceToken(token)) throw new Error('admin_device_generation_failed');
  return token;
}

export function getCookieValue(cookieHeader: string, cookieName: string) {
  const expected = String(cookieName || '').trim();
  if (!expected) return '';
  for (const part of String(cookieHeader || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== expected) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return '';
    }
  }
  return '';
}

export function readAdminDeviceToken(cookieHeader = '') {
  const token = getCookieValue(cookieHeader, ADMIN_DEVICE_COOKIE_NAME);
  return isValidAdminDeviceToken(token) ? token : '';
}

export function serializeAdminDeviceCookie(token: string, secure = false) {
  if (!isValidAdminDeviceToken(token)) throw new Error('invalid_admin_device_token');
  return [
    `${ADMIN_DEVICE_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${ADMIN_DEVICE_MAX_AGE_SECONDS}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function persistAdminDeviceToken(
  token: string,
  cookieDocument: CookieDocument = document,
  protocol = typeof location === 'undefined' ? '' : location.protocol,
) {
  cookieDocument.cookie = serializeAdminDeviceCookie(token, protocol === 'https:');
  return token;
}

export function ensureAdminDeviceToken(
  cookieDocument: CookieDocument = document,
  cryptoSource: CryptoLike = globalThis.crypto,
  protocol = typeof location === 'undefined' ? '' : location.protocol,
) {
  const existing = readAdminDeviceToken(cookieDocument.cookie || '');
  if (existing) return existing;
  return persistAdminDeviceToken(generateAdminDeviceToken(cryptoSource), cookieDocument, protocol);
}

export function adminDeviceHeaders(token: string) {
  if (!isValidAdminDeviceToken(token)) return {};
  return { [ADMIN_DEVICE_HEADER_NAME]: token };
}

export function extractAdminDeviceErrorCode(error: unknown) {
  const candidate = error as any;
  const values = [
    candidate?.response?.data?.code,
    candidate?.response?.code,
    candidate?.data?.code,
    candidate?.code,
  ];
  for (const value of values) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof value.code === 'string') return value.code;
  }
  const validationData = candidate?.response?.data;
  if (validationData && typeof validationData === 'object') {
    for (const [key, value] of Object.entries(validationData)) {
      if (typeof (value as any)?.code === 'string' && (value as any).code === key) return key;
    }
  }
  return '';
}

export function getAdminDeviceLoginMessage(error: unknown) {
  const code = extractAdminDeviceErrorCode(error);
  if (code === 'user_device_limit_reached' || code === 'store_device_limit_reached') {
    return ADMIN_DEVICE_MESSAGES.limit;
  }
  if (code === 'device_required' || code === 'device_revoked' || code === 'device_not_authorized') {
    return ADMIN_DEVICE_MESSAGES.unauthorized;
  }
  if (code === 'device_authorization_unavailable') return ADMIN_DEVICE_MESSAGES.unavailable;
  return ADMIN_DEVICE_MESSAGES.credentials;
}
