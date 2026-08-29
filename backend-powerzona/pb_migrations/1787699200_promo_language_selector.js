/// <reference path="../pb_data/types.d.ts" />

"use strict";

const LANGUAGE_SELECTOR_FIELD_ID = "bool1787699201";
const LANGUAGE_SELECTOR_FIELD_NAME = "language_selector_enabled";

migrate((app) => {
  const entitlements = app.findCollectionByNameOrId("promo_site_entitlements");
  let existing = null;
  try { existing = entitlements.fields.getByName(LANGUAGE_SELECTOR_FIELD_NAME); } catch (_) {}
  if (existing) {
    if (existing.id !== LANGUAGE_SELECTOR_FIELD_ID || existing.type !== "bool") {
      throw new Error("incompatible_promo_language_selector");
    }
    return;
  }
  entitlements.fields.add(new Field({
    hidden: false,
    id: LANGUAGE_SELECTOR_FIELD_ID,
    name: LANGUAGE_SELECTOR_FIELD_NAME,
    presentable: false,
    required: false,
    system: false,
    type: "bool",
  }));
  app.save(entitlements);
}, (app) => {
  const entitlements = app.findCollectionByNameOrId("promo_site_entitlements");
  let field = null;
  try { field = entitlements.fields.getByName(LANGUAGE_SELECTOR_FIELD_NAME); } catch (_) {}
  if (!field) return;
  if (field.id !== LANGUAGE_SELECTOR_FIELD_ID || field.type !== "bool") {
    throw new Error("incompatible_promo_language_selector");
  }
  entitlements.fields.removeById(LANGUAGE_SELECTOR_FIELD_ID);
  app.save(entitlements);
});
