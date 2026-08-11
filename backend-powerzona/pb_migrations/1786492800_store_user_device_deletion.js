/// <reference path="../pb_data/types.d.ts" />

const ADMIN_DEVICE_FIELD_ID = "relation1786492801";
const ADMIN_DEVICE_INDEX = "CREATE INDEX `idx_store_push_devices_admin_device_status` ON `store_push_devices` (`admin_device`, `status`)";
const DELETE_ACTION = "device_deleted";

function hasField(collection, name) {
  try { return !!collection.fields.getByName(name); } catch (_) { return false; }
}

function addSelectValue(collection, fieldName, value) {
  const field = collection.fields.getByName(fieldName);
  const values = Array.isArray(field.values) ? field.values.slice() : [];
  if (!values.includes(value)) values.push(value);
  field.values = values;
}

function removeSelectValue(collection, fieldName, value) {
  const field = collection.fields.getByName(fieldName);
  const values = Array.isArray(field.values) ? field.values : [];
  field.values = values.filter((item) => item !== value);
}

migrate((app) => {
  const administrativeDevices = app.findCollectionByNameOrId("store_user_devices");
  const pushDevices = app.findCollectionByNameOrId("store_push_devices");
  const deviceAudit = app.findCollectionByNameOrId("store_user_device_audit");

  if (!hasField(pushDevices, "admin_device")) {
    pushDevices.fields.add(new Field({
      cascadeDelete: false,
      collectionId: administrativeDevices.id,
      hidden: true,
      id: ADMIN_DEVICE_FIELD_ID,
      maxSelect: 1,
      minSelect: 0,
      name: "admin_device",
      presentable: false,
      required: false,
      system: false,
      type: "relation",
    }));
  }
  if (!pushDevices.indexes.some((index) => String(index).includes("idx_store_push_devices_admin_device_status"))) {
    pushDevices.indexes.push(ADMIN_DEVICE_INDEX);
  }
  addSelectValue(deviceAudit, "action", DELETE_ACTION);
  app.save(pushDevices);
  return app.save(deviceAudit);
}, (app) => {
  const pushDevices = app.findCollectionByNameOrId("store_push_devices");
  const deviceAudit = app.findCollectionByNameOrId("store_user_device_audit");
  pushDevices.indexes = pushDevices.indexes.filter((index) => !String(index).includes("idx_store_push_devices_admin_device_status"));
  try { pushDevices.fields.removeById(ADMIN_DEVICE_FIELD_ID); } catch (_) {}
  removeSelectValue(deviceAudit, "action", DELETE_ACTION);
  app.save(deviceAudit);
  return app.save(pushDevices);
});
