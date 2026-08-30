/// <reference path="../pb_data/types.d.ts" />

"use strict";

function value(record, key) {
  try {
    const current = record.get(key);
    if (current !== undefined) return current;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record && record[key];
}

function stringValue(record, key) {
  return String(value(record, key) || "").trim();
}

function integerValue(record, key) {
  const number = Number(value(record, key));
  return Number.isSafeInteger(number) ? number : 0;
}

function relationId(record, key) {
  const current = value(record, key);
  if (Array.isArray(current)) return String(current[0] || "").trim();
  if (current && typeof current === "object") return String(current.id || "").trim();
  return String(current || "").trim();
}

function exactForSite(app, collection, siteId) {
  const records = Array.from(app.findRecordsByFilter(
    collection,
    "site = {:site}",
    "id",
    2,
    0,
    { site: siteId },
  ) || []);
  return records.length === 1 ? records[0] : null;
}

migrate((app) => {
  const sites = Array.from(app.findRecordsByFilter(
    "promo_sites", "status = 'draft'", "id", 10000, 0,
  ) || []);
  if (!sites.length) return;

  const master = typeof __hooks === "undefined"
    ? require("../pb_hooks/pz_promo_master_lib.js")
    : require(`${__hooks}/pz_promo_master_lib.js`);
  const pubcfg = typeof __hooks === "undefined"
    ? require("../pb_hooks/pz_promo_pubcfg_lib.js")
    : require(`${__hooks}/pz_promo_pubcfg_lib.js`);

  sites.forEach((site) => {
    const storeId = relationId(site, "store");
    let store;
    try { store = app.findRecordById("stores", storeId); } catch (_) { return; }
    if (!store || stringValue(store, "status") !== "active") return;
    const siteId = String(site.id || "").trim();
    const draft = exactForSite(app, "promo_draft_documents", siteId);
    const slot = exactForSite(app, "promo_publication_slots", siteId);
    if (!draft || !slot || stringValue(slot, "state") !== "unpublished"
      || !master.isUnconfiguredDraftDocument(value(draft, "document_json"))) return;

    let current;
    try { current = pubcfg.normalizeJson(value(draft, "document_json")); } catch (_) { return; }
    const themeId = String(current && current.theme && current.theme.theme_id || "promo.black-gold").trim();
    let document;
    try {
      document = master.initialPublishedDocument(
        stringValue(store, "name"),
        stringValue(site, "public_slug"),
        themeId,
      );
    } catch (_) { return; }

    const actorId = relationId(site, "updated_by") || relationId(site, "created_by");
    const now = new Date().toISOString();
    draft.set("document_json", document);
    draft.set("document_sha256", pubcfg.digestDocument(document));
    draft.set("version", Math.max(1, integerValue(draft, "version")) + 1);
    if (actorId) draft.set("updated_by", actorId);
    app.save(draft);

    site.set("status", "active");
    if (actorId) site.set("updated_by", actorId);
    app.save(site);

    slot.set("state", "active");
    slot.set("canonical_mode", "platform");
    slot.set("generation", Math.max(0, integerValue(slot, "generation")) + 1);
    slot.set("published_revision", "");
    if (actorId) slot.set("published_by", actorId);
    slot.set("published_at", now);
    app.save(slot);
  });
}, () => {
  // La publicación inicial no se revierte: la tienda puede haber recibido contenido después.
});
