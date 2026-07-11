/// <reference path="../pb_data/types.d.ts" />

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
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

migrate((app) => {
  const raffles = app.findCollectionByNameOrId("raffles");

  addBoolField(
    raffles,
    "bool1783385001",
    "whatsapp_group_invite_enabled",
    false
  );

  addTextField(
    raffles,
    "text1783385002",
    "whatsapp_group_invite_url",
    500
  );

  app.save(raffles);
}, (app) => {
  const raffles = app.findCollectionByNameOrId("raffles");

  try {
    raffles.fields.removeById("bool1783385001");
  } catch (_) {}

  try {
    raffles.fields.removeById("text1783385002");
  } catch (_) {}

  app.save(raffles);
});
