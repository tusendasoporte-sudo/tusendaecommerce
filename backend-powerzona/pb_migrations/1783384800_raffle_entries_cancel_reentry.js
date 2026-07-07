/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_USER_CREATE_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && @request.body.store = @request.auth.store';
const STORE_USER_RECORD_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store';
const FIXED_ENTRY_RAFFLE_SLUG_RULE = '(raffle.slug = "rifa-1" || raffle.slug = "rifa-2" || raffle.slug = "rifa-3")';
const PUBLIC_ENTRY_CREATE_RULE = `@request.auth.id = "" && @request.body.store != "" && @request.body.raffle != "" && @request.body.status = "active" && raffle.store = @request.body.store && raffle.is_configured = true && raffle.link_enabled = true && raffle.store.status = "active" && ${FIXED_ENTRY_RAFFLE_SLUG_RULE}`;
const PUBLIC_ACTIVE_ENTRY_RECORD_RULE = `@request.auth.id = "" && status = "active" && raffle.is_configured = true && raffle.link_enabled = true && raffle.store.status = "active" && ${FIXED_ENTRY_RAFFLE_SLUG_RULE}`;
const PUBLIC_CANCELLED_ENTRY_LOOKUP_RULE = `@request.auth.id = "" && status = "cancelled" && phone = @request.query.phone && raffle = @request.query.raffle && raffle.is_configured = true && raffle.link_enabled = true && raffle.store.status = "active" && ${FIXED_ENTRY_RAFFLE_SLUG_RULE}`;
const PUBLIC_REENTRY_CONSUME_RULE = `@request.auth.id = "" && status = "cancelled" && can_reenter = true && phone = @request.body.phone && raffle = @request.body.raffle && @request.body.can_reenter = false && @request.body.reentry_allowed_at = "" && @request.body.store:isset = false && @request.body.chosen_number:isset = false && @request.body.receipt_code:isset = false && @request.body.status:isset = false && @request.body.cancelled_at:isset = false && @request.body.cancelled_reason:isset = false && raffle.is_configured = true && raffle.link_enabled = true && raffle.store.status = "active" && ${FIXED_ENTRY_RAFFLE_SLUG_RULE}`;

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function addDateField(collection, id, name) {
  if (getFieldSafe(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "date",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    min: "",
    max: "",
  }));
}

function addTextField(collection, id, name, max) {
  if (getFieldSafe(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "text",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    primaryKey: false,
    min: 0,
    max,
    pattern: "",
    autogeneratePattern: "",
  }));
}

function addBoolField(collection, id, name, defaultValue) {
  if (getFieldSafe(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "bool",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    default: defaultValue,
  }));
}

migrate((app) => {
  const entries = app.findCollectionByNameOrId("raffle_entries");
  addDateField(entries, "date1783384801", "cancelled_at");
  addTextField(entries, "text1783384802", "cancelled_reason", 220);
  addBoolField(entries, "bool1783384803", "can_reenter", false);
  addDateField(entries, "date1783384804", "reentry_allowed_at");
  entries.createRule = `(${PUBLIC_ENTRY_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`;
  entries.updateRule = `(${PUBLIC_REENTRY_CONSUME_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  entries.listRule = `(${PUBLIC_ACTIVE_ENTRY_RECORD_RULE}) || (${PUBLIC_CANCELLED_ENTRY_LOOKUP_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  entries.viewRule = `(${PUBLIC_ACTIVE_ENTRY_RECORD_RULE}) || (${PUBLIC_CANCELLED_ENTRY_LOOKUP_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  app.save(entries);
}, (app) => {
  const entries = app.findCollectionByNameOrId("raffle_entries");
  ["date1783384804", "bool1783384803", "text1783384802", "date1783384801"].forEach((id) => {
    try { entries.fields.removeById(id); } catch (_) {}
  });
  entries.createRule = `(${PUBLIC_ENTRY_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`;
  entries.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  entries.listRule = `(${PUBLIC_ACTIVE_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  entries.viewRule = `(${PUBLIC_ACTIVE_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  app.save(entries);
});
