/// <reference path="../pb_data/types.d.ts" />

const WALLET = "storefront_installation_coupons";
const INBOX_RETENTION_DAYS = 30;
const DELIVERY_FIELD_IDS = Object.freeze({
  title: "txt17877000001",
  body: "txt17877000002",
  image: "txt17877000003",
  targetType: "sel17877000004",
  targetPath: "txt17877000005",
  readAt: "dat17877000006",
  deletedAt: "dat17877000007",
  expiresAt: "dat17877000008",
});

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required, hidden, pattern) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min: required ? 1 : 0,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, required, hidden) {
  return {
    cascadeDelete: false, collectionId, hidden: hidden === true, id, maxSelect: 1,
    minSelect: required ? 1 : 0, name, presentable: false, required: !!required,
    system: false, type: "relation",
  };
}

function selectField(id, name, values, required, hidden) {
  return {
    hidden: hidden === true, id, maxSelect: 1, name, presentable: false,
    required: !!required, system: false, type: "select", values,
  };
}

function dateField(id, name, required, hidden) {
  return {
    hidden: hidden === true, id, max: "", min: "", name, presentable: false,
    required: !!required, system: false, type: "date",
  };
}

function boolField(id, name) {
  return {
    hidden: false, id, name, presentable: false, required: false,
    system: false, type: "bool",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: "autodate",
  };
}

function addDays(value, days) {
  const parsed = new Date(value || Date.now());
  const base = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return new Date(base.getTime() + days * 86_400_000).toISOString();
}

function recordValue(record, name) {
  try { return record.get(name); } catch (_) { return record && record[name]; }
}

function recordString(record, name) {
  const value = recordValue(record, name);
  return String(value === null || value === undefined ? "" : value).trim();
}

function relationId(record, name) {
  const value = recordValue(record, name);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value && typeof value === "object" ? value.id || "" : value || "").trim();
}

function findRecord(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function addDeliveryField(collection, field) {
  let existing = null;
  try { existing = collection.fields.getByName(field.name); } catch (_) {}
  if (!existing) collection.fields.add(new Field(field));
}

function backfillDeliveries(app) {
  for (let offset = 0; ; offset += 500) {
    const records = app.findRecordsByFilter("push_campaign_deliveries", "", "id", 500, offset) || [];
    records.forEach((delivery) => {
      const campaign = findRecord(app, "push_campaigns", relationId(delivery, "campaign"));
      if (!campaign) return;
      delivery.set("inbox_title", recordString(campaign, "title"));
      delivery.set("inbox_body", recordString(campaign, "body"));
      delivery.set("inbox_image_url", "");
      delivery.set("inbox_target_type", recordString(campaign, "target_type") || "home");
      delivery.set("inbox_target_path", recordString(campaign, "target_path"));
      delivery.set("inbox_expires_at", addDays(recordString(delivery, "created"), INBOX_RETENTION_DAYS));
      app.save(delivery);
    });
    if (records.length < 500) break;
  }
}

migrate((app) => {
  const deliveries = app.findCollectionByNameOrId("push_campaign_deliveries");
  addDeliveryField(deliveries, textField(DELIVERY_FIELD_IDS.title, "inbox_title", 120, false, false));
  addDeliveryField(deliveries, textField(DELIVERY_FIELD_IDS.body, "inbox_body", 1000, false, false));
  addDeliveryField(deliveries, textField(DELIVERY_FIELD_IDS.image, "inbox_image_url", 1000, false, true, "^https://"));
  addDeliveryField(deliveries, selectField(
    DELIVERY_FIELD_IDS.targetType,
    "inbox_target_type",
    ["home", "product", "category", "section", "order", "raffle", "coupon"],
    false,
    false,
  ));
  addDeliveryField(deliveries, textField(DELIVERY_FIELD_IDS.targetPath, "inbox_target_path", 500, false, false));
  addDeliveryField(deliveries, dateField(DELIVERY_FIELD_IDS.readAt, "inbox_read_at", false, false));
  addDeliveryField(deliveries, dateField(DELIVERY_FIELD_IDS.deletedAt, "inbox_deleted_at", false, false));
  addDeliveryField(deliveries, dateField(DELIVERY_FIELD_IDS.expiresAt, "inbox_expires_at", false, false));
  const deliveryIndexes = Array.isArray(deliveries.indexes) ? deliveries.indexes : [];
  if (!deliveryIndexes.some((index) => String(index).includes("idx_push_deliveries_private_inbox"))) {
    deliveries.indexes = [...deliveryIndexes,
      "CREATE INDEX `idx_push_deliveries_private_inbox` ON `push_campaign_deliveries` (`installation`, `status`, `inbox_deleted_at`, `inbox_expires_at`, `created`)",
    ];
  }
  app.save(deliveries);

  let wallet = null;
  try { wallet = app.findCollectionByNameOrId(WALLET); } catch (_) {}
  if (!wallet) {
    const stores = app.findCollectionByNameOrId("stores");
    const installations = app.findCollectionByNameOrId("storefront_installations");
    const coupons = app.findCollectionByNameOrId("manual_coupons");
    wallet = new Collection({
      id: "pbc_1787700001",
      name: WALLET,
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField("txt17877000101"),
        relationField("rel17877000102", "store", stores.id, true, false),
        relationField("rel17877000103", "installation", installations.id, true, true),
        relationField("rel17877000104", "coupon", coupons.id, false, false),
        textField("txt17877000105", "coupon_code", 8, true, false, "^[\\x20-\\x7E]{2,8}$"),
        selectField("sel17877000106", "status", ["active", "used", "removed", "expired"], true, false),
        selectField("sel17877000107", "source", ["link", "push", "code", "checkout", "migration"], true, false),
        boolField("bol17877000108", "selected"),
        dateField("dat17877000109", "acquired_at", true, false),
        dateField("dat17877000110", "used_at", false, false),
        dateField("dat17877000111", "expires_at", false, false),
        autoDateField("aut17877000112", "created", false),
        autoDateField("aut17877000113", "updated", true),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_storefront_installation_coupons_code` ON `storefront_installation_coupons` (`installation`, `coupon_code`)",
        "CREATE UNIQUE INDEX `idx_storefront_installation_coupons_selected` ON `storefront_installation_coupons` (`installation`) WHERE `selected` = 1 AND `status` = 'active'",
        "CREATE INDEX `idx_storefront_installation_coupons_store_status` ON `storefront_installation_coupons` (`store`, `status`, `updated`)",
      ],
    });
    app.save(wallet);
  }

  backfillDeliveries(app);
}, (app) => {
  const wallet = app.findCollectionByNameOrId(WALLET);
  const walletRows = app.findRecordsByFilter(WALLET, "", "", 1, 0) || [];
  if (walletRows.length) throw new Error("unsafe_rollback_storefront_private_wallet");
  app.delete(wallet);

  // Inbox values are a derived snapshot of campaign deliveries. Removing these
  // columns during a deliberate migration rollback does not delete the source
  // campaigns or their technical delivery evidence.
  const deliveries = app.findCollectionByNameOrId("push_campaign_deliveries");
  deliveries.indexes = (Array.isArray(deliveries.indexes) ? deliveries.indexes : [])
    .filter((index) => !String(index).includes("idx_push_deliveries_private_inbox"));
  Object.values(DELIVERY_FIELD_IDS).forEach((id) => {
    try { deliveries.fields.removeById(id); } catch (_) {}
  });
  app.save(deliveries);
});
