/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_USER_CREATE_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && @request.body.store = @request.auth.store';
const STORE_USER_RECORD_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store';
const PUBLIC_RAFFLE_RULE = 'link_enabled = true && store.status = "active"';
const PUBLIC_ENTRY_CREATE_RULE = '@request.auth.id = "" && @request.body.store != "" && @request.body.raffle != "" && @request.body.status = "active" && raffle.store = @request.body.store && raffle.link_enabled = true && raffle.store.status = "active"';
const PUBLIC_ENTRY_RECORD_RULE = '@request.auth.id = "" && status = "active" && raffle.link_enabled = true && raffle.store.status = "active"';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function ensureAccessCodeField(collection) {
  if (getFieldSafe(collection, "access_code")) return;
  collection.fields.add(new Field({
    id: "text1783384501",
    name: "access_code",
    type: "text",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    primaryKey: false,
    min: 0,
    max: 80,
    pattern: "",
    autogeneratePattern: "",
  }));
}

function makeLegacyHashOptional(collection) {
  const field = getFieldSafe(collection, "access_code_hash");
  if (!field) return;
  field.required = false;
  field.min = 0;
}

migrate((app) => {
  const raffles = findCollectionSafe(app, "raffles");
  if (raffles) {
    ensureAccessCodeField(raffles);
    makeLegacyHashOptional(raffles);
    raffles.createRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`;
    raffles.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    raffles.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    raffles.listRule = `(${PUBLIC_RAFFLE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    raffles.viewRule = `(${PUBLIC_RAFFLE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    app.save(raffles);
  }

  const entries = findCollectionSafe(app, "raffle_entries");
  if (entries) {
    entries.createRule = `(${PUBLIC_ENTRY_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`;
    entries.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    entries.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    entries.listRule = `(${PUBLIC_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    entries.viewRule = `(${PUBLIC_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
    app.save(entries);
  }
}, () => {
});
