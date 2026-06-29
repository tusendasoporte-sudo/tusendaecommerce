/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_USER_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store';
const PUBLIC_CREATE_RULE = '@request.auth.id = "" && store != ""';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

function addBoolField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;
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

function addNumberField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "number",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    min: null,
    max: null,
    onlyInt: false,
    default: defaultValue,
  }));
}

migrate((app) => {
  const existingNotifications = findCollectionSafe(app, "store_notifications");
  if (!existingNotifications) {
    const collection = new Collection({
      "createRule": `(${PUBLIC_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`,
      "deleteRule": MASTER_ADMIN_RULE,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false,
          "id": "text1780471901",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_1780469000",
          "hidden": false,
          "id": "relation1780471902",
          "maxSelect": 1,
          "minSelect": 1,
          "name": "store",
          "presentable": true,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "select1780471903",
          "maxSelect": 1,
          "name": "type",
          "presentable": true,
          "required": true,
          "system": false,
          "type": "select",
          "values": ["new_order", "pending_order", "system_warning", "low_stock", "out_of_stock", "product_expiring_soon", "promotion_expiring_soon", "coupon_expiring_soon", "review_pending"]
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text1780471904",
          "max": 160,
          "min": 1,
          "name": "title",
          "pattern": "",
          "presentable": true,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text1780471905",
          "max": 600,
          "min": 1,
          "name": "message",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "select1780471906",
          "maxSelect": 1,
          "name": "status",
          "presentable": true,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["unread", "read"]
        },
        {
          "hidden": false,
          "id": "select1780471907",
          "maxSelect": 1,
          "name": "priority",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["normal", "important", "critical"]
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text1780471908",
          "max": 300,
          "min": 0,
          "name": "target_url",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text1780471909",
          "max": 80,
          "min": 0,
          "name": "entity_collection",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text1780471910",
          "max": 80,
          "min": 0,
          "name": "entity_id",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "json1780471911",
          "maxSize": 0,
          "name": "metadata_json",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "hidden": false,
          "id": "date1780471912",
          "max": "",
          "min": "",
          "name": "read_at",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        },
        {
          "hidden": false,
          "id": "autodate1780471913",
          "name": "created",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "hidden": false,
          "id": "autodate1780471914",
          "name": "updated",
          "onCreate": true,
          "onUpdate": true,
          "presentable": false,
          "system": false,
          "type": "autodate"
        }
      ],
      "id": "pbc_1780471900",
      "indexes": [
        "CREATE INDEX `idx_store_notifications_store_status` ON `store_notifications` (`store`, `status`)",
        "CREATE INDEX `idx_store_notifications_store_created` ON `store_notifications` (`store`, `created`)",
        "CREATE UNIQUE INDEX `idx_store_notifications_unread_entity` ON `store_notifications` (`store`, `type`, `entity_collection`, `entity_id`, `status`) WHERE `status` = 'unread' AND `entity_collection` != '' AND `entity_id` != ''"
      ],
      "listRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`,
      "name": "store_notifications",
      "system": false,
      "type": "base",
      "updateRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`,
      "viewRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`
    });

    app.save(collection);
  }

  const settings = findCollectionSafe(app, "settings");
  if (settings) {
    addBoolField(settings, "bool1780471915", "notifications_enabled", true);
    addBoolField(settings, "bool1780471916", "notify_new_order", true);
    addBoolField(settings, "bool1780471917", "notify_pending_order", true);
    addNumberField(settings, "number17804718", "pending_order_hours", 2);
    addBoolField(settings, "bool1780471919", "notify_low_stock", true);
    addNumberField(settings, "number17804720", "low_stock_threshold", 3);
    addBoolField(settings, "bool1780471921", "notify_out_of_stock", true);
    addBoolField(settings, "bool1780471922", "notify_product_expiring", false);
    addNumberField(settings, "number17804723", "product_expiring_days", 15);
    addBoolField(settings, "bool1780471924", "notify_promotion_expiring", true);
    addNumberField(settings, "number17804725", "promotion_expiring_days", 3);
    addBoolField(settings, "bool1780471926", "notify_review_pending", true);
    app.save(settings);
  }
}, (app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (collection) app.delete(collection);

  const settings = findCollectionSafe(app, "settings");
  if (settings) {
    [
      "bool1780471926",
      "number17804725",
      "bool1780471924",
      "number17804723",
      "bool1780471922",
      "bool1780471921",
      "number17804720",
      "bool1780471919",
      "number17804718",
      "bool1780471917",
      "bool1780471916",
      "bool1780471915",
    ].forEach((id) => {
      try { settings.fields.removeById(id); } catch (_) {}
    });
    app.save(settings);
  }
});
