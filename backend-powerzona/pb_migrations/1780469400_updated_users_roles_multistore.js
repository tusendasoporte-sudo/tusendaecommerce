/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-21-30-11-USERS-ROLES-MULTISTORE-20260611
// Agrega base de roles multitienda sobre la coleccion auth users existente.

const USER_ROLE_VALUES = ["master_admin", "store_admin", "store_staff"];
const USER_STATUS_VALUES = ["active", "suspended"];

const USER_ROLE_FIELD_ID = "select1780469401";
const USER_STORE_FIELD_ID = "relation1780469402";
const USER_STATUS_FIELD_ID = "select1780469403";
const USER_DISPLAY_NAME_FIELD_ID = "text1780469404";
const USER_PHONE_FIELD_ID = "text1780469405";

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

function addFieldIfMissing(collection, name, field) {
  if (hasField(collection, name)) return false;
  collection.fields.add(new Field(field));
  return true;
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const stores = app.findCollectionByNameOrId("stores");

  addFieldIfMissing(users, "role", {
    "hidden": false,
    "id": USER_ROLE_FIELD_ID,
    "maxSelect": 1,
    "name": "role",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": USER_ROLE_VALUES
  });

  addFieldIfMissing(users, "store", {
    "cascadeDelete": false,
    "collectionId": stores.id,
    "hidden": false,
    "id": USER_STORE_FIELD_ID,
    "maxSelect": 1,
    "minSelect": 0,
    "name": "store",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  });

  addFieldIfMissing(users, "status", {
    "hidden": false,
    "id": USER_STATUS_FIELD_ID,
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": USER_STATUS_VALUES
  });

  addFieldIfMissing(users, "display_name", {
    "autogeneratePattern": "",
    "hidden": false,
    "id": USER_DISPLAY_NAME_FIELD_ID,
    "max": 140,
    "min": 0,
    "name": "display_name",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  });

  addFieldIfMissing(users, "phone", {
    "autogeneratePattern": "",
    "hidden": false,
    "id": USER_PHONE_FIELD_ID,
    "max": 60,
    "min": 0,
    "name": "phone",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  });

  return app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");

  [
    USER_ROLE_FIELD_ID,
    USER_STORE_FIELD_ID,
    USER_STATUS_FIELD_ID,
    USER_DISPLAY_NAME_FIELD_ID,
    USER_PHONE_FIELD_ID
  ].forEach((fieldId) => {
    try {
      users.fields.removeById(fieldId);
    } catch (_) {}
  });

  return app.save(users);
});
