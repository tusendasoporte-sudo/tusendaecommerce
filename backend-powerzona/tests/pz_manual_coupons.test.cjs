'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const coupons = require('../pb_hooks/pz_manual_coupons_lib.js');

test('acepta cualquier símbolo ASCII visible dentro del máximo de ocho caracteres', () => {
  for (const code of ['SAVE!50%', 'A B&C', '50/$#']) {
    assert.equal(coupons.validCouponCode(code), true, code);
  }
  assert.equal(coupons.normalizeCouponCode(' save!50% '), 'SAVE!50%');
});

test('rechaza acentos, ñ, emojis, controles y códigos mayores de ocho caracteres', () => {
  for (const code of ['PROMOÑ', 'CAFÉ', 'SAVE🔥', 'A\nB']) {
    assert.equal(coupons.couponCodeError(code)?.code, 'coupon_code_accents_emojis', code);
  }
  assert.equal(coupons.couponCodeError('A')?.code, 'coupon_code_too_short');
  assert.equal(coupons.couponCodeError('123456789')?.code, 'coupon_code_too_long');
});

test('el sistema normaliza el código y reemplaza el nombre interno enviado por el cliente', () => {
  const values = { code: ' save!50% ', name: 'Nombre controlado por el usuario' };
  const record = {
    get(key) { return values[key]; },
    set(key, value) { values[key] = value; },
  };
  assert.equal(coupons.normalizeCouponRecord(record), null);
  assert.equal(values.code, 'SAVE!50%');
  assert.equal(values.name, 'Cupón SAVE!50%');
});
