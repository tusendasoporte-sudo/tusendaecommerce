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
    presentable: true,
    default: defaultValue,
  }));
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

function addResultPendingStatus(collection) {
  const statusField = getFieldSafe(collection, "status");
  if (!statusField || !Array.isArray(statusField.values)) return;
  if (!statusField.values.includes("result_pending")) {
    const nextValues = [];
    statusField.values.forEach((value) => {
      nextValues.push(value);
      if (value === "selection_closed") nextValues.push("result_pending");
    });
    statusField.values = nextValues.includes("result_pending")
      ? nextValues
      : [...statusField.values, "result_pending"];
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("raffles");
  addResultPendingStatus(collection);
  addBoolField(collection, "bool1783384401", "link_enabled", true);
  addBoolField(collection, "bool1783384402", "show_in_store", false);
  addDateField(collection, "date1783384403", "finalized_at");

  collection.listRule = collection.listRule?.replace("visible = true", "link_enabled = true") || collection.listRule;
  collection.viewRule = collection.viewRule?.replace("visible = true", "link_enabled = true") || collection.viewRule;

  const linkIndex = "CREATE INDEX `idx_raffles_store_link_show` ON `raffles` (`store`, `link_enabled`, `show_in_store`)";
  if (!collection.indexes.some((index) => String(index).includes("idx_raffles_store_link_show"))) {
    collection.indexes.push(linkIndex);
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("raffles");
  ["date1783384403", "bool1783384402", "bool1783384401"].forEach((id) => {
    try {
      collection.fields.removeById(id);
    } catch (_) {
    }
  });

  const statusField = getFieldSafe(collection, "status");
  if (statusField && Array.isArray(statusField.values)) {
    statusField.values = statusField.values.filter((value) => value !== "result_pending");
  }

  collection.indexes = collection.indexes.filter((index) => !String(index).includes("idx_raffles_store_link_show"));
  collection.listRule = collection.listRule?.replace("link_enabled = true", "visible = true") || collection.listRule;
  collection.viewRule = collection.viewRule?.replace("link_enabled = true", "visible = true") || collection.viewRule;

  return app.save(collection);
});
