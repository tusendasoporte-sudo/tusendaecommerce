/// <reference path="../pb_data/types.d.ts" />

"use strict";

const COMMERCIAL_SNAPSHOT_FIELD_ID = "json1788447801";
const COMMERCIAL_SNAPSHOT_FIELD_NAME = "commercial_snapshot_json";

function fieldType(field) {
  try { return typeof field.type === "function" ? field.type() : field.type; } catch (_) { return ""; }
}

migrate((app) => {
  const audit = app.findCollectionByNameOrId("store_plan_audit");
  let existing = null;
  try { existing = audit.fields.getByName(COMMERCIAL_SNAPSHOT_FIELD_NAME); } catch (_) {}
  if (existing) {
    if (existing.id !== COMMERCIAL_SNAPSHOT_FIELD_ID || fieldType(existing) !== "json") {
      throw new Error("incompatible_store_plan_commercial_snapshot");
    }
    return;
  }
  audit.fields.add(new Field({
    hidden: true,
    id: COMMERCIAL_SNAPSHOT_FIELD_ID,
    maxSize: 32768,
    name: COMMERCIAL_SNAPSHOT_FIELD_NAME,
    presentable: false,
    required: false,
    system: false,
    type: "json",
  }));
  app.save(audit);
}, (app) => {
  const audit = app.findCollectionByNameOrId("store_plan_audit");
  let field = null;
  try { field = audit.fields.getByName(COMMERCIAL_SNAPSHOT_FIELD_NAME); } catch (_) {}
  if (!field) return;
  if (field.id !== COMMERCIAL_SNAPSHOT_FIELD_ID || fieldType(field) !== "json") {
    throw new Error("incompatible_store_plan_commercial_snapshot");
  }
  audit.fields.removeById(COMMERCIAL_SNAPSHOT_FIELD_ID);
  app.save(audit);
});
