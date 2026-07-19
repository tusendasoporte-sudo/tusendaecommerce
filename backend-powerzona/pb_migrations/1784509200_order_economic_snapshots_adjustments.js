/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_ORDER_ITEM_RULE = '@request.auth.role = "store_admin" && order.store = @request.auth.store';
const ADJUSTMENT_READ_RULE = '(@request.auth.role = "master_admin" && @request.auth.status = "active") || (@request.auth.role = "store_admin" && @request.auth.status = "active" && store = @request.auth.store)';

const ORDER_FIELD_IDS = [
  "number1784509201",
  "json1784509202",
  "number1784509203",
  "number1784509204",
  "number1784509205",
];

const ITEM_FIELD_IDS = [
  "number1784509211",
  "json1784509212",
  "number1784509213",
  "number1784509214",
  "bool1784509215",
  "number1784509216",
  "number1784509217",
  "number1784509218",
  "select1784509219",
  "text1784509220",
  "relation1784509221",
  "date1784509222",
];

function findCollectionSafe(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function addFieldIfMissing(collection, options) {
  try {
    const existing = collection.fields.getByName(options.name);
    if (existing) return existing;
  } catch (_) {}
  const field = new Field(options);
  collection.fields.add(field);
  return field;
}

function removeFieldByIdIfExists(collection, id) {
  try { collection.fields.removeById(id); } catch (_) {}
}

function numberField(id, name, options) {
  const config = options || {};
  return {
    default: config.default === undefined ? 0 : config.default,
    hidden: config.hidden === true,
    id,
    max: config.max === undefined ? null : config.max,
    min: config.min === undefined ? null : config.min,
    name,
    onlyInt: config.onlyInt === true,
    presentable: config.presentable === true,
    required: false,
    system: false,
    type: "number",
  };
}

function addIndexIfNeeded(collection, name, unique, columns, where) {
  try { if (collection.getIndex(name)) return; } catch (_) {}
  collection.addIndex(name, unique, columns, where || "");
}

function removeIndexIfExists(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

migrate((app) => {
  const orders = app.findCollectionByNameOrId("orders");
  [
    ["number1784509260", "subtotal_original_usd"],
    ["number1784509261", "discount_total_usd"],
    ["number1784509262", "subtotal_after_discount_usd"],
    ["number1784509263", "coupon_discount_usd"],
    ["number1784509264", "shipping_original_usd"],
    ["number1784509265", "shipping_discount_usd"],
  ].forEach(([id, name]) => addFieldIfMissing(orders, numberField(id, name, { min: 0 })));
  [
    ["text1784509266", "promotion_summary", 2000],
    ["text1784509267", "coupon_id", 80],
    ["text1784509268", "coupon_code", 60],
    ["text1784509269", "coupon_summary", 1000],
  ].forEach(([id, name, max]) => addFieldIfMissing(orders, {
    autogeneratePattern: "", hidden: false, id, max, min: 0, name, pattern: "",
    presentable: false, primaryKey: false, required: false, system: false, type: "text",
  }));
  ["subtotal", "total", "usd_total"].forEach((name) => {
    try {
      const field = orders.fields.getByName(name);
      if (field) field.required = false;
    } catch (_) {}
  });
  addFieldIfMissing(orders, numberField("number1784509201", "economic_snapshot_version", { hidden: true, onlyInt: true, min: 0 }));
  addFieldIfMissing(orders, {
    hidden: true, id: "json1784509202", maxSize: 65536, name: "economic_snapshot_json",
    presentable: false, required: false, system: false, type: "json",
  });
  addFieldIfMissing(orders, numberField("number1784509203", "subtotal_before_manual_adjustments_usd", { min: 0 }));
  addFieldIfMissing(orders, numberField("number1784509204", "manual_adjustment_total_usd", {}));
  addFieldIfMissing(orders, numberField("number1784509205", "subtotal_after_manual_adjustments_usd", { min: 0 }));
  app.save(orders);

  const orderItems = app.findCollectionByNameOrId("order_items");
  [
    ["number1784509270", "unit_price_original_usd"],
    ["number1784509271", "unit_price_final_usd"],
    ["number1784509272", "line_subtotal_original_usd"],
    ["number1784509273", "line_discount_usd"],
    ["number1784509274", "line_subtotal_final_usd"],
    ["number1784509275", "coupon_discount_usd"],
  ].forEach(([id, name]) => addFieldIfMissing(orderItems, numberField(id, name, { min: 0 })));
  [
    ["text1784509276", "promotion_id", 80],
    ["text1784509277", "promotion_name", 180],
    ["text1784509278", "promotion_type", 80],
    ["text1784509279", "coupon_id", 80],
    ["text1784509280", "coupon_code", 80],
  ].forEach(([id, name, max]) => addFieldIfMissing(orderItems, {
    autogeneratePattern: "", hidden: false, id, max, min: 0, name, pattern: "",
    presentable: false, primaryKey: false, required: false, system: false, type: "text",
  }));
  addFieldIfMissing(orderItems, numberField("number1784509211", "economic_snapshot_version", { hidden: true, onlyInt: true, min: 0 }));
  addFieldIfMissing(orderItems, {
    hidden: true, id: "json1784509212", maxSize: 16384, name: "economic_snapshot_json",
    presentable: false, required: false, system: false, type: "json",
  });
  addFieldIfMissing(orderItems, numberField("number1784509213", "unit_price_after_automatic_discount_usd", { min: 0 }));
  addFieldIfMissing(orderItems, numberField("number1784509214", "line_subtotal_after_automatic_discount_usd", { min: 0 }));
  addFieldIfMissing(orderItems, {
    default: false, hidden: false, id: "bool1784509215", name: "has_manual_price_adjustment",
    presentable: true, required: false, system: false, type: "bool",
  });
  addFieldIfMissing(orderItems, numberField("number1784509216", "manual_final_unit_price_usd", { min: 0, presentable: true }));
  addFieldIfMissing(orderItems, numberField("number1784509217", "manual_adjustment_unit_usd", {}));
  addFieldIfMissing(orderItems, numberField("number1784509218", "manual_adjustment_total_usd", {}));
  addFieldIfMissing(orderItems, {
    hidden: true, id: "select1784509219", maxSelect: 1, name: "manual_adjustment_reason_code",
    presentable: false, required: false, system: false, type: "select",
    values: ["customer_agreement", "price_correction", "special_discount", "shipping_service", "inconvenience", "other"],
  });
  addFieldIfMissing(orderItems, {
    autogeneratePattern: "", hidden: true, id: "text1784509220", max: 500, min: 0,
    name: "manual_adjustment_reason_text", pattern: "", presentable: false,
    primaryKey: false, required: false, system: false, type: "text",
  });
  addFieldIfMissing(orderItems, {
    cascadeDelete: false, collectionId: app.findCollectionByNameOrId("users").id, hidden: true,
    id: "relation1784509221", maxSelect: 1, minSelect: 0, name: "manual_adjusted_by",
    presentable: false, required: false, system: false, type: "relation",
  });
  addFieldIfMissing(orderItems, {
    hidden: true, id: "date1784509222", max: "", min: "", name: "manual_adjusted_at",
    presentable: false, required: false, system: false, type: "date",
  });
  orderItems.createRule = null;
  orderItems.updateRule = null;
  orderItems.deleteRule = null;
  app.save(orderItems);

  if (!findCollectionSafe(app, "order_price_adjustments")) {
    const audit = new Collection({
      id: "pbc_1784509200",
      name: "order_price_adjustments",
      type: "base",
      system: false,
      listRule: ADJUSTMENT_READ_RULE,
      viewRule: ADJUSTMENT_READ_RULE,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { autogeneratePattern: "[a-z0-9]{15}", hidden: false, id: "text1784509230", max: 15, min: 15, name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true, required: true, system: true, type: "text" },
        { cascadeDelete: false, collectionId: app.findCollectionByNameOrId("stores").id, hidden: false, id: "relation1784509231", maxSelect: 1, minSelect: 0, name: "store", presentable: true, required: false, system: false, type: "relation" },
        { autogeneratePattern: "", hidden: true, id: "text1784509232", max: 15, min: 1, name: "store_id_snapshot", pattern: "", presentable: false, primaryKey: false, required: true, system: false, type: "text" },
        { cascadeDelete: false, collectionId: orders.id, hidden: false, id: "relation1784509233", maxSelect: 1, minSelect: 0, name: "order", presentable: true, required: false, system: false, type: "relation" },
        { autogeneratePattern: "", hidden: true, id: "text1784509234", max: 15, min: 1, name: "order_id_snapshot", pattern: "", presentable: false, primaryKey: false, required: true, system: false, type: "text" },
        { autogeneratePattern: "", hidden: false, id: "text1784509235", max: 60, min: 0, name: "order_number_snapshot", pattern: "", presentable: true, primaryKey: false, required: false, system: false, type: "text" },
        { cascadeDelete: false, collectionId: orderItems.id, hidden: false, id: "relation1784509236", maxSelect: 1, minSelect: 0, name: "order_item", presentable: true, required: false, system: false, type: "relation" },
        { autogeneratePattern: "", hidden: true, id: "text1784509237", max: 15, min: 1, name: "order_item_id_snapshot", pattern: "", presentable: false, primaryKey: false, required: true, system: false, type: "text" },
        { autogeneratePattern: "", hidden: false, id: "text1784509238", max: 180, min: 1, name: "product_name_snapshot", pattern: "", presentable: true, primaryKey: false, required: true, system: false, type: "text" },
        { cascadeDelete: false, collectionId: app.findCollectionByNameOrId("users").id, hidden: true, id: "relation1784509239", maxSelect: 1, minSelect: 0, name: "actor", presentable: false, required: false, system: false, type: "relation" },
        { autogeneratePattern: "", hidden: true, id: "text1784509240", max: 160, min: 1, name: "actor_name_snapshot", pattern: "", presentable: false, primaryKey: false, required: true, system: false, type: "text" },
        { autogeneratePattern: "", hidden: true, id: "text1784509241", max: 40, min: 1, name: "actor_role_snapshot", pattern: "", presentable: false, primaryKey: false, required: true, system: false, type: "text" },
        { hidden: false, id: "select1784509242", maxSelect: 1, name: "action", presentable: true, required: true, system: false, type: "select", values: ["adjust", "reset"] },
        numberField("number1784509243", "quantity_snapshot", { onlyInt: true, min: 1 }),
        numberField("number1784509244", "automatic_unit_price_usd", { min: 0 }),
        numberField("number1784509245", "previous_final_unit_price_usd", { min: 0 }),
        numberField("number1784509246", "new_final_unit_price_usd", { min: 0 }),
        numberField("number1784509247", "unit_adjustment_usd", {}),
        numberField("number1784509248", "total_adjustment_usd", {}),
        { hidden: true, id: "select1784509249", maxSelect: 1, name: "reason_code", presentable: false, required: true, system: false, type: "select", values: ["customer_agreement", "price_correction", "special_discount", "shipping_service", "inconvenience", "other"] },
        { autogeneratePattern: "", hidden: true, id: "text1784509250", max: 500, min: 0, name: "reason_text", pattern: "", presentable: false, primaryKey: false, required: false, system: false, type: "text" },
        { hidden: false, id: "autodate1784509251", name: "created", onCreate: true, onUpdate: false, presentable: false, system: false, type: "autodate" },
      ],
      indexes: [
        "CREATE INDEX `idx_order_price_adjustments_store_created` ON `order_price_adjustments` (`store`, `created`)",
        "CREATE INDEX `idx_order_price_adjustments_order_created` ON `order_price_adjustments` (`order`, `created`)",
        "CREATE INDEX `idx_order_price_adjustments_item_created` ON `order_price_adjustments` (`order_item`, `created`)",
      ],
    });
    app.save(audit);
  }

  const usages = findCollectionSafe(app, "manual_coupon_usages");
  if (usages) {
    addIndexIfNeeded(usages, "idx_manual_coupon_usages_order_coupon", false, "order, coupon", "");
    app.save(usages);
  }
}, (app) => {
  const usages = findCollectionSafe(app, "manual_coupon_usages");
  if (usages) {
    removeIndexIfExists(usages, "idx_manual_coupon_usages_order_coupon");
    app.save(usages);
  }

  const audit = findCollectionSafe(app, "order_price_adjustments");
  if (audit) app.delete(audit);

  const orderItems = findCollectionSafe(app, "order_items");
  if (orderItems) {
    ITEM_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(orderItems, id));
    orderItems.createRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    orderItems.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    orderItems.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    app.save(orderItems);
  }

  const orders = findCollectionSafe(app, "orders");
  if (orders) {
    ORDER_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(orders, id));
    ["subtotal", "total", "usd_total"].forEach((name) => {
      try {
        const field = orders.fields.getByName(name);
        if (field) field.required = true;
      } catch (_) {}
    });
    app.save(orders);
  }
});
