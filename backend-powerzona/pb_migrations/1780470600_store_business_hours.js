/// <reference path="../pb_data/types.d.ts" />


const DEFAULT_BUSINESS_HOURS = {
  monday: { enabled: false, open: "09:00", close: "18:00" },
  tuesday: { enabled: false, open: "09:00", close: "18:00" },
  wednesday: { enabled: false, open: "09:00", close: "18:00" },
  thursday: { enabled: false, open: "09:00", close: "18:00" },
  friday: { enabled: false, open: "09:00", close: "18:00" },
  saturday: { enabled: false, open: "09:00", close: "18:00" },
  sunday: { enabled: false, open: "09:00", close: "18:00" },
};

function fieldExists(collection, name) {
  try {
    collection.fields.getByName(name);
    return true;
  } catch (_) {
    return false;
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  if (!fieldExists(collection, "business_hours_mode")) {
    collection.fields.add(new Field({
      id: "text1780470601",
      name: "business_hours_mode",
      type: "text",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      primaryKey: false,
      min: 0,
      max: 0,
      pattern: "",
      autogeneratePattern: "",
      default: "always_available",
    }));
  }

  if (!fieldExists(collection, "business_hours")) {
    collection.fields.add(new Field({
      id: "json1780470602",
      name: "business_hours",
      type: "json",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      maxSize: 0,
      default: JSON.stringify(DEFAULT_BUSINESS_HOURS),
    }));
  }

  if (!fieldExists(collection, "closed_message")) {
    collection.fields.add(new Field({
      id: "text1780470603",
      name: "closed_message",
      type: "text",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      primaryKey: false,
      min: 0,
      max: 0,
      pattern: "",
      autogeneratePattern: "",
      default: "Estamos fuera de horario, pero puedes realizar tu pedido. Lo atenderemos en horario laboral.",
    }));
  }

  if (!fieldExists(collection, "temporarily_closed_message")) {
    collection.fields.add(new Field({
      id: "text1780470604",
      name: "temporarily_closed_message",
      type: "text",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      primaryKey: false,
      min: 0,
      max: 0,
      pattern: "",
      autogeneratePattern: "",
      default: "Estamos cerrados temporalmente. Puedes realizar tu pedido y te responderemos pronto.",
    }));
  }

  if (!fieldExists(collection, "allow_orders_when_closed")) {
    collection.fields.add(new Field({
      id: "bool1780470605",
      name: "allow_orders_when_closed",
      type: "bool",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      default: true,
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  ["bool1780470605", "text1780470604", "text1780470603", "text1780470601", "json1780470602"].forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });
  return app.save(collection);
});
