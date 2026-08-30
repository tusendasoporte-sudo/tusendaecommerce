/// <reference path="../pb_data/types.d.ts" />

"use strict";

const FIXED_CAPABILITIES = Object.freeze({
  promo_site_enabled: true,
  publish_enabled: true,
  custom_domain_enabled: false,
  theme_customization_enabled: true,
  multilanguage_enabled: true,
  video_enabled: false,
  analytics_enabled: true,
  landing_qr_bridge_enabled: false,
  max_services: 12,
  max_locales: 2,
  max_videos: 0,
  max_storage_bytes: 250 * 1024 * 1024,
});

function value(record, key) {
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record && record[key];
}

function relationId(record, key) {
  const current = value(record, key);
  return String(Array.isArray(current) ? current[0] || "" : current || "").trim();
}

migrate((app) => {
  const entitlements = Array.from(app.findRecordsByFilter(
    "promo_site_entitlements", "", "id", 10000, 0,
  ) || []);
  entitlements.forEach((entitlement) => {
    const site = app.findRecordById("promo_sites", relationId(entitlement, "site"));
    const store = app.findRecordById("stores", relationId(site, "store"));
    const plan = String(value(store, "plan") || "free").trim();
    Object.entries(FIXED_CAPABILITIES).forEach(([key, next]) => entitlement.set(key, next));
    entitlement.set("source", "contract");
    entitlement.set("max_gallery_assets", plan === "basic" || plan === "premium" ? 300 : 150);
    // El selector es la única preferencia de capacidad que conserva la decisión de cada tienda.
    entitlement.set("language_selector_enabled", value(entitlement, "language_selector_enabled") === true);
    app.save(entitlement);
  });
}, () => {
  // Los overrides técnicos anteriores no se restauran: ya no forman parte del contrato operativo Promo.
});
