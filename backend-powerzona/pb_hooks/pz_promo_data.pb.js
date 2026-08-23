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

for (const collectionName of PZ_PROMO_DATA_COLLECTIONS) {
  onRecordCreateRequest(
    (e) => require(`${__hooks}/pz_promo_data_lib.js`).enforcePromoRequest(e, "create"),
    collectionName,
  );
  onRecordUpdateRequest(
    (e) => require(`${__hooks}/pz_promo_data_lib.js`).enforcePromoRequest(e, "update"),
    collectionName,
  );
  onRecordDeleteRequest(
    (e) => require(`${__hooks}/pz_promo_data_lib.js`).enforcePromoDeleteRequest(e),
    collectionName,
  );
}
