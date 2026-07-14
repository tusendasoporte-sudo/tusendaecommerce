/// <reference path="../pb_data/types.d.ts" />

const MASTER_NOTIFICATION_READ_RULE = '@request.auth.role = "master_admin" && recipient = @request.auth.id';

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required, hidden) {
  return {
    autogeneratePattern: "", hidden: !!hidden, id, max, min: required ? 1 : 0,
    name, pattern: "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, required) {
  return {
    cascadeDelete: false, collectionId, hidden: false, id, maxSelect: 1,
    minSelect: required ? 1 : 0, name, presentable: false, required: !!required,
    system: false, type: "relation",
  };
}

function selectField(id, name, values, required) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: !!required, system: false, type: "select", values,
  };
}

function dateField(id, name, required) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: !!required, system: false, type: "date",
  };
}

function jsonField(id, name) {
  return {
    hidden: true, id, maxSize: 0, name, presentable: false,
    required: false, system: false, type: "json",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: "autodate",
  };
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const products = app.findCollectionByNameOrId("products");
  const variations = app.findCollectionByNameOrId("product_variations");
  const users = app.findCollectionByNameOrId("users");

  const watches = new Collection({
    id: "pbc_1783386100",
    name: "master_product_watches",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386101"),
      relationField("relation17833801", "store", stores.id, true),
      relationField("relation17833802", "product", products.id, false),
      textField("text1783386102", "product_id_snapshot", 15, true, false),
      textField("text1783386103", "product_name_snapshot", 180, false, false),
      textField("text1783386104", "product_slug_snapshot", 180, false, false),
      selectField("select1783386101", "status", ["active", "paused", "deleted"], true),
      jsonField("json1783386101", "last_snapshot"),
      textField("text1783386105", "last_fingerprint", 128, false, true),
      dateField("date1783386101", "started_at", true),
      dateField("date1783386102", "paused_at", false),
      dateField("date1783386103", "deleted_at", false),
      relationField("relation17833803", "created_by", users.id, false),
      relationField("relation17833804", "updated_by", users.id, false),
      autoDateField("autodate17833801", "created", false),
      autoDateField("autodate17833802", "updated", true),
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_master_product_watches_store_product` ON `master_product_watches` (`store`, `product_id_snapshot`)",
      "CREATE INDEX `idx_master_product_watches_store_status_updated` ON `master_product_watches` (`store`, `status`, `updated`)",
      "CREATE INDEX `idx_master_product_watches_product_status` ON `master_product_watches` (`product`, `status`)",
    ],
  });
  app.save(watches);

  const events = new Collection({
    id: "pbc_1783386101",
    name: "master_product_price_events",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386110"),
      relationField("relation17833810", "store", stores.id, true),
      relationField("relation17833811", "watch", watches.id, true),
      relationField("relation17833812", "product", products.id, false),
      textField("text1783386111", "product_id_snapshot", 15, true, false),
      textField("text1783386112", "product_name_snapshot", 180, false, false),
      textField("text1783386113", "product_slug_snapshot", 180, false, false),
      relationField("relation17833813", "variation", variations.id, false),
      textField("text1783386114", "variation_id_snapshot", 15, false, false),
      textField("text1783386115", "variation_label_snapshot", 220, false, false),
      selectField("select1783386110", "entity_type", ["product", "variation", "catalog"], true),
      textField("text1783386116", "change_type", 60, true, false),
      textField("text1783386117", "summary", 500, true, false),
      jsonField("json1783386110", "before_state"),
      jsonField("json1783386111", "after_state"),
      relationField("relation17833814", "actor", users.id, false),
      textField("text1783386118", "actor_name_snapshot", 160, false, false),
      textField("text1783386119", "actor_role_snapshot", 40, false, false),
      selectField("select1783386111", "source", ["request", "system"], true),
      textField("text1783386120", "dedupe_key", 180, true, true),
      autoDateField("autodate17833810", "created", false),
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_master_product_price_events_dedupe` ON `master_product_price_events` (`dedupe_key`)",
      "CREATE INDEX `idx_master_product_price_events_store_product_created` ON `master_product_price_events` (`store`, `product_id_snapshot`, `created`)",
      "CREATE INDEX `idx_master_product_price_events_watch_created` ON `master_product_price_events` (`watch`, `created`)",
    ],
  });
  app.save(events);

  const notifications = new Collection({
    id: "pbc_1783386102",
    name: "master_notifications",
    type: "base",
    system: false,
    listRule: MASTER_NOTIFICATION_READ_RULE,
    viewRule: MASTER_NOTIFICATION_READ_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386121"),
      relationField("relation17833820", "recipient", users.id, true),
      textField("text1783386122", "type", 60, true, false),
      textField("text1783386123", "category", 40, true, false),
      relationField("relation17833821", "store", stores.id, false),
      relationField("relation17833822", "product", products.id, false),
      textField("text1783386124", "product_id_snapshot", 15, false, false),
      textField("text1783386125", "product_name_snapshot", 180, false, false),
      textField("text1783386126", "title", 180, true, false),
      textField("text1783386127", "message", 500, true, false),
      textField("text1783386128", "action_url", 500, false, false),
      selectField("select1783386120", "status", ["unread", "read", "archived"], true),
      textField("text1783386129", "group_key", 180, false, true),
      {
        hidden: false, id: "number1783386101", max: null, min: 1, name: "event_count",
        onlyInt: true, presentable: false, required: true, system: false, type: "number",
      },
      dateField("date1783386120", "first_event_at", true),
      dateField("date1783386121", "last_event_at", true),
      dateField("date1783386122", "read_at", false),
      dateField("date1783386123", "archived_at", false),
      dateField("date1783386124", "expires_at", true),
      autoDateField("autodate17833820", "created", false),
      autoDateField("autodate17833821", "updated", true),
    ],
    indexes: [
      "CREATE INDEX `idx_master_notifications_recipient_status_created` ON `master_notifications` (`recipient`, `status`, `created`)",
      "CREATE INDEX `idx_master_notifications_recipient_category_created` ON `master_notifications` (`recipient`, `category`, `created`)",
      "CREATE INDEX `idx_master_notifications_expires_at` ON `master_notifications` (`expires_at`)",
      "CREATE INDEX `idx_master_notifications_group_recipient_status_last` ON `master_notifications` (`group_key`, `recipient`, `status`, `last_event_at`)",
    ],
  });
  app.save(notifications);
}, (app) => {
  ["master_notifications", "master_product_price_events", "master_product_watches"].forEach((name) => {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {}
  });
});
