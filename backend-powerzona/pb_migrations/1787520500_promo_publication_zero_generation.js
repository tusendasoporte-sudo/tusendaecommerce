/// <reference path="../pb_data/types.d.ts" />

const GENERATION_BEFORE_FIELD_ID = "number1787522405";
const GENERATION_AFTER_FIELD_ID = "number1787522406";

function fieldByName(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function assertExpectedField(field, id, name) {
  if (!field || field.id !== id || field.name !== name) {
    throw new Error("incompatible_promo_publication_generation_field");
  }
}

function assertSafeRollback(app) {
  const rows = app.findRecordsByFilter(
    "promo_publication_events",
    "generation_before = 0 || generation_after = 0",
    "id",
    1,
    0,
  ) || [];
  if (rows.length) throw new Error("unsafe_rollback_promo_publication_zero_generation");
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("promo_publication_events");
  const before = fieldByName(collection, "generation_before");
  const after = fieldByName(collection, "generation_after");
  assertExpectedField(before, GENERATION_BEFORE_FIELD_ID, "generation_before");
  assertExpectedField(after, GENERATION_AFTER_FIELD_ID, "generation_after");

  // PocketBase 0.39 treats numeric zero as blank when a number field is marked
  // required. The DATA hook remains the authoritative non-null/integer guard.
  before.required = false;
  after.required = false;
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("promo_publication_events");
  const before = fieldByName(collection, "generation_before");
  const after = fieldByName(collection, "generation_after");
  assertExpectedField(before, GENERATION_BEFORE_FIELD_ID, "generation_before");
  assertExpectedField(after, GENERATION_AFTER_FIELD_ID, "generation_after");
  assertSafeRollback(app);
  before.required = true;
  after.required = true;
  app.save(collection);
});
