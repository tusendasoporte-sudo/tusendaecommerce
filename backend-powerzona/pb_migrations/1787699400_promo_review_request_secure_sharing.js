/// <reference path="../pb_data/types.d.ts" />

"use strict";

const FIELD_ID = "txt178769940001";
const FIELD_NAME = "token_encrypted";

function optionalField(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function fieldType(field) {
  try { return typeof field.type === "function" ? field.type() : field.type; } catch (_) { return ""; }
}

migrate((app) => {
  const requests = app.findCollectionByNameOrId("promo_review_requests");
  const existing = optionalField(requests, FIELD_NAME);
  if (existing) {
    if (existing.id !== FIELD_ID || fieldType(existing) !== "text" || existing.max !== 1024 || existing.hidden !== true) {
      throw new Error("incompatible_promo_review_request_secure_sharing");
    }
    return;
  }
  requests.fields.add(new Field({
    autogeneratePattern: "",
    hidden: true,
    id: FIELD_ID,
    max: 1024,
    min: 0,
    name: FIELD_NAME,
    pattern: "",
    presentable: false,
    primaryKey: false,
    required: false,
    system: false,
    type: "text",
  }));
  app.save(requests);
}, (app) => {
  const rows = app.findRecordsByFilter(
    "promo_review_requests", "token_encrypted != ''", "id", 1, 0,
  ) || [];
  if (rows.length) throw new Error("unsafe_rollback_promo_review_request_secure_sharing");
  const requests = app.findCollectionByNameOrId("promo_review_requests");
  const field = optionalField(requests, FIELD_NAME);
  if (!field) return;
  if (field.id !== FIELD_ID || fieldType(field) !== "text") {
    throw new Error("incompatible_promo_review_request_secure_sharing");
  }
  requests.fields.removeById(field.id);
  app.save(requests);
});
