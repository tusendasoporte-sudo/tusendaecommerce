/// <reference path="../pb_data/types.d.ts" />

const PZ_PROMO_DATA_COLLECTIONS = [
  "promo_sites",
  "promo_site_entitlements",
  "promo_theme_releases",
  "promo_domain_bindings",
  "promo_draft_documents",
  "promo_media_assets",
  "promo_revisions",
  "promo_revision_media_refs",
  "promo_publication_slots",
  "promo_publication_events",
  "promo_audit_events",
  "promo_analytics_events",
  "promo_analytics_daily",
];

function pzPromoDataValidationError(error) {
  const safeCode = error && /^[-a-z0-9_]{1,80}$/.test(String(error.code || ""))
    ? String(error.code)
    : "invalid_promo_data";
  const safeField = error && /^[a-z][a-z0-9_]{0,79}$/.test(String(error.field || ""))
    ? String(error.field)
    : "promo";
  const data = {};
  data[safeField] = new ValidationError(safeCode, "Los datos Promo no cumplen el contrato.");
  return new BadRequestError("Los datos Promo no cumplen el contrato.", data);
}

function pzEnforcePromoMutation(e, collection, operation) {
  try {
    const lib = require(`${__hooks}/pz_promo_data_lib.js`);
    lib.assertPromoRecord(e.app || $app, collection, e.record, operation);
  } catch (error) {
    throw pzPromoDataValidationError(error);
  }
  return e.next();
}

function pzEnforcePromoDelete(e, collection) {
  try {
    require(`${__hooks}/pz_promo_data_lib.js`).assertPromoDelete(collection);
  } catch (error) {
    throw pzPromoDataValidationError(error);
  }
  return e.next();
}

for (const collection of PZ_PROMO_DATA_COLLECTIONS) {
  onRecordCreateRequest((e) => pzEnforcePromoMutation(e, collection, "create"), collection);
  onRecordUpdateRequest((e) => pzEnforcePromoMutation(e, collection, "update"), collection);
  onRecordDeleteRequest((e) => pzEnforcePromoDelete(e, collection), collection);
}
