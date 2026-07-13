/// <reference path="../pb_data/types.d.ts" />

const SECURITY_HMAC_SECRET_ENV = "PZ_SECURITY_HMAC_SECRET";
const SECURITY_AES_KEY_ENV = "PZ_SECURITY_AES_KEY";

const FORBIDDEN_SECRET_VALUES = [
  "changeme",
  "change-me",
  "replace-me",
  "example",
  "replace-with-at-least-32-random-characters",
  "replace-with-exactly-32-characters-if-full-ip-is-enabled",
];

function utf8ByteLength(value) {
  const stringValue = String(value || "");
  let bytes = 0;

  for (let index = 0; index < stringValue.length; index += 1) {
    const code = stringValue.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < stringValue.length) {
      const next = stringValue.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
        continue;
      }
    }
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else bytes += 3;
  }

  return bytes;
}

function isForbiddenSecretValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || FORBIDDEN_SECRET_VALUES.includes(normalized);
}

function isValidHmacSecretValue(value) {
  return !isForbiddenSecretValue(value) && utf8ByteLength(value) >= 32;
}

function isPrintableNonSpaceAscii(value) {
  const stringValue = String(value || "");
  if (stringValue.length !== 32) return false;
  for (let index = 0; index < stringValue.length; index += 1) {
    const code = stringValue.charCodeAt(index);
    if (code < 33 || code > 126) return false;
  }
  return true;
}

function isValidAesKeyValue(value) {
  return !isForbiddenSecretValue(value) && isPrintableNonSpaceAscii(value);
}

function getValidHmacSecret() {
  const secret = String($os.getenv(SECURITY_HMAC_SECRET_ENV) || "");
  return isValidHmacSecretValue(secret) ? secret : "";
}

function getValidAesKey() {
  const key = String($os.getenv(SECURITY_AES_KEY_ENV) || "");
  return isValidAesKeyValue(key) ? key : "";
}

function getSecuritySecretStatus() {
  return {
    hmac_ready: Boolean(getValidHmacSecret()),
    aes_ready: Boolean(getValidAesKey()),
  };
}

module.exports = {
  SECURITY_HMAC_SECRET_ENV,
  SECURITY_AES_KEY_ENV,
  utf8ByteLength,
  isValidHmacSecretValue,
  isValidAesKeyValue,
  getValidHmacSecret,
  getValidAesKey,
  getSecuritySecretStatus,
};
