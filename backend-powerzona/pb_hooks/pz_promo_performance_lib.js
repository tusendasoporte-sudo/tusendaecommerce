/// <reference path="../pb_data/types.d.ts" />

"use strict";

const CACHE_CONTRACT = "promo.public.cache.v2";
const CACHE_CONTRACT_HEADER = "X-PZ-Promo-Cache-Contract";
const CACHE_KEY_HEADER = "X-PZ-Promo-Cache-Key";
const HTML_REPRESENTATION = "text/html; charset=utf-8";
const PLATFORM_CANONICAL_HOST = "tusenda84.com";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const THEME_PATTERN = /^[a-z][a-z0-9.-]{0,79}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;

class PromoPerformanceError extends Error {
  constructor(code) {
    super(code || "promo_performance_cache_unavailable");
    this.name = "PromoPerformanceError";
    this.code = this.message;
  }
}

function fail() {
  throw new PromoPerformanceError("promo_performance_cache_unavailable");
}

function safeText(value, pattern, maximum) {
  const text = String(value || "");
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/.test(text) || !pattern.test(text)) fail();
  return text;
}

function safePublicPath(value) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 240
    || /[?#\\\u0000-\u001f\u007f]/.test(path)) fail();
  return path;
}

function hashMaterial(material, sha256) {
  let digest = "";
  try {
    const hash = sha256 || ((value) => {
      if (typeof $security === "undefined" || !$security || typeof $security.sha256 !== "function") fail();
      return $security.sha256(value);
    });
    digest = String(hash(material) || "").trim().toLowerCase();
  } catch (error) {
    if (error instanceof PromoPerformanceError) throw error;
    fail();
  }
  if (!SHA256_PATTERN.test(digest)) fail();
  return digest;
}

function generationCacheIdentity(input, sha256) {
  const value = input || {};
  const canonicalHost = safeText(value.canonicalHost, HOST_PATTERN, 253);
  if (canonicalHost.includes("..")) fail();
  const tenantId = safeText(value.tenantId, RECORD_ID_PATTERN, 15);
  const generation = Number(value.generation);
  if (!Number.isSafeInteger(generation) || generation < 1) fail();
  const locale = safeText(value.locale, LOCALE_PATTERN, 80);
  const themeId = safeText(value.themeId, THEME_PATTERN, 80);
  const themeVersion = safeText(value.themeVersion, VERSION_PATTERN, 32);
  const publicPath = safePublicPath(value.publicPath);
  const representation = value.representation === HTML_REPRESENTATION
    ? HTML_REPRESENTATION
    : fail();
  const material = JSON.stringify([
    CACHE_CONTRACT,
    canonicalHost,
    tenantId,
    generation,
    locale,
    themeId,
    themeVersion,
    publicPath,
    representation,
  ]);
  return Object.freeze({
    contract: CACHE_CONTRACT,
    key: hashMaterial(material, sha256),
  });
}

function isCacheIdentity(value) {
  return Boolean(value)
    && value.contract === CACHE_CONTRACT
    && SHA256_PATTERN.test(String(value.key || ""));
}

module.exports = {
  CACHE_CONTRACT,
  CACHE_CONTRACT_HEADER,
  CACHE_KEY_HEADER,
  HTML_REPRESENTATION,
  PLATFORM_CANONICAL_HOST,
  PromoPerformanceError,
  generationCacheIdentity,
  isCacheIdentity,
};
