/// <reference path="../pb_data/types.d.ts" />

"use strict";

const COUPON_CODE_MIN = 2;
const COUPON_CODE_MAX = 8;
const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]+$/;

function rawCouponCode(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function normalizeCouponCode(value) {
  return rawCouponCode(value).toUpperCase();
}

function couponCodeError(value) {
  const raw = rawCouponCode(value);
  if (raw && !PRINTABLE_ASCII_PATTERN.test(raw)) {
    return {
      code: "coupon_code_accents_emojis",
      field: "code",
      message: "El código del cupón no admite acentos, ñ ni emojis.",
    };
  }
  if (raw.length < COUPON_CODE_MIN) {
    return {
      code: "coupon_code_too_short",
      field: "code",
      message: "El código del cupón debe tener al menos 2 caracteres.",
    };
  }
  if (raw.length > COUPON_CODE_MAX) {
    return {
      code: "coupon_code_too_long",
      field: "code",
      message: "El código del cupón admite un máximo de 8 caracteres.",
    };
  }
  return null;
}

function validCouponCode(value) {
  return couponCodeError(value) === null;
}

function couponInternalName(value) {
  return `Cupón ${normalizeCouponCode(value)}`;
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    if (typeof record.get === "function") return record.get(key);
  } catch (_) {}
  return record[key];
}

function normalizeCouponRecord(record) {
  const code = normalizeCouponCode(recordValue(record, "code"));
  const error = couponCodeError(code);
  if (error) return error;
  if (record && typeof record.set === "function") {
    record.set("code", code);
    record.set("name", couponInternalName(code));
  } else if (record) {
    record.code = code;
    record.name = couponInternalName(code);
  }
  return null;
}

function raiseCouponRequestError(error) {
  const safe = error || {
    code: "invalid_coupon_code",
    field: "code",
    message: "El código del cupón no es válido.",
  };
  if (typeof BadRequestError === "function" && typeof ValidationError === "function") {
    const fields = {};
    fields[safe.field || "code"] = new ValidationError(safe.code || "invalid_coupon_code", safe.message);
    throw new BadRequestError("No se pudo guardar el cupón.", fields);
  }
  const raised = new Error(safe.message);
  raised.code = safe.code || "invalid_coupon_code";
  raised.field = safe.field || "code";
  throw raised;
}

module.exports = {
  COUPON_CODE_MAX,
  COUPON_CODE_MIN,
  couponCodeError,
  couponInternalName,
  normalizeCouponCode,
  normalizeCouponRecord,
  raiseCouponRequestError,
  validCouponCode,
};
