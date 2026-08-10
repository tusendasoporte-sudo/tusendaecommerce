/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_currency_pricing_lib.js`);
  const safe = lib.normalizeProductPricingRequest(e);
  if (safe) lib.raisePricingRequestError(safe);
  return e.next();
}, "products");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_currency_pricing_lib.js`);
  const safe = lib.normalizeProductPricingRequest(e);
  if (safe) lib.raisePricingRequestError(safe);
  return e.next();
}, "products");

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_currency_pricing_lib.js`);
  const safe = lib.normalizeVariationPricingRequest(e);
  if (safe) lib.raisePricingRequestError(safe);
  return e.next();
}, "product_variations");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_currency_pricing_lib.js`);
  const safe = lib.normalizeVariationPricingRequest(e);
  if (safe) lib.raisePricingRequestError(safe);
  return e.next();
}, "product_variations");

onRecordAfterUpdateSuccess(
  (e) => require(`${__hooks}/pz_product_currency_pricing_lib.js`).continueProductCurrencySync(e),
  "products",
);

onRecordAfterUpdateSuccess(
  (e) => require(`${__hooks}/pz_product_currency_pricing_lib.js`).continueCurrencyReprice(e),
  "currencies",
);
