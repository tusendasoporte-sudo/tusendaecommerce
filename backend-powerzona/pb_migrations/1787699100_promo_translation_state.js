/// <reference path="../pb_data/types.d.ts" />

"use strict";

const TRANSLATION_STATE_FIELD_ID = "json1787699101";
const TRANSLATION_STATE_FIELD_NAME = "translation_state_json";

migrate((app) => {
  const drafts = app.findCollectionByNameOrId("promo_draft_documents");
  let existing = null;
  try { existing = drafts.fields.getByName(TRANSLATION_STATE_FIELD_NAME); } catch (_) {}
  if (existing) {
    if (existing.id !== TRANSLATION_STATE_FIELD_ID || existing.type !== "json") {
      throw new Error("incompatible_promo_translation_state");
    }
    return;
  }
  drafts.fields.add(new Field({
    hidden: true,
    id: TRANSLATION_STATE_FIELD_ID,
    maxSize: 4 * 1024 * 1024,
    name: TRANSLATION_STATE_FIELD_NAME,
    presentable: false,
    required: false,
    system: false,
    type: "json",
  }));
  app.save(drafts);
}, (app) => {
  const drafts = app.findCollectionByNameOrId("promo_draft_documents");
  let field = null;
  try { field = drafts.fields.getByName(TRANSLATION_STATE_FIELD_NAME); } catch (_) {}
  if (!field) return;
  if (field.id !== TRANSLATION_STATE_FIELD_ID || field.type !== "json") {
    throw new Error("incompatible_promo_translation_state");
  }
  drafts.fields.removeById(TRANSLATION_STATE_FIELD_ID);
  app.save(drafts);
});
