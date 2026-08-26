/// <reference path="../pb_data/types.d.ts" />

"use strict";

const AUDIT_COLLECTION = "promo_audit_events";
const MODULE_FIELD_ID = "select1787523107";
const REVIEWS_MODULE = "reviews";

function auditModuleField(app) {
  const audit = app.findCollectionByNameOrId(AUDIT_COLLECTION);
  const moduleField = audit.fields.getByName("module");
  if (!moduleField || moduleField.id !== MODULE_FIELD_ID || !Array.isArray(moduleField.values)) {
    throw new Error("incompatible_promo_audit_module");
  }
  return { audit, moduleField };
}

migrate((app) => {
  const { audit, moduleField } = auditModuleField(app);
  if (!moduleField.values.includes(REVIEWS_MODULE)) moduleField.values.push(REVIEWS_MODULE);
  return app.save(audit);
}, (app) => {
  const used = app.findRecordsByFilter(
    AUDIT_COLLECTION, "module = {:module}", "id", 1, 0, { module: REVIEWS_MODULE },
  ) || [];
  if (used.length) throw new Error("unsafe_rollback_promo_reviews_audit");
  const { audit, moduleField } = auditModuleField(app);
  moduleField.values = moduleField.values.filter((value) => value !== REVIEWS_MODULE);
  return app.save(audit);
});
