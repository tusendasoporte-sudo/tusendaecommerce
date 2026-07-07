/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_USER_CREATE_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && @request.body.store = @request.auth.store';
const STORE_USER_RECORD_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store';
const FIXED_RAFFLE_SLUG_RULE = '(slug = "rifa-1" || slug = "rifa-2" || slug = "rifa-3")';
const FIXED_ENTRY_RAFFLE_SLUG_RULE = '(raffle.slug = "rifa-1" || raffle.slug = "rifa-2" || raffle.slug = "rifa-3")';
const PUBLIC_RAFFLE_RULE = `link_enabled = true && is_configured = true && store.status = "active" && ${FIXED_RAFFLE_SLUG_RULE}`;
const PUBLIC_ENTRY_CREATE_RULE = `@request.auth.id = "" && @request.body.store != "" && @request.body.raffle != "" && @request.body.status = "active" && raffle.store = @request.body.store && raffle.is_configured = true && raffle.link_enabled = true && raffle.store.status = "active" && ${FIXED_ENTRY_RAFFLE_SLUG_RULE}`;
const PUBLIC_ENTRY_RECORD_RULE = `@request.auth.id = "" && status = "active" && raffle.is_configured = true && raffle.link_enabled = true && raffle.store.status = "active" && ${FIXED_ENTRY_RAFFLE_SLUG_RULE}`;

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function addNumberField(collection, id, name, min, max) {
  if (getFieldSafe(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "number",
    system: false,
    required: false,
    hidden: false,
    presentable: true,
    min,
    max,
    onlyInt: true,
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

function listRecords(app, collectionName, filter) {
  let offset = 0;
  const limit = 200;
  const records = [];
  while (true) {
    const chunk = app.findRecordsByFilter(collectionName, filter || "", "created", limit, offset);
    if (!chunk || !chunk.length) return records;
    records.push(...chunk);
    if (chunk.length < limit) return records;
    offset += limit;
  }
}

function slotNumberFromSlug(slug) {
  const match = String(slug || "").match(/^rifa-([1-3])$/);
  return match ? Number(match[1]) : 0;
}

function hasRaffleContent(record) {
  const title = String(record.get("title") || "").trim();
  return Boolean(
    (title && title.toLowerCase() !== "nueva rifa")
    || String(record.get("access_code") || "").trim()
    || String(record.get("description") || "").trim()
    || String(record.get("conditions") || "").trim()
    || record.get("starts_at")
    || record.get("closes_at")
    || record.get("draw_at")
  );
}

migrate((app) => {
  const raffles = app.findCollectionByNameOrId("raffles");
  addNumberField(raffles, "number1783384701", "slot_number", 1, 3);
  addBoolField(raffles, "bool1783384702", "is_configured", false);
  addBoolField(raffles, "bool1783384703", "selection_manually_closed", false);
  addDateField(raffles, "date1783384704", "reset_at");

  const linkField = getFieldSafe(raffles, "link_enabled");
  if (linkField) linkField.default = false;

  raffles.createRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`;
  raffles.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  raffles.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  raffles.listRule = `(${PUBLIC_RAFFLE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  raffles.viewRule = `(${PUBLIC_RAFFLE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;

  const slotIndex = "CREATE UNIQUE INDEX `idx_raffles_store_slot` ON `raffles` (`store`, `slot_number`) WHERE `slot_number` > 0";
  if (!raffles.indexes.some((index) => String(index).includes("idx_raffles_store_slot"))) {
    raffles.indexes.push(slotIndex);
  }

  app.save(raffles);

  listRecords(app, "raffles", "").forEach((record) => {
    const slotNumber = slotNumberFromSlug(record.get("slug"));
    if (slotNumber) {
      record.set("slot_number", slotNumber);
      record.set("is_configured", hasRaffleContent(record));
      if (!String(record.get("title") || "").trim()) record.set("title", "Nueva rifa");
    } else {
      record.set("link_enabled", false);
      record.set("show_in_store", false);
      record.set("visible", false);
      record.set("status", "archived");
    }
    app.save(record);
  });

  const entries = app.findCollectionByNameOrId("raffle_entries");
  entries.createRule = `(${PUBLIC_ENTRY_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`;
  entries.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  entries.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  entries.listRule = `(${PUBLIC_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  entries.viewRule = `(${PUBLIC_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`;
  app.save(entries);
}, (app) => {
  const raffles = app.findCollectionByNameOrId("raffles");
  ["date1783384704", "bool1783384703", "bool1783384702", "number1783384701"].forEach((id) => {
    try { raffles.fields.removeById(id); } catch (_) {}
  });
  raffles.indexes = raffles.indexes.filter((index) => !String(index).includes("idx_raffles_store_slot"));
  app.save(raffles);
});
