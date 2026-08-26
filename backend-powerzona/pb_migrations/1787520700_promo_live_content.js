/// <reference path="../pb_data/types.d.ts" />

"use strict";

const CONTENT_GENERATION_FIELD_ID = "number1787523401";
const REVISION_FIELD_ID = "relation75230203";

const pubcfg = typeof __hooks === "undefined"
  ? require("../pb_hooks/pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);
const pubcfgApi = typeof __hooks === "undefined"
  ? require("../pb_hooks/pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);

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
  if (Array.isArray(current)) return String(current[0] || "");
  if (current && typeof current === "object") return String(current.id || "");
  return String(current || "");
}

function recordId(record) {
  return String(record && (record.id || value(record, "id")) || "");
}

function jsonValue(record, key) {
  const current = value(record, key);
  return pubcfg.normalizeJson(current);
}

function rows(app, collection) {
  return Array.from(app.findRecordsByFilter(collection, "", "id", 10000, 0) || []);
}

function exactForSite(app, collection, siteId) {
  const found = Array.from(app.findRecordsByFilter(
    collection,
    "site = {:site}",
    "id",
    2,
    0,
    { site: siteId },
  ) || []);
  if (found.length !== 1) throw new Error(`incompatible_promo_live_${collection}`);
  return found[0];
}

function validateCandidate(app, site, entitlement, input, publicDocument) {
  let document;
  try {
    document = pubcfg.validatePromoDocument(pubcfg.upgradePromoDocument(input), {
      publicRevision: publicDocument,
    });
  } catch (error) {
    if (error && error.code === "incomplete_promo_locale" && error.reason) {
      throw new Error(`incompatible_promo_live_${error.reason}`);
    }
    throw error;
  }
  pubcfgApi.assertDraftTheme(app, document, { selectionChanged: false });
  const assets = pubcfgApi.loadDocumentAssets(app, recordId(site), document, {
    publicRevision: publicDocument,
  });
  pubcfgApi.assertEntitlementMetrics(entitlement, document, assets);
  return document;
}

function preparedLiveDocuments(app) {
  return rows(app, "promo_draft_documents").map((draft) => {
    const siteId = relationId(draft, "site");
    const site = app.findRecordById("promo_sites", siteId);
    const entitlement = exactForSite(app, "promo_site_entitlements", siteId);
    const slot = exactForSite(app, "promo_publication_slots", siteId);
    const isActive = stringValue(site, "status") === "active";
    let document;
    try {
      document = validateCandidate(app, site, entitlement, jsonValue(draft, "document_json"), isActive);
    } catch (draftError) {
      const revisionId = relationId(slot, "published_revision");
      if (!isActive || !revisionId) throw draftError;
      const revision = app.findRecordById("promo_revisions", revisionId);
      if (relationId(revision, "site") !== siteId) throw draftError;
      document = validateCandidate(app, site, entitlement, jsonValue(revision, "snapshot_json"), true);
    }
    return { document, draft, isActive, slot };
  });
}

function addGenerationField(collection) {
  if (collection.fields.getByName("content_generation")) return;
  collection.fields.addAt(3, new Field({
    hidden: false,
    id: CONTENT_GENERATION_FIELD_ID,
    max: null,
    min: 1,
    name: "content_generation",
    onlyInt: true,
    presentable: false,
    required: true,
    system: false,
    type: "number",
  }));
}

function assertSafeRollback(app) {
  for (const [collection, filter] of [
    ["promo_draft_documents", ""],
    ["promo_publication_slots", ""],
    ["promo_analytics_events", ""],
  ]) {
    const found = app.findRecordsByFilter(collection, filter, "id", 1, 0) || [];
    if (found.length) throw new Error("unsafe_rollback_promo_live_content");
  }
}

migrate((app) => {
  const prepared = preparedLiveDocuments(app);
  const analytics = app.findCollectionByNameOrId("promo_analytics_events");
  const revision = analytics.fields.getByName("revision");
  if (!revision || revision.id !== REVISION_FIELD_ID) {
    throw new Error("incompatible_promo_analytics_revision");
  }
  revision.required = false;
  revision.minSelect = 0;
  addGenerationField(analytics);
  app.save(analytics);

  for (const item of prepared) {
    const nextVersion = Math.max(1, integerValue(item.draft, "version")) + 1;
    item.draft.set("document_json", item.document);
    item.draft.set("document_sha256", $security.sha256(pubcfg.canonicalJson(item.document)));
    item.draft.set("version", nextVersion);
    app.save(item.draft);

    item.slot.set("published_revision", "");
    item.slot.set("state", item.isActive ? "active" : "unpublished");
    item.slot.set("generation", Math.max(0, integerValue(item.slot, "generation")) + 1);
    app.save(item.slot);
  }

  for (const event of rows(app, "promo_analytics_events")) {
    const siteId = relationId(event, "site");
    const slot = exactForSite(app, "promo_publication_slots", siteId);
    event.set("content_generation", Math.max(1, integerValue(slot, "generation")));
    app.save(event);
  }
}, (app) => {
  assertSafeRollback(app);
  const analytics = app.findCollectionByNameOrId("promo_analytics_events");
  const revision = analytics.fields.getByName("revision");
  const generation = analytics.fields.getByName("content_generation");
  if (!revision || revision.id !== REVISION_FIELD_ID
    || !generation || generation.id !== CONTENT_GENERATION_FIELD_ID) {
    throw new Error("incompatible_promo_live_content_schema");
  }
  analytics.fields.removeById(CONTENT_GENERATION_FIELD_ID);
  revision.required = true;
  revision.minSelect = 1;
  app.save(analytics);
});
