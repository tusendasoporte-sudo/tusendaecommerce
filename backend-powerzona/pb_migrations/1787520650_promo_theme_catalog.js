/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promoTheme = typeof __hooks === "undefined"
  ? require("../pb_hooks/pz_promo_theme_lib.js")
  : require(`${__hooks}/pz_promo_theme_lib.js`);

const LEGACY_BLACK_GOLD_MANIFEST_SHA256 = "dfd9455fb313cac15c1a2b74dbf43dda7d101e3ad8d7aa2a8f6a0306f593fde8";
const BLACK_GOLD_KEY = "promo.black-gold@1.0.0";

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

function relationId(record, key) {
  const current = value(record, key);
  if (Array.isArray(current)) return String(current[0] || "");
  if (current && typeof current === "object") return String(current.id || "");
  return String(current || "");
}

function rows(app, collection) {
  return Array.from(app.findRecordsByFilter(collection, "", "id", 10000, 0) || []);
}

function releaseFor(app, entry) {
  const found = Array.from(app.findRecordsByFilter(
    "promo_theme_releases",
    "theme_id = {:theme} && version = {:version}",
    "id",
    2,
    0,
    { theme: entry.manifest.theme_id, version: entry.manifest.version },
  ) || []);
  if (found.length > 1) throw new Error("incompatible_promo_theme_catalog");
  return found[0] || null;
}

function setIntegrity(record, entry) {
  record.set("renderer_key", entry.manifest.renderer_key);
  record.set("contract_version", entry.manifest.contract_version);
  record.set("manifest_sha256", entry.manifest_sha256);
  record.set("token_schema_sha256", entry.token_schema_sha256);
}

function createRelease(app, entry, approval) {
  const record = new Record(app.findCollectionByNameOrId("promo_theme_releases"), {});
  record.set("theme_id", entry.manifest.theme_id);
  record.set("version", entry.manifest.version);
  record.set("status", approval ? "approved" : "draft");
  setIntegrity(record, entry);
  if (approval) {
    record.set("approved_by", approval.actorId);
    record.set("approved_at", approval.approvedAt);
  }
  app.save(record);
  return record;
}

function approvalFrom(record) {
  if (!record || stringValue(record, "status") !== "approved") return null;
  const actorId = relationId(record, "approved_by");
  const approvedAt = stringValue(record, "approved_at");
  if (!actorId || !approvedAt) throw new Error("incompatible_promo_theme_approval");
  return { actorId, approvedAt };
}

function draftUsesTheme(record, themeId, version) {
  let document;
  try { document = JSON.parse(JSON.stringify(value(record, "document_json") || {})); }
  catch (_) { throw new Error("incompatible_promo_theme_document"); }
  return document && document.theme
    && String(document.theme.theme_id || "") === themeId
    && String(document.theme.version || "") === version;
}

function assertReleaseUnused(app, release, entry) {
  const releaseId = String(release && (release.id || value(release, "id")) || "");
  const revisions = app.findRecordsByFilter(
    "promo_revisions", "theme_release = {:release}", "id", 1, 0, { release: releaseId },
  ) || [];
  if (revisions.length || rows(app, "promo_draft_documents").some((record) => (
    draftUsesTheme(record, entry.manifest.theme_id, entry.manifest.version)
  ))) {
    throw new Error("unsafe_rollback_promo_theme_catalog");
  }
}

migrate((app) => {
  const blackEntry = promoTheme.THEME_REGISTRY[BLACK_GOLD_KEY];
  if (!blackEntry) throw new Error("incompatible_promo_theme_registry");
  const blackRelease = releaseFor(app, blackEntry);

  // Un entorno nuevo todavía no tiene un actor Master que pueda aprobar releases.
  // En ese caso el catálogo se inicializa por el flujo Master existente, sin identidades sintéticas.
  if (!blackRelease) return;

  const approval = approvalFrom(blackRelease);
  for (const entry of Object.values(promoTheme.THEME_REGISTRY)) {
    const current = releaseFor(app, entry);
    if (current) {
      setIntegrity(current, entry);
      app.save(current);
    } else {
      createRelease(app, entry, approval);
    }
  }
}, (app) => {
  const blackEntry = promoTheme.THEME_REGISTRY[BLACK_GOLD_KEY];
  if (!blackEntry) throw new Error("incompatible_promo_theme_registry");
  for (const entry of Object.values(promoTheme.THEME_REGISTRY)) {
    const current = releaseFor(app, entry);
    if (!current) continue;
    if (entry === blackEntry) {
      if (stringValue(current, "manifest_sha256") !== entry.manifest_sha256) {
        throw new Error("incompatible_promo_theme_catalog");
      }
      current.set("manifest_sha256", LEGACY_BLACK_GOLD_MANIFEST_SHA256);
      app.save(current);
      continue;
    }
    assertReleaseUnused(app, current, entry);
    app.delete(current);
  }
});
